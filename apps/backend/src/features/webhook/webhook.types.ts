export interface IWhatsAppWebhookPayload {
  object: 'whatsapp_business_account';
  entry: IWebhookEntry[];
}

export interface IWebhookEntry {
  id: string;
  changes: IWebhookChange[];
}

/**
 * Un cambio del webhook, discriminado por `field`. La app de SofiApp recibe varios campos por el
 * mismo endpoint, y solo `messages` trae `value.metadata.phone_number_id`: asumirlo en todos era lo
 * que tumbaba el procesamiento de un payload con un evento de plantilla (HT-WA-04).
 *
 * Meta puede añadir campos sin avisar; el código los ignora con el `else` final, aunque el tipo no
 * los modele (un `field: string` aquí impediría estrechar la unión).
 */
export type IWebhookChange = IWebhookMessagesChange | ITemplateStatusChange;

export interface IWebhookMessagesChange {
  field: 'messages';
  value: IWebhookValue;
}

/** `message_template_status_update` (HT-WA-04). `entry.id` es la WABA, no el número. */
export interface ITemplateStatusChange {
  field: 'message_template_status_update';
  value: ITemplateStatusValue;
}

export interface ITemplateStatusValue {
  /** `APPROVED`, `REJECTED`, `PENDING`, `PAUSED`, `DISABLED`, `FLAGGED`, `REINSTATED`… */
  event: string;
  /** Meta lo manda como número; se guarda como string, igual que `metaTemplateId`. */
  message_template_id: number | string;
  message_template_name?: string;
  message_template_language?: string;
  /** Motivo del rechazo (`INVALID_FORMAT`…) o `NONE`. */
  reason?: string | null;
}

export interface IWebhookValue {
  messaging_product: 'whatsapp';
  metadata: {
    display_phone_number: string;
    phone_number_id: string;
  };
  contacts?: Array<{ profile: { name: string }; wa_id: string }>;
  messages?: IWhatsAppMessage[];
  statuses?: IWhatsAppStatus[];
}

/**
 * Objeto de media de la Cloud API. Meta lo anida bajo una clave con el nombre del tipo
 * (`msg.image`, `msg.document`, …), no bajo una clave común.
 *
 * `id` es el **Media ID**, no el archivo: hay que canjearlo por una URL temporal en la Graph API.
 */
export interface IWhatsAppMedia {
  id: string;
  mime_type: string;
  sha256?: string;
  /** Pie de foto. Solo en `image`, `video` y `document`. */
  caption?: string;
  /** Solo en `document`. Es texto escrito por el cliente: nunca se usa para construir una ruta. */
  filename?: string;
  /** Solo en `sticker`. */
  animated?: boolean;
  /** Solo en `audio`: distingue una nota de voz de un archivo de audio. */
  voice?: boolean;
}

/**
 * Lo que Meta puede mandar hoy en `type`. Se tipa ancho a propósito con `(string & {})`: la Cloud
 * API añade tipos nuevos sin avisar (`reaction`, `order`, `system`…) y un `type` desconocido tiene
 * que caer en `otro`, no romper el build ni el parseo.
 */
export type TipoMensajeWhatsApp =
  | 'text'
  | 'image'
  | 'video'
  | 'audio'
  | 'document'
  | 'sticker'
  | 'location'
  | 'contacts'
  | 'interactive'
  | 'button'
  | 'reaction'
  | 'order'
  | 'system'
  | 'unknown'
  | (string & {});

export interface IWhatsAppMessage {
  from: string;
  id: string;
  timestamp: string;
  type: TipoMensajeWhatsApp;
  text?: { body: string };
  image?: IWhatsAppMedia;
  video?: IWhatsAppMedia;
  audio?: IWhatsAppMedia;
  document?: IWhatsAppMedia;
  sticker?: IWhatsAppMedia;
  /** Meta lo manda cuando no pudo entregar el contenido (media caducada, tipo no soportado). */
  errors?: Array<{ code: number; title: string; message?: string }>;
  context?: { from?: string; id?: string };
}

export interface IWhatsAppStatus {
  id: string;
  status: 'sent' | 'delivered' | 'read' | 'failed';
  timestamp: string;
  recipient_id: string;
}
