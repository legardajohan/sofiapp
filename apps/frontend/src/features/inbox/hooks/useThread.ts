import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchThread,
  markConversationRead,
  sendMediaReply,
  sendReply,
  setSofiEnabled,
} from '../api.js';
import type { MessageDTO, Paginated } from '../types.js';

export function useThread(conversationId: string | null) {
  return useQuery<Paginated<MessageDTO>>({
    queryKey: ['thread', conversationId],
    queryFn: () => fetchThread(conversationId as string),
    enabled: !!conversationId,
  });
}

export function useSendReply(conversationId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (texto: string) => sendReply(conversationId as string, texto),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['thread', conversationId] });
      void qc.invalidateQueries({ queryKey: ['conversations'] });
    },
  });
}

/**
 * Envío de un archivo, con el progreso de subida expuesto para la barra del composer.
 *
 * El progreso vive aquí y no en el componente porque la mutación es quien sabe cuándo empieza y
 * cuándo termina; el composer solo lo pinta.
 */
export function useSendMedia(conversationId: string | null) {
  const qc = useQueryClient();
  const [progreso, setProgreso] = useState<number | null>(null);

  const mutation = useMutation({
    mutationFn: ({ archivo, caption }: { archivo: File; caption: string }) => {
      setProgreso(0);
      return sendMediaReply(conversationId as string, archivo, caption, setProgreso);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['thread', conversationId] });
      void qc.invalidateQueries({ queryKey: ['conversations'] });
    },
    onSettled: () => setProgreso(null),
  });

  return { ...mutation, progreso };
}

export function useMarkRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (conversationId: string) => markConversationRead(conversationId),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['conversations'] }),
  });
}

export function useSetSofi(conversationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (habilitada: boolean) => setSofiEnabled(conversationId, habilitada),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['conversations'] });
      void qc.invalidateQueries({ queryKey: ['thread', conversationId] });
    },
  });
}
