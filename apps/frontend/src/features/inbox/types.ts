import type { AdminSubrol } from '@/stores/authStore';

export type FiltroBandeja = 'todos' | 'mios' | 'sin_asignar' | 'sofi';

export type EstadoComercial = 'nuevo' | 'en_gestion' | 'pago_pendiente' | 'pagado' | 'perdido';

export type Direccion = 'inbound' | 'outbound';
export type Sender = 'user' | 'bot' | 'agent';
export type MessageStatus = 'sent' | 'delivered' | 'read' | 'failed';

export interface ConversationDTO {
  id: string;
  nombre: string | null;
  telefono: string;
  canalOrigen: string;
  ultimoMensajeAt: string | null;
  preview: string | null;
  noLeidos: number;
  /** Campo persistido (HU-OMNI-01). Se conserva por compatibilidad. */
  asesorId: string | null;
  /** Alias público del contrato HTTP (HU-OMNI-02): mismo valor que `asesorId`. */
  asignadoA: string | null;
  asignadoANombre: string | null;
  asignadoASubrol: AdminSubrol | null;
  iaHabilitada: boolean;
  ventana24hAbierta: boolean;
  estadoComercial: string;
}

/** Filtros combinables de la bandeja, reflejados en los query params de `/inbox`. */
export interface InboxFiltros {
  filtro: FiltroBandeja;
  asignadoA?: string;
  estado?: EstadoComercial;
}

export interface MessageDTO {
  id: string;
  direccion: Direccion;
  sender: Sender;
  tipo: string;
  texto: string | null;
  attachmentUrl: string | null;
  status: MessageStatus;
  createdAt: string;
}

export interface Paginated<T> {
  data: T[];
  page: number;
  limit: number;
  total: number;
}

/** Payload de los eventos de tiempo real emitidos por el gateway. */
export interface RealtimeMessageEvent {
  tenantId: string;
  conversationId: string;
  message: MessageDTO;
  conversation: ConversationDTO;
}

export interface RealtimeConversationEvent {
  tenantId: string;
  conversationId: string;
  conversation: ConversationDTO;
}

export interface RealtimeAssignedEvent {
  tenantId: string;
  conversationId: string;
  conversation: ConversationDTO;
  targetUserId: string | null;
  actor: { id: string; nombre: string | null };
}
