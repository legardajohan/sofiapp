import { Types, type FilterQuery } from 'mongoose';
import {
  countScoped,
  findByIdScoped,
  findOneAndUpdateScoped,
  findScoped,
} from '../../repositories/base.repository.js';
import { AppError } from '../../utils/AppError.js';
import { Cliente } from '../cliente/cliente.model.js';
import type { IClienteDocument } from '../cliente/cliente.types.js';
import { Message } from '../message/message.model.js';
import type { IMessageDocument } from '../message/message.types.js';
import { sendMessage } from '../message/message.service.js';
import { publishRealtime } from '../../realtime/realtime.publisher.js';
import {
  toConversationResponse,
  toMessageResponse,
  type IConversationSource,
  type IMessageSource,
} from './conversation.mapper.js';
import type {
  FiltroBandeja,
  IConversationResponse,
  IMessageResponse,
  IPaginated,
} from './conversation.types.js';
import type { ListConversationsQuery, ThreadQuery } from './conversation.validation.js';

function nonTextPreview(tipo: string): string {
  const labels: Record<string, string> = {
    image: '📷 Imagen',
    audio: '🎤 Audio',
    document: '📄 Documento',
    template: '📋 Plantilla',
  };
  return labels[tipo] ?? '[mensaje]';
}

function buildFiltro(filtro: FiltroBandeja, asesorId: string): FilterQuery<IClienteDocument> {
  const f: FilterQuery<IClienteDocument> = {};
  if (filtro === 'mios') f.asesorId = new Types.ObjectId(asesorId);
  else if (filtro === 'sin_asignar') f.asesorId = null;
  else if (filtro === 'sofi') f.iaHabilitada = true;
  return f;
}

export async function listConversations(
  tenantId: string,
  asesorId: string,
  query: ListConversationsQuery,
): Promise<IPaginated<IConversationResponse>> {
  const { page, limit, filtro } = query;
  const filtroMongo = buildFiltro(filtro, asesorId);

  const clientes = await findScoped(Cliente, tenantId, filtroMongo)
    .sort({ ultimoMensajeAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .lean();
  const total = await countScoped(Cliente, tenantId, filtroMongo);

  const ids = clientes.map((c) => c._id as Types.ObjectId);

  // Preview = último mensaje por conversación. No hay helper de aggregate scoped, así que
  // el `$match { tenantId }` va PRIMERO para preservar el aislamiento (excepción documentada
  // en docs/multi-tenancy.md; ver también el guard de la skill multi-tenancy-guard).
  const tenantOid = new Types.ObjectId(tenantId);
  const previews = ids.length
    ? await Message.aggregate<{ _id: Types.ObjectId; texto: string | null; tipo: string }>([
        { $match: { tenantId: tenantOid, clienteId: { $in: ids } } },
        { $sort: { createdAt: -1 } },
        { $group: { _id: '$clienteId', texto: { $first: '$texto' }, tipo: { $first: '$tipo' } } },
      ])
    : [];

  const previewMap = new Map<string, string | null>();
  for (const p of previews) previewMap.set(String(p._id), p.texto ?? nonTextPreview(p.tipo));

  const now = new Date();
  const data = clientes.map((c) =>
    toConversationResponse(
      c as unknown as IConversationSource,
      previewMap.get(String(c._id)) ?? null,
      now,
    ),
  );

  return { data, page, limit, total };
}

export async function getThread(
  tenantId: string,
  clienteId: string,
  query: ThreadQuery,
): Promise<IPaginated<IMessageResponse>> {
  const cliente = await findByIdScoped(Cliente, tenantId, clienteId).lean();
  if (!cliente) throw new AppError('Conversación no encontrada.', 404);

  const { page, limit } = query;
  const filter: FilterQuery<IMessageDocument> = { clienteId: new Types.ObjectId(clienteId) };
  const total = await countScoped(Message, tenantId, filter);

  // Traemos la página de los mensajes más recientes (desc) y la invertimos a ascendente
  // para pintar el hilo de arriba (viejo) a abajo (nuevo).
  const docs = await findScoped(Message, tenantId, filter)
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .lean();

  const data = docs
    .reverse()
    .map((m) => toMessageResponse(m as unknown as IMessageSource));

  return { data, page, limit, total };
}

export async function replyMessage(
  tenantId: string,
  clienteId: string,
  texto: string,
): Promise<IMessageResponse> {
  // sendMessage (HT-WA-01) valida pertenencia al tenant y la ventana de 24 h (AppError 422).
  const msg = await sendMessage(tenantId, { clienteId, texto });
  const message = toMessageResponse(msg as unknown as IMessageSource);

  // La respuesta saliente reordena la bandeja y se notifica en vivo a los demás asesores.
  const cliente = await findOneAndUpdateScoped(
    Cliente,
    tenantId,
    { _id: new Types.ObjectId(clienteId) },
    { ultimoMensajeAt: new Date() },
    { new: true },
  ).lean();

  if (cliente) {
    await publishRealtime({
      type: 'message:new',
      tenantId,
      conversationId: clienteId,
      message,
      conversation: toConversationResponse(cliente as unknown as IConversationSource, message.texto),
    });
  }

  return message;
}

export async function markRead(tenantId: string, clienteId: string): Promise<IConversationResponse> {
  const cliente = await findOneAndUpdateScoped(
    Cliente,
    tenantId,
    { _id: new Types.ObjectId(clienteId) },
    { noLeidos: 0 },
    { new: true },
  ).lean();
  if (!cliente) throw new AppError('Conversación no encontrada.', 404);

  const conversation = toConversationResponse(cliente as unknown as IConversationSource, null);
  await publishRealtime({ type: 'conversation:updated', tenantId, conversationId: clienteId, conversation });
  return conversation;
}

export async function setIaHabilitada(
  tenantId: string,
  clienteId: string,
  habilitada: boolean,
): Promise<IConversationResponse> {
  const cliente = await findOneAndUpdateScoped(
    Cliente,
    tenantId,
    { _id: new Types.ObjectId(clienteId) },
    { iaHabilitada: habilitada },
    { new: true },
  ).lean();
  if (!cliente) throw new AppError('Conversación no encontrada.', 404);

  const conversation = toConversationResponse(cliente as unknown as IConversationSource, null);
  await publishRealtime({ type: 'conversation:updated', tenantId, conversationId: clienteId, conversation });
  return conversation;
}

/**
 * Llamada desde el worker al recibir un entrante: incrementa el contador de no leídos y
 * publica `message:new` para que la bandeja se actualice en vivo. `upsertByMetaUser` ya
 * refrescó `ultimoMensajeAt` y la ventana de 24 h.
 */
export async function notifyInboundMessage(
  tenantId: string,
  clienteId: string,
  savedMsg: IMessageSource,
): Promise<void> {
  const cliente = await findOneAndUpdateScoped(
    Cliente,
    tenantId,
    { _id: new Types.ObjectId(clienteId) },
    { $inc: { noLeidos: 1 } },
    { new: true },
  ).lean();
  if (!cliente) return;

  const message = toMessageResponse(savedMsg);
  await publishRealtime({
    type: 'message:new',
    tenantId,
    conversationId: clienteId,
    message,
    conversation: toConversationResponse(cliente as unknown as IConversationSource, message.texto),
  });
}
