import type { Types } from 'mongoose';
import { env } from '../config/env.js';
import { findOneAndUpdateScoped } from '../repositories/base.repository.js';
import { publishRealtime } from '../realtime/realtime.publisher.js';
import { ContactNote } from '../features/contact-note/contact-note.model.js';
import { registrarEvento, snapshotProgramacion } from '../features/organizador/organizador.eventos.js';
import { instanteRecordatorio, diaEnZona } from '../features/pendiente/pendiente.fechas.js';
import { getZonaHorariaTenant } from '../features/tenant/tenant.service.js';
import { logger } from '../utils/logger.js';

/**
 * Barrido del Organizador (HU-PDF-02, ADR 0016). Corre cada `ORGANIZADOR_SWEEP_INTERVAL_MS` en la
 * cola `flow-runtime`.
 *
 * La verdad de «qué está vencido» es la consulta (`recordatorioAt ≤ now`), no este proceso: si el
 * worker estuvo caído, la pila y la campana igual muestran los vencidos al preguntar. El barrido
 * solo hace dos cosas que una consulta no puede:
 *
 * 1. **Avisar en vivo** al autor de la nota (`pendiente:vencido` → `asesor:<autorId>`).
 * 2. **Dejar constancia** en el historial (evento `vencido`), una sola vez por instante.
 *
 * Aislamiento: las dos lecturas globales solo proyectan `{ _id, tenantId, ... }` —mismo patrón que
 * `processCampaignSweep`— y toda escritura pasa por el repositorio `*Scoped` con el `tenantId` del
 * propio documento.
 */

interface INotaVencida {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  recordatorioAt: Date;
}

interface INotaLegada {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  programadoDia?: string | null;
  programadoHora?: string | null;
  createdAt: Date;
}

interface INotaAvisada {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  clienteId: Types.ObjectId;
  autorId: Types.ObjectId;
  programadoDia?: string | null;
  programadoHora?: string | null;
  recordatorioAt: Date;
}

/**
 * Pendientes abiertos anteriores a HU-PDF-02: tienen día (y quizá hora) pero ningún instante de
 * aviso. Se les calcula con la zona horaria de la empresa, la mejor aproximación disponible a la de
 * quien los agendó.
 */
async function rellenarLegados(): Promise<number> {
  const legados = await ContactNote.find({
    pendiente: true,
    estadoPendiente: 'abierto',
    recordatorioAt: null,
  })
    .select({ tenantId: 1, programadoDia: 1, programadoHora: 1, createdAt: 1 })
    .limit(env.ORGANIZADOR_SWEEP_BATCH)
    .lean<INotaLegada[]>();

  const zonas = new Map<string, string>();
  let rellenados = 0;
  for (const nota of legados) {
    const tenantId = String(nota.tenantId);
    let tz = zonas.get(tenantId);
    if (!tz) {
      tz = await getZonaHorariaTenant(tenantId);
      zonas.set(tenantId, tz);
    }
    const dia = nota.programadoDia ?? diaEnZona(nota.createdAt, tz);
    const actualizada = await findOneAndUpdateScoped(
      ContactNote,
      tenantId,
      // `recordatorioAt: null` en el filtro: si una edición lo calculó entretanto, no se pisa.
      { _id: nota._id, recordatorioAt: null },
      {
        $set: {
          programadoDia: dia,
          recordatorioAt: instanteRecordatorio(dia, nota.programadoHora ?? null, tz),
          avisoAt: instanteRecordatorio(dia, nota.programadoHora ?? null, tz),
          programadoTz: tz,
          notificadoPara: null,
        },
      },
    ).lean();
    if (actualizada) rellenados += 1;
  }
  return rellenados;
}

/**
 * HU-PDF-02 A1: pendientes con `recordatorioAt` pero sin `avisoAt` (creados antes de la
 * anticipación). Se les pone el aviso a la hora del pendiente menos su anticipación (0 por defecto).
 */
async function rellenarAvisos(): Promise<number> {
  const sinAviso = await ContactNote.find({
    pendiente: true,
    estadoPendiente: 'abierto',
    recordatorioAt: { $ne: null },
    avisoAt: null,
  })
    .select({ tenantId: 1, recordatorioAt: 1, avisoAntesMin: 1 })
    .limit(env.ORGANIZADOR_SWEEP_BATCH)
    .lean<{ _id: Types.ObjectId; tenantId: Types.ObjectId; recordatorioAt: Date; avisoAntesMin?: number }[]>();

  let rellenados = 0;
  for (const n of sinAviso) {
    const avisoAt = new Date(n.recordatorioAt.getTime() - (n.avisoAntesMin ?? 0) * 60_000);
    const hecho = await findOneAndUpdateScoped(
      ContactNote,
      n.tenantId,
      { _id: n._id, recordatorioAt: n.recordatorioAt, avisoAt: null },
      { $set: { avisoAt } },
    ).lean();
    if (hecho) rellenados += 1;
  }
  return rellenados;
}

async function avisarVencidos(now: Date): Promise<number> {
  const vencidos = await ContactNote.find({
    pendiente: true,
    estadoPendiente: 'abierto',
    // HU-PDF-02 A1: se avisa en `avisoAt` (con anticipación, antes de la hora del pendiente).
    avisoAt: { $lte: now },
    $expr: { $ne: ['$notificadoPara', '$recordatorioAt'] },
  })
    .select({ tenantId: 1, recordatorioAt: 1 })
    .sort({ recordatorioAt: 1 })
    .limit(env.ORGANIZADOR_SWEEP_BATCH)
    .lean<INotaVencida[]>();

  let avisados = 0;
  for (const { _id, tenantId, recordatorioAt } of vencidos) {
    // Escritura condicional: de dos barridos concurrentes solo uno casa (CA-14). El que pierde
    // recibe `null` y sigue.
    const nota = await findOneAndUpdateScoped(
      ContactNote,
      tenantId,
      {
        _id,
        pendiente: true,
        estadoPendiente: 'abierto',
        recordatorioAt,
        notificadoPara: { $ne: recordatorioAt },
      },
      { $set: { notificadoPara: recordatorioAt } },
      { new: true },
    ).lean<INotaAvisada | null>();
    if (!nota) continue;

    const nuevo = await registrarEvento(tenantId, {
      notaId: nota._id,
      clienteId: nota.clienteId,
      responsableId: nota.autorId,
      tipo: 'vencido',
      actorId: null,
      origen: 'sistema',
      at: now,
      despues: snapshotProgramacion(nota),
    });
    if (!nuevo) continue;

    await publishRealtime({
      type: 'pendiente:vencido',
      tenantId: String(tenantId),
      targetUserId: String(nota.autorId),
      notaId: String(nota._id),
    });
    avisados += 1;
  }
  return avisados;
}

export async function processOrganizadorSweep(
  now: Date = new Date(),
): Promise<{ avisados: number; rellenados: number }> {
  const rellenados = (await rellenarLegados()) + (await rellenarAvisos());
  const avisados = await avisarVencidos(now);
  if (avisados > 0 || rellenados > 0) {
    logger.info('Organizador: barrido', { avisados, rellenados });
  }
  return { avisados, rellenados };
}
