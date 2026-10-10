import { z } from 'zod';
import { ESTADOS_COMERCIALES } from '../cliente/cliente.types.js';
import { ESTADOS_CAMPANA, ESTADOS_DESTINATARIO, INTENCIONES_COMPRA } from './campaign.types.js';

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
    intencionCompra: z.array(z.enum(INTENCIONES_COMPRA)).max(3).optional(),
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

// ─── HU-MARK-03 — programación con imagen (multipart) ──────────────────────────

/**
 * En un multipart todo campo de texto llega como `string`: `filtros` y `parametros` viajan como
 * JSON serializado. Un JSON roto se deja pasar tal cual para que falle el schema de debajo con un
 * `400` legible en vez de reventar aquí con un `SyntaxError` → 500.
 */
function jsonDe<T extends z.ZodTypeAny>(schema: T): z.ZodType<z.infer<T>> {
  return z.preprocess((valor) => {
    if (typeof valor !== 'string') return valor;
    try {
      return JSON.parse(valor) as unknown;
    } catch {
      return valor;
    }
  }, schema) as unknown as z.ZodType<z.infer<T>>;
}

/**
 * Antelación mínima al programar. Por debajo de un minuto no es "programar", es "lanzar tarde", y
 * el job diferido podría dispararse antes de que termine la propia petición.
 */
export const ANTELACION_MINIMA_MS = 60_000;

const programadaParaFutura = z
  .string()
  .datetime({ offset: true })
  .refine((iso) => new Date(iso).getTime() - Date.now() >= ANTELACION_MINIMA_MS, {
    message: 'Programa la campaña con al menos un minuto de antelación.',
  });

const scheduleBody = z
  .object({
    nombre: z.string().trim().min(1, 'El nombre es obligatorio.').max(120),
    filtros: jsonDe(segmentoFiltros),
    templateId: objectId,
    parametros: jsonDe(z.array(z.string().max(1000)).max(20)),
    programadaPara: programadaParaFutura,
  })
  .strict();

/** `POST /api/campaigns/schedule`. La imagen no pasa por Zod: la deja multer en `req.file`. */
export const scheduleCampaignSchema = z.object({
  body: scheduleBody,
  params: empty,
  query: empty,
});

/**
 * `PATCH /api/campaigns/:id/schedule`. Todo opcional; `quitarImagen` llega como texto de multipart,
 * así que solo se acepta el literal `'true'` y se traduce a booleano.
 */
export const rescheduleCampaignSchema = z.object({
  body: z
    .object({
      nombre: z.string().trim().min(1, 'El nombre es obligatorio.').max(120).optional(),
      filtros: jsonDe(segmentoFiltros).optional(),
      templateId: objectId.optional(),
      parametros: jsonDe(z.array(z.string().max(1000)).max(20)).optional(),
      programadaPara: programadaParaFutura.optional(),
      quitarImagen: z
        .literal('true')
        .transform(() => true)
        .optional(),
    })
    .strict(),
  params: z.object({ id: objectId }),
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

// ─── Métricas (HU-MARK-04) ──────────────────────────────────────────────────────

/**
 * Zona horaria IANA del navegador, para cortar la serie diaria por días **del usuario**: en UTC, lo
 * que en Bogotá pasa a las 8 p. m. caería en el día siguiente. Inválida → 400, no UTC en silencio.
 */
const zonaHoraria = z
  .string()
  .max(64)
  .refine(
    (zona) => {
      try {
        new Intl.DateTimeFormat('en-CA', { timeZone: zona });
        return true;
      } catch {
        return false;
      }
    },
    { message: 'Zona horaria inválida.' },
  )
  .default('UTC');

export const campaignMetricsSchema = z.object({
  body: empty,
  params: z.object({ id: objectId }),
  query: z.object({ zona: zonaHoraria }),
});

/** Tope del rango del resumen: un año. Más es una auditoría, no un tablero. */
const RANGO_MAXIMO_MS = 366 * 86_400_000;

export const campaignsOverviewSchema = z.object({
  body: empty,
  params: empty,
  query: z
    .object({
      desde: z.coerce.date(),
      // Ausente = ahora: "los últimos N días" es el caso de la pantalla.
      hasta: z.coerce.date().optional(),
      zona: zonaHoraria,
    })
    .transform((q) => ({ desde: q.desde, hasta: q.hasta ?? new Date(), zona: q.zona }))
    .refine((q) => q.hasta.getTime() >= q.desde.getTime(), {
      message: '`hasta` debe ser posterior a `desde`.',
      path: ['hasta'],
    })
    .refine((q) => q.hasta.getTime() - q.desde.getTime() <= RANGO_MAXIMO_MS, {
      message: 'El rango no puede superar 366 días.',
      path: ['desde'],
    }),
});

export type PreviewSegmentoBody = z.infer<typeof previewSegmentoSchema>['body'];
export type CreateCampaignBody = z.infer<typeof createCampaignSchema>['body'];
export type ListCampaignsQuery = z.infer<typeof listCampaignsSchema>['query'];
export type ListRecipientsQuery = z.infer<typeof listRecipientsSchema>['query'];
export type ScheduleCampaignBody = z.infer<typeof scheduleCampaignSchema>['body'];
export type RescheduleCampaignBody = z.infer<typeof rescheduleCampaignSchema>['body'];
export type CampaignsOverviewQuery = z.infer<typeof campaignsOverviewSchema>['query'];
export type CampaignMetricsQuery = z.infer<typeof campaignMetricsSchema>['query'];
