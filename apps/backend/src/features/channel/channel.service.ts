import { Types } from 'mongoose';
import { encrypt, decrypt } from '../../utils/crypto.util.js';
import { AppError } from '../../utils/AppError.js';
import { logger } from '../../utils/logger.js';
import { env } from '../../config/env.js';
import { findOneScoped, findOneAndUpdateScoped } from '../../repositories/base.repository.js';
import { metaPhoneNumberClient } from '../../integrations/meta/meta-phone-number.client.js';
import { MetaIntegration } from './channel.model.js';
import type {
  IChannelConnectDto,
  IChannelStatusResponse,
  IMetaIntegration,
  IMetaIntegrationDocument,
  IUpdateChannelTierDto,
} from './channel.types.js';

type TenantId = string | Types.ObjectId;

function toStatusResponse(integration: IMetaIntegrationDocument | IMetaIntegration): IChannelStatusResponse {
  return {
    activo: integration.activo,
    phoneNumberId: integration.phoneNumberId,
    wabaId: integration.wabaId,
    // Los tres con `??`: una integración conectada antes de HU-MARK-01 no lleva estos campos, y
    // leer `undefined` aquí dejaría al frontend pintando un tier vacío en vez del conservador.
    messagingTier: integration.messagingTier ?? 'TIER_250',
    qualityRating: integration.qualityRating ?? 'UNKNOWN',
    healthStatus: integration.healthStatus ?? 'UNKNOWN',
    tierSyncedAt: integration.tierSyncedAt ? integration.tierSyncedAt.toISOString() : null,
    tierManual: integration.tierManual ?? false,
  };
}

export async function connectChannel(
  tenantId: TenantId,
  dto: IChannelConnectDto,
): Promise<IChannelStatusResponse> {
  const accessTokenEnc = encrypt(dto.accessToken);

  const integration = await findOneAndUpdateScoped(
    MetaIntegration,
    tenantId,
    { canal: 'whatsapp' },
    {
      canal: 'whatsapp',
      wabaId: dto.wabaId,
      phoneNumberId: dto.phoneNumberId,
      accessTokenEnc,
      activo: true,
    },
    { upsert: true, new: true },
  ).lean<IMetaIntegrationDocument>();

  if (!integration) throw new AppError('No se pudo guardar la configuración del canal.', 500);

  return toStatusResponse(integration);
}

export async function getChannelStatus(tenantId: TenantId): Promise<IChannelStatusResponse> {
  const integration = await findOneScoped(MetaIntegration, tenantId, {
    canal: 'whatsapp',
  }).lean<IMetaIntegrationDocument>();

  if (!integration) {
    throw new AppError('No hay canal de WhatsApp configurado.', 404);
  }

  return toStatusResponse(integration);
}

export async function getIntegrationWithToken(
  tenantId: TenantId,
): Promise<IMetaIntegration & { accessToken: string }> {
  const integration = await findOneScoped(MetaIntegration, tenantId, { canal: 'whatsapp' })
    .select('+accessTokenEnc')
    .lean<IMetaIntegration>();

  if (!integration) throw new AppError('Canal de WhatsApp no configurado.', 404);

  const accessToken = decrypt(integration.accessTokenEnc);
  return { ...integration, accessToken };
}

/**
 * Capacidad de envío vigente del número, para el cálculo del presupuesto de campañas (HU-MARK-01).
 *
 * Refresca de forma **oportunista**: si el último sondeo tiene más de `CAMPAIGN_TIER_TTL_MS`, se
 * vuelve a preguntar a Meta. Así el pacing usa un dato razonablemente fresco sin que nadie tenga
 * que acordarse de pulsar "Actualizar", y sin una llamada a la Graph API por cada lote.
 *
 * Nunca lanza por un fallo de la sonda: devuelve lo último que se supo.
 */
export async function getChannelCapacity(tenantId: TenantId): Promise<IChannelStatusResponse> {
  const status = await getChannelStatus(tenantId);

  if (status.tierManual) return status;

  const vencido =
    !status.tierSyncedAt ||
    Date.now() - new Date(status.tierSyncedAt).getTime() > env.CAMPAIGN_TIER_TTL_MS;

  if (!vencido) return status;

  return syncChannelTier(tenantId);
}

/**
 * Sondea Meta y persiste tier, calidad y salud del número.
 *
 * Dos garantías del criterio 7 del spec: respeta el override manual (`tierManual`) y **no lanza**
 * si la sonda falla — se conserva lo guardado. Que la Graph API no responda no puede impedir
 * lanzar una campaña; solo significa que se irá con el último tier conocido.
 */
export async function syncChannelTier(tenantId: TenantId): Promise<IChannelStatusResponse> {
  const integration = await getIntegrationWithToken(tenantId);

  const salud = await metaPhoneNumberClient.getHealth(
    integration.phoneNumberId,
    integration.accessToken,
  );

  if (!salud) {
    logger.warn('Sondeo de tier sin respuesta: se conservan los valores guardados', {
      phoneNumberId: integration.phoneNumberId,
    });
    return getChannelStatus(tenantId);
  }

  // El tier manual manda sobre el de Meta; la calidad y la salud se refrescan igualmente, porque
  // son observaciones, no una decisión del administrador.
  const update: Record<string, unknown> = {
    qualityRating: salud.qualityRating,
    healthStatus: salud.healthStatus,
    tierSyncedAt: new Date(),
  };
  if (!integration.tierManual) update['messagingTier'] = salud.messagingTier;

  const actualizado = await findOneAndUpdateScoped(
    MetaIntegration,
    tenantId,
    { canal: 'whatsapp' },
    update,
    { new: true },
  ).lean<IMetaIntegrationDocument>();

  if (!actualizado) throw new AppError('No hay canal de WhatsApp configurado.', 404);

  return toStatusResponse(actualizado);
}

/**
 * Override manual del tier y/o la calidad. Marca `tierManual` para que la sonda no lo pise después.
 */
export async function updateChannelTier(
  tenantId: TenantId,
  dto: IUpdateChannelTierDto,
): Promise<IChannelStatusResponse> {
  const update: Record<string, unknown> = { tierManual: true, tierSyncedAt: new Date() };
  if (dto.messagingTier) update['messagingTier'] = dto.messagingTier;
  if (dto.qualityRating) update['qualityRating'] = dto.qualityRating;

  const actualizado = await findOneAndUpdateScoped(
    MetaIntegration,
    tenantId,
    { canal: 'whatsapp' },
    update,
    { new: true },
  ).lean<IMetaIntegrationDocument>();

  if (!actualizado) throw new AppError('No hay canal de WhatsApp configurado.', 404);

  return toStatusResponse(actualizado);
}
