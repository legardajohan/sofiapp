import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { formatEntero, formatPorcentaje } from '@/lib/format';
import type { HandoffRate } from '../types/index.js';

interface Props {
  rate: HandoffRate | undefined;
  isLoading: boolean;
}

// Mismo lenguaje que AdvisorKpiStrip (HU-REP-01): una franja con divisores de 1px.
const STRIP = 'grid grid-cols-2 gap-px overflow-hidden bg-border xl:grid-cols-4';

/**
 * Cifras del periodo. La celda con acento va PRIMERO porque es la respuesta a la historia: qué parte
 * de lo que atiende Sofi termina en manos de una persona.
 */
export function HandoffKpiStrip({ rate, isLoading }: Props): React.ReactElement {
  if (isLoading || !rate) {
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

  const reescaladas = rate.handoffsRegistrados - rate.transferidas;
  const celdas = [
    {
      key: 'ia',
      label: 'Conversaciones con Sofi',
      valor: rate.conversacionesIa,
      detalle: 'Sofi respondió o transfirió en el periodo',
    },
    {
      key: 'resueltas',
      label: 'Resueltas por Sofi',
      valor: rate.resueltasPorIa,
      detalle: 'Sin transferir a un asesor',
    },
    {
      key: 'transferidas',
      label: 'Transferidas a un asesor',
      valor: rate.transferidas,
      detalle:
        reescaladas > 0
          ? `${formatEntero(rate.handoffsRegistrados)} transferencias: algunas volvieron a escalar`
          : 'Una por conversación',
    },
  ];

  return (
    <Card className={STRIP}>
      <div className="flex flex-col gap-1 bg-secondary p-5">
        <span className="text-sm font-medium text-primary">Tasa de escalamiento</span>
        <span className="text-3xl font-semibold tabular-nums tracking-tight text-foreground">
          {formatPorcentaje(rate.tasaEscalamiento)}
        </span>
        <Progress
          value={Math.min(100, rate.tasaEscalamiento * 100)}
          className="mt-1 h-1.5 bg-primary/15"
          aria-label={`Tasa de escalamiento: ${formatPorcentaje(rate.tasaEscalamiento)}`}
        />
        <span className="text-xs text-muted-foreground">De las conversaciones con Sofi llegan a un asesor</span>
      </div>
      {celdas.map((c) => (
        <div key={c.key} className="flex flex-col gap-1 bg-card p-5">
          <span className="text-sm text-muted-foreground">{c.label}</span>
          <span className="text-3xl font-semibold tabular-nums tracking-tight text-foreground">{formatEntero(c.valor)}</span>
          <span className="text-xs text-muted-foreground">{c.detalle}</span>
        </div>
      ))}
    </Card>
  );
}
