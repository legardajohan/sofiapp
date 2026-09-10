import { apiClient } from './apiClient.js';
import type {
  CreateTemplatePayload,
  IWhatsAppTemplate,
  ListTemplatesParams,
  SyncTemplatesResponse,
  WhatsAppTemplatesListResponse,
} from '../features/whatsapp-templates/types/index.js';

// Las rutas NO llevan el prefijo `/api`: lo aporta el baseURL del apiClient.

export const getWhatsAppTemplates = async (
  params: ListTemplatesParams,
): Promise<WhatsAppTemplatesListResponse> => {
  const res = await apiClient.get<WhatsAppTemplatesListResponse>('/templates', { params });
  return res.data;
};

export const createWhatsAppTemplate = async (
  payload: CreateTemplatePayload,
): Promise<IWhatsAppTemplate> => {
  const res = await apiClient.post<IWhatsAppTemplate>('/templates', payload);
  return res.data;
};

export const syncWhatsAppTemplates = async (): Promise<SyncTemplatesResponse> => {
  const res = await apiClient.post<SyncTemplatesResponse>('/templates/sync');
  return res.data;
};

/** Mensaje de error del backend (`{ message }`), con un respaldo legible. */
export const templateErrorMessage = (err: unknown, fallback: string): string => {
  const serverMsg = (err as { response?: { data?: { message?: string } } })?.response?.data
    ?.message;
  return serverMsg ?? fallback;
};
