import { z } from 'zod';
import { DIA_MS } from '../../utils/date-range.util.js';
import { RANGO_MAX_DIAS, TOP_DEFAULT, TOP_MAX } from './reports.types.js';

const rangoQueryBase = z.object({
  desde: z.coerce.date().optional(),
  hasta: z.coerce.date().optional(),
});

type RangoBase = z.infer<typeof rangoQueryBase>;

/** Las reglas del rango, aplicables a cualquier query que lo extienda (HU-REP-03 añade `top`). */
function conReglasDeRango<O extends RangoBase>(schema: z.ZodType<O, z.ZodTypeDef, unknown>) {
  return schema
    .refine((q) => !q.desde || !q.hasta || q.hasta >= q.desde, {
      message: '`hasta` debe ser igual o posterior a `desde`.',
      path: ['hasta'],
    })
    .refine(
      (q) => !q.desde || !q.hasta || q.hasta.getTime() - q.desde.getTime() <= RANGO_MAX_DIAS * DIA_MS,
      { message: `El rango no puede superar ${RANGO_MAX_DIAS} días.`, path: ['desde'] },
    );
}

/** Rango `desde`/`hasta` común a todos los reportes de tenant (HU-REP-01, HU-REP-02, HU-REP-03). */
export const rangoReporteQuerySchema = z.object({ query: conReglasDeRango(rangoQueryBase) });

export type RangoReporteQuery = z.infer<typeof rangoReporteQuerySchema>['query'];

export const advisorReportQuerySchema = rangoReporteQuerySchema;
export type AdvisorReportQuery = RangoReporteQuery;

export const handoffRateQuerySchema = rangoReporteQuerySchema;
export type HandoffRateQuery = RangoReporteQuery;

export const topProductsQuerySchema = z.object({
  query: conReglasDeRango(
    rangoQueryBase.extend({
      top: z.coerce.number().int().min(1).max(TOP_MAX).default(TOP_DEFAULT),
    }),
  ),
});
export type TopProductsQuery = z.infer<typeof topProductsQuerySchema>['query'];
