import { apiClient } from '../../api/apiClient.js';
import type { CreateEstadoPayload, EstadoDTO } from './types.js';

// Rutas SIN el prefijo `/api`: lo aporta el `baseURL` del apiClient.

export async function fetchEstados(): Promise<EstadoDTO[]> {
  const { data } = await apiClient.get<EstadoDTO[]>('/estados');
  return data;
}

export async function createEstado(payload: CreateEstadoPayload): Promise<EstadoDTO> {
  const { data } = await apiClient.post<EstadoDTO>('/estados', payload);
  return data;
}
