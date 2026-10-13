import { z } from 'zod';
import {
  CATEGORIAS_CON_IMAGEN,
  CATEGORIAS_PLANTILLA,
  ESTADOS_PLANTILLA,
  MAX_PIE_PLANTILLA,
} from './whatsapp-template.types.js';

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'ID inválido.');
const empty = z.object({});

export const listTemplatesSchema = z.object({
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    status: z.enum(ESTADOS_PLANTILLA).optional(),
    category: z.enum(CATEGORIAS_PLANTILLA).optional(),
  }),
});

/**
 * Cabecera del alta (HT-WA-04). Sin `cabecera`, la plantilla es de solo texto: el contrato de
 * HT-WA-02 sigue valiendo tal cual (criterio 16).
 */
const cabeceraAltaSchema = z.discriminatedUnion('formato', [
  z.object({ formato: z.literal('NINGUNA') }),
  z.object({ formato: z.literal('IMAGE'), uploadId: objectId }),
]);

export const createTemplateSchema = z.object({
  body: z
    .object({
      name: z
        .string()
        .trim()
        .min(1, 'El nombre es obligatorio.')
        .max(512)
        .regex(/^[a-z0-9_]+$/, 'Solo minúsculas, números y guión bajo, como lo exige Meta.'),
      language: z.string().trim().min(2).max(10),
      category: z.enum(CATEGORIAS_PLANTILLA),
      cuerpo: z
        .string()
        .trim()
        .min(1, 'El cuerpo es obligatorio.')
        .max(1_024, 'El cuerpo no puede superar los 1,024 caracteres.'),
      ejemplos: z.array(z.string().trim().min(1)).default([]),
      cabecera: cabeceraAltaSchema.default({ formato: 'NINGUNA' }),
      pie: z
        .string()
        .trim()
        .min(1)
        .max(MAX_PIE_PLANTILLA, `El pie no puede superar los ${MAX_PIE_PLANTILLA} caracteres.`)
        .optional(),
    })
    .superRefine((body, ctx) => {
      if (body.cabecera.formato === 'IMAGE' && !CATEGORIAS_CON_IMAGEN.includes(body.category)) {
        ctx.addIssue({
          code: 'custom',
          path: ['cabecera'],
          message: 'La imagen de encabezado solo está disponible para Marketing y Utilidad.',
        });
      }
    }),
});

export const syncTemplatesSchema = z.object({});

/** La imagen la valida el service (tipo y tamaño); multer ya cortó lo que pasa de 5 MB. */
export const uploadTemplateMediaSchema = z.object({ body: empty, query: empty });

export const templateIdSchema = z.object({
  body: empty,
  params: z.object({ id: objectId }),
  query: empty,
});
