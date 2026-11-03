import {
  aperturaDeError,
  consultarVentana,
  esVentanaCerrada,
  registrarRetencion,
  ultimoMomentoDeEnvio,
} from '../send-window/send-window.service.js';
import { Types } from 'mongoose';
import { env } from '../../config/env.js';
import { FLOW_REMINDER_JOB, flowRuntimeQueue } from '../../config/queues.js';
import { findByIdScoped, findOneAndUpdateScoped } from '../../repositories/base.repository.js';
import { AppError } from '../../utils/AppError.js';
import { logger } from '../../utils/logger.js';
import { sendOutbound } from '../message/message.service.js';
import { Cliente } from '../cliente/cliente.model.js';
import { Tenant } from '../tenant/tenant.model.js';
import type { ITenantDocument } from '../tenant/tenant.types.js';

/** Opciones del job `reminder`: reintentos moderados, igual que el resto de envíos automáticos de
 *  esta cola — el envío pega contra la Graph API y una conversación de más no vale un martilleo. */
const REMINDER_JOB_OPTS = {
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 5000 },
  removeOnComplete: 1000,
  removeOnFail: 5000,
};

/**
 * Cota superior del barrido: el máximo `antelacionMinutos` que admite `updateReminderSchema`
 * (24 h). El barrido en sí es cross-tenant y no conoce todavía la antelación configurada por cada
 * tenant candidato — eso se filtra después, por tenant, en `ejecutarBarridoRecordatorios`.
 */
const MAX_ANTELACION_MINUTOS = 1440;

/**
 * ¿Toca enviar ya el recordatorio de una ventana que vence en `expira`? (HU-CONF-01)
 *
 * El recordatorio sale `antelacionMinutos` antes del **plazo efectivo**: el último momento en que
 * todavía se le puede escribir dentro del horario de envío de `recordatorio`. Si la ventana vence
 * dentro del horario (o no hay horario), el plazo es el propio vencimiento —el comportamiento de
 * siempre—. Si vence fuera, el plazo se ADELANTA al cierre del último tramo abierto: así una ventana
 * que vence a las 23:00 con horario hasta las 19:00 recibe el recordatorio antes de las 19:00, en
 * vez de perderse. Sin ningún momento abierto antes del vencimiento, no hay recordatorio posible.
 */
async function enPlazoDeRecordatorio(
  tenantId: string,
  expira: Date,
  antelacionMinutos: number,
  ahora: Date,
): Promise<boolean> {
  // Ya vencida (el job corrió tarde): sigue en plazo, como siempre. `sendOutbound` lo manda como
  // plantilla HSM o lo omite con 422 (HU-FLOW-02, criterio 9); el horario lo decide el chequeo
  // posterior de `consultarVentana`.
  if (expira.getTime() <= ahora.getTime()) return true;
  const plazo = await ultimoMomentoDeEnvio(tenantId, 'recordatorio', expira, ahora);
  if (!plazo) return false;
  return plazo.getTime() - ahora.getTime() <= antelacionMinutos * 60_000;
}

export interface ICandidatoRecordatorio {
  tenantId: string;
  clienteId: string;
  ventana24hExpiraEn: Date;
}

/**
 * Barrido cross-tenant: la única lectura sin scope de esta spec, documentada en
 * `docs/multi-tenancy.md` junto a `login` y el webhook de Meta. Solo devuelve identificadores; no
 * expone ningún dato de un tenant a otro. A partir de aquí, todo pasa por `*Scoped`.
 */
