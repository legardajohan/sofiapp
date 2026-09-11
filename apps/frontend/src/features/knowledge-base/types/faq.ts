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
  /** Coincidencias del filtro pedido: responde a `page`, `limit` y `activo`. */
  total: number;
  page: number;
  limit: number;
  /**
   * Activas del tenant completo, al margen de la página y del filtro. Es el número contra el que
   * se compara `minimoActivas`.
   */
  activas: number;
  /** Mínimo de activas que el servidor exige antes de dejar apagar o eliminar una. */
  minimoActivas: number;
}

/**
 * Las tres señales que deciden el cortocircuito. Se cumplen todas o la pregunta va al
 * modelo: el score por sí solo confunde FAQs que solo comparten tema.
 */
export interface FaqTestSenales {
  score: number;
  /** Score de la segunda FAQ. Ausente si no había otra con la que competir. */
  segundoScore?: number;
  margen: number;
  overlap: number;
  pasaUmbral: boolean;
  pasaMargen: boolean;
  pasaOverlap: boolean;
}

/**
 * Resultado del probador. Trae el mejor candidato aunque no supere las señales,
 * para que el admin vea qué tan cerca quedó y cuál lo bloqueó.
 */
export interface FaqTestResult {
  matched: boolean;
  /** Respuesta que daría la FAQ candidata. */
  respuesta?: string;
  /** Score de similitud, 0–1. */
  confianza?: number;
  /** Umbral vigente en el servidor, 0–1. */
  umbral: number;
  /** Margen mínimo exigido sobre la segunda FAQ, 0–1. */
  margenMinimo: number;
  /** Coincidencia de palabras mínima exigida, 0–1. */
  overlapMinimo: number;
  faqId?: string;
  /** Pregunta de la FAQ candidata (no la que escribió el admin). */
  pregunta?: string;
  /** Pregunta de la segunda FAQ: es lo que explica un margen pequeño. */
  segundaPregunta?: string;
  senales?: FaqTestSenales;
}
