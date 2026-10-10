import { PeriodFilter } from '@/components/charts/PeriodFilter';
import type { MetricsFilters as Filters } from '../hooks/useMetricsFilters.js';

interface Props {
  filters: Filters;
}

/** Periodo del tablero global. La pieza es compartida (`PeriodFilter`); aquí solo se configura. */
export function MetricsFilters({ filters }: Props): React.ReactElement {
  return (
    <PeriodFilter
      period={filters.period}
      idPrefix="metricas"
      mientrasInvertido="Mostramos todo el historial hasta que lo corrijas."
    />
  );
}