export async function buscarCandidatos(ahora: Date): Promise<ICandidatoRecordatorio[]> {
  const limite = new Date(ahora.getTime() + MAX_ANTELACION_MINUTOS * 60_000);

  const docs = await Cliente.find(
    {
      ventana24hExpiraEn: { $gt: ahora, $lte: limite },
      iaHabilitada: true,
      estadoComercial: { $nin: ['pagado', 'perdido'] },
      // `$ne` entre `undefined`/`null` (nunca se envió) y una fecha real es `true`, así que un
      // cliente sin recordatorio previo siempre entra. Autolimpiante: en cuanto un nuevo inbound
      // adelanta `ventana24hExpiraEn`, la comparación vuelve a ser desigual sin tocar banderas.
      $expr: { $ne: ['$recordatorioEnviadoParaVentana', '$ventana24hExpiraEn'] },
    },
    { tenantId: 1, ventana24hExpiraEn: 1 },
  )
    .limit(env.REMINDER_SWEEP_BATCH)
    .lean<{ _id: Types.ObjectId; tenantId: Types.ObjectId; ventana24hExpiraEn: Date }[]>();

  return docs.map((d) => ({
    tenantId: d.tenantId.toString(),
    clienteId: d._id.toString(),
    ventana24hExpiraEn: d.ventana24hExpiraEn,
  }));
}

/**
 * Filtra los candidatos del barrido por la política de CADA tenant (activo + su propia
 * antelación) y encola un job `reminder` por conversación elegible. `enviarJob` es inyectable para
 * no acoplar este filtrado a BullMQ en los tests.
 */
export async function filtrarPorConfiguracionTenant(
  candidatos: ICandidatoRecordatorio[],
  ahora: Date,
): Promise<ICandidatoRecordatorio[]> {
  if (candidatos.length === 0) return [];

  const tenantIds = [...new Set(candidatos.map((c) => c.tenantId))].map((id) => new Types.ObjectId(id));
  const tenants = await Tenant.find(
    { _id: { $in: tenantIds } },
    { recordatorio: 1 },
  ).lean<Pick<ITenantDocument, '_id' | 'recordatorio'>[]>();

  const configPorTenant = new Map(tenants.map((t) => [t._id.toString(), t.recordatorio]));

  const elegibles: ICandidatoRecordatorio[] = [];
  for (const c of candidatos) {
    const config = configPorTenant.get(c.tenantId);
    if (!config?.activo) continue;
    if (!(await enPlazoDeRecordatorio(c.tenantId, c.ventana24hExpiraEn, config.antelacionMinutos, ahora))) {
      continue;
    }
    // En plazo pero con el horario aún cerrado (p. ej. la antelación empieza antes de que abra el
    // tramo): no se encola. El siguiente barrido dentro del horario lo recoge, y así no se deja un
    // rastro de "omitido" cada diez minutos mientras tanto.
    if (!(await consultarVentana(c.tenantId, 'recordatorio', ahora)).permitido) continue;
    elegibles.push(c);
  }
  return elegibles;
}

/**
 * El barrido periódico completo (job `sweep`, HU-FLOW-02): encuentra candidatos cross-tenant, los
 * filtra por la política de cada tenant y encola un job `reminder` por conversación elegible —
 * cada uno ya operará con el `tenantId` de su propia conversación y tenant-safe de ahí en más.
 */
export async function ejecutarBarridoRecordatorios(ahora: Date): Promise<void> {
  const candidatos = await buscarCandidatos(ahora);
  const elegibles = await filtrarPorConfiguracionTenant(candidatos, ahora);

  for (const candidato of elegibles) {
    await flowRuntimeQueue.add(
      FLOW_REMINDER_JOB,
      { tipo: 'reminder', tenantId: candidato.tenantId, clienteId: candidato.clienteId },
      REMINDER_JOB_OPTS,
    );
  }
}

/**
 * Envía el recordatorio a UNA conversación. Todo lo de aquí en adelante es tenant-safe.
 * `sendOutbound` (`HT-WA-02`) es el único que decide texto libre vs plantilla HSM según la ventana
 * — esta función nunca vuelve a comparar `ventana24hExpiraEn` para eso, solo para reconfirmar (con
 * datos frescos) que sigue siendo elegible.
 */
