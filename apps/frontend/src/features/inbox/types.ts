import type { HandoffMotivo } from '../handoff/types.js';
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
  /**
   * Lead al que ya se convirtió esta conversación, o `null` (HU-CRM-01). Viaja resuelto para que la
   * cabecera muestre el estado en vez de ofrecer una conversión que fallaría con 409.
   */
  leadId: string | null;
  /**
   * Sofi transfirió esta conversación a una persona (HU-IA-03). `null` mientras no haya pasado, y
   * vuelve a `null` cuando alguien reactiva a Sofi en el hilo.
   */
  handoff: { at: string; motivo: HandoffMotivo } | null;
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
  /**
   * Etiquetas ya hidratadas por el backend (`cliente.service.ts` las resuelve desde `tagIds`).
   * Eran `string[]` cuando `Cliente.tags` era texto libre; HU-OMNI-04 las convirtió en objetos y
   * este tipo se quedó atrás. Mientras mintió, `tsc` daba por bueno pintar `{tag}` como hijo de
   * React y el fallo solo aparecía en runtime.
   */
  tags: TagDTO[];
  asesorId: string | null;
  ultimoMensajeAt: string | null;
  createdAt: string;
  /** Lead al que ya se convirtió este contacto, o `null` (HU-CRM-01). */
  leadId: string | null;
  // ─── Datos sensibles (HU-CRM-02) ─────────────────────────────────────────────
  /** En claro o enmascarado (`d••••@dominio.com`) según el subrol. Lo decide el backend. */
  correo: string | null;
  /** En claro o enmascarado (`••••1234`). */
  documento: string | null;
  atributos: AtributoDTO[];
  /**
   * Si el usuario ve los sensibles en claro. Viene del backend porque la UI no puede deducirlo del
   * formato: un correo enmascarado y uno real son ambos cadenas.
   */
  puedeVerSensibles: boolean;
}

/** Atributo personalizado del contacto. `oculto` marca los que llegaron enmascarados. */
export interface AtributoDTO {
  key: string;
  label: string;
  valor: string;
  sensible: boolean;
  oculto: boolean;
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
  /** `id: null` es Sofi: el handoff automático no lo dispara ninguna persona (HU-IA-03). */
  actor: { id: string | null; nombre: string | null };
}
