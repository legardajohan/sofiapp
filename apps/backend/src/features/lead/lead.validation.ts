import { z } from 'zod';
import { MOTIVOS_ELIMINACION_LEAD } from './lead.types.js';

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'ID inválido.');
const empty = z.object({});

const nombre = z
  .string()
  .trim()
  .min(1, 'El nombre del lead no puede estar vacío.')
  .max(120, 'El nombre no puede superar los 120 caracteres.');

/**
 * Se normaliza aquí, en el borde, para que el service, la comprobación de duplicados y el índice
 * único vean siempre el mismo valor. Sin esto la unicidad sería decorativa: `+57 300 111 2233` y
 * `573001112233` entrarían como dos leads distintos.
 */
const telefono = z
  .string()
  .transform((v) => v.replace(/\D/g, ''))
  .refine((v) => v.length >= 7 && v.length <= 20, {
    message: 'Teléfono inválido: debe tener entre 7 y 20 dígitos.',
  });

// Un correo vacío desde un formulario significa "no lo sé", no "guarda una cadena vacía".
const correo = z
  .string()
  .trim()
  .email('Correo inválido.')
  .optional()
  .or(z.literal('').transform(() => undefined));

export const createLeadSchema = z.object({
  body: z.object({ nombre, telefono, correo, clienteId: objectId }),
  params: empty,
  query: empty,
});

export const getLeadSchema = z.object({
  body: empty,
  params: z.object({ id: objectId }),
  query: empty,
});

/**
 * El motivo viaja en la query y no en el body: un cuerpo en `DELETE` es legal pero lo pierden
 * proxies y clientes por el camino, y aquí es obligatorio. Sin motivo válido → 400, nunca un
 * borrado "sin explicación".
 */
export const deleteLeadSchema = z.object({
  body: empty,
  params: z.object({ id: objectId }),
  query: z.object({
    motivo: z.enum(MOTIVOS_ELIMINACION_LEAD, {
      errorMap: () => ({ message: 'Motivo de eliminación inválido.' }),
    }),
  }),
});

export type CreateLeadBody = z.infer<typeof createLeadSchema>['body'];
export type DeleteLeadQuery = z.infer<typeof deleteLeadSchema>['query'];
