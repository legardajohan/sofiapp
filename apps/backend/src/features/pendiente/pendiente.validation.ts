import { z } from 'zod';
import { ESTADOS_PENDIENTE } from '../contact-note/contact-note.types.js';
import { diasEnRango, esDiaValido, esZonaIana } from './pendiente.fechas.js';
import {
  PENDIENTES_LIMIT_DEFECTO,
  PENDIENTES_LIMIT_MAXIMO,
  PENDIENTES_RANGO_MAX_DIAS,
} from './pendiente.types.js';

const empty = z.object({}).optional();
const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'ID inválido.');
const dia = z.string().refine(esDiaValido, 'Fecha inválida: usa el formato AAAA-MM-DD.');

export const listPendientesSchema = z.object({
  body: empty,
  params: empty,
  query: z.object({
    // HU-PDF-01 A1: `abierto` es la columna; `cerrado`, el historial.
    estado: z.enum(ESTADOS_PENDIENTE).default('abierto'),
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce
      .number()
      .int()
      .positive()
      .max(PENDIENTES_LIMIT_MAXIMO)
      .default(PENDIENTES_LIMIT_DEFECTO),
  }),
});

export const pdfPendientesSchema = z.object({
  body: empty,
  params: empty,
  query: z
    .object({
      desde: dia,
      hasta: dia,
      tz: z.string().refine(esZonaIana, 'Zona horaria inválida.').default('America/Bogota'),
    })
    // RN7.
    .refine((q) => diasEnRango(q.desde, q.hasta) >= 1, {
      message: 'La fecha final no puede ser anterior a la inicial.',
      path: ['hasta'],
    })
    .refine((q) => diasEnRango(q.desde, q.hasta) <= PENDIENTES_RANGO_MAX_DIAS, {
      message: `El rango no puede superar ${PENDIENTES_RANGO_MAX_DIAS} días.`,
      path: ['desde'],
    }),
});

/** Cerrar y reabrir: el id del pendiente es el de su nota. Sin cuerpo. */
export const transicionPendienteSchema = z.object({
  body: empty,
  params: z.object({ id: objectId }),
  query: empty,
});

export type ListPendientesQuery = z.infer<typeof listPendientesSchema>['query'];
export type PdfPendientesQuery = z.infer<typeof pdfPendientesSchema>['query'];
