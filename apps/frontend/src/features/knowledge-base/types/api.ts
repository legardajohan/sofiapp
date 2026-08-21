import type { IKbDocument, KbEstructura } from './domain.js';

export interface CreateKbDocumentPayload {
  titulo: string;
  contenido: string;
  estructura?: KbEstructura;
}

export interface UpdateKbDocumentPayload {
  contenido: string;
  /** Ausente = no tocar la estructura guardada. El backend nunca la borra por omisión. */
  estructura?: KbEstructura;
}

export interface KbDocumentsListResponse {
  data: IKbDocument[];
  total: number;
  page: number;
  limit: number;
}
