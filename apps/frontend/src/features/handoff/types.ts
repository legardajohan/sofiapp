/** Los disparadores, en el mismo orden en que los evalúa el backend (= su prioridad). */
export type HandoffMotivo =
  | 'explicit_request'
  | 'keyword'
  // HU-IA-07: una condición que escribió el admin. UN solo valor, no uno por condición; cuál fue
  // viaja en `HandoffAplicado.condicion`.
  | 'custom'
  | 'low_confidence'
  | 'intent_purchase';

/**
 * Una condición de transferencia creada por el admin (HU-IA-07). Es un grupo de palabras CON
 * NOMBRE: lo que añade sobre `reglas.keyword` es poder encenderlas por separado y que la bandeja
 * diga cuál de ellas fue.
 */
export interface CondicionExtra {
  /** Slug derivado del nombre al crearla; NO cambia al renombrarla. */
  key: string;
  nombre: string;
  activa: boolean;
  palabras: string[];
}

/** Cómo se elige el asesor que recibe la conversación (HU-IA-07). */
export type EstrategiaDestino = 'primero' | 'menor_carga' | 'fijo';

/** Una fila del reparto de trabajo por asesor (HU-IA-07). */
export interface AsesorMetricasDTO {
  asesorId: string;
  nombre: string;
  /** Conversaciones sin cerrar. Es la cifra que gobierna el reparto por menor carga. */
  activas: number;
  porEstado: Record<string, number>;
}

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
  estrategiaDestino: EstrategiaDestino;
  mensajeTransicion: string;
  reglas: HandoffReglas;
  condicionesExtras: CondicionExtra[];
  /** `true` mientras la empresa no haya guardado la suya y esté viendo la de fábrica. */
  heredado: boolean;
}

export type UpdateHandoffSettingsPayload = Omit<HandoffSettings, 'heredado'>;

export const MENSAJE_TRANSICION_MAX = 500;
export const TERMINOS_MAX = 30;
export const TERMINO_MIN = 2;

/** Topes de las condiciones propias (HU-IA-07). Espejo de `ai-handoff.validation.ts`. */
export const CONDICIONES_MAX = 10;
export const CONDICION_NOMBRE_MIN = 2;
export const CONDICION_NOMBRE_MAX = 40;

/**
 * Cómo se le nombra cada disparador al admin. Nunca se muestra la clave técnica: quien configura
 * esto piensa en "cuando el cliente pide hablar con alguien", no en `explicit_request`.
 */
export const MOTIVO_LABEL: Record<HandoffMotivo, string> = {
  explicit_request: 'Pidió hablar con una persona',
  keyword: 'Escribió una palabra clave',
  // Fallback: cuando la conversación trae el nombre de la condición, la bandeja pinta ese. Este
  // texto es para las transferidas antes de que el nombre se guardara.
  custom: 'Cumplió una de tus condiciones',
  low_confidence: 'Sofi no supo responder',
  intent_purchase: 'Mostró intención de compra',
};
