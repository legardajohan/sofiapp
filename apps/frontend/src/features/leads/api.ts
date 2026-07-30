import { apiClient } from '../../api/apiClient.js';
import type { CreateLeadPayload, LeadDTO, MotivoEliminacion } from './types.js';

// Rutas SIN el prefijo `/api`: lo aporta el `baseURL` del apiClient (regla del CLAUDE.md frontend).

export async function createLead(payload: CreateLeadPayload): Promise<LeadDTO> {
  const { data } = await apiClient.post<LeadDTO>('/leads', payload);
  return data;
}

export async function fetchLead(id: string): Promise<LeadDTO> {
  const { data } = await apiClient.get<LeadDTO>(`/leads/${id}`);
  return data;
}

/** El motivo va en la query, no en el cuerpo: un `DELETE` con body lo pierden proxies y clientes. */
export async function deleteLead(id: string, motivo: MotivoEliminacion): Promise<void> {
  await apiClient.delete(`/leads/${id}`, { params: { motivo } });
}
