import { apiClient } from '../../api/apiClient.js';
import type { CreateSemaforoPayload, SemaforoDTO, UpdateSemaforoPayload } from './types.js';

// Rutas SIN el prefijo `/api`: lo aporta el `baseURL` del apiClient.

export async function fetchSemaforos(): Promise<SemaforoDTO[]> {
  const { data } = await apiClient.get<SemaforoDTO[]>('/semaforos');
  return data;
}

export async function createSemaforo(payload: CreateSemaforoPayload): Promise<SemaforoDTO> {
  const { data } = await apiClient.post<SemaforoDTO>('/semaforos', payload);
  return data;
}

export async function updateSemaforo(
  id: string,
  payload: UpdateSemaforoPayload,
): Promise<SemaforoDTO> {
  const { data } = await apiClient.patch<SemaforoDTO>(`/semaforos/${id}`, payload);
  return data;
}
