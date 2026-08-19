import type { AdminSubrol } from '../users/user.types.js';
import type { Direccion, MessageStatus, Sender, TipoMensaje } from '../message/message.types.js';
import type { ITagResponse } from '../tag/tag.types.js';

/** Segmentos de la bandeja (submenú del sidebar). */
export type FiltroBandeja = 'todos' | 'mios' | 'sin_asignar' | 'sofi';

export type EstadoComercial = 'nuevo' | 'en_gestion' | 'pago_pendiente' | 'pagado' | 'perdido';

/** Una conversación es un `Cliente` proyectado para la bandeja (no hay colección propia). */
export interface IConversationResponse {
  id: string;
  nombre: string | null;
  telefono: string;
  canalOrigen: string;
  ultimoMensajeAt: string | null;
  preview: string | null;
  noLeidos: number;
  /** Campo persistido (`Cliente.asesorId`, HU-OMNI-01). Se conserva por compatibilidad. */
  asesorId: string | null;
  /** Alias público del contrato HTTP (HU-OMNI-02): mismo valor que `asesorId`. */
  asignadoA: string | null;
  asignadoANombre: string | null;
  asignadoASubrol: AdminSubrol | null;
  iaHabilitada: boolean;
  ventana24hAbierta: boolean;
  estadoComercial: string;
  /** Etiquetas ya hidratadas (HU-OMNI-04): la bandeja pinta los chips sin una segunda llamada. */
  tags: ITagResponse[];
  /**
   * Lead al que ya se convirtió esta conversación, o `null` (HU-CRM-01). Viaja resuelto para que la
   * cabecera muestre el estado en vez de ofrecer una conversión que fallaría con 409.
   */
  leadId: string | null;
}

/** Un evento del historial de reasignaciones de una conversación (`audit_events`). */
export interface IAssignmentResponse {
  id: string;
  actorId: string;
  actorNombre: string | null;
  de: { id: string; nombre: string | null } | null;
  a: { id: string; nombre: string | null } | null;
  createdAt: string;
}

export interface IMessageResponse {
  id: string;
  direccion: Direccion;
  sender: Sender;
  tipo: TipoMensaje;
  texto: string | null;
  attachmentUrl: string | null;
  status: MessageStatus;
  createdAt: string;
}

export interface IPaginated<T> {
  data: T[];
  page: number;
  limit: number;
  total: number;
}
