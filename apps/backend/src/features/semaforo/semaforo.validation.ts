import { z } from 'zod';

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'ID inválido.');

/** `#RRGGBB`, igual que el resto de catálogos coloreables del tenant. */
const colorHex = z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'El color debe tener el formato #RRGGBB.');

const label = z
  .string()
  .trim()
  .min(1, 'El nombre del semáforo es obligatorio.')
  .max(60, 'El nombre no puede superar los 60 caracteres.');

export const createSemaforoSchema = z.object({
  body: z.object({ label, color: colorHex.optional() }),
});

/**
 * `key` no se admite: es el valor que los leads llevan grabado y cambiarlo desharía el vínculo.
 * `.strict()` para que intentarlo sea un `400` explícito y no un campo ignorado en silencio.
 *
 * El `.refine` evita el `PATCH` vacío, que respondería `200` sin haber hecho nada — parecería que
 * el cambio se guardó.
 */
export const updateSemaforoSchema = z.object({
  params: z.object({ id: objectId }),
  body: z
    .object({
      label: label.optional(),
      color: colorHex.optional(),
      activo: z.boolean().optional(),
    })
    .strict()
    .refine((b) => b.label !== undefined || b.color !== undefined || b.activo !== undefined, {
      message: 'No hay nada que cambiar: envía al menos «label», «color» o «activo».',
    }),
});

export type CreateSemaforoBody = z.infer<typeof createSemaforoSchema>['body'];
export type UpdateSemaforoBody = z.infer<typeof updateSemaforoSchema>['body'];
