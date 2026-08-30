import { Types } from 'mongoose';
import {
  createScoped,
  findOneScoped,
  findOneAndUpdateScoped,
  findByIdScoped,
} from '../../repositories/base.repository.js';
import { AppError } from '../../utils/AppError.js';
import { metaWhatsAppClient } from '../../integrations/meta/meta-whatsapp.client.js';
import { getIntegrationWithToken } from '../channel/channel.service.js';
import { assertWithinQuota, incrementUsage } from '../usage/usage.service.js';
import { buildTemplatePayload } from '../whatsapp-template/whatsapp-template.service.js';
import { Cliente } from '../cliente/cliente.model.js';
import { Message } from './message.model.js';
import type {
  ContenidoOutbound,
  ICreateMessageDto,
  IMessageDocument,
  ISendMessageDto,
  MessageStatus,
  Sender,
} from './message.types.js';

type TenantId = string | Types.ObjectId;

const FUERA_DE_VENTANA =
  'Fuera de la ventana de 24 h. Solo se pueden enviar plantillas HSM aprobadas.';

export async function saveMessage(
  tenantId: TenantId,
  dto: ICreateMessageDto,
): Promise<IMessageDocument> {
  if (dto.metaMessageId) {
    const existing = await findOneScoped(Message, tenantId, { metaMessageId: dto.metaMessageId }).lean();
    if (existing) return existing as unknown as IMessageDocument;
  }

  return createScoped(Message, tenantId, dto as unknown as Record<string, unknown>);
}

/**
 * Único punto del sistema donde se decide texto libre vs plantilla HSM según la ventana de 24 h
 * del cliente (`Cliente.ventana24hExpiraEn`). La bandeja (`sendMessage`), `HU-FLOW-02`
 * (recordatorios) y la futura épica de Remarketing la consumen; ninguna reimplementa la regla.
 */
export async function sendOutbound(
  tenantId: TenantId,
  clienteId: string,
  contenido: ContenidoOutbound,
  sender: Sender = 'agent',
): Promise<IMessageDocument> {
  // Cuota de mensajes (outbound): bloqueo duro antes de cualquier decisión. HU-SAAS-02.
  await assertWithinQuota(tenantId, 'mensajesMes');

  const cliente = await findByIdScoped(Cliente, tenantId, clienteId).lean();
  if (!cliente) throw new AppError('Cliente no encontrado.', 404);

  const now = new Date();
  const ventanaAbierta = !!cliente.ventana24hExpiraEn && cliente.ventana24hExpiraEn > now;

  let plantilla: { templateId: string; parametros: string[] } | undefined;
  let texto: string | undefined;

  if (contenido.modo === 'texto') {
    if (!ventanaAbierta) throw new AppError(FUERA_DE_VENTANA, 422);
    texto = contenido.texto;
  } else if (contenido.modo === 'auto') {
    if (ventanaAbierta) {
      texto = contenido.texto;
    } else if (contenido.plantillaFallback) {
      plantilla = contenido.plantillaFallback;
    } else {
      throw new AppError(FUERA_DE_VENTANA, 422);
    }
  } else {
    // 'plantilla': permitido dentro y fuera de la ventana, Meta lo acepta en ambos casos.
    plantilla = { templateId: contenido.templateId, parametros: contenido.parametros };
  }

  const integration = await getIntegrationWithToken(tenantId);

  if (plantilla) {
    const payload = await buildTemplatePayload(tenantId, plantilla.templateId, plantilla.parametros);
    const { messageId } = await metaWhatsAppClient.sendTemplate(
      cliente.telefono,
      payload.name,
      payload.langCode,
      payload.components,
      integration.phoneNumberId,
      integration.accessToken,
    );

    const message = await createScoped(Message, tenantId, {
      clienteId: new Types.ObjectId(clienteId),
      canal: 'whatsapp',
      direccion: 'outbound',
      // Los envíos por plantilla se atribuyen a 'bot': son un mensaje automatizado/aprobado por
      // Meta, no texto libre redactado por el agente, aunque los haya disparado un admin.
      sender: 'bot',
      tipo: 'template',
      metaMessageId: messageId,
      status: 'sent',
    } as Record<string, unknown>);

    await incrementUsage(tenantId, 'mensajesMes');
    return message;
  }

  const { messageId } = await metaWhatsAppClient.sendText(
    cliente.telefono,
    texto as string,
    integration.phoneNumberId,
    integration.accessToken,
  );

  const message = await createScoped(Message, tenantId, {
    clienteId: new Types.ObjectId(clienteId),
    canal: 'whatsapp',
    direccion: 'outbound',
    sender,
    tipo: 'text',
    texto,
    metaMessageId: messageId,
    status: 'sent',
  } as Record<string, unknown>);

  // Contabiliza el mensaje outbound en la cuota mensual del tenant.
  await incrementUsage(tenantId, 'mensajesMes');

  return message;
}

export async function sendMessage(
  tenantId: TenantId,
  dto: ISendMessageDto,
): Promise<IMessageDocument> {
  return sendOutbound(tenantId, dto.clienteId, { modo: 'texto', texto: dto.texto });
}

export async function updateDeliveryStatus(
  tenantId: TenantId,
  metaMessageId: string,
  status: MessageStatus,
): Promise<void> {
  await findOneAndUpdateScoped(Message, tenantId, { metaMessageId }, { status });
}
