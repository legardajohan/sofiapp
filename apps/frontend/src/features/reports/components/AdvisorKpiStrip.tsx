import { DollarSign, Headset, MessageSquareReply, UserCheck } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { KpiCell, KpiStripCard, KpiStripSkeleton } from '@/components/charts/KpiCell';
import { formatEntero, formatPorcentaje } from '@/lib/format';
import type { AdvisorReport } from '../types/index.js';

interface Props {
  report: AdvisorReport | undefined;
  isLoading: boolean;
}

// Mismo lenguaje que el KpiStrip del tablero global (HU-SAAS-03): una franja con divisores de 1px.
const COLUMNAS = 'grid-cols-2 xl:grid-cols-4';

/** Totales del equipo en el periodo. La celda con acento es Ventas, con su tasa de cierre. */
export function AdvisorKpiStrip({ report, isLoading }: Props): React.ReactElement {
  if (isLoading || !report) {
    return <KpiStripSkeleton count={4} columns={COLUMNAS} />;
  }

  const { totales, sinAsignar } = report;

  return (
    <KpiStripCard columns={COLUMNAS}>
      <KpiCell
        icon={Headset}
        label="Asesores"
        value={formatEntero(totales.asesores)}
        detail="Con cuenta activa o con cifras en el periodo"
      />
      <KpiCell
        icon={MessageSquareReply}
        label="Conversaciones atendidas"
        value={formatEntero(totales.conversacionesAtendidas)}
        detail={
          sinAsignar.conversacionesAtendidas > 0
            ? `${formatEntero(sinAsignar.conversacionesAtendidas)} sin asesor asignado`
            : 'Con al menos una respuesta de un asesor'
        }
      />
      <KpiCell
        icon={UserCheck}
        label="Asignadas activas"
        value={formatEntero(totales.asignadasActivas)}
        detail="A cargo de un asesor y con mensajes"
      />
      <KpiCell
        accent
        icon={DollarSign}
        label="Ventas cerradas"
        value={formatEntero(totales.ventas)}
        detail={`${formatPorcentaje(totales.tasaCierre)} de las conversaciones atendidas`}
      >
        <Progress
          value={Math.min(100, totales.tasaCierre * 100)}
          className="mt-1 h-1.5 bg-primary/15"
          aria-label={`Tasa de cierre: ${formatPorcentaje(totales.tasaCierre)}`}
        />
      </KpiCell>
    </KpiStripCard>
  );
}
