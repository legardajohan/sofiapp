import { z } from 'zod';
import { METRICS_SORT_FIELDS } from './admin-metrics.types.js';

export const globalMetricsQuerySchema = z.object({
  query: z
    .object({
      desde: z.coerce.date().optional(),
      hasta: z.coerce.date().optional(),
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(100).default(20),
      sort: z.enum(METRICS_SORT_FIELDS).default('leads'),
      order: z.enum(['asc', 'desc']).default('desc'),
      search: z.string().trim().max(80).optional(),
      estado: z.enum(['activo', 'suspendido', 'prueba']).optional(),
    })
    .refine((q) => !q.desde || !q.hasta || q.hasta >= q.desde, {
      message: '`hasta` debe ser igual o posterior a `desde`.',
      path: ['hasta'],
    }),
});

export type GlobalMetricsQueryInput = z.infer<typeof globalMetricsQuerySchema>['query'];
