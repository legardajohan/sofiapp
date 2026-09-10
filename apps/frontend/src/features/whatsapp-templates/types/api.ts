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

export interface CreateTemplatePayload {
  name: string;
  language: string;
  category: CategoriaPlantilla;
  cuerpo: string;
  ejemplos: string[];
}

export interface SyncTemplatesResponse {
  creadas: number;
  actualizadas: number;
  obsoletas: number;
}
