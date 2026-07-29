import type { IKbDocument } from './domain.js';

export interface CreateKbDocumentPayload {
  titulo: string;
  contenido: string;
}

export interface UpdateKbDocumentPayload {
  contenido: string;
}

export interface KbDocumentsListResponse {
  data: IKbDocument[];
  total: number;
  page: number;
  limit: number;
}
