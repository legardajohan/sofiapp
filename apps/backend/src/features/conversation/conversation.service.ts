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
import { assertTagsDelTenant, findTagsByIds } from '../tag/tag.service.js';
import { toResumenResponse } from '../cliente/cliente.service.js';
import { primerAdminActivo } from '../ai/ai-handoff.service.js';
import type { HandoffMotivo } from '../ai/ai-handoff.types.js';
import { logger } from '../../utils/logger.js';
import type { ITagResponse } from '../tag/tag.types.js';
import { findLeadIdsByClientes } from '../lead/lead.service.js';
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
  IConversationOverviewResponse,
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
  etiqueta?: string,
): FilterQuery<IClienteDocument> {
  const f: FilterQuery<IClienteDocument> = {};
  if (filtro === 'mios') f.asesorId = new Types.ObjectId(asesorId);
  else if (filtro === 'sin_asignar') f.asesorId = null;
  else if (filtro === 'sofi') f.iaHabilitada = true;

  // `asignadoA` es más específico que `filtro`: si viene, gana sobre lo anterior.
  if (asignadoA === 'sin_asignar') f.asesorId = null;
  else if (asignadoA) f.asesorId = new Types.ObjectId(asignadoA);

  if (estado) f.estadoComercial = estado;

  // Un ObjectId suelto contra un campo array significa "contiene" en Mongo: no hace falta `$in`.
  // Cubierto por el índice { tenantId, tagIds }.
  if (etiqueta) f.tagIds = new Types.ObjectId(etiqueta);

  return f;
}

/** Resuelve las etiquetas de UNA conversación (usado por las mutaciones de un solo `Cliente`). */
async function resolveTags(
  tenantId: string,
  source: IConversationSource,
): Promise<Map<string, ITagResponse>> {
  const ids = (source.tagIds ?? []).map((id) => String(id));
  return findTagsByIds(tenantId, ids);
}

/** Resuelve el responsable de UNA conversación (usado por las mutaciones de un solo `Cliente`). */
async function resolveAsignado(tenantId: string, asesorId: unknown): Promise<IUserResponse | null> {
  if (!asesorId) return null;
  const id = String(asesorId);
  return (await findUsersByIds(tenantId, [id])).get(id) ?? null;
}

/**
 * Resuelve el `leadId` de UNA conversación (HU-CRM-01). Va en todas las mutaciones, no solo en el
 * listado: sin esto, togglear Sofi o aplicar una etiqueta devolvería `leadId: null` y la cabecera
 * volvería a ofrecer "Convertir en lead" en una conversación ya convertida.
 */
async function resolveLeadMap(tenantId: string, clienteId: string): Promise<Map<string, string>> {
  return findLeadIdsByClientes(tenantId, [clienteId]);
}

