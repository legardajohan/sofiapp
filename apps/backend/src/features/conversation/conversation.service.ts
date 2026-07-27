import { Types, type FilterQuery } from 'mongoose';
import {
  countScoped,
  findByIdScoped,
  findOneAndUpdateScoped,
  findScoped,
} from '../../repositories/base.repository.js';
import { AppError } from '../../utils/AppError.js';
import { env } from '../../config/env.js';
import { Cliente } from '../cliente/cliente.model.js';
import type { IClienteDocument, IResumenResponse } from '../cliente/cliente.types.js';
import { Message } from '../message/message.model.js';
import { getAIService } from '../../services/ai/ai-service.singleton.js';
import type { ChatTurn } from '../../integrations/llm/llm-provider.types.js';
import type { IMessageDocument } from '../message/message.types.js';
import { sendMessage } from '../message/message.service.js';
import { assertAssignableAdmin, findUsersByIds } from '../users/user.service.js';
import type { IUserResponse } from '../users/user.types.js';
import { listAuditEvents, recordAuditEvent } from '../audit/audit.service.js';
import { publishRealtime } from '../../realtime/realtime.publisher.js';
import {
  toAssignmentResponse,
  toConversationResponse,
  toMessageResponse,
  type IConversationSource,
  type IMessageSource,
} from './conversation.mapper.js';
import type {
  EstadoComercial,
  FiltroBandeja,
  IAssignmentResponse,
  IConversationResponse,
  IMessageResponse,
  IPaginated,
} from './conversation.types.js';
import type {
  AssignmentsQuery,
  ListConversationsQuery,
  ThreadQuery,
} from './conversation.validation.js';

function nonTextPreview(tipo: string): string {
  const labels: Record<string, string> = {
    image: '📷 Imagen',
    audio: '🎤 Audio',
    document: '📄 Documento',
    template: '📋 Plantilla',
  };
  return labels[tipo] ?? '[mensaje]';
}

function buildFiltro(
  filtro: FiltroBandeja,
  asesorId: string,
  asignadoA?: string,
  estado?: EstadoComercial,
): FilterQuery<IClienteDocument> {
  const f: FilterQuery<IClienteDocument> = {};
  if (filtro === 'mios') f.asesorId = new Types.ObjectId(asesorId);
  else if (filtro === 'sin_asignar') f.asesorId = null;
  else if (filtro === 'sofi') f.iaHabilitada = true;

  // `asignadoA` es más específico que `filtro`: si viene, gana sobre lo anterior.
  if (asignadoA === 'sin_asignar') f.asesorId = null;
  else if (asignadoA) f.asesorId = new Types.ObjectId(asignadoA);

  if (estado) f.estadoComercial = estado;

  return f;
}

/** Resuelve el responsable de UNA conversación (usado por las mutaciones de un solo `Cliente`). */
async function resolveAsignado(tenantId: string, asesorId: unknown): Promise<IUserResponse | null> {
  if (!asesorId) return null;
  const id = String(asesorId);
  return (await findUsersByIds(tenantId, [id])).get(id) ?? null;
}

export async function listConversations(
  tenantId: string,
  asesorId: string,
  query: ListConversationsQuery,
): Promise<IPaginated<IConversationResponse>> {
  const { page, limit, filtro, asignadoA, estado } = query;
  const filtroMongo = buildFiltro(filtro, asesorId, asignadoA, estado);

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

  // Resuelve todos los responsables de la página en UNA sola consulta (sin N+1 ni `populate`,
  // que saltaría el repositorio scoped).
  const assigneeIds = clientes
    .map((c) => (c as unknown as IConversationSource).asesorId)
    .filter((id): id is Types.ObjectId | string => !!id)
    .map((id) => String(id));
  const assigneeMap = await findUsersByIds(tenantId, assigneeIds);

  const now = new Date();
  const data = clientes.map((c) => {
    const source = c as unknown as IConversationSource;
    const asignado = source.asesorId ? (assigneeMap.get(String(source.asesorId)) ?? null) : null;
    return toConversationResponse(source, previewMap.get(String(c._id)) ?? null, now, asignado);
  });

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
    const source = cliente as unknown as IConversationSource;
    const asignado = await resolveAsignado(tenantId, source.asesorId);
    await publishRealtime({
      type: 'message:new',
      tenantId,
      conversationId: clienteId,
      message,
      conversation: toConversationResponse(source, message.texto, new Date(), asignado),
    });
  }

  return message;
}

/**
 * Genera (o regenera) el resumen por IA de la conversación de forma síncrona y lo persiste en
 * `Cliente.resumenIA` (HU-OMNI-03). El transcript se arma desde todos los mensajes del cliente:
 * `sender 'user'` → `role 'user'`; `bot | agent` → `role 'model'`. La invalidación por mensajes
 * nuevos es derivada (`ultimoMensajeAt > mensajesHasta`), no requiere escritura extra.
 */
