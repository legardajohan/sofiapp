import { apiClient } from '../../api/apiClient.js';
import type { FlowDTO, FlowListItemDTO, ReminderDTO, SaveFlowPayload, UpdateReminderPayload } from './types.js';

// Rutas SIN el prefijo `/api`: lo aporta el `baseURL` del apiClient (regla del CLAUDE.md frontend).

export async function fetchFlows(): Promise<FlowListItemDTO[]> {
  const { data } = await apiClient.get<FlowListItemDTO[]>('/flows');
  return data;
}

export async function fetchFlow(id: string): Promise<FlowDTO> {
  const { data } = await apiClient.get<FlowDTO>(`/flows/${id}`);
  return data;
}

export async function createFlow(payload: SaveFlowPayload): Promise<FlowDTO> {
  const { data } = await apiClient.post<FlowDTO>('/flows', payload);
  return data;
}

export async function updateFlow(id: string, payload: SaveFlowPayload): Promise<FlowDTO> {
  const { data } = await apiClient.put<FlowDTO>(`/flows/${id}`, payload);
  return data;
}

// HU-FLOW-02 — recordatorio de inactividad, del `admin` sobre su propio tenant.

export async function fetchReminder(): Promise<ReminderDTO> {
  const { data } = await apiClient.get<ReminderDTO>('/flows/reminder');
  return data;
}

export async function updateReminder(payload: UpdateReminderPayload): Promise<ReminderDTO> {
  const { data } = await apiClient.put<ReminderDTO>('/flows/reminder', payload);
  return data;
}
