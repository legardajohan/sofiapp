import { z } from 'zod';

/** `#RRGGBB`, igual que el resto de catálogos coloreables del tenant. */
const colorHex = z
  .string()
  .regex(/^#[0-9A-Fa-f]{6}$/, 'El color debe tener el formato #RRGGBB.');

export const createEstadoSchema = z.object({
  body: z.object({
    label: z
      .string()
      .trim()
      .min(1, 'El nombre del estado es obligatorio.')
      .max(60, 'El nombre no puede superar los 60 caracteres.'),
    color: colorHex.optional(),
  }),
});

export type CreateEstadoBody = z.infer<typeof createEstadoSchema>['body'];
