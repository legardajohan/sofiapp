import { useQuery } from '@tanstack/react-query';
import { fetchConversations } from '../api.js';
import type { ConversationDTO, FiltroBandeja, Paginated } from '../types.js';

export function useConversations(filtro: FiltroBandeja) {
  return useQuery<Paginated<ConversationDTO>>({
    queryKey: ['conversations', filtro],
    queryFn: () => fetchConversations(filtro),
  });
}
