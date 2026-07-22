import { apiClient } from '../../api/apiClient.js';
import type {
  ContactHistoryDTO,
  ConversationDTO,
  FiltroBandeja,
  MessageDTO,
  Paginated,
  ResumenDTO,
} from './types.js';

export async function fetchConversations(
  filtro: FiltroBandeja,
  page = 1,
): Promise<Paginated<ConversationDTO>> {
  const { data } = await apiClient.get<Paginated<ConversationDTO>>('/api/conversations', {
    params: { filtro, page },
  });
  return data;
}

export async function fetchThread(
  conversationId: string,
  page = 1,
): Promise<Paginated<MessageDTO>> {
  const { data } = await apiClient.get<Paginated<MessageDTO>>(
    `/api/conversations/${conversationId}/messages`,
    { params: { page } },
  );
  return data;
}

export async function sendReply(conversationId: string, texto: string): Promise<MessageDTO> {
  const { data } = await apiClient.post<MessageDTO>(
    `/api/conversations/${conversationId}/messages`,
    { texto },
  );
  return data;
}

export async function markConversationRead(conversationId: string): Promise<ConversationDTO> {
  const { data } = await apiClient.patch<ConversationDTO>(
    `/api/conversations/${conversationId}/read`,
  );
  return data;
}

export async function setSofiEnabled(
  conversationId: string,
  habilitada: boolean,
): Promise<ConversationDTO> {
  const { data } = await apiClient.patch<ConversationDTO>(
    `/api/conversations/${conversationId}/ia`,
    { habilitada },
  );
  return data;
}

/** Ficha del contacto: historial completo + estado del resumen (HU-OMNI-03). */
export async function fetchContactHistory(
  clienteId: string,
  page = 1,
): Promise<ContactHistoryDTO> {
  const { data } = await apiClient.get<ContactHistoryDTO>(`/api/clientes/${clienteId}/history`, {
    params: { page },
  });
  return data;
}

/** Genera/actualiza el resumen por IA de la conversación (bajo demanda). */
export async function generateSummary(clienteId: string): Promise<ResumenDTO> {
  const { data } = await apiClient.post<ResumenDTO>(`/api/conversations/${clienteId}/summary`);
  return data;
}
