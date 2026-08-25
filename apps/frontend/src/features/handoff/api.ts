import { apiClient } from '../../api/apiClient.js';
import type { HandoffSettings, UpdateHandoffSettingsPayload } from './types.js';

// Las rutas NO llevan el prefijo `/api`: lo aporta el baseURL del apiClient.

export const fetchHandoffSettings = async (): Promise<HandoffSettings> => {
  const res = await apiClient.get<HandoffSettings>('/ai/handoff-rules');
  return res.data;
};

export const saveHandoffSettings = async (
  payload: UpdateHandoffSettingsPayload,
): Promise<HandoffSettings> => {
  const res = await apiClient.put<HandoffSettings>('/ai/handoff-rules', payload);
  return res.data;
};
