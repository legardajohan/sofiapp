import { RefreshCw, TriangleAlert } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { PeriodFilter } from '@/components/charts/PeriodFilter';
import { usePeriodParams, type PeriodoPreset } from '@/hooks/use-period-params';
import { usePeakHours } from '../hooks/usePeakHours.js';
import { PeakHoursKpiStrip } from '../components/PeakHoursKpiStrip.js';
import { PeakHoursByHourChart } from '../components/PeakHoursByHourChart.js';
import { PeakHoursByDayChart } from '../components/PeakHoursByDayChart.js';

const PRESETS: readonly PeriodoPreset[] = ['7d', '30d', 'mes', 'personalizado'];

/**
 * La zona del navegador: las horas pico se leen en la hora de quien mira el reporte (spec D1). Se
 * calcula una vez por carga; si `Intl` no la resuelve, el backend usa UTC.
 */
const ZONA_DEL_VISOR = ((): string | undefined => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
  } catch {
    return undefined;
  }
})();

// El rango viene del backend como días calendario en la zona: se lee en UTC para no correr un día.
const dia = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const diaConAnio = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

function rangoLegible(desde: string, hasta: string): string {
  return `Del ${dia.format(new Date(desde))} al ${diaConAnio.format(new Date(hasta))}`;
}

/**
 * Horas pico de mensajería (HU-REP-04). Mismo acceso que los otros reportes de tenant: las guardas
 * viven en el router (`RequireRole` + `RequireReportes`) y el backend decide (ADR 0011).
 */
export function PeakHoursPage(): React.ReactElement {
  const period = usePeriodParams({ presets: PRESETS, defaultPreset: '30d' });
  const { data, isPending, isError, refetch } = usePeakHours({
    ...period.rango,
    ...(ZONA_DEL_VISOR ? { tz: ZONA_DEL_VISOR } : {}),
  });

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 p-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Horas pico</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {data
              ? `${rangoLegible(data.rango.desde, data.rango.hasta)}. Horas en tu zona: ${data.timezone}`
              : 'A qué horas escriben más tus clientes'}
          </p>
        </div>
        <PeriodFilter
          period={period}
          idPrefix="reporte-horas-pico"
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
          <PeakHoursKpiStrip report={data} isLoading={isPending} />
          <PeakHoursByHourChart report={data} isLoading={isPending} />
          <PeakHoursByDayChart report={data} isLoading={isPending} />
        </>
      )}
    </div>
  );
}
