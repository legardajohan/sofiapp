import { ChartCard, ChartEmpty } from '@/components/charts/ChartCard';
import { formatFranja, formatHora } from '../lib/peak-hours-format.js';
import type { PeakHours } from '../types/index.js';
import { VolumeLineChart, type VolumePoint } from './VolumeLineChart.js';

interface Props {
  report: PeakHours | undefined;
  isLoading: boolean;
}

/**
 * La respuesta a la historia: cómo se reparte el día. Líneas y no barras porque las 24 horas son un
 * ciclo continuo y la forma de la curva —la subida de la mañana, el valle del mediodía— es el dato.
 */
export function PeakHoursByHourChart({ report, isLoading }: Props): React.ReactElement {
  const puntos: VolumePoint[] = (report?.porHora ?? []).map((h) => ({
    clave: String(h.hora),
    entrantes: h.entrantes,
    salientes: h.salientes,
  }));

  return (
    <ChartCard
      title="Por hora del día"
      description="Mensajes de todo el periodo sumados por hora. El punto marca la hora con más mensajes recibidos."
      isLoading={isLoading}
    >
      {!report || report.totales.mensajes === 0 ? (
        <ChartEmpty>No hubo mensajes en este periodo.</ChartEmpty>
      ) : (
        <VolumeLineChart
          puntos={puntos}
          pico={report.pico ? String(report.pico.hora) : null}
          formatTick={(c) => formatHora(Number(c))}
          formatTitulo={(c) => formatFranja(Number(c))}
          intervalo={2}
        />
      )}
    </ChartCard>
  );
}
