import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import { toast } from 'sonner';
import { motivo } from '@/features/leads/lib/errors';
import { fetchAjustesTenant, updateAjustesTenant, type AjustesTenantDTO } from '../api.js';

const AJUSTES_KEY = ['tenant-ajustes'] as const;

export function useAjustesTenant(enabled = true): UseQueryResult<AjustesTenantDTO> {
  return useQuery({ queryKey: AJUSTES_KEY, queryFn: fetchAjustesTenant, enabled, staleTime: 300_000 });
}

export function useUpdateAjustesTenant(): UseMutationResult<AjustesTenantDTO, unknown, AjustesTenantDTO> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: updateAjustesTenant,
    onSuccess: (ajustes) => {
      qc.setQueryData(AJUSTES_KEY, ajustes);
      // El rango resuelto de las vistas previas depende de la zona: se recalcula.
      void qc.invalidateQueries({ queryKey: ['campaign-audience'] });
      toast.success(`Zona horaria: ${ajustes.zonaHoraria}`);
    },
    onError: (error) => toast.error(motivo(error, 'No se pudo cambiar la zona horaria.')),
  });
}
