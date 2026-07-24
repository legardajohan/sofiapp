import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getTenantUsage, assignTenantPlan } from '../../../api/admin-tenants.js';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { QuotaMetric } from '../types/index.js';

// Radix Select no admite `value=""` en un item; centinela para "Sin plan".
const SIN_PLAN = '__sin_plan__';

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
  if (porcentaje >= 100) return 'bg-destructive';
  if (porcentaje >= 80) return 'bg-amber-500';
  return 'bg-primary';
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
    <div className="mt-4 border-t border-border pt-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-foreground">Consumo del periodo</h3>
        {/* Select de shadcn (Radix): el popup respeta el modo oscuro (`bg-popover`), a diferencia
            del <select> nativo cuyo desplegable usaba el tema del sistema. */}
        <Select
          value={currentPlanId ?? SIN_PLAN}
          onValueChange={(value) => value !== SIN_PLAN && assignMutation.mutate(value)}
          disabled={assignMutation.isPending}
        >
          <SelectTrigger className="h-8 w-44 text-sm">
            <SelectValue placeholder="Sin plan" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={SIN_PLAN}>Sin plan</SelectItem>
            {plans.map((p) => (
              <SelectItem key={p._id} value={p._id}>
                {p.nombre}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Cargando consumo…</p>}
      {isError && <p className="text-sm text-destructive">No se pudo cargar el consumo.</p>}

      {data && (
        <>
          {data.plan === null && (
            <p className="mb-2 rounded bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
              La empresa no tiene un plan asignado: no se aplican límites.
            </p>
          )}
          <p className="mb-2 text-xs text-muted-foreground">Periodo {data.periodo}</p>
          <div className="space-y-3">
            {METRIC_ORDER.map((metric) => {
              const m = data.metrics[metric];
              const pct = Math.min(m.porcentaje, 100);
              return (
                <div key={metric}>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">{METRIC_LABELS[metric]}</span>
                    <span
                      className={
                        m.porcentaje >= 80
                          ? 'font-medium text-amber-600 dark:text-amber-400'
                          : 'text-muted-foreground'
                      }
                    >
                      {m.usado} / {m.limite} ({m.porcentaje}%)
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded bg-muted">
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
