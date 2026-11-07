import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { createNota, deleteNota, fetchNotas, updateNota } from '../api.js';
import { errorMessage, esSinPermiso } from '../lib/errors.js';
import type { CambiosNota, NotasPage, NuevaNota } from '../types.js';

/** Clave de la columna «Pendientes» del embudo (HU-PDF-01). Toda mutación de notas la invalida. */
export const PENDIENTES_KEY = ['pendientes'] as const;

/**
 * Notas del contacto. `retry: false` ante un 403: reintentar un rechazo por permiso solo gasta
 * peticiones y retrasa el momento en que la tarjeta decide ocultarse.
 */
export function useNotas(clienteId: string | null, habilitado: boolean) {
  return useQuery<NotasPage>({
    queryKey: ['contact-notas', clienteId],
    queryFn: () => fetchNotas(clienteId as string),
    enabled: !!clienteId && habilitado,
    retry: (fallos, error) => !esSinPermiso(error) && fallos < 1,
  });
}

/**
 * Una nota cambia dos vistas: la ficha del contacto y, si es o era pendiente, la columna del
 * embudo. Se invalidan las dos siempre: saber si «era pendiente» exigiría leer la caché anterior.
 */
function invalidarNotas(qc: QueryClient, clienteId: string | null): void {
  void qc.invalidateQueries({ queryKey: ['contact-notas', clienteId] });
  void qc.invalidateQueries({ queryKey: PENDIENTES_KEY });
}

export function useCreateNota(clienteId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (nota: NuevaNota) => createNota(clienteId as string, nota),
    onSuccess: () => invalidarNotas(qc, clienteId),
    onError: (error) => toast.error(errorMessage(error, 'No se pudo guardar la nota.')),
  });
}

export function useUpdateNota(clienteId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ notaId, cambios }: { notaId: string; cambios: CambiosNota }) =>
      updateNota(clienteId as string, notaId, cambios),
    onSuccess: () => invalidarNotas(qc, clienteId),
    onError: (error) => toast.error(errorMessage(error, 'No se pudo actualizar la nota.')),
  });
}

export function useDeleteNota(clienteId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (notaId: string) => deleteNota(clienteId as string, notaId),
    onSuccess: () => {
      invalidarNotas(qc, clienteId);
      toast.success('Nota eliminada.');
    },
    onError: (error) => toast.error(errorMessage(error, 'No se pudo eliminar la nota.')),
  });
}
