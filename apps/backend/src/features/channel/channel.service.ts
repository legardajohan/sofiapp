import { randomInt } from 'crypto';
import { Types } from 'mongoose';
import { encrypt, decrypt } from '../../utils/crypto.util.js';
import { AppError } from '../../utils/AppError.js';
import { logger } from '../../utils/logger.js';
import { env } from '../../config/env.js';
import { findOneScoped, findOneAndUpdateScoped } from '../../repositories/base.repository.js';
import { metaPhoneNumberClient } from '../../integrations/meta/meta-phone-number.client.js';
import { metaOnboardingClient } from '../../integrations/meta/meta-onboarding.client.js';
import { MetaIntegration } from './channel.model.js';
import type {
  IChannelConnectDto,
  IChannelStatusResponse,
  IEmbeddedSignupDto,
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
    displayPhoneNumber: integration.displayPhoneNumber ?? null,
    verifiedName: integration.verifiedName ?? null,
    // Los tres con `??`: una integración conectada antes de HU-MARK-01 no lleva estos campos, y
    // leer `undefined` aquí dejaría al frontend pintando un tier vacío en vez del conservador.
    messagingTier: integration.messagingTier ?? 'TIER_250',
    qualityRating: integration.qualityRating ?? 'UNKNOWN',
    healthStatus: integration.healthStatus ?? 'UNKNOWN',
    tierSyncedAt: integration.tierSyncedAt ? integration.tierSyncedAt.toISOString() : null,
    tierManual: integration.tierManual ?? false,
  };
}

/** Duplicado de índice único en Mongo, con la clave que lo provocó. */
function isDuplicatePhoneNumber(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const { code, keyPattern } = err as { code?: number; keyPattern?: Record<string, unknown> };
  return code === 11000 && keyPattern !== undefined && 'phoneNumberId' in keyPattern;
}

interface IPersistIntegrationData {
  wabaId: string;
  phoneNumberId: string;
  accessToken: string;
  activo: boolean;
}

/**
 * Upsert del canal del tenant. Un `phoneNumberId` ya conectado a **otra** empresa choca con el índice
 * único global: se traduce el E11000 a un 409 legible en vez de consultar antes a los demás tenants
 * (que sería una lectura fuera del repositorio scoped sin necesidad).
 */
async function persistIntegration(
  tenantId: TenantId,
  data: IPersistIntegrationData,
): Promise<IMetaIntegrationDocument> {
  try {
    const integration = await findOneAndUpdateScoped(
      MetaIntegration,
      tenantId,
      { canal: 'whatsapp' },
      {
        canal: 'whatsapp',
        wabaId: data.wabaId,
        phoneNumberId: data.phoneNumberId,
        accessTokenEnc: encrypt(data.accessToken),
        activo: data.activo,
      },
      { upsert: true, new: true },
    ).lean<IMetaIntegrationDocument>();

    if (!integration) throw new AppError('No se pudo guardar la configuración del canal.', 500);
    return integration;
  } catch (err) {
    if (isDuplicatePhoneNumber(err)) {
      throw new AppError('Este número de WhatsApp ya está conectado a otra empresa en SofiApp.', 409);
    }
    throw err;
  }
}

/** Conexión manual (sandbox/soporte): IDs y token pegados a mano. */
export async function connectChannel(
  tenantId: TenantId,
  dto: IChannelConnectDto,
): Promise<IChannelStatusResponse> {
  const integration = await persistIntegration(tenantId, { ...dto, activo: true });
  return toStatusResponse(integration);
}

/**
 * Embedded Signup (HT-WA-03). El orden importa: el `code` se gasta al canjearlo, así que el token se
 * guarda **antes** de los pasos que pueden fallar. Si la activación falla, el canal queda
 * `activo:false` y `activateChannel` reintenta sin que la persona tenga que volver al popup.
 */
export async function connectViaEmbeddedSignup(
  tenantId: TenantId,
  dto: IEmbeddedSignupDto,
): Promise<IChannelStatusResponse> {
  const accessToken = await metaOnboardingClient.exchangeCode(dto.code);

  await persistIntegration(tenantId, {
    wabaId: dto.wabaId,
    phoneNumberId: dto.phoneNumberId,
    accessToken,
    activo: false,
  });

  return activateChannel(tenantId);
}

/** Solo aquí se lee el PIN: `getIntegrationWithToken` lo usan muchos callers que no lo necesitan. */
async function readStoredPin(tenantId: TenantId): Promise<string | null> {
  const doc = await findOneScoped(MetaIntegration, tenantId, { canal: 'whatsapp' })
    .select('+pinEnc')
    .lean<Pick<IMetaIntegration, 'pinEnc'>>();
  return doc?.pinEnc ? decrypt(doc.pinEnc) : null;
}

function generatePin(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, '0');
}

/**
 * Deja el número operativo: suscribe la app a la WABA y lo registra en la Cloud API. Idempotente —
 * ambas llamadas de Meta lo son—, así que es seguro reintentarla.
 *
 * El PIN se resuelve en este orden: el que escribió la persona (solo cuando Meta pidió el que ya
 * tenía el número), el que guardamos en una activación anterior, o uno nuevo. En el caso normal
 * nadie ve un PIN nunca.
 */
export async function activateChannel(
  tenantId: TenantId,
  pin?: string,
): Promise<IChannelStatusResponse> {
  const integration = await getIntegrationWithToken(tenantId);
  const { accessToken, phoneNumberId, wabaId } = integration;

  await metaOnboardingClient.subscribeApp(wabaId, accessToken);

  const pinEfectivo = pin ?? (await readStoredPin(tenantId)) ?? generatePin();
  await metaOnboardingClient.registerPhone(phoneNumberId, accessToken, pinEfectivo);

  const info = await metaOnboardingClient.getPhoneInfo(phoneNumberId, accessToken);

  const update: Record<string, unknown> = { activo: true, pinEnc: encrypt(pinEfectivo) };
  if (info?.displayPhoneNumber) update['displayPhoneNumber'] = info.displayPhoneNumber;
  if (info?.verifiedName) update['verifiedName'] = info.verifiedName;

  const activada = await findOneAndUpdateScoped(
    MetaIntegration,
    tenantId,
    { canal: 'whatsapp' },
    update,
    { new: true },
  ).lean<IMetaIntegrationDocument>();

  if (!activada) throw new AppError('No hay canal de WhatsApp configurado.', 404);

  // El tier y la calidad son un plus para el panel, no parte de la conexión: si la sonda se cae, el
  // canal ya está activo y se devuelve tal cual.
  try {
    return await syncChannelTier(tenantId);
  } catch (err) {
    logger.warn('Sonda de tier tras la activación falló; el canal queda activo igualmente', {
      error: String(err),
    });
    return toStatusResponse(activada);
  }
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
