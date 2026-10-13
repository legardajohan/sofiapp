import { z } from 'zod';

export const sendSchema = z.object({
  body: z.object({
    clienteId: z.string().min(1),
    texto: z.string().min(1).max(4096),
  }),
  params: z.object({}),
  query: z.object({}),
});

export const sendTemplateSchema = z.object({
  body: z.object({
    clienteId: z.string().min(1),
    templateId: z.string().regex(/^[0-9a-f]{24}$/i, 'ID inválido'),
    parametros: z.array(z.string()).default([]),
    /**
     * HT-WA-04: imagen de reemplazo subida con `POST /campaigns/media`. Sin ella, una plantilla de
     * imagen se envía con su imagen por defecto.
     */
    imagenHeaderUploadId: z.string().regex(/^[0-9a-f]{24}$/i, 'ID inválido').optional(),
  }),
});
