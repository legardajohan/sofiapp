import type { ClientSession, Types } from 'mongoose';
import { AppError } from '../../utils/AppError.js';
import {
  countScoped,
  findOneScoped,
  findOneAndUpdateScoped,
} from '../../repositories/base.repository.js';
import { UserModel } from '../users/user.model.js';
import { Cliente } from '../cliente/cliente.model.js';
import { Tenant } from '../tenant/tenant.model.js';
import { Plan } from '../plan/plan.model.js';
import { getPlanLimits } from '../plan/plan.service.js';
import { TenantUsage } from './usage.model.js';
import type { IPlanLimites, IPlanDocument } from '../plan/plan.types.js';
import type { ITenantDocument } from '../tenant/tenant.types.js';
import type {
  QuotaMetric,
  MonthlyQuotaMetric,
  IMetricUsage,
  IUsageResponse,
  ITenantUsageDocument,
} from './usage.types.js';

type TenantId = string | Types.ObjectId;

// Roles que ocupan un "puesto"/asiento comercial (consumen la cuota `administradores`).
// El `superadmin` es global (no pertenece a un tenant) y NO ocupa asiento.
// Tras AUTH-02 los roles se colapsaron a superadmin/admin (coordinador/asesor desaparecieron;
// lo que antes eran esos puestos hoy es un `admin` con `subrol` de metadata). El único rol que
// ocupa asiento cobrable dentro del tenant es 'admin'; el superadmin es global y no cuenta.
const ROLES_CON_PUESTO = ['admin'] as const;

/** Periodo actual en formato 'YYYY-MM' (UTC en el MVP). */
export function getCurrentPeriodo(now: Date = new Date()): string {
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

async function resolveTenantWithLimits(
  tenantId: TenantId,
  session?: ClientSession,
): Promise<{ tenant: ITenantDocument | null; limites: IPlanLimites | null }> {
  const query = Tenant.findById(tenantId);
  if (session) query.session(session);
  const tenant = await query.lean<ITenantDocument>();
  const limites = tenant ? await getPlanLimits(tenant.planId ?? null) : null;
  return { tenant, limites };
}

async function readMonthlyCounter(
  tenantId: TenantId,
  metric: MonthlyQuotaMetric,
): Promise<number> {
  const doc = await findOneScoped(TenantUsage, tenantId, {
    periodo: getCurrentPeriodo(),
  }).lean<ITenantUsageDocument>();
  return doc ? (doc[metric] ?? 0) : 0;
}

/** Consumo actual de una métrica para un tenant. Totales vivos para usuarios/leads. */
export async function getMetricUsed(tenantId: TenantId, metric: QuotaMetric): Promise<number> {
  switch (metric) {
    case 'usuarios':
      return countScoped(UserModel, tenantId, { activo: true });
    case 'administradores':
      return countScoped(UserModel, tenantId, {
        activo: true,
        rol: { $in: ROLES_CON_PUESTO },
      });
    case 'leads':
      return countScoped(Cliente, tenantId, {});
    case 'mensajesMes':
    case 'campanasMes':
      return readMonthlyCounter(tenantId, metric);
  }
}

/**
 * Lanza `AppError(429)` si el tenant ya alcanzó (o superó) el límite de su plan para la métrica.
 * Es no-op si el tenant no tiene plan asignado (o su plan está inactivo).
 *
 * `session` es obligatorio cuando el tenant se está creando en la misma transacción (p. ej.
 * `createTenant`): sin ella, la lectura de `Tenant.findById` no ve el documento aún no confirmado
 * y la cuota queda como no-op siempre.
 */
export async function assertWithinQuota(
  tenantId: TenantId,
  metric: QuotaMetric,
  session?: ClientSession,
): Promise<void> {
  const { limites } = await resolveTenantWithLimits(tenantId, session);
  if (!limites) return; // sin plan → sin límites
  const usado = await getMetricUsed(tenantId, metric);
  if (usado >= limites[metric]) {
    throw new AppError(`Límite del plan alcanzado para "${metric}".`, 429);
  }
}

/** Incrementa (atómico) un contador mensual del periodo actual, creándolo si no existe. */
export async function incrementUsage(
  tenantId: TenantId,
  metric: MonthlyQuotaMetric,
  amount = 1,
): Promise<void> {
  await findOneAndUpdateScoped(
    TenantUsage,
    tenantId,
    { periodo: getCurrentPeriodo() },
    { $inc: { [metric]: amount } },
    { upsert: true, new: true },
  );
}

function buildMetric(usado: number, limite: number): IMetricUsage {
  const restante = Math.max(limite - usado, 0);
  const porcentaje = limite > 0 ? Math.round((usado / limite) * 100) : 0;
  return { usado, limite, restante, porcentaje };
}

/** Consumo vs límite por métrica para el panel del superadmin. */
export async function getTenantUsage(tenantId: TenantId): Promise<IUsageResponse> {
  const { tenant, limites } = await resolveTenantWithLimits(tenantId);
  if (!tenant) throw new AppError('Empresa no encontrada.', 404);

  const [usuarios, administradores, leads, mensajesMes, campanasMes] = await Promise.all([
    getMetricUsed(tenantId, 'usuarios'),
    getMetricUsed(tenantId, 'administradores'),
    getMetricUsed(tenantId, 'leads'),
    getMetricUsed(tenantId, 'mensajesMes'),
    getMetricUsed(tenantId, 'campanasMes'),
  ]);

  // Normaliza límites: rellena con 0 cualquier métrica ausente (p. ej. `administradores` en
  // planes creados antes de la ampliación v2), evitando NaN en el desglose.
  const l: IPlanLimites = {
    usuarios: 0,
    administradores: 0,
    mensajesMes: 0,
    leads: 0,
    campanasMes: 0,
    ...(limites ?? {}),
  };

  let plan: IUsageResponse['plan'] = null;
  if (tenant.planId) {
    const planDoc = await Plan.findById(tenant.planId).lean<IPlanDocument>();
    if (planDoc) plan = { _id: planDoc._id.toString(), nombre: planDoc.nombre };
  }

  return {
    tenantId: tenant._id.toString(),
    periodo: getCurrentPeriodo(),
    plan,
    metrics: {
      usuarios: buildMetric(usuarios, l.usuarios),
      administradores: buildMetric(administradores, l.administradores),
      mensajesMes: buildMetric(mensajesMes, l.mensajesMes),
      leads: buildMetric(leads, l.leads),
      campanasMes: buildMetric(campanasMes, l.campanasMes),
    },
  };
}
