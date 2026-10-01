import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import axios from 'axios';
import { getWhatsAppStatus, type IChannelStatusResponse } from '../api.js';

export const CHANNEL_STATUS_KEY = ['channel', 'whatsapp', 'status'] as const;

/**
 * Estado del canal. Un 404 **no es un error**: significa «aún no conectado», y se entrega como
 * `null` para que la pantalla muestre la invitación a conectar en vez de un fallo.
 */
export function useChannelStatus(): UseQueryResult<IChannelStatusResponse | null> {
  return useQuery({
    queryKey: CHANNEL_STATUS_KEY,
    queryFn: async () => {
      try {
        return await getWhatsAppStatus();
      } catch (err) {
        if (axios.isAxiosError(err) && err.response?.status === 404) return null;
        throw err;
      }
    },
    retry: false,
  });
}
