import { apiClient } from '../../api/apiClient.js';
import type { Festivo, PoliticaVentana, SendWindowConfig, SendWindowStatus } from './types.js';

// Las rutas NO llevan el prefijo `/api`: lo aporta el baseURL del apiClient.

export const fetchSendWindowConfig = async (): Promise<SendWindowConfig> => {
  const res = await apiClient.get<SendWindowConfig>('/send-window');
  return res.data;
};

export const saveSendWindowConfig = async (payload: PoliticaVentana): Promise<SendWindowConfig> => {
  const res = await apiClient.put<SendWindowConfig>('/send-window', payload);
  return res.data;
};

export const fetchSendWindowStatus = async (): Promise<SendWindowStatus> => {
  const res = await apiClient.get<SendWindowStatus>('/send-window/status');
  return res.data;
};

export const previewFestivos = async (anio: number): Promise<Festivo[]> => {
  const res = await apiClient.post<Festivo[]>('/send-window/holidays/preview', { anio });
  return res.data;
};
