import { apiClient } from '../../api/apiClient.js';
import type { ContactCardDTO } from '@/features/inbox/types';
import type { ContactPatchPayload, NotaDTO, NotasPage } from './types.js';

// Rutas SIN el prefijo `/api`: lo aporta el `baseURL` del apiClient (regla del CLAUDE.md frontend).

export async function updateContact(
  id: string,
  payload: ContactPatchPayload,
): Promise<ContactCardDTO> {
  const { data } = await apiClient.patch<ContactCardDTO>(`/clientes/${id}`, payload);
  return data;
}

export async function fetchNotas(clienteId: string, page = 1): Promise<NotasPage> {
  const { data } = await apiClient.get<NotasPage>(`/clientes/${clienteId}/notas`, {
    params: { page, limit: 20 },
  });
  return data;
}

export async function createNota(clienteId: string, texto: string): Promise<NotaDTO> {
  const { data } = await apiClient.post<NotaDTO>(`/clientes/${clienteId}/notas`, { texto });
  return data;
}
