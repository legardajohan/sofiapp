import { Activity, CalendarDays, Clock, Inbox } from 'lucide-react';
import { KpiCell, KpiStripCard, KpiStripSkeleton } from '@/components/charts/KpiCell';
import { formatEntero, formatPorcentaje } from '@/lib/format';
import { formatDiaLargo, formatFranja } from '../lib/peak-hours-format.js';
import type { PeakHours } from '../types/index.js';

interface Props {
  report: PeakHours | undefined;
  isLoading: boolean;
}

// Mismo lenguaje que las franjas de HU-REP-02/03: celdas con divisores de 1px.
const COLUMNAS = 'grid-cols-2 xl:grid-cols-4';
const DETALLE = 'truncate first-letter:uppercase';

/**
 * Cifras del periodo. La hora pico va primero y con acento: es la respuesta a la historia, y la que
 * decide cuánta gente hace falta conectada y cuándo.
 */
export function PeakHoursKpiStrip({ report, isLoading }: Props): React.ReactElement {
  if (isLoading || !report) {
    return <KpiStripSkeleton count={4} columns={COLUMNAS} />;
  }

  const { totales, pico, diaPico, porDia } = report;
  const promedioDiario = porDia.length ? totales.entrantes / porDia.length : 0;

  return (
    <KpiStripCard columns={COLUMNAS}>
      {pico ? (
        <KpiCell
          accent
          icon={Clock}
          label="Hora pico"
          value={formatFranja(pico.hora)}
          detail={`${formatEntero(pico.entrantes)} recibidos, ${formatPorcentaje(pico.entrantes / totales.entrantes)} del total`}
        />
      ) : (
        <KpiCell
          accent
          icon={Clock}
          label="Hora pico"
          value="Sin datos"
          valueClassName="text-muted-foreground"
          detail="Ningún cliente escribió en el periodo"
        />
      )}
      <KpiCell
        icon={Inbox}
        label="Mensajes recibidos"
        value={formatEntero(totales.entrantes)}
        detail={`${formatEntero(totales.salientes)} enviados en el mismo periodo`}
        detailClassName={DETALLE}
      />
      <KpiCell
        icon={CalendarDays}
        label="Día de más demanda"
        value={diaPico ? formatEntero(diaPico.entrantes) : '0'}
        detail={diaPico ? formatDiaLargo(diaPico.fecha) : 'Sin mensajes recibidos'}
        detailClassName={DETALLE}
      />
      <KpiCell
        icon={Activity}
        label="Promedio diario"
        value={formatEntero(Math.round(promedioDiario))}
        detail={`Recibidos por día en ${formatEntero(porDia.length)} días`}
        detailClassName={DETALLE}
      />
    </KpiStripCard>
  );
}
