import { RefreshCw, TriangleAlert } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { useGlobalMetrics } from '../hooks/useGlobalMetrics.js';
import { useMetricsFilters } from '../hooks/useMetricsFilters.js';
import { MetricsFilters } from '../components/MetricsFilters.js';
import { KpiStrip } from '../components/KpiStrip.js';
import { PlanDistributionChart } from '../components/PlanDistributionChart.js';
import { TenantStatusChart } from '../components/TenantStatusChart.js';
import { MonthlyTrendChart } from '../components/MonthlyTrendChart.js';
import { TopTenantsChart } from '../components/TopTenantsChart.js';
import { TenantMetricsTable } from '../components/TenantMetricsTable.js';

const horaCorta = new Intl.DateTimeFormat('es-CO', { hour: 'numeric', minute: '2-digit' });

/** Tablero global del SaaS (HU-SAAS-03). Solo superadmin: la guarda vive en `AdminRoutes`. */
export function AdminMetricsPage(): React.ReactElement {
  const filters = useMetricsFilters();
  const { data, isPending, isFetching, isError, refetch } = useGlobalMetrics(filters.params);
  const conRango = filters.rango.desde !== undefined || filters.rango.hasta !== undefined;

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 p-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Métricas globales</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Cómo van todas las empresas de la plataforma
            {data && <>. Datos de las {horaCorta.format(new Date(data.generadoAt))}</>}
          </p>
        </div>
        <MetricsFilters filters={filters} />
      </header>

      {isError && !data ? (
        <Alert variant="destructive">
          <TriangleAlert className="size-4" />
          <AlertTitle>No pudimos cargar las métricas</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center gap-3">
            Revisa tu conexión y vuelve a intentarlo.
            <Button variant="outline" size="sm" onClick={() => void refetch()}>
              <RefreshCw className="size-3.5" />
              Reintentar
            </Button>
          </AlertDescription>
        </Alert>
      ) : (
        <>
          <KpiStrip consolidado={data?.consolidado} isLoading={isPending} conRango={conRango} />

          <div className="grid gap-6 lg:grid-cols-2">
            <PlanDistributionChart planes={data?.consolidado.planes} isLoading={isPending} />
            <TenantStatusChart empresas={data?.consolidado.empresas} isLoading={isPending} />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <MonthlyTrendChart serie={data?.serieMensual} isLoading={isPending} />
            <TopTenantsChart rango={filters.rango} />
          </div>

          <TenantMetricsTable
            porEmpresa={data?.porEmpresa}
            isLoading={isPending}
            isFetching={isFetching && !isPending}
            filters={filters}
          />
        </>
      )}
    </div>
  );
}
