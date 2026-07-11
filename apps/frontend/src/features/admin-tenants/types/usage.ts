export type QuotaMetric = 'usuarios' | 'mensajesMes' | 'leads' | 'campanasMes';

export interface IMetricUsage {
  usado: number;
  limite: number;
  restante: number;
  porcentaje: number;
}

export interface IUsageResponse {
  tenantId: string;
  periodo: string;
  plan: { _id: string; nombre: string } | null;
  metrics: Record<QuotaMetric, IMetricUsage>;
}
