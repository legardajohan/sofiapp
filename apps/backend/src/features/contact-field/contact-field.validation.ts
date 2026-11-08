import { z } from 'zod';
import { TIPOS_DATO_CAMPO } from './contact-field.types.js';

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'ID inválido.');
// `.optional()`: en Express 5 `req.body` queda `undefined` sin cuerpo (mismo motivo que en `contact-option`).
const empty = z.object({}).optional();

const label = z
  .string()
  .trim()
  .min(1, 'El campo necesita un nombre.')
  .max(60, 'El nombre no puede superar los 60 caracteres.');

const tipoDato = z.enum(TIPOS_DATO_CAMPO, {
  errorMap: () => ({ message: 'Tipo inválido: usa texto, numero, fecha o booleano.' }),
});

export const listContactFieldsSchema = z.object({
  body: empty,
  params: empty,
  query: z.object({ incluirArchivados: z.enum(['true', 'false']).optional() }),
});

export const createContactFieldSchema = z.object({
  // `.strict()`: la clave la deriva el servidor del `label`; aceptarla del cliente permitiría fijarla
  // a mano y chocar a propósito con un campo archivado o reservado.
  body: z.object({ label, tipoDato, sensible: z.boolean().optional() }).strict(),
  params: empty,
  query: empty,
});

export const updateContactFieldSchema = z.object({
  body: z
    .object({
      label: label.optional(),
      tipoDato: tipoDato.optional(),
      sensible: z.boolean().optional(),
      orden: z.number().int().min(0).max(999).optional(),
    })
    .strict()
    .refine((b) => Object.keys(b).length > 0, 'Indica al menos un cambio: nombre, tipo, sensible u orden.'),
  params: z.object({ id: objectId }),
  query: empty,
});

export const archiveContactFieldSchema = z.object({
  body: empty,
  params: z.object({ id: objectId }),
  query: empty,
});

export type ListContactFieldsQuery = z.infer<typeof listContactFieldsSchema>['query'];
export type CreateContactFieldBody = z.infer<typeof createContactFieldSchema>['body'];
export type UpdateContactFieldBody = z.infer<typeof updateContactFieldSchema>['body'];
