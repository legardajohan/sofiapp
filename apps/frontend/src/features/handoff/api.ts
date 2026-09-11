import { apiClient } from '../../api/apiClient.js';
import type {
  AsesorMetricasDTO,
  HandoffSettings,
  UpdateHandoffSettingsPayload,
} from './types.js';

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

/**
 * Cómo está repartido el trabajo entre los asesores (HU-IA-07). Un solo agregado en el servidor;
 * aquí no se calcula nada.
 */
export const fetchAsesorMetricas = async (): Promise<AsesorMetricasDTO[]> => {
  const res = await apiClient.get<AsesorMetricasDTO[]>('/ai/handoff-rules/asesores/metricas');
  return res.data;
};
