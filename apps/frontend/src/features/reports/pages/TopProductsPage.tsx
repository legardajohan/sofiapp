import { useSearchParams } from 'react-router-dom';
import { RefreshCw, TriangleAlert } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PeriodFilter } from '@/components/charts/PeriodFilter';
import { usePeriodParams, type PeriodoPreset } from '@/hooks/use-period-params';
import { useTopProducts } from '../hooks/useTopProducts.js';
import { TopProductsKpiStrip } from '../components/TopProductsKpiStrip.js';
import { TopProductsChart } from '../components/TopProductsChart.js';

const PRESETS: readonly PeriodoPreset[] = ['7d', '30d', 'mes', 'personalizado'];

/** Tamaños de ranking que ofrece la UI. El API admite 1..50; estos cubren el uso real. */
const TOPS = [5, 10, 20] as const;
type Top = (typeof TOPS)[number];
const TOP_DEFAULT: Top = 10;

function leerTop(valor: string | null): Top {
  const n = Number(valor);
  return (TOPS as readonly number[]).includes(n) ? (n as Top) : TOP_DEFAULT;
}

// El rango viene del backend en UTC (medianoche → fin de día): se lee en UTC para no correr un día.
const dia = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const diaConAnio = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

function rangoLegible(desde: string, hasta: string): string {
  return `Del ${dia.format(new Date(desde))} al ${diaConAnio.format(new Date(hasta))}`;
}

/**
 * Productos más consultados (HU-REP-03). Mismo acceso que los otros reportes de tenant: las guardas
 * viven en el router (`RequireRole` + `RequireReportes`) y el backend decide (ADR 0011).
 */
export function TopProductsPage(): React.ReactElement {
  const period = usePeriodParams({ presets: PRESETS, defaultPreset: '30d' });
  const [params, setParams] = useSearchParams();
  const top = leerTop(params.get('top'));
  const { data, isPending, isError, refetch } = useTopProducts({ ...period.rango, top });

  function cambiarTop(valor: string): void {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        // El valor por defecto no ensucia la URL.
        if (Number(valor) === TOP_DEFAULT) next.delete('top');
        else next.set('top', valor);
        return next;
      },
      { replace: true },
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 p-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Productos más consultados</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {data ? rangoLegible(data.rango.desde, data.rango.hasta) : 'Qué productos preguntan más tus clientes'}
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <Tabs value={String(top)} onValueChange={cambiarTop}>
            <TabsList className="h-9" aria-label="Tamaño del ranking">
              {TOPS.map((t) => (
                <TabsTrigger key={t} value={String(t)} className="text-xs">
                  Top {t}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <PeriodFilter
            period={period}
            idPrefix="reporte-productos"
            mientrasInvertido="Mostramos los últimos 30 días hasta que lo corrijas."
          />
        </div>
      </header>

      {isError && !data ? (
        <Alert variant="destructive">
          <TriangleAlert className="size-4" />
          <AlertTitle>No pudimos cargar el reporte</AlertTitle>
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
          <TopProductsKpiStrip report={data} isLoading={isPending} />
          <TopProductsChart report={data} isLoading={isPending} />
        </>
      )}
    </div>
  );
}
