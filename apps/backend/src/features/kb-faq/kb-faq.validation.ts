import { z } from 'zod';

const idParams = z.object({ id: z.string().regex(/^[0-9a-f]{24}$/i, 'ID inválido') });

const preguntaField = z
  .string()
  .trim()
  .min(3, 'La pregunta es obligatoria.')
  .max(300, 'La pregunta no puede superar los 300 caracteres.');

const respuestaField = z
  .string()
  .trim()
  .min(1, 'La respuesta es obligatoria.')
  .max(2_000, 'La respuesta no puede superar los 2,000 caracteres.');

export const createFaqSchema = z.object({
  body: z.object({
    pregunta: preguntaField,
    respuesta: respuestaField,
    activo: z.boolean().optional(),
  }),
});

export const updateFaqSchema = z.object({
  params: idParams,
  body: z
    .object({
      pregunta: preguntaField.optional(),
      respuesta: respuestaField.optional(),
      activo: z.boolean().optional(),
    })
    .refine((b) => Object.keys(b).length > 0, {
      message: 'Debes enviar al menos un campo para actualizar.',
    }),
});

export const listFaqsSchema = z.object({
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    // `z.coerce.boolean()` convierte cualquier string no vacío en `true` ("false" incluido),
    // así que el filtro se declara como enum explícito.
    activo: z
      .enum(['true', 'false'])
      .transform((v) => v === 'true')
      .optional(),
  }),
});

export const deleteFaqSchema = z.object({ params: idParams });

export const testFaqSchema = z.object({
  body: z.object({ pregunta: preguntaField }),
});
