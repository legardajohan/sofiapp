import type { Types } from 'mongoose';
import type { Direccion, MessageStatus, Sender, TipoMensaje } from '../message/message.types.js';
import type { IConversationResponse, IMessageResponse } from './conversation.types.js';

/** Forma mínima de un `Cliente` (lean) necesaria para proyectar una conversación. */
export interface IConversationSource {
  _id: Types.ObjectId | string;
  nombre?: string;
  telefono: string;
  canalOrigen: string;
  ultimoMensajeAt?: Date | null;
  noLeidos?: number;
  iaHabilitada?: boolean;
  asesorId?: Types.ObjectId | string | null;
  ventana24hExpiraEn?: Date | null;
  estadoComercial: string;
}

/** Forma mínima de un `Message` (lean) necesaria para proyectar un mensaje. */
export interface IMessageSource {
  _id: Types.ObjectId | string;
  direccion: Direccion;
  sender: Sender;
  tipo: TipoMensaje;
  texto?: string;
  attachmentUrl?: string;
  status: MessageStatus;
  createdAt: Date;
}

export function toConversationResponse(
  cliente: IConversationSource,
  preview: string | null,
  now: Date = new Date(),
): IConversationResponse {
  return {
    id: String(cliente._id),
    nombre: cliente.nombre ?? null,
    telefono: cliente.telefono,
    canalOrigen: cliente.canalOrigen,
    ultimoMensajeAt: cliente.ultimoMensajeAt ? cliente.ultimoMensajeAt.toISOString() : null,
    preview,
    noLeidos: cliente.noLeidos ?? 0,
    asesorId: cliente.asesorId ? String(cliente.asesorId) : null,
    iaHabilitada: cliente.iaHabilitada ?? true,
    ventana24hAbierta: !!cliente.ventana24hExpiraEn && cliente.ventana24hExpiraEn > now,
    estadoComercial: cliente.estadoComercial,
  };
}

export function toMessageResponse(msg: IMessageSource): IMessageResponse {
  return {
    id: String(msg._id),
    direccion: msg.direccion,
    sender: msg.sender,
    tipo: msg.tipo,
    texto: msg.texto ?? null,
    attachmentUrl: msg.attachmentUrl ?? null,
    status: msg.status,
    createdAt: msg.createdAt.toISOString(),
  };
}
