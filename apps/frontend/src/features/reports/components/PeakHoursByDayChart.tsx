import { ChartCard, ChartEmpty } from '@/components/charts/ChartCard';
import { formatDiaCorto, formatDiaLargo } from '../lib/peak-hours-format.js';
import type { PeakHours } from '../types/index.js';
import { VolumeLineChart, type VolumePoint } from './VolumeLineChart.js';

interface Props {
  report: PeakHours | undefined;
  isLoading: boolean;
}

/** El volumen día a día: si la demanda crece o se concentra en ciertos días del periodo. */
export function PeakHoursByDayChart({ report, isLoading }: Props): React.ReactElement {
  const puntos: VolumePoint[] = (report?.porDia ?? []).map((d) => ({
    clave: d.fecha,
    entrantes: d.entrantes,
    salientes: d.salientes,
  }));

  return (
    <ChartCard
      title="Por día"
      description="Mensajes de cada día del periodo. El punto marca el día con más mensajes recibidos."
      isLoading={isLoading}
    >
      {!report || report.totales.mensajes === 0 ? (
        <ChartEmpty>No hubo mensajes en este periodo.</ChartEmpty>
      ) : (
        <VolumeLineChart
          puntos={puntos}
          pico={report.diaPico?.fecha ?? null}
          formatTick={formatDiaCorto}
          formatTitulo={formatDiaLargo}
        />
      )}
    </ChartCard>
  );
}