export async function enviarRecordatorio(tenantId: string, clienteId: string): Promise<void> {
  const cliente = await findByIdScoped(Cliente, tenantId, clienteId).lean();
  if (!cliente) throw new AppError('Cliente no encontrado.', 404);

  if (!cliente.iaHabilitada) return;
  if (cliente.estadoComercial === 'pagado' || cliente.estadoComercial === 'perdido') return;
  if (!cliente.ventana24hExpiraEn) return;

  const tenant = await Tenant.findById(tenantId).lean<ITenantDocument>();
  if (!tenant?.recordatorio?.activo) return;
  if (!tenant.recordatorio.texto?.trim()) return;

  // Reconfirma la elegibilidad con datos frescos: si hubo un inbound nuevo entre el barrido y este
  // envío, `ventana24hExpiraEn` ya se recalculó más lejos en el futuro y la conversación dejó de
  // estar en la franja de antelación — es la señal de "hubo actividad después" sin necesitar un
  // campo aparte para detectarlo.
  // Con horario de envío, el plazo se mide contra el último momento abierto antes del vencimiento
  // (HU-CONF-01): ver `enPlazoDeRecordatorio`.
  const ahora = new Date();
  if (
    !(await enPlazoDeRecordatorio(
      tenantId,
      cliente.ventana24hExpiraEn,
      tenant.recordatorio.antelacionMinutos,
      ahora,
    ))
  ) {
    return;
  }

  // Ventana horaria (HU-CONF-01) ANTES del marcado de idempotencia. El barrido ya no encola fuera de
  // franja, así que esto cubre la carrera de un tramo que cierra entre el barrido y el job: se omite
  // sin marcar y un barrido posterior dentro de franja lo envía si sigue elegible.
  const ventana = await consultarVentana(tenantId, 'recordatorio', ahora);
  if (!ventana.permitido) {
    await registrarRetencion(tenantId, {
      categoria: 'recordatorio',
      accion: 'omitido',
      siguienteApertura: ventana.siguienteApertura,
      clienteId,
    });
    return;
  }

  // Idempotencia: marca ANTES de enviar, con un filtro que excluye el caso ya marcado para esta
  // MISMA ventana. Dos barridos solapados no producen dos envíos.
  const marcado = await findOneAndUpdateScoped(
    Cliente,
    tenantId,
    {
      _id: new Types.ObjectId(clienteId),
      recordatorioEnviadoParaVentana: { $ne: cliente.ventana24hExpiraEn },
    },
    { $set: { recordatorioEnviadoParaVentana: cliente.ventana24hExpiraEn } },
  );
  if (!marcado) return;

  try {
    await sendOutbound(
      tenantId,
      clienteId,
      {
        modo: 'auto',
        texto: tenant.recordatorio.texto,
        plantillaFallback: tenant.recordatorio.templateId
          ? { templateId: tenant.recordatorio.templateId.toString(), parametros: [cliente.nombre ?? ''] }
          : undefined,
      },
      'bot',
      { categoria: 'recordatorio' },
    );
  } catch (err) {
    // La franja cerró entre la consulta y el envío (423): se deshace el marcado para que el
    // siguiente barrido dentro de franja lo reintente, como si nunca se hubiera intentado.
    if (esVentanaCerrada(err)) {
      await findOneAndUpdateScoped(
        Cliente,
        tenantId,
        { _id: new Types.ObjectId(clienteId) },
        { $set: { recordatorioEnviadoParaVentana: cliente.recordatorioEnviadoParaVentana ?? null } },
      );
      await registrarRetencion(tenantId, {
        categoria: 'recordatorio',
        accion: 'omitido',
        siguienteApertura: aperturaDeError(err),
        clienteId,
      });
      return;
    }
    // Fuera de ventana sin plantilla utilizable (422) o cuota agotada (429): se omite y queda
    // registrado, sin reintentos infinitos. Cualquier otro error (transitorio) sí se propaga para
    // que BullMQ reintente el job.
    if (err instanceof AppError && [422, 429].includes(err.statusCode)) {
      logger.warn('Recordatorio omitido', { tenantId, clienteId, motivo: err.message });
      return;
    }
    throw err;
  }
}
