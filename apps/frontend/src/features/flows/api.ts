import { apiClient } from '../../api/apiClient.js';
import type {
  FlowDTO,
  FlowListItemDTO,
  FlowSaveDTO,
  ReminderDTO,
  SaveFlowPayload,
  UpdateReminderPayload,
} from './types.js';

// Rutas SIN el prefijo `/api`: lo aporta el `baseURL` del apiClient (regla del CLAUDE.md frontend).

export async function fetchFlows(): Promise<FlowListItemDTO[]> {
  const { data } = await apiClient.get<FlowListItemDTO[]>('/flows');
  return data;
}

export async function fetchFlow(id: string): Promise<FlowDTO> {
  const { data } = await apiClient.get<FlowDTO>(`/flows/${id}`);
  return data;
}

/** Crear y actualizar devuelven, además del flujo, lo que quedó pendiente de corregir (HU-FLOW-05). */
export async function createFlow(payload: SaveFlowPayload): Promise<FlowSaveDTO> {
  const { data } = await apiClient.post<FlowSaveDTO>('/flows', payload);
  return data;
}

export async function updateFlow(id: string, payload: SaveFlowPayload): Promise<FlowSaveDTO> {
  const { data } = await apiClient.put<FlowSaveDTO>(`/flows/${id}`, payload);
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
