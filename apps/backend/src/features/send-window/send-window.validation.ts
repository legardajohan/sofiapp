import { z } from 'zod';
import { esZonaHorariaValida } from '../../utils/zona-horaria.util.js';
import { aMinutos, validarSolapes, validarSolapesDia } from './send-window.policy.js';
import {
  CATEGORIAS_ENVIO,
  MAX_EXCEPCIONES,
  MAX_FRANJAS_POR_REGLA,
  MODOS_REGLA,
} from './send-window.types.js';

const empty = z.object({});

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

const horaInicio = z.string().regex(HHMM, 'Hora inválida: usa HH:mm (00:00–23:59).');
/** El fin admite además `24:00` (medianoche del día siguiente). */
const horaFin = z
  .string()
  .refine((v) => HHMM.test(v) || v === '24:00', 'Hora inválida: usa HH:mm (00:00–24:00).');

const categoria = z.enum(CATEGORIAS_ENVIO);

const franja = z
  .object({
    dias: z
      .array(z.number().int().min(0).max(6))
      .min(1, 'Elige al menos un día.')
      .refine((d) => new Set(d).size === d.length, 'Días repetidos.'),
    desde: horaInicio,
    hasta: horaFin,
  })
  // `desde > hasta` es válido: la franja cruza la medianoche y pertenece al día en que empieza.
  // `00:00–24:00` es el día completo y es válido.
  .refine((f) => f.desde !== f.hasta, {
    message: 'El inicio y el fin no pueden ser iguales.',
    path: ['hasta'],
  });

const regla = z
  .object({
    categoria,
    modo: z.enum(MODOS_REGLA),
    franjas: z
      .array(franja)
      .max(MAX_FRANJAS_POR_REGLA, `Máximo ${MAX_FRANJAS_POR_REGLA} franjas por categoría.`),
  })
  .superRefine((r, ctx) => {
    for (const message of validarSolapes(r.franjas)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message, path: ['franjas'] });
    }
  });

function esFechaValida(fecha: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return false;
  const [a, m, d] = fecha.split('-').map(Number) as [number, number, number];
  const date = new Date(Date.UTC(a, m - 1, d));
  return date.getUTCFullYear() === a && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/** Las franjas de una excepción no cruzan la medianoche: son de un solo día. */
const franjaDia = z
  .object({ desde: horaInicio, hasta: horaFin })
  .refine((f) => aMinutos(f.hasta) > aMinutos(f.desde), {
    message: 'En una excepción el fin debe ser posterior al inicio.',
    path: ['hasta'],
  });

const excepcion = z
  .object({
    fecha: z.string().refine(esFechaValida, 'Fecha inválida: usa YYYY-MM-DD.'),
    tipo: z.enum(['cerrado', 'franjas']),
    franjas: z.array(franjaDia).max(MAX_FRANJAS_POR_REGLA).optional(),
    categorias: z
      .array(categoria)
      .refine((c) => new Set(c).size === c.length, 'Categorías repetidas.')
      .optional(),
    motivo: z.string().trim().max(80, 'Máximo 80 caracteres.').optional(),
    origen: z.enum(['manual', 'festivo']).optional(),
  })
  .superRefine((e, ctx) => {
    if (e.tipo === 'franjas' && !e.franjas?.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Indica al menos una franja.', path: ['franjas'] });
    }
    for (const message of validarSolapesDia(e.franjas ?? [])) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message, path: ['franjas'] });
    }
  })
  // Una excepción `cerrado` no lleva franjas: se descartan para no guardar datos muertos.
  .transform((e) => (e.tipo === 'cerrado' ? { ...e, franjas: undefined } : e));

export const updateSendWindowSchema = z.object({
  body: z
    .object({
      activo: z.boolean(),
      zonaHoraria: z.string().refine(esZonaHorariaValida, 'Zona horaria desconocida.'),
      reglas: z.array(regla),
      excepciones: z
        .array(excepcion)
        .max(MAX_EXCEPCIONES, `Máximo ${MAX_EXCEPCIONES} excepciones.`),
    })
    .superRefine((b, ctx) => {
      const vistas = new Set<string>();
      b.reglas.forEach((r, i) => {
        if (vistas.has(r.categoria)) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Categoría repetida.', path: ['reglas', i, 'categoria'] });
        }
        vistas.add(r.categoria);
      });
      for (const c of CATEGORIAS_ENVIO) {
        if (!vistas.has(c)) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Falta la regla de «${c}».`, path: ['reglas'] });
        }
      }
      const fechas = new Set<string>();
      b.excepciones.forEach((e, i) => {
        if (fechas.has(e.fecha)) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Fecha repetida.', path: ['excepciones', i, 'fecha'] });
        }
        fechas.add(e.fecha);
      });
    }),
  params: empty,
  query: empty,
});

export const getSendWindowSchema = z.object({ body: empty, params: empty, query: empty });

export const holidaysPreviewSchema = z.object({
  body: z.object({ anio: z.number().int().min(2020, 'Año entre 2020 y 2100.').max(2100, 'Año entre 2020 y 2100.') }),
  params: empty,
  query: empty,
});

export type UpdateSendWindowBody = z.infer<typeof updateSendWindowSchema>['body'];
export type HolidaysPreviewBody = z.infer<typeof holidaysPreviewSchema>['body'];
