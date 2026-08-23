import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import axios from 'axios';
import { updateLeadEstado } from '../api.js';

/** Mensaje del backend si lo hay: "Ese estado no existe…" dice más que un genérico. */
function motivo(error: unknown, fallback: string): string {
  if (axios.isAxiosError(error) && typeof error.response?.data?.message === 'string') {
    return error.response.data.message;
  }
  return fallback;
}

/**
 * Cambia la etapa de un lead (HU-CRM-03).
 *
 * Invalida el listado en vez de parchear la fila a mano: el filtro por estado puede estar activo, y
 * un lead que acaba de dejar de cumplirlo tiene que desaparecer de la tabla —y el `total` bajar—
 * en lugar de quedarse ahí mintiendo.
 */
export function useUpdateLeadEstado() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: ({ id, estado }: { id: string; estado: string }) => updateLeadEstado(id, estado),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['leads'] });
    },
    onError: (error) => toast.error(motivo(error, 'No se pudo cambiar el estado del lead.')),
  });
}
