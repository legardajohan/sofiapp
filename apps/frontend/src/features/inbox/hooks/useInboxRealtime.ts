import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { disconnectSocket, getSocket } from '../../../lib/socket.js';
import { useInboxStore } from '../useInboxStore.js';
import type { RealtimeAssignedEvent, RealtimeConversationEvent, RealtimeMessageEvent } from '../types.js';

/**
 * Suscribe la bandeja al gateway Socket.IO: cada evento invalida la caché de TanStack Query
 * para que la lista y el hilo se actualicen en vivo, sin recargar. `conversation:assigned`
 * solo llega al socket del destinatario (room `asesor:<id>`, ver realtime.publisher del backend),
 * así que si este cliente lo recibe, la conversación es para él.
 */
export function useInboxRealtime(): void {
  const qc = useQueryClient();
  const setActiveId = useInboxStore((s) => s.setActiveId);

  useEffect(() => {
    const socket = getSocket();

    const onMessage = (evt: RealtimeMessageEvent): void => {
      void qc.invalidateQueries({ queryKey: ['conversations'] });
      void qc.invalidateQueries({ queryKey: ['thread', evt.conversationId] });
      // Refresca la ficha para que el resumen se marque "desactualizado" al llegar mensajes nuevos.
      void qc.invalidateQueries({ queryKey: ['contact-history', evt.conversationId] });
      // Y la tira sobre el hilo, que muestra ese mismo estado (HU-IA-04).
      void qc.invalidateQueries({ queryKey: ['conversation-overview', evt.conversationId] });
    };
    const onConversation = (evt: RealtimeConversationEvent): void => {
      void qc.invalidateQueries({ queryKey: ['conversations'] });
      void qc.invalidateQueries({ queryKey: ['thread', evt.conversationId] });
      void qc.invalidateQueries({ queryKey: ['contact-history', evt.conversationId] });
      // Una etiqueta aplicada desde otra sesión tiene que llegar a la tira igual que a la lista.
      void qc.invalidateQueries({ queryKey: ['conversation-overview', evt.conversationId] });
    };
    const onAssigned = (evt: RealtimeAssignedEvent): void => {
      void qc.invalidateQueries({ queryKey: ['conversations'] });
      const nombre = evt.conversation.nombre ?? evt.conversation.telefono;
      toast.success('Nueva conversación asignada', {
        description: `${evt.actor.nombre ?? 'Un administrador'} te asignó a ${nombre}`,
        action: { label: 'Abrir', onClick: () => setActiveId(evt.conversationId) },
      });
    };

    socket.on('message:new', onMessage);
    socket.on('conversation:updated', onConversation);
    socket.on('conversation:assigned', onAssigned);

    return () => {
      socket.off('message:new', onMessage);
      socket.off('conversation:updated', onConversation);
      socket.off('conversation:assigned', onAssigned);
      disconnectSocket();
    };
  }, [qc, setActiveId]);
}
