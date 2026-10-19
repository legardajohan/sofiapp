import { CircleDashed, MessageCircleQuestionMark, Tags, Trophy } from 'lucide-react';
import { KpiCell, KpiStripCard, KpiStripSkeleton } from '@/components/charts/KpiCell';
import { formatEntero, formatPorcentaje } from '@/lib/format';
import type { TopProducts } from '../types/index.js';

interface Props {
  report: TopProducts | undefined;
  isLoading: boolean;
}

// Mismo lenguaje que las franjas de HU-REP-01/02: celdas con divisores de 1px.
const COLUMNAS = 'grid-cols-2 xl:grid-cols-4';

/**
 * Cifras del periodo. La celda con acento es la respuesta a la historia —qué se consulta más— y va
 * entre el volumen y la cobertura de la clasificación, que son el contexto para leerla.
 */
export function TopProductsKpiStrip({ report, isLoading }: Props): React.ReactElement {
  if (isLoading || !report) {
    return <KpiStripSkeleton count={4} columns={COLUMNAS} />;
  }

  const lider = report.ranking[0];
  const cobertura = report.totalConsultas ? report.clasificadas / report.totalConsultas : 0;

  return (
    <KpiStripCard columns={COLUMNAS}>
      <KpiCell
        icon={MessageCircleQuestionMark}
        label="Consultas"
        value={formatEntero(report.totalConsultas)}
        detail="Conversaciones en las que escribió el cliente"
      />
      {lider ? (
        <KpiCell
          accent
          icon={Trophy}
          label="Producto más consultado"
          value={<span title={lider.nombre}>{lider.nombre}</span>}
          valueClassName="truncate text-2xl"
          detail={`${formatEntero(lider.conversaciones)} conversaciones, ${formatPorcentaje(lider.share)} de las clasificadas`}
        />
      ) : (
        <KpiCell
          accent
          icon={Trophy}
          label="Producto más consultado"
          value="Sin datos"
          valueClassName="text-2xl text-muted-foreground"
          detail="Ninguna conversación tiene producto todavía"
        />
      )}
      <KpiCell
        icon={Tags}
        label="Clasificadas"
        value={formatEntero(report.clasificadas)}
        detail={`${formatPorcentaje(cobertura)} de las consultas`}
      />
      <KpiCell
        icon={CircleDashed}
        label="Sin clasificar"
        value={formatEntero(report.sinClasificar)}
        detail="La IA todavía no les asignó un producto"
      />
    </KpiStripCard>
  );
}
