import type { MessageDTO } from '../inbox/types.js';

/** Lo que el sistema hizo durante la prueba. Espejo de `SandboxEfecto` del backend (HU-IA-08). */
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

export interface SandboxFlujoRef {
  id: string;
  nombre: string;
  activo: boolean;
}

export interface SandboxSession {
  clienteId: string;
  /** Flujo elegido para probar; `null` = el flujo activo del tenant. */
  flujo: SandboxFlujoRef | null;
  flujoActivo: { id: string; nombre: string } | null;
  /** `false` tras una transferencia: Sofi ya no responde hasta reiniciar. */
  iaHabilitada: boolean;
  esperaPendiente: { hasta: string } | null;
  mensajes: MessageDTO[];
}

/** Un efecto ya recibido por el socket, con la hora a la que ocurrió. */
export interface EfectoRegistrado {
  /** Clave estable para React: el servidor no manda id de efecto. */
  key: string;
  efecto: SandboxEfecto;
  at: string;
}

export interface SandboxMessageEvent {
  type: 'sandbox:message';
  message: MessageDTO;
}

export interface SandboxEffectEvent {
  type: 'sandbox:effect';
  efecto: SandboxEfecto;
  at: string;
}
