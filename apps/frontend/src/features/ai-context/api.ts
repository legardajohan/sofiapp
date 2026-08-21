import { apiClient } from '../../api/apiClient.js';
import type { AiResponseContextDetail, AiResponseSummary, AiUsageMethod, Paginated } from './types.js';

// Las rutas NO llevan el prefijo `/api`: lo aporta el baseURL del apiClient.

export const fetchAiResponses = async (params: {
  page: number;
  limit?: number;
  method?: AiUsageMethod;
}): Promise<Paginated<AiResponseSummary>> => {
  const res = await apiClient.get<Paginated<AiResponseSummary>>('/ai/responses', { params });
  return res.data;
};

export const fetchAiResponseContext = async (id: string): Promise<AiResponseContextDetail> => {
  const res = await apiClient.get<AiResponseContextDetail>(`/ai/responses/${id}/context`);
  return res.data;
};
