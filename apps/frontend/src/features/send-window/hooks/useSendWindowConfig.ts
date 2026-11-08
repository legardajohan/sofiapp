import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { UseMutationResult, UseQueryResult } from '@tanstack/react-query';
import { toast } from 'sonner';
import { fetchSendWindowConfig, previewFestivos, saveSendWindowConfig } from '../api.js';
import type { Festivo, PoliticaVentana, SendWindowConfig } from '../types.js';
import { STATUS_KEY } from './useSendWindowStatus.js';

export const CONFIG_KEY = ['send-window'] as const;

export function useSendWindowConfig(enabled = true): UseQueryResult<SendWindowConfig> {
  return useQuery({ queryKey: CONFIG_KEY, queryFn: fetchSendWindowConfig, enabled });
}

export function useSaveSendWindowConfig(): UseMutationResult<SendWindowConfig, unknown, PoliticaVentana> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: saveSendWindowConfig,
    // El PUT devuelve la configuración completa: se siembra en la caché en vez de refetchear. El
    // estado sí se vuelve a pedir, porque depende de la hora del servidor.
    onSuccess: (data) => {
      qc.setQueryData(CONFIG_KEY, data);
      void qc.invalidateQueries({ queryKey: STATUS_KEY });
      toast.success('Horarios de envío guardados.');
    },
  });
}

export function usePreviewFestivos(): UseMutationResult<Festivo[], unknown, number> {
  return useMutation({ mutationFn: previewFestivos });
}
