import { z } from 'zod';
import { CATEGORIAS_PLANTILLA, ESTADOS_PLANTILLA } from './whatsapp-template.types.js';

export const listTemplatesSchema = z.object({
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    status: z.enum(ESTADOS_PLANTILLA).optional(),
    category: z.enum(CATEGORIAS_PLANTILLA).optional(),
  }),
});

export const createTemplateSchema = z.object({
  body: z.object({
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
  }),
});

export const syncTemplatesSchema = z.object({});
