import { useCallback } from 'react';
import { useIsFetching, useQueryClient, type QueryKey } from '@tanstack/react-query';

/** Cada cuánto se refrescan solos los tableros (HU-REP-05, D3). */
export const DASHBOARD_REFRESH_MS = 5 * 60 * 1000;

/**
 * Opciones a esparcir en el `useQuery` de cada tablero. La librería ya hace lo que haría un
 * `setInterval` propio, y mejor: limpia el intervalo al desmontar, salta los ticks con la pestaña
 * oculta (`focusManager`) y lo reinicia tras cada carga, también la manual.
 */
export const dashboardAutoRefresh = {
  refetchInterval: DASHBOARD_REFRESH_MS,
  refetchIntervalInBackground: false,
} as const;

export interface DashboardRefresh {
  /** Vuelve a pedir ya todas las queries activas bajo el prefijo. */
  refresh: () => Promise<void>;
  /** Hay una carga en curso bajo el prefijo: manual, automática o por cambio de filtro. */
  isRefreshing: boolean;
}

/**
 * Botón "Actualizar" de un tablero. Trabaja por prefijo de clave y no con el `refetch()` de una sola
 * query porque un tablero puede tener varias (el global tiene la principal y la del top de empresas).
 */
export function useDashboardRefresh(queryKey: QueryKey): DashboardRefresh {
  const qc = useQueryClient();
  const enCurso = useIsFetching({ queryKey });
  const refresh = useCallback(
    () => qc.refetchQueries({ queryKey, type: 'active' }),
    // Las claves son constantes de módulo (`*_KEY`): estables entre renders.
    [qc, queryKey],
  );
  return { refresh, isRefreshing: enCurso > 0 };
}
