import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { UseMutationResult } from '@tanstack/react-query';
import axios from 'axios';
import { toast } from 'sonner';
import { aplicarSemaforo } from '../api.js';
import type { ConversationOverviewDTO } from '../types.js';

function motivo(error: unknown, fallback: string): string {
  if (axios.isAxiosError(error) && typeof error.response?.data?.message === 'string') {
    return error.response.data.message;
  }
  return fallback;
}

/**
 * Aplica la sugerencia de semáforo de la IA (HU-IA-05).
 *
 * Invalida las dos vistas que la muestran: la franja sobre el hilo y los chips de la lista. El
 * backend además emite `conversation:updated`, que `useInboxRealtime` traduce a estas mismas
 * invalidaciones para las otras sesiones abiertas — aquí se hacen igual para no depender del
 * viaje de ida y vuelta por el socket en la pestaña que pulsó.
 *
 * El error se muestra tal cual lo manda el servidor: los 409 de esta ruta son accionables
 * ("la etiqueta ya no existe", "ya está aplicada") y un mensaje genérico los desperdiciaría.
 */
export function useAplicarSemaforo(
  conversationId: string | null,
): UseMutationResult<ConversationOverviewDTO, unknown, void> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => aplicarSemaforo(conversationId as string),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['conversations'] });
      void qc.invalidateQueries({ queryKey: ['conversation-overview', conversationId] });
    },
    onError: (error) => toast.error(motivo(error, 'No se pudo aplicar el semáforo.')),
  });
}
