import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import axios from 'axios';
import { updateLeadSemaforo } from '../api.js';

/** Mensaje del backend si lo hay: "Ese semáforo no existe…" dice más que un genérico. */
function motivo(error: unknown, fallback: string): string {
  if (axios.isAxiosError(error) && typeof error.response?.data?.message === 'string') {
    return error.response.data.message;
  }
  return fallback;
}

/**
 * Cambia el semáforo comercial de un lead (HU-CRM-04).
 *
 * Invalida el listado en vez de parchear la fila a mano, por el mismo motivo que
 * `useUpdateLeadEstado`: el filtro por semáforo puede estar activo, y un lead que acaba de dejar de
 * cumplirlo tiene que desaparecer de la tabla —y el `total` bajar— en lugar de quedarse ahí
 * mintiendo. También se invalida el historial, que acaba de ganar una entrada.
 */
export function useUpdateLeadSemaforo() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: ({ id, semaforo }: { id: string; semaforo: string | null }) =>
      updateLeadSemaforo(id, semaforo),
    onSuccess: (_lead, { id }) => {
      void qc.invalidateQueries({ queryKey: ['leads'] });
      void qc.invalidateQueries({ queryKey: ['historial-semaforo', id] });
      // La bandeja muestra el chip de semáforo de la conversación, que se sincroniza con esto.
      void qc.invalidateQueries({ queryKey: ['conversations'] });
      toast.success('Semáforo actualizado');
    },
    onError: (error) => toast.error(motivo(error, 'No se pudo cambiar el semáforo del lead.')),
  });
}
