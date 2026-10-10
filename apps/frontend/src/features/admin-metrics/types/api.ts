import type { EstadoTenant } from '../../admin-tenants/types/index.js';
import type { MetricsSortField, SortOrder } from './domain.js';

/** Query de `GET /admin/metrics/global`. Fechas como `YYYY-MM-DD`. */
export interface GlobalMetricsParams {
  desde?: string;
  hasta?: string;
  page?: number;
  limit?: number;
  sort?: MetricsSortField;
  order?: SortOrder;
  search?: string;
  estado?: EstadoTenant;
}
