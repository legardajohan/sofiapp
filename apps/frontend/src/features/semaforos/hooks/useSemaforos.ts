import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import axios from 'axios';
import { createSemaforo, fetchSemaforos, updateSemaforo } from '../api.js';
import type { CreateSemaforoPayload, SemaforoDTO, UpdateSemaforoPayload } from '../types.js';

/** Mensaje del backend si lo hay: "Ya existe un semáforo con ese nombre" dice más que un genérico. */
function motivo(error: unknown, fallback: string): string {
  if (axios.isAxiosError(error) && typeof error.response?.data?.message === 'string') {
    return error.response.data.message;
  }
  return fallback;
}

export function useSemaforos() {
  return useQuery<SemaforoDTO[]>({ queryKey: ['semaforos'], queryFn: fetchSemaforos });
}

export function useCreateSemaforo() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (payload: CreateSemaforoPayload) => createSemaforo(payload),
    onSuccess: (semaforo) => {
      void qc.invalidateQueries({ queryKey: ['semaforos'] });
      // El listado pinta la etiqueta y el color del semáforo, así que también se queda viejo.
      void qc.invalidateQueries({ queryKey: ['leads'] });
      toast.success(`Semáforo "${semaforo.label}" creado`);
    },
    onError: (error) => toast.error(motivo(error, 'No se pudo crear el semáforo.')),
  });
}

export function useUpdateSemaforo() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: ({ id, ...payload }: UpdateSemaforoPayload & { id: string }) =>
      updateSemaforo(id, payload),
    onSuccess: (semaforo) => {
      void qc.invalidateQueries({ queryKey: ['semaforos'] });
      void qc.invalidateQueries({ queryKey: ['leads'] });
      toast.success(`Semáforo "${semaforo.label}" actualizado`);
    },
    onError: (error) => toast.error(motivo(error, 'No se pudo actualizar el semáforo.')),
  });
}
