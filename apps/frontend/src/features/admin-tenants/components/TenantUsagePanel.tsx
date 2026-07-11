import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getTenantUsage, assignTenantPlan } from '../../../api/admin-tenants.js';
import type { QuotaMetric } from '../types/index.js';

interface PlanOption {
  _id: string;
  nombre: string;
}

interface Props {
  tenantId: string;
  currentPlanId?: string;
  plans: PlanOption[];
}

const METRIC_LABELS: Record<QuotaMetric, string> = {
  usuarios: 'Usuarios',
  administradores: 'Administradores',
  mensajesMes: 'Mensajes / mes',
  leads: 'Leads',
  campanasMes: 'Campañas / mes',
};

const METRIC_ORDER: QuotaMetric[] = [
  'usuarios',
  'administradores',
  'mensajesMes',
  'leads',
  'campanasMes',
];

function barColor(porcentaje: number): string {
  if (porcentaje >= 100) return 'bg-red-600';
  if (porcentaje >= 80) return 'bg-amber-500';
  return 'bg-blue-500';
}

export function TenantUsagePanel({ tenantId, currentPlanId, plans }: Props) {
  const queryClient = useQueryClient();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['tenant-usage', tenantId],
    queryFn: () => getTenantUsage(tenantId),
  });

  const assignMutation = useMutation({
    mutationFn: (planId: string) => assignTenantPlan(tenantId, planId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['tenant-usage', tenantId] });
      void queryClient.invalidateQueries({ queryKey: ['admin-tenants'] });
    },
  });

  return (
    <div className="mt-4 border-t pt-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-gray-800">Consumo del periodo</h3>
        <select
          className="rounded-md border px-2 py-1 text-sm"
          value={currentPlanId ?? ''}
          onChange={(e) => e.target.value && assignMutation.mutate(e.target.value)}
          disabled={assignMutation.isPending}
        >
          <option value="">Sin plan</option>
          {plans.map((p) => (
            <option key={p._id} value={p._id}>
              {p.nombre}
            </option>
          ))}
        </select>
      </div>

      {isLoading && <p className="text-sm text-gray-400">Cargando consumo…</p>}
      {isError && <p className="text-sm text-red-500">No se pudo cargar el consumo.</p>}

      {data && (
        <>
          {data.plan === null && (
            <p className="mb-2 rounded bg-yellow-50 px-3 py-2 text-xs text-yellow-800">
              La empresa no tiene un plan asignado: no se aplican límites.
            </p>
          )}
          <p className="mb-2 text-xs text-gray-400">Periodo {data.periodo}</p>
          <div className="space-y-3">
            {METRIC_ORDER.map((metric) => {
              const m = data.metrics[metric];
              const pct = Math.min(m.porcentaje, 100);
              return (
                <div key={metric}>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="text-gray-600">{METRIC_LABELS[metric]}</span>
                    <span className={m.porcentaje >= 80 ? 'font-medium text-amber-700' : 'text-gray-500'}>
                      {m.usado} / {m.limite} ({m.porcentaje}%)
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded bg-gray-100">
                    <div className={`h-full ${barColor(m.porcentaje)}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
