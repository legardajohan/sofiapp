import type { Direccion, MessageStatus, Sender, TipoMensaje } from '../message/message.types.js';

/** Segmentos de la bandeja (submenú del sidebar). */
export type FiltroBandeja = 'todos' | 'mios' | 'sin_asignar' | 'sofi';

/** Una conversación es un `Cliente` proyectado para la bandeja (no hay colección propia). */
export interface IConversationResponse {
  id: string;
  nombre: string | null;
  telefono: string;
  canalOrigen: string;
  ultimoMensajeAt: string | null;
  preview: string | null;
  noLeidos: number;
  asesorId: string | null;
  iaHabilitada: boolean;
  ventana24hAbierta: boolean;
  estadoComercial: string;
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
