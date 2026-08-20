import { Document, Types } from 'mongoose';

export type Direccion = 'inbound' | 'outbound';
export type Sender = 'user' | 'bot' | 'agent';
export type TipoMensaje = 'text' | 'image' | 'template' | 'audio' | 'document' | 'other';
export type MessageStatus = 'sent' | 'delivered' | 'read' | 'failed';

export interface IMessage {
  tenantId: Types.ObjectId;
  clienteId: Types.ObjectId;
  canal: 'whatsapp';
  direccion: Direccion;
  sender: Sender;
  tipo: TipoMensaje;
  texto?: string;
  attachmentUrl?: string;
  metaMessageId?: string;
  status: MessageStatus;
  createdAt: Date;
}

export interface IMessageDocument extends IMessage, Document {}

export interface ICreateMessageDto {
  tenantId: Types.ObjectId;
  clienteId: Types.ObjectId;
  canal: 'whatsapp';
  direccion: Direccion;
  sender: Sender;
  tipo: TipoMensaje;
  texto?: string;
  attachmentUrl?: string;
  metaMessageId?: string;
  status: MessageStatus;
}

export interface ISendMessageDto {
  clienteId: string;
  texto: string;
}

/**
 * `sendOutbound` (`message.service.ts`) es el único juez de la ventana de 24 h. `auto` deja que
 * decida entre texto libre y `plantillaFallback`; `texto`/`plantilla` fuerzan un modo concreto
 * (la bandeja usa `texto`, `POST /api/messages/template` usa `plantilla`).
 */
export type ContenidoOutbound =
  | { modo: 'auto'; texto: string; plantillaFallback?: { templateId: string; parametros: string[] } }
  | { modo: 'texto'; texto: string }
  | { modo: 'plantilla'; templateId: string; parametros: string[] };

export interface ISendTemplateDto {
  clienteId: string;
  templateId: string;
  parametros: string[];
}
