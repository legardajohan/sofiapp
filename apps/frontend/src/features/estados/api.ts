import { apiClient } from '../../api/apiClient.js';
import type { CreateEstadoPayload, EstadoDTO, UpdateEstadoPayload } from './types.js';

// Rutas SIN el prefijo `/api`: lo aporta el `baseURL` del apiClient.

/**
 * El catálogo del tenant. Con `uso` cada etapa trae además cuántos leads la tienen: lo pide la
 * pantalla de gestión, no el tablero ni la tabla, que se pintan en cada carga del listado.
 */
export async function fetchEstados(opciones: { uso?: boolean } = {}): Promise<EstadoDTO[]> {
  const { data } = await apiClient.get<EstadoDTO[]>('/estados', {
    params: opciones.uso ? { uso: 'true' } : undefined,
  });
  return data;
}

export async function createEstado(payload: CreateEstadoPayload): Promise<EstadoDTO> {
  const { data } = await apiClient.post<EstadoDTO>('/estados', payload);
  return data;
}

export async function updateEstado(
  id: string,
  payload: UpdateEstadoPayload,
): Promise<EstadoDTO> {
  const { data } = await apiClient.patch<EstadoDTO>(`/estados/${id}`, payload);
  return data;
}

/**
 * Guarda el orden del embudo entero: `ids` son **todas** las etapas del tenant en el orden deseado.
 *
 * Una sola petición y no un `PATCH` por etapa: arrastrar una etapa cambia la posición de varias, y
 * cuatro peticiones que pueden llegar desordenadas dejarían dos etapas empatadas.
 */
export async function reorderEstados(ids: string[]): Promise<EstadoDTO[]> {
  const { data } = await apiClient.patch<EstadoDTO[]>('/estados/orden', { ids });
  return data;
}

/** `204` sin cuerpo: o borra, o el backend responde `409` explicando por qué no. */
export async function deleteEstado(id: string): Promise<void> {
  await apiClient.delete(`/estados/${id}`);
}
