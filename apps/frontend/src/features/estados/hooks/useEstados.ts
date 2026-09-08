import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { createEstado, fetchEstados } from '../api.js';
// Un solo extractor del mensaje del backend para toda la pantalla de leads (HU-PIPE-01).
import { motivo } from '../../leads/lib/errors.js';
import type { CreateEstadoPayload, EstadoDTO } from '../types.js';

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
