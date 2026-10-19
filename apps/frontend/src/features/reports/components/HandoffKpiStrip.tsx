import { Bot, CircleCheck, Headset, Percent } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { KpiCell, KpiStripCard, KpiStripSkeleton } from '@/components/charts/KpiCell';
import { formatEntero, formatPorcentaje } from '@/lib/format';
import type { HandoffRate } from '../types/index.js';

interface Props {
  rate: HandoffRate | undefined;
  isLoading: boolean;
}

// Mismo lenguaje que AdvisorKpiStrip (HU-REP-01): una franja con divisores de 1px.
const COLUMNAS = 'grid-cols-2 xl:grid-cols-4';

/**
 * Cifras del periodo. La celda con acento va PRIMERO porque es la respuesta a la historia: qué parte
 * de lo que atiende Sofi termina en manos de una persona.
 */
export function HandoffKpiStrip({ rate, isLoading }: Props): React.ReactElement {
  if (isLoading || !rate) {
    return <KpiStripSkeleton count={4} columns={COLUMNAS} />;
  }

  const reescaladas = rate.handoffsRegistrados - rate.transferidas;

  return (
    <KpiStripCard columns={COLUMNAS}>
      <KpiCell
        accent
        icon={Percent}
        label="Tasa de escalamiento"
        value={formatPorcentaje(rate.tasaEscalamiento)}
        detail="De las conversaciones con Sofi llegan a un asesor"
      >
        <Progress
          value={Math.min(100, rate.tasaEscalamiento * 100)}
          className="mt-1 h-1.5 bg-primary/15"
          aria-label={`Tasa de escalamiento: ${formatPorcentaje(rate.tasaEscalamiento)}`}
        />
      </KpiCell>
      <KpiCell
        icon={Bot}
        label="Conversaciones con Sofi"
        value={formatEntero(rate.conversacionesIa)}
        detail="Sofi respondió o transfirió en el periodo"
      />
      <KpiCell
        icon={CircleCheck}
        label="Resueltas por Sofi"
        value={formatEntero(rate.resueltasPorIa)}
        detail="Sin transferir a un asesor"
      />
      <KpiCell
        icon={Headset}
        label="Transferidas a un asesor"
        value={formatEntero(rate.transferidas)}
        detail={
          reescaladas > 0
            ? `${formatEntero(rate.handoffsRegistrados)} transferencias: algunas volvieron a escalar`
            : 'Una por conversación'
        }
      />
    </KpiStripCard>
  );
}
