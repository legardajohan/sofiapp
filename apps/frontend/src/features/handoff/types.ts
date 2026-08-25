/** Los cuatro disparadores, en el mismo orden en que los evalúa el backend (= su prioridad). */
export type HandoffMotivo =
  | 'explicit_request'
  | 'keyword'
  | 'low_confidence'
  | 'intent_purchase';

export type NivelMinimoInteres = 'tibio' | 'caliente';

export interface HandoffReglas {
  explicitRequest: { activa: boolean; frases: string[] };
  keyword: { activa: boolean; palabras: string[] };
  lowConfidence: { activa: boolean; umbral: number | null };
  intentPurchase: { activa: boolean; nivelMinimo: NivelMinimoInteres };
}

export interface HandoffSettings {
  activo: boolean;
  asesorDestinoId: string | null;
  mensajeTransicion: string;
  reglas: HandoffReglas;
  /** `true` mientras la empresa no haya guardado la suya y esté viendo la de fábrica. */
  heredado: boolean;
}

export type UpdateHandoffSettingsPayload = Omit<HandoffSettings, 'heredado'>;

export const MENSAJE_TRANSICION_MAX = 500;
export const TERMINOS_MAX = 30;
export const TERMINO_MIN = 2;

/**
 * Cómo se le nombra cada disparador al admin. Nunca se muestra la clave técnica: quien configura
 * esto piensa en "cuando el cliente pide hablar con alguien", no en `explicit_request`.
 */
export const MOTIVO_LABEL: Record<HandoffMotivo, string> = {
  explicit_request: 'Pidió hablar con una persona',
  keyword: 'Escribió una palabra clave',
  low_confidence: 'Sofi no supo responder',
  intent_purchase: 'Mostró intención de compra',
};
