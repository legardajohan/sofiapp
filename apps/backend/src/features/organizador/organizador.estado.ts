import type { FilterQuery } from 'mongoose';
import type { IContactNoteDocument, EstadoPendiente } from '../contact-note/contact-note.types.js';
import type { EstadoOrganizador } from './organizador.types.js';

/**
 * Estados del Organizador (HU-PDF-02), derivados de la nota y de la hora actual. Puro: así las
 * reglas se leen en un sitio y se prueban sin Mongo.
 *
 * - CERRADO: el pendiente está cerrado.
 * - VENCIDO: abierto y su aviso ya llegó (sea o no un pospuesto: la nueva hora también vence).
 * - POSPUESTO: abierto, aplazado al menos una vez, aviso en el futuro.
 * - PENDIENTE: el resto. Incluye un pendiente legado aún sin `recordatorioAt` (el barrido lo rellena).
 */
export interface INotaEstado {
  estadoPendiente?: EstadoPendiente | null;
  recordatorioAt?: Date | null;
  vecesPospuesto?: number;
}

export function derivarEstado(nota: INotaEstado, now: Date): EstadoOrganizador {
  if (nota.estadoPendiente === 'cerrado') return 'cerrado';
  if (nota.recordatorioAt && nota.recordatorioAt.getTime() <= now.getTime()) return 'vencido';
  if ((nota.vecesPospuesto ?? 0) > 0) return 'pospuesto';
  return 'pendiente';
}

/**
 * Avisos ya disparados (HU-PDF-02 A1): abiertos cuyo instante de aviso llegó. Con anticipación, el
 * aviso aparece antes de que el pendiente esté VENCIDO. Los documentos sin `avisoAt` (anteriores a
 * la anticipación, aún sin rellenar) caen al instante del recordatorio.
 */
export function filtroAvisoDisparado(now: Date): FilterQuery<IContactNoteDocument> {
  return {
    pendiente: true,
    estadoPendiente: 'abierto',
    $or: [{ avisoAt: { $lte: now } }, { avisoAt: null, recordatorioAt: { $lte: now } }],
  };
}

/** Filtro Mongo equivalente a `derivarEstado` (sin `tenantId`: lo pone el repositorio). */
export function filtroPorEstado(
  estado: EstadoOrganizador,
  now: Date,
): FilterQuery<IContactNoteDocument> {
  const base: FilterQuery<IContactNoteDocument> = { pendiente: true };
  switch (estado) {
    case 'cerrado':
      return { ...base, estadoPendiente: 'cerrado' };
    case 'vencido':
      return { ...base, estadoPendiente: 'abierto', recordatorioAt: { $lte: now } };
    case 'pospuesto':
      return {
        ...base,
        estadoPendiente: 'abierto',
        recordatorioAt: { $gt: now },
        vecesPospuesto: { $gt: 0 },
      };
    case 'pendiente':
      return {
        ...base,
        estadoPendiente: 'abierto',
        $and: [
          { $or: [{ recordatorioAt: null }, { recordatorioAt: { $gt: now } }] },
          { $or: [{ vecesPospuesto: { $exists: false } }, { vecesPospuesto: { $lte: 0 } }] },
        ],
      };
  }
}
