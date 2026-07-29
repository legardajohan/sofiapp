import { apiClient } from '../../api/apiClient.js';
import type { CreateTagPayload, TagDTO, UpdateTagPayload } from './types.js';

// Rutas SIN el prefijo `/api`: lo aporta el `baseURL` del apiClient (regla del CLAUDE.md frontend).

export async function fetchTags(): Promise<TagDTO[]> {
  const { data } = await apiClient.get<TagDTO[]>('/tags');
  return data;
}

export async function createTag(payload: CreateTagPayload): Promise<TagDTO> {
  const { data } = await apiClient.post<TagDTO>('/tags', payload);
  return data;
}

export async function updateTag(id: string, payload: UpdateTagPayload): Promise<TagDTO> {
  const { data } = await apiClient.patch<TagDTO>(`/tags/${id}`, payload);
  return data;
}

export async function deleteTag(id: string): Promise<void> {
  await apiClient.delete(`/tags/${id}`);
}
