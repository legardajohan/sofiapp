import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import axios from 'axios';
import { createEstado, fetchEstados } from '../api.js';
import type { CreateEstadoPayload, EstadoDTO } from '../types.js';

/** Mensaje del backend si lo hay: "Ya existe un estado con ese nombre" dice más que un genérico. */
function motivo(error: unknown, fallback: string): string {
  if (axios.isAxiosError(error) && typeof error.response?.data?.message === 'string') {
    return error.response.data.message;
  }
  return fallback;
}

export function useEstados() {
  return useQuery<EstadoDTO[]>({ queryKey: ['estados'], queryFn: fetchEstados });
}

export function useCreateEstado() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateEstadoPayload) => createEstado(payload),
    onSuccess: (estado) => {
      void qc.invalidateQueries({ queryKey: ['estados'] });
      // El listado pinta la etiqueta y el color del estado, así que también se queda viejo.
      void qc.invalidateQueries({ queryKey: ['leads'] });
      toast.success(`Estado "${estado.label}" creado`);
    },
    onError: (error) => toast.error(motivo(error, 'No se pudo crear el estado.')),
  });
}
