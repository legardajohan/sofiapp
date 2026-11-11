import { Types } from 'mongoose';
import { createScoped } from '../../repositories/base.repository.js';
import { PendienteEvento } from './organizador.model.js';
import type {
  IMotivoSnapshot,
  IProgramacionSnapshot,
  OrigenEventoPendiente,
  TipoEventoPendiente,
} from './organizador.types.js';

type TenantId = string | Types.ObjectId;

export interface NuevoEventoPendiente {
  notaId: string | Types.ObjectId;
  clienteId: string | Types.ObjectId;
  responsableId: string | Types.ObjectId;
  tipo: TipoEventoPendiente;
  /** `null` = el sistema. */
  actorId: string | Types.ObjectId | null;
  origen: OrigenEventoPendiente;
  at?: Date;
  antes?: IProgramacionSnapshot | null;
  despues?: IProgramacionSnapshot | null;
  motivo?: string | null;
  motivos?: IMotivoSnapshot[];
  otroMotivo?: string | null;
  comentario?: string | null;
  tagIds?: string[];
}

/** Lo que un evento recuerda de una programación: nunca el texto de la nota. */
export function snapshotProgramacion(nota: {
  programadoDia?: string | null;
  programadoHora?: string | null;
  recordatorioAt?: Date | null;
}): IProgramacionSnapshot {
  return {
    dia: nota.programadoDia ?? null,
    hora: nota.programadoHora ?? null,
    recordatorioAt: nota.recordatorioAt ?? null,
  };
}

function aObjectId(id: string | Types.ObjectId): Types.ObjectId {
  return typeof id === 'string' ? new Types.ObjectId(id) : id;
}

function esDuplicado(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: unknown }).code === 11000;
}

/**
 * Añade un evento al historial de un pendiente (HU-PDF-02). Lo usan el Organizador, las notas
 * (programar/reprogramar), el cierre rápido de HU-PDF-01 y el barrido del worker.
 *
 * Devuelve `false` solo cuando un `vencido` para ese mismo instante ya existía (índice único): es
 * el caso normal de dos barridos concurrentes, no un error. Cualquier otro fallo se relanza.
 */
export async function registrarEvento(
  tenantId: TenantId,
  evento: NuevoEventoPendiente,
): Promise<boolean> {
  try {
    await createScoped(PendienteEvento, tenantId, {
      notaId: aObjectId(evento.notaId),
      clienteId: aObjectId(evento.clienteId),
      responsableId: aObjectId(evento.responsableId),
      tipo: evento.tipo,
      actorId: evento.actorId ? aObjectId(evento.actorId) : null,
      at: evento.at ?? new Date(),
      antes: evento.antes ?? null,
      despues: evento.despues ?? null,
      motivo: evento.motivo ?? null,
      motivos: evento.motivos ?? [],
      otroMotivo: evento.otroMotivo ?? null,
      comentario: evento.comentario ?? null,
      tagIds: (evento.tagIds ?? []).map((id) => new Types.ObjectId(id)),
      origen: evento.origen,
    });
    return true;
  } catch (err) {
    if (evento.tipo === 'vencido' && esDuplicado(err)) return false;
    throw err;
  }
}
