import type { Types } from 'mongoose';
import {
  countScoped,
  createScoped,
  findOneAndUpdateScoped,
  findScoped,
  updateManyScoped,
} from '../../repositories/base.repository.js';
import { AppError } from '../../utils/AppError.js';
import { logger } from '../../utils/logger.js';
import type { IPaginated } from '../conversation/conversation.types.js';
import { Notification } from './notification.model.js';
import type { CreateNotificationInput, INotificationDocument, INotificationResponse } from './notification.types.js';

type TenantId = string | Types.ObjectId;

function toNotificationResponse(doc: INotificationDocument): INotificationResponse {
  return {
    id: doc._id.toString(),
    tipo: doc.tipo,
    conversacionId: doc.conversacionId.toString(),
    clienteResumen: doc.clienteResumen,
    actorId: doc.actorId?.toString() ?? null,
    actorNombre: doc.actorNombre,
    mensaje: doc.mensaje,
    leidaAt: doc.leidaAt ? doc.leidaAt.toISOString() : null,
    createdAt: (doc as unknown as { createdAt: Date }).createdAt.toISOString(),
  };
}

/**
 * Registra la notificación. Nunca lanza: se llama junto al `publishRealtime` que ya hacen
 * `assignConversation`/`handoffConversation` — esa operación ya se persistió, así que perder la
 * notificación no debe romper la respuesta al usuario (mismo criterio que `recordAuditEvent`).
 */
export async function createNotification(tenantId: TenantId, input: CreateNotificationInput): Promise<void> {
  try {
    await createScoped(Notification, tenantId, { ...input, leidaAt: null });
  } catch (err) {
    logger.error('No se pudo crear la notificación', { error: String(err), tipo: input.tipo });
  }
}

export async function listNotifications(
  tenantId: TenantId,
  userId: string,
  query: { page: number; limit: number },
): Promise<IPaginated<INotificationResponse>> {
  const { page, limit } = query;
  const filter = { userId };

  const [docs, total] = await Promise.all([
    findScoped(Notification, tenantId, filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean<INotificationDocument[]>(),
    countScoped(Notification, tenantId, filter),
  ]);

  return { data: docs.map(toNotificationResponse), page, limit, total };
}

export async function countUnread(tenantId: TenantId, userId: string): Promise<number> {
  return countScoped(Notification, tenantId, { userId, leidaAt: null });
}

/**
 * El filtro `{ _id, userId }` —no solo el scope de tenant que ya impone `*Scoped`— es la guarda que
 * impide a un admin marcar como leída la notificación de OTRO admin del mismo tenant.
 */
export async function markAsRead(
  tenantId: TenantId,
  userId: string,
  id: string,
): Promise<INotificationResponse> {
  const updated = await findOneAndUpdateScoped(
    Notification,
    tenantId,
    { _id: id, userId },
    { leidaAt: new Date() },
    { new: true },
  ).lean<INotificationDocument>();
  if (!updated) throw new AppError('Notificación no encontrada.', 404);
  return toNotificationResponse(updated);
}

export async function markAllAsRead(tenantId: TenantId, userId: string): Promise<void> {
  await updateManyScoped(Notification, tenantId, { userId, leidaAt: null }, { leidaAt: new Date() });
}
