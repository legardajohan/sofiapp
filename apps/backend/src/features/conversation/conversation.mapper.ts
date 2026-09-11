import type { Types } from 'mongoose';
import type { Direccion, MessageStatus, Sender, TipoMensaje } from '../message/message.types.js';
import type { IUserResponse } from '../users/user.types.js';
import type { ITagResponse } from '../tag/tag.types.js';
import type { IAuditEventResponse } from '../audit/audit.types.js';
import type { HandoffMotivo, IHandoffCondicionAplicada } from '../ai/ai-handoff.types.js';
import type {
  IAssignmentResponse,
  IConversationResponse,
  IMessageResponse,
} from './conversation.types.js';

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
  tagIds?: (Types.ObjectId | string)[] | null;
  /** Handoff automático (HU-IA-03). Opcionales: los documentos anteriores no traen los campos. */
  handoffAt?: Date | null;
  handoffMotivo?: HandoffMotivo | null;
  /** Condición propia que lo disparó (HU-IA-07). Ausente en las transferidas antes de existir. */
  handoffCondicion?: IHandoffCondicionAplicada | null;
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
  asignado: IUserResponse | null = null,
  tagMap: Map<string, ITagResponse> = new Map(),
  leadMap: Map<string, string> = new Map(),
): IConversationResponse {
  const asesorId = cliente.asesorId ? String(cliente.asesorId) : null;
  // Un id sin entrada en el mapa es una referencia colgada (borrado a medias): se omite en vez de
  // romper el render. `deleteTag` hace `$pull`, así que en condiciones normales no ocurre.
  const tags = (cliente.tagIds ?? [])
    .map((id) => tagMap.get(String(id)))
    .filter((t): t is ITagResponse => t !== undefined);
  return {
    id: String(cliente._id),
    nombre: cliente.nombre ?? null,
    telefono: cliente.telefono,
    canalOrigen: cliente.canalOrigen,
    ultimoMensajeAt: cliente.ultimoMensajeAt ? cliente.ultimoMensajeAt.toISOString() : null,
    preview,
    noLeidos: cliente.noLeidos ?? 0,
    asesorId,
    asignadoA: asesorId,
    asignadoANombre: asignado?.nombre ?? null,
    asignadoASubrol: asignado?.subrol ?? null,
    iaHabilitada: cliente.iaHabilitada ?? true,
    ventana24hAbierta: !!cliente.ventana24hExpiraEn && cliente.ventana24hExpiraEn > now,
    estadoComercial: cliente.estadoComercial,
    tags,
    leadId: leadMap.get(String(cliente._id)) ?? null,
    // Ambos campos van juntos o no van: sin `motivo` el aviso de la bandeja no podría decir por qué
    // se transfirió, y una fecha suelta no es información accionable para el asesor.
    handoff:
      cliente.handoffAt && cliente.handoffMotivo
        ? {
            at: cliente.handoffAt.toISOString(),
            motivo: cliente.handoffMotivo,
            condicion: cliente.handoffCondicion ?? null,
          }
        : null,
  };
}

function personFromAuditValue(
  value: unknown,
  userMap: Map<string, IUserResponse>,
): { id: string; nombre: string | null } | null {
  if (typeof value !== 'string') return null;
  return { id: value, nombre: userMap.get(value)?.nombre ?? null };
}

export function toAssignmentResponse(
  evt: IAuditEventResponse,
  userMap: Map<string, IUserResponse>,
): IAssignmentResponse {
  return {
    id: evt.id,
    actorId: evt.actorId,
    // Actor nulo = el sistema. Se muestra como "Sofi" y no como un hueco: el asesor que abre el
    // historial tiene que poder distinguir "lo reasignó el bot" de "no sabemos quién fue".
    actorNombre: evt.actorId ? (userMap.get(evt.actorId)?.nombre ?? null) : 'Sofi',
    de: personFromAuditValue(evt.antes['asignadoA'], userMap),
    a: personFromAuditValue(evt.despues['asignadoA'], userMap),
    createdAt: evt.createdAt,
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
