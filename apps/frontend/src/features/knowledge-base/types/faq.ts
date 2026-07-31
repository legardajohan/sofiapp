/** Una pregunta frecuente: par pregunta → respuesta que cortocircuita al modelo. */
export interface IKbFaq {
  id: string;
  pregunta: string;
  respuesta: string;
  activo: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateFaqPayload {
  pregunta: string;
  respuesta: string;
  activo?: boolean;
}

export interface UpdateFaqPayload {
  pregunta?: string;
  respuesta?: string;
  activo?: boolean;
}

export interface KbFaqsListResponse {
  data: IKbFaq[];
  total: number;
  page: number;
  limit: number;
}

/**
 * Resultado del probador. Trae el mejor candidato aunque no supere el umbral,
 * para que el admin vea qué tan cerca quedó.
 */
export interface FaqTestResult {
  matched: boolean;
  /** Respuesta que daría la FAQ candidata. */
  respuesta?: string;
  /** Score de similitud, 0–1. */
  confianza?: number;
  /** Umbral vigente en el servidor, 0–1. */
  umbral: number;
  faqId?: string;
  /** Pregunta de la FAQ candidata (no la que escribió el admin). */
  pregunta?: string;
}
