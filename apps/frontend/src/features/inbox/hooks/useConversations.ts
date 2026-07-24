import { useQuery } from '@tanstack/react-query';
import { fetchConversations } from '../api.js';
import type { ConversationDTO, InboxFiltros, Paginated } from '../types.js';

export function useConversations(filtros: InboxFiltros) {
  return useQuery<Paginated<ConversationDTO>>({
    queryKey: ['conversations', filtros],
    queryFn: () => fetchConversations(filtros),
  });
}
