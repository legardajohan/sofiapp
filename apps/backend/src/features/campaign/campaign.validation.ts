import { z } from 'zod';
import { ESTADOS_COMERCIALES } from '../cliente/cliente.types.js';
import { ESTADOS_CAMPANA, ESTADOS_DESTINATARIO } from './campaign.types.js';

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'ID inválido.');
const empty = z.object({});

/**
 * Clave de catálogo o de atributo. Solo se valida la **forma**, nunca la existencia: si la clave no
 * está en el catálogo del tenant, el segmento sale vacío, que es la convención del proyecto para
 * los filtros (criterio 2 del spec). Comprobar contra el catálogo aquí convertiría en `400` lo que
 * debe ser "no hay nadie así".
 */
const catalogoKey = z.string().trim().min(1).max(60);

const filtroAtributo = z.object({
  key: catalogoKey,
  valores: z
    .array(z.string().trim().min(1).max(200))
    .min(1, 'Un filtro por atributo necesita al menos un valor.')
    .max(50, 'Demasiados valores en un filtro de atributo.'),
});

/**
 * Todos los ejes son opcionales y se combinan en AND. Un objeto vacío es un segmento legítimo:
 * "toda la base" (menos las bajas, que se excluyen siempre en el service).
 */
const segmentoFiltros = z
  .object({
    atributos: z.array(filtroAtributo).max(10).optional(),
    rolContacto: z.array(catalogoKey).max(50).optional(),
    semaforoLead: z.array(catalogoKey).max(50).optional(),
    nivelInteres: z.array(catalogoKey).max(50).optional(),
    estadoComercial: z.array(z.enum(ESTADOS_COMERCIALES)).max(10).optional(),
    tagIds: z.array(objectId).max(50).optional(),
  })
  .strict();

const paginacion = {
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
};

export const previewSegmentoSchema = z.object({
  body: z.object({ filtros: segmentoFiltros }).strict(),
  params: empty,
  query: empty,
});

/**
 * `lanzar` y `programadaPara` son excluyentes: un cuerpo con las dos cosas describe dos momentos de
 * arranque a la vez, y elegir uno por él sería adivinar. `programadaPara` en el pasado también es
 * un `400`: casi siempre es un error de zona horaria, y arrancar "ya" no es lo que se pidió.
 */
export const createCampaignSchema = z.object({
  body: z
    .object({
      nombre: z.string().trim().min(1, 'El nombre es obligatorio.').max(120),
      filtros: segmentoFiltros,
      templateId: objectId,
      parametros: z.array(z.string().max(1000)).max(20).default([]),
      lanzar: z.boolean().optional(),
      programadaPara: z.string().datetime({ offset: true }).optional(),
    })
    .strict()
    .refine((b) => !(b.lanzar && b.programadaPara), {
      message: 'Elige una cosa: lanzar ahora («lanzar») o programar («programadaPara»).',
      path: ['programadaPara'],
    })
    .refine((b) => !b.programadaPara || new Date(b.programadaPara).getTime() > Date.now(), {
      message: 'La fecha de programación debe estar en el futuro.',
      path: ['programadaPara'],
    }),
  params: empty,
  query: empty,
});

export const listCampaignsSchema = z.object({
  body: empty,
  params: empty,
  query: z.object({ ...paginacion, estado: z.enum(ESTADOS_CAMPANA).optional() }),
});

export const campaignIdSchema = z.object({
  body: empty,
  params: z.object({ id: objectId }),
  query: empty,
});

export const listRecipientsSchema = z.object({
  body: empty,
  params: z.object({ id: objectId }),
  query: z.object({ ...paginacion, estado: z.enum(ESTADOS_DESTINATARIO).optional() }),
});

/** Transiciones sin cuerpo: el destino lo dicta la ruta, no el cliente. */
export const transicionSchema = z.object({
  body: z.object({}).strict(),
  params: z.object({ id: objectId }),
  query: empty,
});

export type PreviewSegmentoBody = z.infer<typeof previewSegmentoSchema>['body'];
export type CreateCampaignBody = z.infer<typeof createCampaignSchema>['body'];
export type ListCampaignsQuery = z.infer<typeof listCampaignsSchema>['query'];
export type ListRecipientsQuery = z.infer<typeof listRecipientsSchema>['query'];
