import type { Document, Types } from 'mongoose';

export type QuotaMetric = 'usuarios' | 'mensajesMes' | 'leads' | 'campanasMes';
/** Métricas con contador mensual persistido (las demás se cuentan en vivo). */
export type MonthlyQuotaMetric = 'mensajesMes' | 'campanasMes';

export interface ITenantUsage {
  tenantId: Types.ObjectId;
  periodo: string; // 'YYYY-MM'
  mensajesMes: number;
  campanasMes: number;
}

export interface ITenantUsageDocument extends ITenantUsage, Document {}

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
