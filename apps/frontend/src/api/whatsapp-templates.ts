import { apiClient } from './apiClient.js';
import type {
  CreateTemplatePayload,
  IWhatsAppTemplate,
  ListTemplatesParams,
  SyncTemplatesResponse,
  UploadImagenResponse,
  WhatsAppTemplatesListResponse,
} from '../features/whatsapp-templates/types/index.js';

// Las rutas NO llevan el prefijo `/api`: lo aporta el baseURL del apiClient.

/**
 * Subir una imagen tarda más que un JSON: el `timeout` general de 10 s cortaría una foto de 5 MB en
 * una conexión lenta. La muestra de plantilla además pasa por Meta antes de responder.
 */
const TIMEOUT_SUBIDA_MS = 60_000;

export const getWhatsAppTemplates = async (
  params: ListTemplatesParams,
): Promise<WhatsAppTemplatesListResponse> => {
  const res = await apiClient.get<WhatsAppTemplatesListResponse>('/templates', { params });
  return res.data;
};

export const getWhatsAppTemplate = async (id: string): Promise<IWhatsAppTemplate> => {
  const res = await apiClient.get<IWhatsAppTemplate>(`/templates/${id}`);
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

/** «Actualizar estado» de una sola plantilla (HT-WA-04). */
export const syncWhatsAppTemplate = async (id: string): Promise<IWhatsAppTemplate> => {
  const res = await apiClient.post<IWhatsAppTemplate>(`/templates/${id}/sync`);
  return res.data;
};

/** Sube una imagen multipart al endpoint indicado y reporta el avance en porcentaje. */
async function subirImagen(
  ruta: string,
  archivo: File,
  onProgress?: (porcentaje: number) => void,
): Promise<UploadImagenResponse> {
  const form = new FormData();
  form.append('imagen', archivo);
  const res = await apiClient.post<UploadImagenResponse>(ruta, form, {
    timeout: TIMEOUT_SUBIDA_MS,
    // Sin `Content-Type` a mano: el navegador pone el `boundary` del multipart.
    onUploadProgress: (e) => {
      if (onProgress && e.total) onProgress(Math.round((e.loaded * 100) / e.total));
    },
  });
  return res.data;
}

/** Imagen de muestra de la cabecera (HT-WA-04). Queda como imagen por defecto de la plantilla. */
export const uploadTemplateImage = (
  archivo: File,
  onProgress?: (porcentaje: number) => void,
): Promise<UploadImagenResponse> => subirImagen('/templates/media', archivo, onProgress);

/** Imagen de reemplazo para una campaña o un envío (HT-WA-04). No pasa por revisión de Meta. */
export const uploadHeaderImage = (
  archivo: File,
  onProgress?: (porcentaje: number) => void,
): Promise<UploadImagenResponse> => subirImagen('/campaigns/media', archivo, onProgress);

/** Mensaje de error del backend (`{ message }`), con un respaldo legible. */
export const templateErrorMessage = (err: unknown, fallback: string): string => {
  const serverMsg = (err as { response?: { data?: { message?: string } } })?.response?.data
    ?.message;
  return serverMsg ?? fallback;
};
