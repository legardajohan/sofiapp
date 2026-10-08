import { z } from 'zod';
import { DIA_MS } from '../../utils/date-range.util.js';
import { RANGO_MAX_DIAS } from './reports.types.js';

export const advisorReportQuerySchema = z.object({
  query: z
    .object({
      desde: z.coerce.date().optional(),
      hasta: z.coerce.date().optional(),
    })
    .refine((q) => !q.desde || !q.hasta || q.hasta >= q.desde, {
      message: '`hasta` debe ser igual o posterior a `desde`.',
      path: ['hasta'],
    })
    .refine(
      (q) => !q.desde || !q.hasta || q.hasta.getTime() - q.desde.getTime() <= RANGO_MAX_DIAS * DIA_MS,
      { message: `El rango no puede superar ${RANGO_MAX_DIAS} días.`, path: ['desde'] },
    ),
});

export type AdvisorReportQuery = z.infer<typeof advisorReportQuerySchema>['query'];
