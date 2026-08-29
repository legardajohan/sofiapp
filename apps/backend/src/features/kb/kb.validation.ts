import { z } from 'zod';

const OBJECT_ID_REGEX = /^[0-9a-f]{24}$/i;

/**
 * HU-KB-07: subido de 3.000 a 10.000 porque el contenido dejó de ser un texto libre para pasar a ser
 * la **suma** de los campos de un formulario. Con `KB_CHUNK_SIZE=1000` / overlap 150 (paso 850) un
 * documento al tope produce ~12 fragmentos: cabe de sobra sin diluir el top-5 de `KB_RETRIEVAL_K`.
 */
const CONTENIDO_MAX = 10_000;
const CONTENIDO_MAX_MSG = 'El contenido no puede superar los 10,000 caracteres.';

/**
 * Tope del JSON de `estructura`. ~4× el tope de texto porque el JSON pesa más que su serialización
 * (claves, discriminantes de tipo y comillas). Es el único guardarraíl real del campo: impide que un
 * documento crezca sin cota sin obligar al backend a conocer los campos.
 */
const ESTRUCTURA_MAX_BYTES = 40_000;
const ESTRUCTURA_MAX_MSG = 'La información estructurada es demasiado grande.';

/**
 * Valida el **sobre** de `estructura`, nunca sus campos: `campos` se acepta como un mapa opaco.
 *
 * Es deliberado. Si Zod conociera los campos, cada HU de la serie KB-08..11 tendría que tocar el
 * backend para añadir los suyos, y un despliegue desacompasado rechazaría con 400 justo lo que el
 * frontend ya sabe enviar. Validando solo la envoltura, esas HUs son puramente frontend.
 */
const estructuraSchema = z
  .object({
    schemaVersion: z.number().int().min(1),
    schemaId: z.string().trim().min(1).max(60),
    campos: z.record(z.string(), z.unknown()),
    adicional: z.string().max(CONTENIDO_MAX),
  })
  .refine((e) => JSON.stringify(e).length <= ESTRUCTURA_MAX_BYTES, ESTRUCTURA_MAX_MSG);

export const createDocumentSchema = z.object({
  body: z.object({
    titulo: z
      .string()
      .trim()
      .min(1, 'El título es obligatorio.')
      .max(200, 'El título no puede tener más de 200 caracteres.'),
    contenido: z
      .string()
      .trim()
      .min(1, 'El contenido es obligatorio.')
      .max(CONTENIDO_MAX, CONTENIDO_MAX_MSG),
    estructura: estructuraSchema.optional(),
  }),
});

export const listDocumentsSchema = z.object({
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  }),
});

export const updateDocumentSchema = z.object({
  params: z.object({ id: z.string().regex(OBJECT_ID_REGEX, 'ID inválido') }),
  // El contenido puede quedar vacío (documento sin llenar); no se indexa hasta que tenga texto.
  body: z.object({
    contenido: z.string().trim().max(CONTENIDO_MAX, CONTENIDO_MAX_MSG),
    // Ausente = no tocar la estructura guardada (ver `UpdateKbDocumentDTO`).
    estructura: estructuraSchema.optional(),
  }),
});

export const deleteDocumentSchema = z.object({
  params: z.object({ id: z.string().regex(OBJECT_ID_REGEX, 'ID inválido') }),
});
