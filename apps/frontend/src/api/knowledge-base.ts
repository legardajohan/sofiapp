import { apiClient } from './apiClient.js';
import type {
  CreateKbDocumentPayload,
  UpdateKbDocumentPayload,
  KbDocumentsListResponse,
  IKbDocument,
} from '../features/knowledge-base/types/index.js';

export const createKbDocument = async (
  payload: CreateKbDocumentPayload,
): Promise<IKbDocument> => {
  const res = await apiClient.post<IKbDocument>('/kb/documents', payload);
  return res.data;
};

export const updateKbDocument = async (
  id: string,
  payload: UpdateKbDocumentPayload,
): Promise<IKbDocument> => {
  const res = await apiClient.patch<IKbDocument>(`/kb/documents/${id}`, payload);
  return res.data;
};

export const getKbDocuments = async (params: {
  page?: number;
  limit?: number;
}): Promise<KbDocumentsListResponse> => {
  const res = await apiClient.get<KbDocumentsListResponse>('/kb/documents', { params });
  return res.data;
};

export const deleteKbDocument = async (id: string): Promise<{ deleted: boolean }> => {
  const res = await apiClient.delete<{ deleted: boolean }>(`/kb/documents/${id}`);
  return res.data;
};
