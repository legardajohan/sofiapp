import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { getSocket } from '../../../lib/socket.js';
import { useInboxStore } from '../../inbox/useInboxStore.js';
import type { RealtimeAssignedEvent } from '../../inbox/types.js';

/**
 * Dueña de la conexión Socket.IO a nivel de sesión (HU-NOTIF-01): se monta una vez en `AppLayout`,
 * no en `/inbox`. Antes, `useInboxRealtime` conectaba y desconectaba el socket al entrar/salir de la
 * bandeja, así que ningún evento —ni el toast que ya existía— llegaba si el admin estaba en otra
 * pantalla. Aquí NO se llama a `disconnectSocket()`: eso pasa al logout (`authStore.ts`).
 *
 * Reutiliza `conversation:assigned`, que ya llega solo al room del destinatario correcto
 * (`assignConversation`/`handoffConversation` en el backend) — no hace falta un evento nuevo.
 */
export function useNotificationsRealtime(): void {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const setActiveId = useInboxStore((s) => s.setActiveId);

  useEffect(() => {
    const socket = getSocket();

    const onAssigned = (evt: RealtimeAssignedEvent): void => {
      void qc.invalidateQueries({ queryKey: ['notifications', 'list'] });
      void qc.invalidateQueries({ queryKey: ['notifications', 'unread-count'] });

      const nombre = evt.conversation.nombre ?? evt.conversation.telefono;
      const esSofi = evt.actor.id === null;
      toast.success(esSofi ? 'Sofi te transfirió una conversación' : 'Nueva conversación asignada', {
        description: esSofi ? nombre : `${evt.actor.nombre ?? 'Un administrador'} te asignó a ${nombre}`,
        action: {
          label: 'Abrir',
          onClick: () => {
            navigate('/inbox');
            setActiveId(evt.conversationId);
          },
        },
      });
    };

    socket.on('conversation:assigned', onAssigned);
    return () => {
      socket.off('conversation:assigned', onAssigned);
    };
  }, [qc, navigate, setActiveId]);
}
