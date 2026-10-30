import { apiClient } from '../../api/apiClient.js';
import type { MessageDTO } from '../inbox/types.js';
import type { SandboxSession } from './types.js';

// Las rutas NO llevan el prefijo `/api`: lo aporta el baseURL del apiClient.

export const fetchSandboxSession = async (): Promise<SandboxSession> => {
  const res = await apiClient.get<SandboxSession>('/sandbox/session');
  return res.data;
};

export const sendSandboxMessage = async (texto: string): Promise<MessageDTO> => {
  const res = await apiClient.post<{ message: MessageDTO }>('/sandbox/messages', { texto });
  return res.data.message;
};

/** `null` vuelve al flujo activo del tenant. */
export const selectSandboxFlow = async (flowId: string | null): Promise<SandboxSession> => {
  const res = await apiClient.put<SandboxSession>('/sandbox/session', { flowId });
  return res.data;
};

export const resetSandboxSession = async (): Promise<SandboxSession> => {
  const res = await apiClient.post<SandboxSession>('/sandbox/session/reset');
  return res.data;
};

export const advanceSandboxWait = async (): Promise<void> => {
  await apiClient.post('/sandbox/session/advance-wait');
};
