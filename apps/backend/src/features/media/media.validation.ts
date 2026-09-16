import { z } from 'zod';

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'ID inválido.');
const empty = z.object({});

export const getMediaSchema = z.object({
  body: empty,
  params: z.object({ id: objectId }),
  query: z.object({
    /** Token HMAC que autoriza la descarga. Es la credencial de esta ruta: sin él, 403. */
    t: z.string().min(1, 'Falta el token del archivo.'),
    /** `1` fuerza `Content-Disposition: attachment` aunque el tipo se pueda mostrar inline. */
    descargar: z.literal('1').optional(),
  }),
});

export const retryMediaSchema = z.object({
  body: empty,
  params: z.object({ id: objectId }),
  query: empty,
});

export const sendMediaSchema = z.object({
  // El archivo NO se valida aquí: es un `Buffer` que multer deja en `req.file` y Zod no lo modela.
  // Tipo y tamaño los comprueba `media.service` contra `LIMITES_MEDIA`, que es donde vive la regla.
  body: z.object({
    texto: z.string().trim().max(1024, 'El pie de foto no puede pasar de 1024 caracteres.').optional(),
  }),
  params: z.object({ id: objectId }),
  query: empty,
});

export type GetMediaQuery = z.infer<typeof getMediaSchema>['query'];
