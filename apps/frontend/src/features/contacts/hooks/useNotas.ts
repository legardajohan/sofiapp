import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { createNota, fetchNotas } from '../api.js';
import { errorMessage, esSinPermiso } from '../lib/errors.js';
import type { NotasPage } from '../types.js';

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

export function useCreateNota(clienteId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (texto: string) => createNota(clienteId as string, texto),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['contact-notas', clienteId] }),
    onError: (error) => toast.error(errorMessage(error, 'No se pudo guardar la nota.')),
  });
}
