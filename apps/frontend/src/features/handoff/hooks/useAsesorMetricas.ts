import { useQuery } from '@tanstack/react-query';
import type { UseQueryResult } from '@tanstack/react-query';
import { fetchAsesorMetricas } from '../api.js';
import type { AsesorMetricasDTO } from '../types.js';

/**
 * Cómo está repartido el trabajo, para el modal de asignación (HU-IA-07).
 *
 * `enabled: abierto` + `staleTime: 0`: cada apertura vuelve a pedir los datos. Cambian con cada
 * transferencia, y leer una foto de hace media hora para decidir el reparto de ahora sería peor
 * que no enseñarla.
 */
export function useAsesorMetricas(abierto: boolean): UseQueryResult<AsesorMetricasDTO[]> {
  return useQuery({
    queryKey: ['asesor-metricas'],
    queryFn: fetchAsesorMetricas,
    enabled: abierto,
    staleTime: 0,
  });
}
