import { z } from 'zod';
import { ESTADOS_COMERCIALES } from '../cliente/cliente.types.js';
import { MOTIVOS_ELIMINACION_LEAD } from './lead.types.js';

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'ID inválido.');
const empty = z.object({});

const nombre = z
  .string()
  .trim()
  .min(1, 'El nombre del lead no puede estar vacío.')
  .max(120, 'El nombre no puede superar los 120 caracteres.');

/**
 * Se normaliza aquí, en el borde, para que el service, la comprobación de duplicados y el índice
 * único vean siempre el mismo valor. Sin esto la unicidad sería decorativa: `+57 300 111 2233` y
 * `573001112233` entrarían como dos leads distintos.
 */
const telefono = z
  .string()
  .transform((v) => v.replace(/\D/g, ''))
  .refine((v) => v.length >= 7 && v.length <= 20, {
    message: 'Teléfono inválido: debe tener entre 7 y 20 dígitos.',
  });

// Un correo vacío desde un formulario significa "no lo sé", no "guarda una cadena vacía".
const correo = z
  .string()
  .trim()
  .email('Correo inválido.')
  .optional()
  .or(z.literal('').transform(() => undefined));

export const createLeadSchema = z.object({
  body: z.object({ nombre, telefono, correo, clienteId: objectId }),
  params: empty,
  query: empty,
});

export const getLeadSchema = z.object({
  body: empty,
  params: z.object({ id: objectId }),
  query: empty,
});

/**
 * El motivo viaja en la query y no en el body: un cuerpo en `DELETE` es legal pero lo pierden
 * proxies y clientes por el camino, y aquí es obligatorio. Sin motivo válido → 400, nunca un
 * borrado "sin explicación".
 */
export const deleteLeadSchema = z.object({
  body: empty,
  params: z.object({ id: objectId }),
  query: z.object({
    motivo: z.enum(MOTIVOS_ELIMINACION_LEAD, {
      errorMap: () => ({ message: 'Motivo de eliminación inválido.' }),
    }),
  }),
});

// ─── Listado (HU-CRM-03) ────────────────────────────────────────────────────────

/**
 * Filtros del listado. Todos opcionales y combinables; ninguno lleva `tenantId`, que nace del
 * token (`docs/multi-tenancy.md` §4).
 *
 * `desde`/`hasta` llegan como `YYYY-MM-DD` y quedan en medianoche UTC. Estirar `hasta` al final
 * del día es cosa del service: aquí se valida la entrada, no la semántica de la consulta.
 */
/**
 * Cambio de etapa de un lead (HU-CRM-03). Solo se admite `estado`: el resto de la ficha tiene dueño
 * en otro sitio (el nombre y el teléfono vienen del contacto, el origen es inmutable por diseño).
 *
 * Zod solo comprueba la forma; que la clave exista en el catálogo de ESTE tenant lo valida el
 * service, que es quien puede consultarlo.
 */
export const updateLeadSchema = z.object({
  params: z.object({ id: objectId }),
  body: z.object({
    estado: z.string().trim().min(1).max(40),
  }),
});

export type UpdateLeadBody = z.infer<typeof updateLeadSchema>['body'];

export const listLeadsSchema = z.object({
  body: empty,
  params: empty,
  query: z
    .object({
      page: z.coerce.number().int().positive().default(1),
      limit: z.coerce.number().int().positive().max(100).default(20),
      // Ya no es un enum cerrado: las etapas son un catálogo por tenant (HU-CRM-03), así que Zod
      // solo comprueba la forma. Que la clave exista en ESTE tenant lo valida el service, que es
      // quien puede consultarlo — el validador no tiene tenantId ni debe pegarle a Mongo.
      estado: z.string().trim().min(1).max(40).optional(),
      // Es un userId (`Lead.responsableId`). No hay rol "Asesor": ver AUTH-02.
      asesor: objectId.optional(),
      // Ya no es un enum cerrado: los semaforos son un catalogo por tenant (HU-CRM-04). Zod solo
      // comprueba la forma; que la clave exista en ESTE tenant lo valida el service.
      semaforo: z.string().trim().min(1).max(40).optional(),
      desde: z.coerce.date({ invalid_type_error: 'Fecha «desde» inválida.' }).optional(),
      hasta: z.coerce.date({ invalid_type_error: 'Fecha «hasta» inválida.' }).optional(),
    })
    .refine((q) => !q.desde || !q.hasta || q.desde <= q.hasta, {
      message: 'El rango está invertido: «desde» no puede ser posterior a «hasta».',
      path: ['desde'],
    }),
});

/**
 * Cambio de semaforo (HU-CRM-04). Ruta propia (`/status`) y no el `PATCH /:id` de la etapa: son dos
 * ejes distintos, y la etapa ya funciona y esta testeada.
 *
 * `null` es un valor legitimo: retira la clasificacion. `.strict()` porque el body tiene UNA llave
 * — colar `estado` aqui debe ser un 400 explicito, no un cambio por la puerta de atras.
 */
export const updateLeadSemaforoSchema = z.object({
  params: z.object({ id: objectId }),
  body: z
    .object({ semaforo: z.string().trim().min(1).max(40).nullable() })
    .strict(),
});

/** Historial de cambios de semaforo del lead. Misma paginacion que el resto del contrato. */
export const historialSemaforoSchema = z.object({
  body: empty,
  params: z.object({ id: objectId }),
  query: z.object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(20),
  }),
});

export type UpdateLeadSemaforoBody = z.infer<typeof updateLeadSemaforoSchema>['body'];
export type HistorialSemaforoQuery = z.infer<typeof historialSemaforoSchema>['query'];

export type CreateLeadBody = z.infer<typeof createLeadSchema>['body'];
export type DeleteLeadQuery = z.infer<typeof deleteLeadSchema>['query'];
export type ListLeadsQueryInput = z.infer<typeof listLeadsSchema>['query'];
