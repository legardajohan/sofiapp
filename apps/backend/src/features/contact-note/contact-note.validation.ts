import { z } from 'zod';
import { esDiaValido, esZonaIana } from '../pendiente/pendiente.fechas.js';

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'ID inválido.');
const empty = z.object({}).optional();

// `mergeParams: true` en el router hace que `:clienteId` del montaje llegue hasta aquí.
const params = z.object({ clienteId: objectId });
const notaParams = z.object({ clienteId: objectId, notaId: objectId });

const texto = z.string().trim().min(1, 'La nota no puede estar vacía.').max(2000);
/** Día civil `YYYY-MM-DD` (HU-PDF-01 A1). */
const dia = z.string().refine(esDiaValido, 'Fecha inválida: usa el formato AAAA-MM-DD.');
/** Hora de reloj `HH:mm`, 00:00–23:59. */
const hora = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Hora inválida: usa el formato HH:mm.');
/** Zona del navegador: con ella el servidor sabe qué día es «hoy» para quien escribe. */
const tz = z.string().refine(esZonaIana, 'Zona horaria inválida.').default('America/Bogota');

export const createNotaSchema = z.object({
  body: z
    .object({
      texto,
      // HU-PDF-01: apagado por defecto. Un cliente que no conoce el campo sigue creando notas normales.
      pendiente: z.boolean().default(false),
      programadoDia: dia.optional(),
      programadoHora: hora.optional(),
      tz,
    })
    // RN9: la programación solo existe en un pendiente.
    .refine((b) => b.pendiente || (b.programadoDia === undefined && b.programadoHora === undefined), {
      message: 'Solo un pendiente se puede programar.',
      path: ['pendiente'],
    }),
  params,
  query: empty,
});

export const listNotasSchema = z.object({
  body: empty,
  params,
  query: z.object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(20),
  }),
});

export const updateNotaSchema = z.object({
  body: z
    .object({
      texto: texto.optional(),
      pendiente: z.boolean().optional(),
      programadoDia: dia.optional(),
      // `null` quita la hora: el pendiente pasa a ser de todo el día.
      programadoHora: hora.nullable().optional(),
      tz,
    })
    .refine(
      (b) =>
        b.texto !== undefined ||
        b.pendiente !== undefined ||
        b.programadoDia !== undefined ||
        b.programadoHora !== undefined,
      { message: 'Indica qué quieres cambiar de la nota.' },
    )
    .refine(
      (b) => b.pendiente !== false || (b.programadoDia === undefined && b.programadoHora === undefined),
      { message: 'Un pendiente que se quita no se puede programar.', path: ['pendiente'] },
    ),
  params: notaParams,
  query: empty,
});

export const deleteNotaSchema = z.object({
  body: empty,
  params: notaParams,
  query: empty,
});

export type CreateNotaBody = z.infer<typeof createNotaSchema>['body'];
export type ListNotasQuery = z.infer<typeof listNotasSchema>['query'];
export type UpdateNotaBody = z.infer<typeof updateNotaSchema>['body'];
