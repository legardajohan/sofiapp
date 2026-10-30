import type { IMessageResponse } from '../conversation/conversation.types.js';

/** Días sin actividad tras los que el barrido borra la sesión de prueba (HU-IA-08). */
export const SANDBOX_TTL_DIAS = 7;

/** Prefijo de los `metaMessageId` de la conversación de prueba: nunca existen en Meta. */
export const PREFIJO_MENSAJE_PRUEBA = 'prueba-';

/** Prefijo del `metaUserId` del cliente de prueba (uno por admin). */
export const PREFIJO_CLIENTE_PRUEBA = 'prueba-';

/**
 * Lo que el sistema hizo por su cuenta durante la prueba. Se pinta en el chat como una tarjeta
 * aparte de las burbujas: el admin ve la consecuencia de su configuración, no solo el texto.
 */
export type SandboxEfecto =
  | { tipo: 'lead_creado'; leadId: string; estado: string }
  | { tipo: 'asignado'; asesor: { id: string; nombre: string } | null }
  | { tipo: 'etiquetas'; nombres: string[] }
  | { tipo: 'estado_comercial'; estado: string }
  | { tipo: 'semaforo'; clave: string }
  | { tipo: 'datos_extraidos'; campos: Record<string, string> }
  | { tipo: 'handoff'; motivo: string; asesor: { id: string; nombre: string } | null }
  | { tipo: 'espera'; hasta: string }
  | { tipo: 'flujo_fin' };

export interface ISandboxFlujoRef {
  id: string;
  nombre: string;
  activo: boolean;
}

export interface ISandboxSessionResponse {
  clienteId: string;
  /** Flujo elegido para probar; `null` = el flujo activo del tenant, como vería un cliente real. */
  flujo: ISandboxFlujoRef | null;
  /** El flujo activo del tenant, para que la UI diga qué se probará si no se elige ninguno. */
  flujoActivo: Pick<ISandboxFlujoRef, 'id' | 'nombre'> | null;
  /** `false` tras una transferencia a un asesor: Sofi ya no responde hasta reiniciar. */
  iaHabilitada: boolean;
  /** Hay un nodo `espera` detenido; la UI ofrece «Avanzar ahora». */
  esperaPendiente: { hasta: string } | null;
  mensajes: IMessageResponse[];
}
