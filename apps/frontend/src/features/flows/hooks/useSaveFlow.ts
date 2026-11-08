import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { createFlow, updateFlow } from '../api.js';
import { detalleDeGuardado, motivo, nodeErroresDesde } from '../lib/errors.js';
import { useFlowStore } from '../useFlowStore.js';
import type { FlowSaveDTO, INodo, SaveFlowPayload } from '../types.js';

export interface SaveFlowVars {
  payload: SaveFlowPayload;
  /** El mismo array que viaja en `payload.nodos`: sirve para mapear el índice de un error de Zod
   *  de vuelta al `id` del nodo. */
  nodos: INodo[];
}

/** Crea el flujo si `id` es `undefined` (primer guardado), o lo actualiza si ya existe. */
export function useSaveFlow(id: string | undefined) {
  const qc = useQueryClient();
  const setNodeErrors = useFlowStore((s) => s.setNodeErrors);

  const mutation = useMutation<FlowSaveDTO, unknown, SaveFlowVars>({
    mutationFn: ({ payload }) => (id ? updateFlow(id, payload) : createFlow(payload)),
    onSuccess: (flow) => {
      setNodeErrors({});
      void qc.invalidateQueries({ queryKey: ['flows'] });
      qc.setQueryData(['flow', flow.id], flow);
      if (flow.desactivado) {
        toast.warning('Flujo guardado e inactivo', {
          description: 'Tus clientes vuelven a ser atendidos por Sofi hasta que corrijas los errores y lo actives.',
        });
      } else if (flow.advertencias.length > 0) {
        const n = flow.advertencias.length;
        toast.warning(`Flujo guardado con ${n} ${n === 1 ? 'pendiente' : 'pendientes'}`, {
          description: 'Puedes seguir editando. No podrás activarlo hasta corregirlos.',
        });
      } else {
        toast.success('Flujo guardado');
      }
    },
    onError: (error, vars) => {
      const detalle = detalleDeGuardado(error);
      // Guardar un flujo ACTIVO con errores no es un fallo: la página abre el modal de confirmación.
      if (detalle.codigo === 'FLOW_ACTIVO_CON_ERRORES') return;

      if (detalle.sinRespuesta) {
        // Sin conexión: el editor conserva todo en pantalla (y en el borrador local), así que lo
        // único que hay que decir es que nada se perdió y ofrecer reintentar.
        toast.error('No se pudo guardar', {
          description: 'Revisa tu conexión. Tus cambios siguen aquí y están a salvo en este navegador.',
          action: { label: 'Reintentar', onClick: () => mutation.mutate(vars) },
        });
        return;
      }

      setNodeErrors(nodeErroresDesde(error, vars.nodos));
      if (detalle.codigo === 'FLOW_CON_ERRORES') {
        toast.error('No se puede activar todavía', {
          description: 'Corrige los nodos marcados en rojo y vuelve a intentarlo.',
        });
        return;
      }
      toast.error(motivo(error, 'No se pudo guardar el flujo.'), {
        description: 'Revisa los nodos marcados en el canvas.',
      });
    },
  });

  return mutation;
}
