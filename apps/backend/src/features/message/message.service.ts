import { Types } from 'mongoose';
import { createScoped, findOneScoped, findOneAndUpdateScoped } from '../../repositories/base.repository.js';
import { AppError } from '../../utils/AppError.js';
import { metaWhatsAppClient } from '../../integrations/meta/meta-whatsapp.client.js';
import { getIntegrationWithToken } from '../channel/channel.service.js';
import { findByIdScoped } from '../../repositories/base.repository.js';
import { assertWithinQuota, incrementUsage } from '../usage/usage.service.js';
import { Cliente } from '../cliente/cliente.model.js';
import { Message } from './message.model.js';
import type { ICreateMessageDto, IMessageDocument, ISendMessageDto, MessageStatus } from './message.types.js';

export async function saveMessage(
  tenantId: string | Types.ObjectId,
  dto: ICreateMessageDto,
): Promise<IMessageDocument> {
  if (dto.metaMessageId) {
    const existing = await findOneScoped(Message, tenantId, { metaMessageId: dto.metaMessageId }).lean();
    if (existing) return existing as unknown as IMessageDocument;
  }

  return createScoped(Message, tenantId, dto as unknown as Record<string, unknown>);
}

export async function sendMessage(
  tenantId: string | Types.ObjectId,
  dto: ISendMessageDto,
): Promise<IMessageDocument> {
  // Cuota de mensajes (outbound): bloqueo duro antes de cualquier envío. HU-SAAS-02.
  await assertWithinQuota(tenantId, 'mensajesMes');

  const cliente = await findByIdScoped(Cliente, tenantId, dto.clienteId).lean();
  if (!cliente) throw new AppError('Cliente no encontrado.', 404);

  const now = new Date();
  if (!cliente.ventana24hExpiraEn || cliente.ventana24hExpiraEn <= now) {
    throw new AppError(
      'Fuera de la ventana de 24 h. Solo se pueden enviar plantillas HSM aprobadas.',
      422,
    );
  }

  const integration = await getIntegrationWithToken(tenantId);
  const { messageId } = await metaWhatsAppClient.sendText(
    cliente.telefono,
    dto.texto,
    integration.phoneNumberId,
    integration.accessToken,
  );

  const message = await createScoped(Message, tenantId, {
    clienteId: new Types.ObjectId(dto.clienteId),
    canal: 'whatsapp',
    direccion: 'outbound',
    sender: 'agent',
    tipo: 'text',
    texto: dto.texto,
    metaMessageId: messageId,
    status: 'sent',
  } as Record<string, unknown>);

  // Contabiliza el mensaje outbound en la cuota mensual del tenant.
  await incrementUsage(tenantId, 'mensajesMes');

  return message;
}

export async function updateDeliveryStatus(
  tenantId: string | Types.ObjectId,
  metaMessageId: string,
  status: MessageStatus,
): Promise<void> {
  await findOneAndUpdateScoped(Message, tenantId, { metaMessageId }, { status });
}
