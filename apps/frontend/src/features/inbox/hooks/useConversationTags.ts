import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import axios from 'axios';
import { setConversationTags } from '../api.js';

function motivo(error: unknown, fallback: string): string {
  if (axios.isAxiosError(error) && typeof error.response?.data?.message === 'string') {
    return error.response.data.message;
  }
  return fallback;
}

/** Aplica el conjunto completo de etiquetas de una conversación (HU-OMNI-04). */
export function useSetConversationTags(conversationId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (tagIds: string[]) => setConversationTags(conversationId as string, tagIds),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['conversations'] }),
    onError: (error) => toast.error(motivo(error, 'No se pudieron actualizar las etiquetas.')),
  });
}
