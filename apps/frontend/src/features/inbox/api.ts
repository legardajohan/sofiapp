import { apiClient } from '../../api/apiClient.js';
import type { ConversationDTO, InboxFiltros, MessageDTO, Paginated } from './types.js';

export async function fetchConversations(
  filtros: InboxFiltros,
  page = 1,
): Promise<Paginated<ConversationDTO>> {
  const { data } = await apiClient.get<Paginated<ConversationDTO>>('/api/conversations', {
    params: { ...filtros, page },
  });
  return data;
}

export async function assignConversation(
  conversationId: string,
  asignadoA: string | null,
): Promise<ConversationDTO> {
  const { data } = await apiClient.patch<ConversationDTO>(
    `/api/conversations/${conversationId}/assign`,
    { asignadoA },
  );
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
