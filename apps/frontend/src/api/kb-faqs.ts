import { apiClient } from './apiClient.js';
import type {
  CreateFaqPayload,
  FaqTestResult,
  IKbFaq,
  KbFaqsListResponse,
  UpdateFaqPayload,
} from '../features/knowledge-base/types/index.js';

// Las rutas NO llevan el prefijo `/api`: lo aporta el baseURL del apiClient.

export const getKbFaqs = async (params: {
  page?: number;
  limit?: number;
}): Promise<KbFaqsListResponse> => {
  const res = await apiClient.get<KbFaqsListResponse>('/kb/faqs', { params });
  return res.data;
};

export const createKbFaq = async (payload: CreateFaqPayload): Promise<IKbFaq> => {
  const res = await apiClient.post<IKbFaq>('/kb/faqs', payload);
  return res.data;
};

export const updateKbFaq = async (
  id: string,
  payload: UpdateFaqPayload,
): Promise<IKbFaq> => {
  const res = await apiClient.patch<IKbFaq>(`/kb/faqs/${id}`, payload);
  return res.data;
};

export const deleteKbFaq = async (id: string): Promise<{ deleted: boolean }> => {
  const res = await apiClient.delete<{ deleted: boolean }>(`/kb/faqs/${id}`);
  return res.data;
};

export const testKbFaq = async (pregunta: string): Promise<FaqTestResult> => {
  const res = await apiClient.post<FaqTestResult>('/kb/faqs/test', { pregunta });
  return res.data;
};

/** Mensaje de error del backend (`{ message }`), con un respaldo legible. */
export const faqErrorMessage = (err: unknown, fallback: string): string => {
  const serverMsg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
  return serverMsg ?? fallback;
};
