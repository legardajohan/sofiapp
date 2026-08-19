import { useQuery } from '@tanstack/react-query';
import { fetchLead } from '../api.js';
import type { LeadDTO } from '../types.js';

/** El `leadId` llega ya resuelto en la conversación y en la ficha, así que aquí solo se hidrata. */
export function useLead(leadId: string | null) {
  return useQuery<LeadDTO>({
    queryKey: ['lead', leadId],
    queryFn: () => fetchLead(leadId as string),
    enabled: !!leadId,
  });
}