export async function listConversations(
  tenantId: string,
  asesorId: string,
  query: ListConversationsQuery,
): Promise<IPaginated<IConversationResponse>> {
  const { page, limit, filtro, asignadoA, estado, etiqueta } = query;
  const filtroMongo = buildFiltro(filtro, asesorId, asignadoA, estado, etiqueta);

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

  // Igual que los responsables: TODAS las etiquetas de la página en una sola consulta.
  const tagIds = clientes.flatMap((c) =>
    ((c as unknown as IConversationSource).tagIds ?? []).map((id) => String(id)),
  );
  const tagMap = await findTagsByIds(tenantId, tagIds);

  // Y lo mismo con los leads: UNA consulta resuelve qué conversaciones de la página ya se
  // convirtieron, apoyada en el índice { tenantId, clienteId } (HU-CRM-01).
  const leadMap = await findLeadIdsByClientes(
    tenantId,
    ids.map((id) => String(id)),
  );

  const now = new Date();
  const data = clientes.map((c) => {
    const source = c as unknown as IConversationSource;
    const asignado = source.asesorId ? (assigneeMap.get(String(source.asesorId)) ?? null) : null;
    return toConversationResponse(
      source,
      previewMap.get(String(c._id)) ?? null,
      now,
      asignado,
      tagMap,
      leadMap,
    );
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

/**
 * Envía un mensaje saliente y deja la bandeja consistente: refresca `ultimoMensajeAt` (que la
 * reordena) y publica `message:new` para los demás asesores. Lo comparten la respuesta manual del
 * asesor y la automática de Sofi; lo único que cambia entre ambas es el `sender`.
 */
async function enviarYNotificar(
  tenantId: string,
  clienteId: string,
  texto: string,
  sender: 'agent' | 'bot',
): Promise<IMessageResponse> {
  // sendMessage (HT-WA-01) valida pertenencia al tenant, la ventana de 24 h (AppError 422) y la
  // cuota mensual de mensajes.
  const msg = await sendMessage(tenantId, { clienteId, texto, sender });
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
    const tagMap = await resolveTags(tenantId, source);
    await publishRealtime({
      type: 'message:new',
      tenantId,
      conversationId: clienteId,
      message,
      conversation: toConversationResponse(source, message.texto, new Date(), asignado, tagMap),
    });
  }

  return message;
}

/** Respuesta manual de un asesor desde la bandeja. */
export async function replyMessage(
  tenantId: string,
  clienteId: string,
  texto: string,
): Promise<IMessageResponse> {
  return enviarYNotificar(tenantId, clienteId, texto, 'agent');
}

/**
 * Respuesta automática de Sofi (HU-IA-01). Idéntica a `replyMessage` salvo el `sender`: pasa por
 * aquí, y no por `sendMessage` directo, para que la respuesta de la IA también aparezca en vivo en
 * la bandeja y reordene la conversación.
 */
export async function replyFromIa(
  tenantId: string,
  clienteId: string,
  texto: string,
): Promise<IMessageResponse> {
  return enviarYNotificar(tenantId, clienteId, texto, 'bot');
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
  const tagMap = await resolveTags(tenantId, source);
  const leadMap = await resolveLeadMap(tenantId, clienteId);
  const conversation = toConversationResponse(source, null, new Date(), asignado, tagMap, leadMap);
  await publishRealtime({ type: 'conversation:updated', tenantId, conversationId: clienteId, conversation });
  return conversation;
}

/**
 * Lectura única de la vista de conversación (HU-IA-04): cabecera, etiquetas, resumen y los permisos
 * del usuario que pregunta.
 *
 * **No devuelve el hilo.** Los mensajes paginan por `getThread` y se refrescan solos con
 * `message:new`; traerlos también aquí obligaría a reconciliar dos copias en cada entrante y a
 * paginar dos veces la misma colección.
 *
 * `puedeVerSensibles` llega resuelto desde el controller y no se calcula aquí: el service no
 * conoce `req`. Con `false` el resumen sale `null`, y `permisos.verResumen` es lo que le permite a
 * la UI distinguir "no hay resumen" de "no puedes verlo".
 */
export async function getConversationOverview(
  tenantId: string,
  clienteId: string,
  puedeVerSensibles: boolean,
): Promise<IConversationOverviewResponse> {
  // Misma guarda que `markRead` y `setIaHabilitada`: un cliente de otro tenant sencillamente no se
  // encuentra, y de ahí sale el aislamiento sin una comprobación aparte.
  const cliente = await findByIdScoped(Cliente, tenantId, clienteId).lean();
  if (!cliente) throw new AppError('Conversación no encontrada.', 404);

  const source = cliente as unknown as IConversationSource;
  const conversation = toConversationResponse(
    source,
    null,
    new Date(),
    await resolveAsignado(tenantId, source.asesorId),
    await resolveTags(tenantId, source),
    await resolveLeadMap(tenantId, clienteId),
  );

  return {
    conversation,
    resumen: toResumenResponse(cliente, puedeVerSensibles),
    permisos: {
      verResumen: puedeVerSensibles,
      generarResumen: puedeVerSensibles,
      verSensibles: puedeVerSensibles,
    },
  };
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
    // Reactivar a Sofi cierra el handoff (HU-IA-03): si el asesor le devuelve el hilo al bot, la
    // bandeja no puede seguir diciendo que está transferida. Apagarla a mano NO marca handoff — eso
    // es una decisión del asesor, no una transferencia automática.
    habilitada
      ? { $set: { iaHabilitada: true }, $unset: { handoffAt: '', handoffMotivo: '' } }
      : { $set: { iaHabilitada: false } },
    { new: true },
  ).lean();
  if (!cliente) throw new AppError('Conversación no encontrada.', 404);

  const source = cliente as unknown as IConversationSource;
  const asignado = await resolveAsignado(tenantId, source.asesorId);
  const tagMap = await resolveTags(tenantId, source);
  const leadMap = await resolveLeadMap(tenantId, clienteId);
  const conversation = toConversationResponse(source, null, new Date(), asignado, tagMap, leadMap);
  await publishRealtime({ type: 'conversation:updated', tenantId, conversationId: clienteId, conversation });
  return conversation;
}

/**
 * Reemplaza el conjunto de etiquetas de una conversación (HU-OMNI-04). Aplicar y quitar varias es
 * una sola operación; `[]` la deja sin etiquetas.
 *
 * `assertTagsDelTenant` va ANTES de escribir: los `tagIds` llegan del body, así que es el único
 * punto por el que una etiqueta de otro tenant podría colarse. Si alguna no pertenece, la
 * operación falla entera y no se escribe nada.
 */
export async function setConversationTags(
  tenantId: string,
  clienteId: string,
  tagIds: string[],
): Promise<IConversationResponse> {
  const cliente = await findByIdScoped(Cliente, tenantId, clienteId).lean();
  if (!cliente) throw new AppError('Conversación no encontrada.', 404);

  const unicos = [...new Set(tagIds)];
  await assertTagsDelTenant(tenantId, unicos);

  const updated = await findOneAndUpdateScoped(
    Cliente,
    tenantId,
    { _id: new Types.ObjectId(clienteId) },
    { tagIds: unicos.map((id) => new Types.ObjectId(id)) },
    { new: true },
  ).lean();
  if (!updated) throw new AppError('Conversación no encontrada.', 404);

  const source = updated as unknown as IConversationSource;
  const asignado = await resolveAsignado(tenantId, source.asesorId);
  const tagMap = await findTagsByIds(tenantId, unicos);
  const leadMap = await resolveLeadMap(tenantId, clienteId);
  const conversation = toConversationResponse(source, null, new Date(), asignado, tagMap, leadMap);

  await publishRealtime({
    type: 'conversation:updated',
    tenantId,
    conversationId: clienteId,
    conversation,
  });
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
    return toConversationResponse(
      source,
      null,
      new Date(),
      asignado,
      await resolveTags(tenantId, source),
      await resolveLeadMap(tenantId, clienteId),
    );
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

  const updatedSource = updated as unknown as IConversationSource;
  const conversation = toConversationResponse(
    updatedSource,
    null,
    new Date(),
    asignado,
    await resolveTags(tenantId, updatedSource),
    await resolveLeadMap(tenantId, clienteId),
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
    // Un actor nulo es el sistema (handoff automático, HU-IA-03): no hay `User` que resolver, y
    // meterlo en el set haría que `findUsersByIds` recibiera un id inválido.
    if (evt.actorId) userIds.add(evt.actorId);
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
 * Sube la conversación a la bandeja como pendiente de una persona (HU-IA-02). Se usa cuando la IA
 * no pudo responder: sin esto el fallo se queda en un log que nadie lee, el cliente espera una
 * respuesta que no llega y ningún asesor se entera de que tiene que intervenir.
 *
 * NO apaga `iaHabilitada`: un 429 pasajero de Gemini no debe desactivar el asistente para siempre.
 */
export async function marcarParaAsesor(tenantId: string, clienteId: string): Promise<void> {
  const cliente = await findOneAndUpdateScoped(
    Cliente,
    tenantId,
    { _id: new Types.ObjectId(clienteId) },
    { $inc: { noLeidos: 1 } },
    { new: true },
  ).lean();
  // Mismo criterio que `notifyInboundMessage`: si la conversación ya no está, no hay nada que
  // notificar y tampoco es un error que deba escalar.
  if (!cliente) return;

  const source = cliente as unknown as IConversationSource;
  const asignado = await resolveAsignado(tenantId, source.asesorId);
  const tagMap = await resolveTags(tenantId, source);
  const leadMap = await resolveLeadMap(tenantId, clienteId);
  await publishRealtime({
    type: 'conversation:updated',
    tenantId,
    conversationId: clienteId,
    conversation: toConversationResponse(source, null, new Date(), asignado, tagMap, leadMap),
  });
}

/**
 * Transfiere la conversación a una persona y calla a Sofi en ese hilo (HU-IA-03).
 *
 * Va en UNA escritura, y no encadenando `assignConversation` + `setIaHabilitada` +
 * `marcarParaAsesor`, por dos motivos concretos. Esa cadena publicaría **tres** eventos de tiempo
 * real, y el intermedio dejaría la bandeja mostrando una conversación ya asignada con Sofi todavía
 * encendida — un estado que nunca existió de verdad. Y `assignConversation` exige un `actorId` de
 * un usuario real: lo resuelve con `findUsersByIds` y lo audita, y en un handoff automático no hay
 * ninguna persona a la que atribuírselo.
 *
 * `asesorId` solo se fija si la conversación estaba SIN asignar: si ya la lleva alguien, el handoff
 * no se la quita. Apaga la IA y avisa, que es lo que hacía falta.
 */
export async function handoffConversation(
  tenantId: string,
  clienteId: string,
  motivo: HandoffMotivo,
  asesorDestinoId: string | null,
): Promise<void> {
  const cliente = await findByIdScoped(Cliente, tenantId, clienteId).lean();
  // Mismo criterio que `marcarParaAsesor`: una conversación borrada a mitad del job no es un error
  // que deba tumbar el worker.
  if (!cliente) return;

  const source = cliente as unknown as IConversationSource;

  // Idempotencia: con Sofi ya apagada, este hilo o bien ya se transfirió o bien lo tomó un asesor a
  // mano. En ninguno de los dos casos hay que reasignar, auditar ni volver a avisar a nadie.
  if (source.iaHabilitada === false) return;

  const yaTeniaAsesor = !!source.asesorId;
  const destino = yaTeniaAsesor ? String(source.asesorId) : await resolverDestino(tenantId, asesorDestinoId);

  const updated = await findOneAndUpdateScoped(
    Cliente,
    tenantId,
    { _id: new Types.ObjectId(clienteId) },
    {
      $set: {
        iaHabilitada: false,
        handoffAt: new Date(),
        handoffMotivo: motivo,
        ...(yaTeniaAsesor || !destino ? {} : { asesorId: new Types.ObjectId(destino) }),
      },
      // La conversación tiene que aparecer como pendiente aunque el asesor la tuviera leída: a
      // partir de ahora hay alguien esperando respuesta humana.
      $inc: { noLeidos: 1 },
    },
    { new: true },
  ).lean();
  if (!updated) return;

  await recordAuditEvent(tenantId, {
    // El sistema, no una persona. Ver `IAuditEvent.actorId`.
    actorId: null,
    accion: 'conversation.handoff',
    entidad: 'cliente',
    entidadId: clienteId,
    antes: { iaHabilitada: true, asignadoA: yaTeniaAsesor ? String(source.asesorId) : null },
    despues: { iaHabilitada: false, asignadoA: destino, motivo },
  });

  const updatedSource = updated as unknown as IConversationSource;
  const conversation = toConversationResponse(
    updatedSource,
    null,
    new Date(),
    await resolveAsignado(tenantId, updatedSource.asesorId),
    await resolveTags(tenantId, updatedSource),
    await resolveLeadMap(tenantId, clienteId),
  );

  // Un solo evento. `conversation:assigned` solo si hay un destinatario NUEVO al que avisar: si la
  // conversación ya la llevaba alguien, o si no hay a quién asignársela, nadie estrena
  // responsabilidad y el evento correcto es el de actualización.
  await publishRealtime(
    !yaTeniaAsesor && destino
      ? {
          type: 'conversation:assigned',
          tenantId,
          conversationId: clienteId,
          conversation,
          targetUserId: destino,
          actor: { id: null, nombre: 'Sofi' },
        }
      : { type: 'conversation:updated', tenantId, conversationId: clienteId, conversation },
  );
}

/**
 * A quién se le pasa la conversación. El destino configurado manda, pero puede haber quedado
 * obsoleto —el asesor se dio de baja o lo desactivaron— y entonces vale más asignarla a cualquiera
 * activo que dejarla sin dueño.
 */
async function resolverDestino(
  tenantId: string,
  asesorDestinoId: string | null,
): Promise<string | null> {
  if (asesorDestinoId) {
    try {
      await assertAssignableAdmin(tenantId, asesorDestinoId);
      return asesorDestinoId;
    } catch {
      logger.warn('Handoff: el asesor destino configurado ya no es asignable', {
        tenantId,
        asesorDestinoId,
      });
    }
  }
  return primerAdminActivo(tenantId);
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
  const tagMap = await resolveTags(tenantId, source);
  const message = toMessageResponse(savedMsg);
  await publishRealtime({
    type: 'message:new',
    tenantId,
    conversationId: clienteId,
    message,
    conversation: toConversationResponse(source, message.texto, new Date(), asignado, tagMap),
  });
}
