import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { PENDIENTES_KEY } from '@/features/contacts/hooks/useNotas';
import { errorMessage, esSinPermiso } from '@/features/contacts/lib/errors';
import { cerrarPendiente, fetchPendientes, reabrirPendiente } from '../api.js';
import type { EstadoPendiente } from '../types.js';

const LIMITE = 20;

/**
 * Una pestaña de la columna «Pendientes» (HU-PDF-01): `abierto` o el historial `cerrado`.
 *
 * La clave cuelga de la misma raíz que invalidan las mutaciones de notas: crear, editar o borrar una
 * nota en la ficha refresca las dos pestañas sin que estas sepan nada de la ficha. Un 403 no se
 * reintenta: es que el usuario no puede ver notas, y la columna se oculta.
 */
export function usePendientes(estado: EstadoPendiente, habilitado = true) {
  return useInfiniteQuery({
    queryKey: [...PENDIENTES_KEY, estado],
    queryFn: ({ pageParam }) => fetchPendientes(estado, pageParam, LIMITE),
    initialPageParam: 1,
    getNextPageParam: (ultima) =>
      ultima.page * ultima.limit < ultima.total ? ultima.page + 1 : undefined,
    retry: (fallos, error) => !esSinPermiso(error) && fallos < 1,
    enabled: habilitado,
  });
}

/**
 * Cerrar y reabrir mueven el pendiente entre pestañas y cambian su distintivo en la ficha, así que
 * invalidan las dos pestañas y las notas de todos los contactos en caché.
 */
function useInvalidarPendientes(): () => void {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: PENDIENTES_KEY });
    void qc.invalidateQueries({ queryKey: ['contact-notas'] });
    // HU-PDF-02: reabrir rearma el recordatorio.
    void qc.invalidateQueries({ queryKey: ['organizador'] });
  };
}

export function useReabrirPendiente() {
  const invalidar = useInvalidarPendientes();
  return useMutation({
    mutationFn: (id: string) => reabrirPendiente(id),
    onSuccess: () => {
      invalidar();
      toast.success('Pendiente reabierto.');
    },
    onError: (error) => toast.error(errorMessage(error, 'No se pudo reabrir el pendiente.')),
  });
}

/**
 * Cierra el pendiente y ofrece «Deshacer» en el mismo aviso: cerrar es un clic en una tarjeta que
 * se escanea rápido, y equivocarse de tarjeta no debería obligar a ir a buscarla al historial.
 */
export function useCerrarPendiente() {
  const invalidar = useInvalidarPendientes();
  const reabrir = useReabrirPendiente();
  return useMutation({
    mutationFn: (id: string) => cerrarPendiente(id),
    onSuccess: (pendiente) => {
      invalidar();
      toast.success('Pendiente cerrado. Lo encuentras en el historial.', {
        action: { label: 'Deshacer', onClick: () => reabrir.mutate(pendiente.id) },
      });
    },
    onError: (error) => toast.error(errorMessage(error, 'No se pudo cerrar el pendiente.')),
  });
}
