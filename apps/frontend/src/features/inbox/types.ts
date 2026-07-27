import type { AdminSubrol } from '@/stores/authStore';
import type { TagDTO } from '@/features/tags/types';

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
  /** Etiquetas ya hidratadas por el backend: los chips se pintan sin una segunda llamada. */
  tags: TagDTO[];
}

/** Filtros combinables de la bandeja, reflejados en los query params de `/inbox`. */
export interface InboxFiltros {
  filtro: FiltroBandeja;
  asignadoA?: string;
  estado?: EstadoComercial;
  /** Id de la etiqueta por la que se filtra. */
  etiqueta?: string;
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

// ─── Ficha del contacto + resumen (HU-OMNI-03) ──────────────────────────────────

export interface ResumenDTO {
  texto: string;
  generadoAt: string;
  desactualizado: boolean;
}

export interface ContactCardDTO {
  id: string;
  nombre: string | null;
  telefono: string;
  canalOrigen: string;
  estadoComercial: string;
  nivelInteres: string | null;
  objecionPrincipal: string | null;
  rolContacto: string | null;
  tags: string[];
  asesorId: string | null;
  ultimoMensajeAt: string | null;
  createdAt: string;
}

/** `conversacion` = el cliente lo dictó en un mensaje; `whatsapp` = es el número desde el que escribe. */
export type TelefonoOrigen = 'conversacion' | 'whatsapp';

/**
 * Datos de contacto extraídos por IA. `nombreCompleto` y `correo` son `null` si la conversación
 * no los menciona; `telefono` siempre trae valor (cae al número de WhatsApp del contacto).
 */
export interface DatosExtraidosDTO {
  nombreCompleto: string | null;
  correo: string | null;
  telefono: string;
  telefonoOrigen: TelefonoOrigen;
  extraidoAt: string;
}

export interface ContactHistoryDTO {
  contacto: ContactCardDTO;
  resumen: ResumenDTO | null;
  datosExtraidos: DatosExtraidosDTO | null;
  mensajes: Paginated<MessageDTO>;
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
