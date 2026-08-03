import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { deleteLead } from '../api.js';
import { motivo as mensajeDeError } from '../lib/errors.js';
import type { MotivoEliminacion } from '../types.js';

/**
 * Borra el lead y devuelve la conversación a su estado anterior a la conversión.
 *
 * `clienteId` es la conversación de la que nació: sin él la cabecera seguiría mostrando "Lead
 * creado" y la ficha seguiría pintando una tarjeta de algo que ya no existe.
 */
export function useDeleteLead(leadId: string, clienteId: string | null) {
  const qc = useQueryClient();

  return useMutation<void, unknown, MotivoEliminacion>({
    mutationFn: (razon) => deleteLead(leadId, razon),
    onSuccess: () => {
      // `removeQueries`, no `invalidateQueries`: invalidar refetchearía un lead borrado para
      // recibir un 404 y pintar el estado de error de la tarjeta antes de que desaparezca.
      qc.removeQueries({ queryKey: ['lead', leadId] });
      void qc.invalidateQueries({ queryKey: ['conversations'] });
      if (clienteId) void qc.invalidateQueries({ queryKey: ['contact-history', clienteId] });
      toast.success('Lead eliminado', {
        description: 'La conversación vuelve a estar disponible para convertirla.',
      });
    },
    onError: (error) => {
      toast.error(mensajeDeError(error, 'No se pudo eliminar el lead.'), {
        description: 'Intenta de nuevo en unos segundos.',
      });
    },
  });
}
