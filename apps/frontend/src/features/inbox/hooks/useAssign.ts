import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { assignConversation } from '../api.js';

export function useAssign(conversationId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (asignadoA: string | null) =>
      assignConversation(conversationId as string, asignadoA),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['conversations'] });
    },
    onError: () => {
      toast.error('No se pudo actualizar la asignación', {
        description: 'Intenta de nuevo en unos segundos.',
      });
    },
  });
}
