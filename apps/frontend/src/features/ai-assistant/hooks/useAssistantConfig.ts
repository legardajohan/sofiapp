import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { UseMutationResult, UseQueryResult } from '@tanstack/react-query';
import { toast } from 'sonner';
import { fetchAssistantConfig, saveAssistantConfig } from '../api.js';
import type { AssistantConfig, UpdateAssistantPayload } from '../types.js';

const QUERY_KEY = ['ai-assistant'] as const;

export function useAssistantConfig(): UseQueryResult<AssistantConfig> {
  return useQuery({ queryKey: QUERY_KEY, queryFn: fetchAssistantConfig });
}

export function useSaveAssistantConfig(): UseMutationResult<
  AssistantConfig,
  Error,
  UpdateAssistantPayload
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: saveAssistantConfig,
    // Se siembra la respuesta en la caché en vez de invalidar y refetchear: el PUT ya devuelve la
    // configuración completa, incluidos `version` y `heredado` recalculados.
    onSuccess: (data) => {
      queryClient.setQueryData(QUERY_KEY, data);
      toast.success('Configuración guardada. Sofi ya responde con estas indicaciones.');
    },
    onError: () => {
      toast.error('No se pudo guardar la configuración. Inténtalo de nuevo.');
    },
  });
}
