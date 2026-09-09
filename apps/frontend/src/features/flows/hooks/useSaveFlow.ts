import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { createFlow, updateFlow } from '../api.js';
import { motivo, nodeErroresDesde } from '../lib/errors.js';
import { useFlowStore } from '../useFlowStore.js';
import type { FlowDTO, INodo, SaveFlowPayload } from '../types.js';

interface SaveFlowVars {
  payload: SaveFlowPayload;
  /** El mismo array que viaja en `payload.nodos`: sirve para mapear el índice de un error de Zod
   *  de vuelta al `id` del nodo. */
  nodos: INodo[];
}

/** Crea el flujo si `id` es `undefined` (primer guardado), o lo actualiza si ya existe. */
export function useSaveFlow(id: string | undefined) {
  const qc = useQueryClient();
  const setNodeErrors = useFlowStore((s) => s.setNodeErrors);

  return useMutation<FlowDTO, unknown, SaveFlowVars>({
    mutationFn: ({ payload }) => (id ? updateFlow(id, payload) : createFlow(payload)),
    onSuccess: (flow) => {
      setNodeErrors({});
      void qc.invalidateQueries({ queryKey: ['flows'] });
      qc.setQueryData(['flow', flow.id], flow);
      toast.success('Flujo guardado');
    },
    onError: (error, { nodos }) => {
      setNodeErrors(nodeErroresDesde(error, nodos));
      toast.error(motivo(error, 'No se pudo guardar el flujo.'), {
        description: 'Revisa los nodos marcados en el canvas.',
      });
    },
  });
}
