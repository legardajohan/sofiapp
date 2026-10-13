import type { CategoriaPlantilla, EstadoPlantilla, IWhatsAppTemplate } from './domain.js';

export interface WhatsAppTemplatesListResponse {
  data: IWhatsAppTemplate[];
  total: number;
  page: number;
  limit: number;
}

export interface ListTemplatesParams {
  page?: number;
  limit?: number;
  status?: EstadoPlantilla;
  category?: CategoriaPlantilla;
}

export type CabeceraAlta = { formato: 'NINGUNA' } | { formato: 'IMAGE'; uploadId: string };

export interface CreateTemplatePayload {
  name: string;
  language: string;
  category: CategoriaPlantilla;
  cuerpo: string;
  ejemplos: string[];
  /** HT-WA-04. Sin ella, la plantilla es de solo texto. */
  cabecera?: CabeceraAlta;
  pie?: string;
}

export interface SyncTemplatesResponse {
  creadas: number;
  actualizadas: number;
  obsoletas: number;
}

/** Respuesta de una subida de imagen en dos pasos: el alta o el envío consumen el `uploadId`. */
export interface UploadImagenResponse {
  uploadId: string;
  mimeType: string;
  tamanoBytes: number;
}

/** Evento Socket.IO `template:status-updated` (HT-WA-04). */
export interface TemplateStatusEvent {
  templateId: string;
  status: EstadoPlantilla;
  motivoRechazo: { codigo: string; mensaje: string } | null;
}
