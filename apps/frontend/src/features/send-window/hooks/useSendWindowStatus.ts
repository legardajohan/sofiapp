import { useQuery } from '@tanstack/react-query';
import type { UseQueryResult } from '@tanstack/react-query';
import { fetchSendWindowStatus } from '../api.js';
import type { SendWindowStatus } from '../types.js';

export const STATUS_KEY = ['send-window', 'status'] as const;

/**
 * Estado actual de la ventana por categoría. Se refresca cada minuto: una franja abre y cierra con
 * el reloj, sin que nadie toque nada, y el banner de la bandeja tiene que enterarse solo.
 */
export function useSendWindowStatus(enabled = true): UseQueryResult<SendWindowStatus> {
  return useQuery({
    queryKey: STATUS_KEY,
    queryFn: fetchSendWindowStatus,
    enabled,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}
