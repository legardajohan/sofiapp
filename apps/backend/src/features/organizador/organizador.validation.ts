import { z } from 'zod';
import { esDiaValido, esZonaIana } from '../pendiente/pendiente.fechas.js';
import {
  ESTADOS_ORGANIZADOR,
  ETIQUETAS_MAX_POR_CONTACTO,
  MOTIVO_KEYS,
  ORGANIZADOR_LIMIT_DEFECTO,
  ORGANIZADOR_LIMIT_MAXIMO,
} from './organizador.types.js';

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'ID inválido.');
const empty = z.object({}).optional();
const dia = z.string().refine(esDiaValido, 'Fecha inválida: usa el formato AAAA-MM-DD.');
const hora = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Hora inválida: usa el formato HH:mm.');
const tz = z.string().refine(esZonaIana, 'Zona horaria inválida.').default('America/Bogota');
const textoMotivo = z
  .string()
  .trim()
  .min(3, 'Escribe al menos 3 caracteres.')
  .max(500, 'Máximo 500 caracteres.');
const tagIds = z.array(objectId).max(ETIQUETAS_MAX_POR_CONTACTO).default([]);
/**
 * `recordatorioAt` que vio el cliente: si cambió entretanto, la acción ya no aplica (409). `null`
 * solo para un pendiente legado al que el barrido aún no le calculó el aviso.
 */
const version = z.string().datetime({ offset: true, message: 'Versión inválida.' }).nullable();
const paginacion = {
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(ORGANIZADOR_LIMIT_MAXIMO).default(ORGANIZADOR_LIMIT_DEFECTO),
};
const idParams = z.object({ id: objectId });

export const getPreferenciaSchema = z.object({ body: empty, params: empty, query: empty });

export const setPreferenciaSchema = z.object({
  body: z.object({ activo: z.boolean() }),
  params: empty,
  query: empty,
});

export const listOrganizadorSchema = z.object({
  body: empty,
  params: empty,
  query: z
    .object({
      estado: z.enum(ESTADOS_ORGANIZADOR).optional(),
      desde: dia.optional(),
      hasta: dia.optional(),
      clienteId: objectId.optional(),
      responsableId: objectId.optional(),
      ...paginacion,
    })
    .refine((q) => !q.desde || !q.hasta || q.hasta >= q.desde, {
      message: 'La fecha final no puede ser anterior a la inicial.',
      path: ['hasta'],
    }),
});

/** Contadores de las pestañas: mismos filtros que el listado, sin estado ni paginación. */
export const conteosSchema = z.object({
  body: empty,
  params: empty,
  query: z.object({
    desde: dia.optional(),
    hasta: dia.optional(),
    clienteId: objectId.optional(),
    responsableId: objectId.optional(),
  }),
});

export const activosSchema = z.object({ body: empty, params: empty, query: empty });

export const historialPendienteSchema = z.object({ body: empty, params: idParams, query: empty });

export const actividadSchema = z.object({
  body: empty,
  params: empty,
  query: z.object({
    clienteId: objectId.optional(),
    responsableId: objectId.optional(),
    ...paginacion,
  }),
});

export const cerrarSchema = z.object({
  body: z
    .object({
      motivoKeys: z.array(z.enum(MOTIVO_KEYS)).max(MOTIVO_KEYS.length).default([]),
      motivoIds: z.array(objectId).max(20).default([]),
      // «Otros motivos»: el texto es obligatorio y queda solo en el evento.
      otro: z.object({ texto: textoMotivo }).optional(),
      comentario: z.string().trim().max(1000).optional(),
      tagIds,
      version,
    })
    .refine((b) => b.motivoKeys.length + b.motivoIds.length > 0 || b.otro !== undefined, {
      message: 'Elige al menos un motivo de cierre.',
      path: ['motivoKeys'],
    }),
  params: idParams,
  query: empty,
});

export const posponerSchema = z.object({
  body: z.object({
    motivo: textoMotivo,
    nuevoDia: dia,
    nuevaHora: hora,
    tz,
    tagIds,
    version,
  }),
  params: idParams,
  query: empty,
});

export const listMotivosSchema = z.object({ body: empty, params: empty, query: empty });

export const crearMotivoSchema = z.object({
  body: z.object({
    nombre: z.string().trim().min(3, 'Escribe al menos 3 caracteres.').max(80, 'Máximo 80 caracteres.'),
  }),
  params: empty,
  query: empty,
});

export type ListOrganizadorQuery = z.infer<typeof listOrganizadorSchema>['query'];
export type ConteosQuery = z.infer<typeof conteosSchema>['query'];
export type ActividadQuery = z.infer<typeof actividadSchema>['query'];
export type CerrarBody = z.infer<typeof cerrarSchema>['body'];
export type PosponerBody = z.infer<typeof posponerSchema>['body'];
