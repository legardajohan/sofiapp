import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { formatEntero, formatPorcentaje } from '@/lib/format';
import type { AdvisorReport } from '../types/index.js';

interface Props {
  report: AdvisorReport | undefined;
  isLoading: boolean;
}

// Mismo lenguaje que el KpiStrip del tablero global (HU-SAAS-03): una franja con divisores de 1px.
const STRIP = 'grid grid-cols-2 gap-px overflow-hidden bg-border xl:grid-cols-4';

/** Totales del equipo en el periodo. La celda con acento es Ventas, con su tasa de cierre. */
export function AdvisorKpiStrip({ report, isLoading }: Props): React.ReactElement {
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

  const { totales, sinAsignar } = report;
  const celdas = [
    { key: 'asesores', label: 'Asesores', valor: totales.asesores, detalle: 'Con cuenta activa o con cifras en el periodo' },
    {
      key: 'atendidas',
      label: 'Conversaciones atendidas',
      valor: totales.conversacionesAtendidas,
      detalle:
        sinAsignar.conversacionesAtendidas > 0
          ? `${formatEntero(sinAsignar.conversacionesAtendidas)} sin asesor asignado`
          : 'Con al menos una respuesta de un asesor',
    },
    {
      key: 'asignadas',
      label: 'Asignadas activas',
      valor: totales.asignadasActivas,
      detalle: 'A cargo de un asesor y con mensajes',
    },
  ];

  return (
    <Card className={STRIP}>
      {celdas.map((c) => (
        <div key={c.key} className="flex flex-col gap-1 bg-card p-5">
          <span className="text-sm text-muted-foreground">{c.label}</span>
          <span className="text-3xl font-semibold tabular-nums tracking-tight text-foreground">{formatEntero(c.valor)}</span>
          <span className="text-xs text-muted-foreground">{c.detalle}</span>
        </div>
      ))}
      <div className="flex flex-col gap-1 bg-secondary p-5">
        <span className="text-sm font-medium text-primary">Ventas cerradas</span>
        <span className="text-3xl font-semibold tabular-nums tracking-tight text-foreground">{formatEntero(totales.ventas)}</span>
        <Progress
          value={Math.min(100, totales.tasaCierre * 100)}
          className="mt-1 h-1.5 bg-primary/15"
          aria-label={`Tasa de cierre: ${formatPorcentaje(totales.tasaCierre)}`}
        />
        <span className="text-xs text-muted-foreground">
          {formatPorcentaje(totales.tasaCierre)} de las conversaciones atendidas
        </span>
      </div>
    </Card>
  );
}
