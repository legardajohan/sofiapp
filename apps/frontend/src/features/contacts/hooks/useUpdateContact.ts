import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { updateContact } from '../api.js';
import { errorMessage } from '../lib/errors.js';
import type { ContactPatchPayload } from '../types.js';

/**
 * Guarda el parche de la ficha. Invalida también `['conversations']` porque el `nombre` se pinta en
 * la lista de la bandeja: dejarlo sin refrescar mostraría dos nombres distintos para el mismo
 * contacto en la misma pantalla.
 */
export function useUpdateContact(clienteId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: ContactPatchPayload) => updateContact(clienteId as string, payload),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['contact-history', clienteId] });
      void qc.invalidateQueries({ queryKey: ['conversations'] });
      toast.success('Datos del contacto actualizados');
    },
    onError: (error) =>
      toast.error(errorMessage(error, 'No se pudieron guardar los datos del contacto.')),
  });
}
