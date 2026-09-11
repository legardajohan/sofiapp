import { useQuery } from '@tanstack/react-query';
import type { UseQueryResult } from '@tanstack/react-query';
import { fetchConversationOverview } from '../api.js';
import type { ConversationOverviewDTO } from '../types.js';

/**
 * Cabecera, etiquetas, resumen y permisos de la conversación activa (HU-IA-04).
 *
 * Va aparte de `useThread` a propósito: el hilo pagina y se refresca con `message:new`, mientras
 * que esto solo cambia cuando cambia la conversación en sí. Separarlos evita volver a pedir el
 * resumen cada vez que llega un mensaje.
 */
export function useConversationOverview(
  conversationId: string | null,
): UseQueryResult<ConversationOverviewDTO> {
  return useQuery({
    queryKey: ['conversation-overview', conversationId],
    queryFn: () => fetchConversationOverview(conversationId as string),
    enabled: !!conversationId,
  });
}
