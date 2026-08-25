import type { Document, Types } from 'mongoose';

/**
 * Los cuatro disparadores de handoff (HU-IA-03), **en orden de evaluación**.
 *
 * El orden no es decorativo: es la prioridad. Si en un mismo turno se cumplen varias condiciones se
 * ejecuta un solo handoff, el del primero de esta lista. Por eso no hay campo `orden` configurable:
 * la prioridad la fija el producto, no cada empresa, y así dos tenants con la misma configuración
 * se comportan igual.
 *
 * Los dos primeros se deciden mirando lo que escribió el cliente, sin llamar al modelo; los dos
 * últimos necesitan la respuesta ya generada. De ahí que la evaluación tenga dos puntos.
 */
export const MOTIVOS_HANDOFF = [
  'explicit_request',
  'keyword',
  'low_confidence',
  'intent_purchase',
] as const;

export type HandoffMotivo = (typeof MOTIVOS_HANDOFF)[number];

/** Escala del clasificador con la que se compara `intentPurchase.nivelMinimo`. */
export type NivelMinimoInteres = 'tibio' | 'caliente';

export interface IHandoffReglas {
  /** El cliente pide hablar con una persona, con las frases de fábrica o las que añada el admin. */
  explicitRequest: { activa: boolean; frases: string[] };
  /** Palabras que el admin quiere que escalen siempre ("factura", "reclamo", "cancelar"…). */
  keyword: { activa: boolean; palabras: string[] };
  /**
   * Sofi respondió que no sabe. `umbral` es la vía estricta opcional y solo puede exigir MÁS que
   * `KB_MIN_SCORE`: la recuperación ya descarta todo lo que esté por debajo, así que un umbral
   * menor describiría una regla que no puede dispararse nunca.
   */
  lowConfidence: { activa: boolean; umbral: number | null };
  /** El cliente muestra intención de compra según `AIService.classify()`. */
  intentPurchase: { activa: boolean; nivelMinimo: NivelMinimoInteres };
}

export interface IHandoffSettings {
  tenantId: Types.ObjectId;
  /**
   * Interruptor maestro. `false` de fábrica **a propósito**: esta historia no puede cambiarle el
   * comportamiento a ningún tenant que ya está en producción hasta que un admin lo encienda.
   */
  activo: boolean;
  /**
   * A quién se transfiere. `null` = al primer admin activo del tenant: no existe noción de
   * disponibilidad ni de carga, así que "el primero disponible" no puede significar otra cosa.
   */
  asesorDestinoId: Types.ObjectId | null;
  /** Lo que se le dice al cliente al transferirlo. Es copy de cara al cliente, lo edita el admin. */
  mensajeTransicion: string;
  reglas: IHandoffReglas;
}

export interface IHandoffSettingsDocument extends IHandoffSettings, Document {}

/** Lo que ve el panel. Sin `tenantId`: nace del token y no viaja nunca en el cuerpo. */
export interface HandoffSettingsDTO {
  activo: boolean;
  asesorDestinoId: string | null;
  mensajeTransicion: string;
  reglas: IHandoffReglas;
  /** `true` mientras la empresa no haya guardado nada y esté viendo los valores de fábrica. */
  heredado: boolean;
}

export type UpdateHandoffSettingsDTO = Omit<HandoffSettingsDTO, 'heredado'>;

/**
 * Resultado de evaluar los disparadores. Unión discriminada en vez de `{ dispara, motivo? }` para
 * que el compilador garantice que no se lee un motivo cuando no hubo handoff.
 */
export type HandoffDecision = { dispara: false } | { dispara: true; motivo: HandoffMotivo };

export const NO_DISPARA: HandoffDecision = { dispara: false };
