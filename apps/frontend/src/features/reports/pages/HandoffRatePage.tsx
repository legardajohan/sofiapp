import { RefreshCw, TriangleAlert } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { PeriodFilter } from '@/components/charts/PeriodFilter';
import { usePeriodParams, type PeriodoPreset } from '@/hooks/use-period-params';
import { useHandoffRate } from '../hooks/useHandoffRate.js';
import { HandoffKpiStrip } from '../components/HandoffKpiStrip.js';
import { HandoffDonutChart } from '../components/HandoffDonutChart.js';
import { HandoffMotivoChart } from '../components/HandoffMotivoChart.js';

const PRESETS: readonly PeriodoPreset[] = ['7d', '30d', 'mes', 'personalizado'];

// El rango viene del backend en UTC (medianoche → fin de día): se lee en UTC para no correr un día.
const dia = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const diaConAnio = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

function rangoLegible(desde: string, hasta: string): string {
  return `Del ${dia.format(new Date(desde))} al ${diaConAnio.format(new Date(hasta))}`;
}

/**
 * Tasa de escalamiento IA → asesor (HU-REP-02). Mismo acceso que la productividad por asesor: las
 * guardas viven en el router (`RequireRole` + `RequireReportes`) y el backend decide (ADR 0011).
 */
export function HandoffRatePage(): React.ReactElement {
  const period = usePeriodParams({ presets: PRESETS, defaultPreset: '30d' });
  const { data, isPending, isError, refetch } = useHandoffRate(period.rango);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 p-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Tasa de escalamiento</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {data ? rangoLegible(data.rango.desde, data.rango.hasta) : 'Cuántas conversaciones pasan de Sofi a un asesor'}
          </p>
        </div>
        <PeriodFilter
          period={period}
          idPrefix="reporte-escalamiento"
          mientrasInvertido="Mostramos los últimos 30 días hasta que lo corrijas."
        />
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
          <HandoffKpiStrip rate={data} isLoading={isPending} />
          <div className="grid gap-6 lg:grid-cols-2">
            <HandoffDonutChart rate={data} isLoading={isPending} />
            <HandoffMotivoChart motivos={data?.transferidasPorMotivo} isLoading={isPending} />
          </div>
        </>
      )}
    </div>
  );
}
