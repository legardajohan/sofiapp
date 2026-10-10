import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatEntero, formatPorcentaje } from '@/lib/format';
import { formatDiaLargo, formatFranja } from '../lib/peak-hours-format.js';
import type { PeakHours } from '../types/index.js';

interface Props {
  report: PeakHours | undefined;
  isLoading: boolean;
}

// Mismo lenguaje que las franjas de HU-REP-02/03: celdas con divisores de 1px.
const STRIP = 'grid grid-cols-2 gap-px overflow-hidden bg-border xl:grid-cols-4';

/**
 * Cifras del periodo. La hora pico va primero y con acento: es la respuesta a la historia, y la que
 * decide cuánta gente hace falta conectada y cuándo.
 */
export function PeakHoursKpiStrip({ report, isLoading }: Props): React.ReactElement {
  if (isLoading || !report) {
    return (
      <Card className={STRIP} aria-busy="true">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="space-y-3 bg-card p-5">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-8 w-20" />
            <Skeleton className="h-3 w-32" />
          </div>
        ))}
      </Card>
    );
  }

  const { totales, pico, diaPico, porDia } = report;
  const promedioDiario = porDia.length ? totales.entrantes / porDia.length : 0;

  return (
    <Card className={STRIP}>
      <div className="flex min-w-0 flex-col gap-1 bg-secondary p-5">
        <span className="text-sm font-medium text-primary">Hora pico</span>
        {pico ? (
          <>
            <span className="text-3xl font-semibold tabular-nums tracking-tight text-foreground">
              {formatFranja(pico.hora)}
            </span>
            <span className="text-xs text-muted-foreground">
              {formatEntero(pico.entrantes)} recibidos, {formatPorcentaje(pico.entrantes / totales.entrantes)} del total
            </span>
          </>
        ) : (
          <>
            <span className="text-3xl font-semibold tracking-tight text-muted-foreground">Sin datos</span>
            <span className="text-xs text-muted-foreground">Ningún cliente escribió en el periodo</span>
          </>
        )}
      </div>
      <Celda
        label="Mensajes recibidos"
        valor={formatEntero(totales.entrantes)}
        detalle={`${formatEntero(totales.salientes)} enviados en el mismo periodo`}
      />
      <Celda
        label="Día de más demanda"
        valor={diaPico ? formatEntero(diaPico.entrantes) : '0'}
        detalle={diaPico ? formatDiaLargo(diaPico.fecha) : 'Sin mensajes recibidos'}
      />
      <Celda
        label="Promedio diario"
        valor={formatEntero(Math.round(promedioDiario))}
        detalle={`Recibidos por día en ${formatEntero(porDia.length)} días`}
      />
    </Card>
  );
}

function Celda({ label, valor, detalle }: { label: string; valor: string; detalle: string }): React.ReactElement {
  return (
    <div className="flex min-w-0 flex-col gap-1 bg-card p-5">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-3xl font-semibold tabular-nums tracking-tight text-foreground">{valor}</span>
      <span className="truncate text-xs text-muted-foreground first-letter:uppercase">{detalle}</span>
    </div>
  );
}
