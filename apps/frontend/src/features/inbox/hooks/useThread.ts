import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchThread, markConversationRead, sendReply, setSofiEnabled } from '../api.js';
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
