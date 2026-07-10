import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { disconnectSocket, getSocket } from '../../../lib/socket.js';
import type { RealtimeConversationEvent, RealtimeMessageEvent } from '../types.js';

/**
 * Suscribe la bandeja al gateway Socket.IO: cada evento invalida la caché de TanStack Query
 * para que la lista y el hilo se actualicen en vivo, sin recargar.
 */
export function useInboxRealtime(): void {
  const qc = useQueryClient();

  useEffect(() => {
    const socket = getSocket();

    const onMessage = (evt: RealtimeMessageEvent): void => {
      void qc.invalidateQueries({ queryKey: ['conversations'] });
      void qc.invalidateQueries({ queryKey: ['thread', evt.conversationId] });
    };
    const onConversation = (evt: RealtimeConversationEvent): void => {
      void qc.invalidateQueries({ queryKey: ['conversations'] });
      void qc.invalidateQueries({ queryKey: ['thread', evt.conversationId] });
    };

    socket.on('message:new', onMessage);
    socket.on('conversation:updated', onConversation);

    return () => {
      socket.off('message:new', onMessage);
      socket.off('conversation:updated', onConversation);
      disconnectSocket();
    };
  }, [qc]);
}
