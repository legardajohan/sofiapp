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