export async function generateConversationSummary(
  tenantId: string,
  clienteId: string,
): Promise<IResumenResponse> {
  const cliente = await findByIdScoped(Cliente, tenantId, clienteId).lean();
  if (!cliente) throw new AppError('Conversación no encontrada.', 404);

  const docs = await findScoped(Message, tenantId, {
    clienteId: new Types.ObjectId(clienteId),
  })
    .sort({ createdAt: 1 })
    .lean();

  const historial: ChatTurn[] = docs.map((m) => ({
    role: m.sender === 'user' ? 'user' : 'model',
    content: m.texto ?? nonTextPreview(m.tipo),
  }));

  if (historial.length === 0) throw new AppError('No hay mensajes para resumir.', 422);

  const { data: texto } = await getAIService().summarize({
    tenantId: new Types.ObjectId(tenantId),
    historial,
  });

  const now = new Date();
  const mensajesHasta = (cliente as { ultimoMensajeAt?: Date }).ultimoMensajeAt ?? now;
  await findOneAndUpdateScoped(
    Cliente,
    tenantId,
    { _id: new Types.ObjectId(clienteId) },
    { resumenIA: { texto, generadoAt: now, mensajesHasta, modelo: env.GEMINI_MODEL } },
    { new: true },
  );

  return { texto, generadoAt: now.toISOString(), desactualizado: false };
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

  const source = cliente as unknown as IConversationSource;
  const asignado = await resolveAsignado(tenantId, source.asesorId);
  const conversation = toConversationResponse(source, null, new Date(), asignado);
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

  const source = cliente as unknown as IConversationSource;
  const asignado = await resolveAsignado(tenantId, source.asesorId);
  const conversation = toConversationResponse(source, null, new Date(), asignado);
  await publishRealtime({ type: 'conversation:updated', tenantId, conversationId: clienteId, conversation });
  return conversation;
}

/**
 * Asigna, reasigna, auto-asigna o desasigna (`asignadoA: null`) el responsable de una
 * conversación. Cualquier `admin` del tenant puede reasignar una conversación ya asignada a
 * otro `admin` (con cualquier subrol): no hay comprobación de propiedad (HU-OMNI-02).
 */
export async function assignConversation(
  tenantId: string,
  actorId: string,
  clienteId: string,
  asignadoA: string | null,
): Promise<IConversationResponse> {
  const cliente = await findByIdScoped(Cliente, tenantId, clienteId).lean();
  if (!cliente) throw new AppError('Conversación no encontrada.', 404);

  // Única guarda: el destinatario debe ser un admin activo del propio tenant.
  const asignado = asignadoA ? await assertAssignableAdmin(tenantId, asignadoA) : null;

  const source = cliente as unknown as IConversationSource;
  const antes = source.asesorId ? String(source.asesorId) : null;

  if (antes === asignadoA) {
    // Idempotente: mismo valor, sin auditoría ni evento de tiempo real.
    return toConversationResponse(source, null, new Date(), asignado);
  }

  const updated = await findOneAndUpdateScoped(
    Cliente,
    tenantId,
    { _id: new Types.ObjectId(clienteId) },
    { asesorId: asignadoA ? new Types.ObjectId(asignadoA) : null },
    { new: true },
  ).lean();
  if (!updated) throw new AppError('Conversación no encontrada.', 404);

  await recordAuditEvent(tenantId, {
    actorId,
    accion: 'conversation.assign',
    entidad: 'cliente',
    entidadId: clienteId,
    antes: { asignadoA: antes },
    despues: { asignadoA },
  });

  const conversation = toConversationResponse(
    updated as unknown as IConversationSource,
    null,
    new Date(),
    asignado,
  );

  const actorInfo = (await findUsersByIds(tenantId, [actorId])).get(actorId) ?? null;
  await publishRealtime({
    type: 'conversation:assigned',
    tenantId,
    conversationId: clienteId,
    conversation,
    targetUserId: asignadoA,
    actor: { id: actorId, nombre: actorInfo?.nombre ?? null },
  });

  return conversation;
}

export async function listAssignments(
  tenantId: string,
  clienteId: string,
  query: AssignmentsQuery,
): Promise<IPaginated<IAssignmentResponse>> {
  const cliente = await findByIdScoped(Cliente, tenantId, clienteId).lean();
  if (!cliente) throw new AppError('Conversación no encontrada.', 404);

  const { page, limit } = query;
  const { data, total } = await listAuditEvents(tenantId, 'cliente', clienteId, page, limit);

  const userIds = new Set<string>();
  for (const evt of data) {
    userIds.add(evt.actorId);
    const de = evt.antes['asignadoA'];
    const a = evt.despues['asignadoA'];
    if (typeof de === 'string') userIds.add(de);
    if (typeof a === 'string') userIds.add(a);
  }
  const userMap = await findUsersByIds(tenantId, [...userIds]);

  return {
    data: data.map((evt) => toAssignmentResponse(evt, userMap)),
    page,
    limit,
    total,
  };
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

  const source = cliente as unknown as IConversationSource;
  const asignado = await resolveAsignado(tenantId, source.asesorId);
  const message = toMessageResponse(savedMsg);
  await publishRealtime({
    type: 'message:new',
    tenantId,
    conversationId: clienteId,
    message,
    conversation: toConversationResponse(source, message.texto, new Date(), asignado),
  });
}
