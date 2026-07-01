import { Types } from 'mongoose';
import { encrypt, decrypt } from '../../utils/crypto.util.js';
import { AppError } from '../../utils/AppError.js';
import { MetaIntegration } from './channel.model.js';
import type { IChannelConnectDto, IChannelStatusResponse, IMetaIntegration, IMetaIntegrationDocument } from './channel.types.js';

export async function connectChannel(
  tenantId: string | Types.ObjectId,
  dto: IChannelConnectDto,
): Promise<IChannelStatusResponse> {
  const accessTokenEnc = encrypt(dto.accessToken);

  const integration = await MetaIntegration.findOneAndUpdate(
    { tenantId, canal: 'whatsapp' },
    {
      tenantId,
      canal: 'whatsapp',
      wabaId: dto.wabaId,
      phoneNumberId: dto.phoneNumberId,
      accessTokenEnc,
      activo: true,
    },
    { upsert: true, new: true },
  ).lean<IMetaIntegrationDocument>();

  if (!integration) throw new AppError('No se pudo guardar la configuración del canal.', 500);

  return {
    activo: integration.activo,
    phoneNumberId: integration.phoneNumberId,
    wabaId: integration.wabaId,
  };
}

export async function getChannelStatus(
  tenantId: string | Types.ObjectId,
): Promise<IChannelStatusResponse> {
  const integration = await MetaIntegration.findOne({ tenantId, canal: 'whatsapp' }).lean<IMetaIntegrationDocument>();

  if (!integration) {
    throw new AppError('No hay canal de WhatsApp configurado.', 404);
  }

  return {
    activo: integration.activo,
    phoneNumberId: integration.phoneNumberId,
    wabaId: integration.wabaId,
  };
}

export async function getIntegrationWithToken(
  tenantId: string | Types.ObjectId,
): Promise<IMetaIntegration & { accessToken: string }> {
  const integration = await MetaIntegration.findOne({ tenantId, canal: 'whatsapp' })
    .select('+accessTokenEnc')
    .lean<IMetaIntegration>();

  if (!integration) throw new AppError('Canal de WhatsApp no configurado.', 404);

  const accessToken = decrypt(integration.accessTokenEnc);
  return { ...integration, accessToken };
}
