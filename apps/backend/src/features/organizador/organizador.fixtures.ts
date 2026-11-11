import { Types } from 'mongoose';
import { createScoped } from '../../repositories/base.repository.js';
import { ContactNote } from '../contact-note/contact-note.model.js';
import { crearNota } from '../pendiente/pendiente.fixtures.js';
import { Tag } from '../tag/tag.model.js';

/**
 * Siembra de los tests de HU-PDF-02. Solo para tests: fija `recordatorioAt` directamente en la
 * colección para poder poner un recordatorio en el pasado o en el futuro sin esperar.
 */

export async function crearRecordatorio(
  tenantId: Types.ObjectId,
  clienteId: string,
  autorId: string,
  texto: string,
  opciones: {
    recordatorioAt: Date;
    programadoDia?: string;
    programadoHora?: string | null;
    vecesPospuesto?: number;
    /** Minutos de anticipación del aviso (HU-PDF-02 A1). */
    avisoAntesMin?: 0 | 5 | 10;
    estado?: 'abierto' | 'cerrado';
    notificadoPara?: Date | null;
  },
): Promise<string> {
  const id = await crearNota(tenantId, clienteId, autorId, texto, {
    programadoDia: opciones.programadoDia ?? '2026-11-10',
    programadoHora: opciones.programadoHora ?? '10:00',
    estado: opciones.estado ?? 'abierto',
  });
  await ContactNote.collection.updateOne(
    { _id: new Types.ObjectId(id) },
    {
      $set: {
        recordatorioAt: opciones.recordatorioAt,
        programadoTz: 'America/Bogota',
        notificadoPara: opciones.notificadoPara ?? null,
        vecesPospuesto: opciones.vecesPospuesto ?? 0,
        avisoAntesMin: opciones.avisoAntesMin ?? 0,
        avisoAt: new Date(opciones.recordatorioAt.getTime() - (opciones.avisoAntesMin ?? 0) * 60_000),
      },
    },
  );
  return id;
}

export async function crearEtiqueta(tenantId: Types.ObjectId, nombre: string): Promise<string> {
  const tag = await createScoped(Tag, tenantId, { nombre, color: '#3366ff', origen: 'manual' });
  return String(tag._id);
}

export const HACE_UNA_HORA = (): Date => new Date(Date.now() - 60 * 60 * 1000);
export const EN_UNA_HORA = (): Date => new Date(Date.now() + 60 * 60 * 1000);
