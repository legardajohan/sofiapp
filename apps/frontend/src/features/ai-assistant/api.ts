import { apiClient } from '../../api/apiClient.js';
import type { AssistantConfig, UpdateAssistantPayload } from './types.js';

// Las rutas NO llevan el prefijo `/api`: lo aporta el baseURL del apiClient.

export const fetchAssistantConfig = async (): Promise<AssistantConfig> => {
  const res = await apiClient.get<AssistantConfig>('/ai/assistant');
  return res.data;
};

export const saveAssistantConfig = async (
  payload: UpdateAssistantPayload,
): Promise<AssistantConfig> => {
  const res = await apiClient.put<AssistantConfig>('/ai/assistant', payload);
  return res.data;
};
