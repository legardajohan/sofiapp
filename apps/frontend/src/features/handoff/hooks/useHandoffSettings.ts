import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { UseMutationResult, UseQueryResult } from '@tanstack/react-query';
import { toast } from 'sonner';
import { fetchHandoffSettings, saveHandoffSettings } from '../api.js';
import type { HandoffSettings, UpdateHandoffSettingsPayload } from '../types.js';

const QUERY_KEY = ['handoff-settings'] as const;

export function useHandoffSettings(): UseQueryResult<HandoffSettings> {
  return useQuery({ queryKey: QUERY_KEY, queryFn: fetchHandoffSettings });
}

export function useSaveHandoffSettings(): UseMutationResult<
  HandoffSettings,
  Error,
  UpdateHandoffSettingsPayload
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: saveHandoffSettings,
    // Se siembra la respuesta en la caché en vez de invalidar y refetchear: el PUT ya devuelve la
    // configuración completa, con `heredado` recalculado.
    onSuccess: (data) => {
      queryClient.setQueryData(QUERY_KEY, data);
      toast.success('Cambios guardados.');
    },
    onError: () => {
      toast.error('No se pudieron guardar los cambios. Inténtalo de nuevo.');
    },
  });
}
