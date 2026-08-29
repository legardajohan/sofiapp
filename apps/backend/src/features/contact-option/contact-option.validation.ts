import { z } from 'zod';
import { TIPOS_OPCION_CONTACTO } from './contact-option.types.js';

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'ID inválido.');
// `.optional()`: en Express 5 `req.body` queda `undefined` sin cuerpo, y un `z.object({})` a secas
// rechazaría todo GET/DELETE con "Required" (mismo motivo que en `cliente.validation`).
const empty = z.object({}).optional();

const tipo = z.enum(TIPOS_OPCION_CONTACTO, {
  errorMap: () => ({ message: 'Tipo de opción inválido: usa interes, objecion o rol.' }),
});

const label = z
  .string()
  .trim()
  .min(1, 'La opción necesita un nombre.')
  .max(60, 'El nombre no puede superar los 60 caracteres.');

// Mismo formato que el color de una etiqueta (`tag.validation`): un solo vocabulario de color en
// todo el CRM. La legibilidad no se valida aquí sino al pintar, donde se conoce el tema activo.
const color = z
  .string()
  .trim()
  .regex(/^#[0-9A-Fa-f]{6}$/, 'Color inválido: usa el formato #RRGGBB.');

export const listContactOptionsSchema = z.object({
  body: empty,
  params: empty,
  // Sin `tipo` devuelve los tres catálogos; con él, solo ese. La UI pide los tres de una vez.
  query: z.object({ tipo: tipo.optional() }),
});

export const createContactOptionSchema = z.object({
  // `.strict()`: la clave la deriva el servidor del `label`. Aceptarla del cliente dejaría que
  // alguien la fijara a mano y colisionara a propósito con una opción archivada.
  body: z.object({ tipo, label, color: color.optional() }).strict(),
  params: empty,
  query: empty,
});

export const updateContactOptionSchema = z.object({
  // Igual que en `tag.validation`: un PATCH sin ningún cambio es un error del llamador, no una
  // operación válida que no hace nada. `tipo` y `key` no son editables a propósito.
  body: z
    .object({
      label: label.optional(),
      color: color.optional(),
      /** `true` desarchiva una opción retirada; `false` la archiva sin pasar por el DELETE. */
      activo: z.boolean().optional(),
      orden: z.number().int().min(0).max(999).optional(),
    })
    .strict()
    .refine(
      (b) => Object.keys(b).length > 0,
      'Indica al menos un cambio: nombre, color, estado u orden.',
    ),
  params: z.object({ id: objectId }),
  query: empty,
});

export const deleteContactOptionSchema = z.object({
  body: empty,
  params: z.object({ id: objectId }),
  query: empty,
});

export type ListContactOptionsQuery = z.infer<typeof listContactOptionsSchema>['query'];
export type CreateContactOptionBody = z.infer<typeof createContactOptionSchema>['body'];
export type UpdateContactOptionBody = z.infer<typeof updateContactOptionSchema>['body'];
