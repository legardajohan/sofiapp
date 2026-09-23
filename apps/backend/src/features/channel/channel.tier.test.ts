import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Types } from 'mongoose';
import { createScoped, findOneScoped } from '../../repositories/base.repository.js';
import { encrypt } from '../../utils/crypto.util.js';
import { MetaIntegration } from './channel.model.js';

const getHealth = vi.fn();
vi.mock('../../integrations/meta/meta-phone-number.client.js', () => ({
  metaPhoneNumberClient: { getHealth: (...args: unknown[]) => getHealth(...args) },
}));

import { getChannelStatus, syncChannelTier, updateChannelTier } from './channel.service.js';
import type { IMetaIntegration } from './channel.types.js';

const tenantId = new Types.ObjectId();

describe('HU-MARK-01 — tier y calidad del número de WhatsApp', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await MetaIntegration.deleteMany({});
    await createScoped(MetaIntegration, tenantId, {
      canal: 'whatsapp',
      wabaId: 'waba-1',
      phoneNumberId: 'phone-1',
      accessTokenEnc: encrypt('token'),
      activo: true,
    });
  });

  it('un canal recién conectado arranca en el tier conservador, no en uno optimista', async () => {
    const status = await getChannelStatus(tenantId);

    // 250 es el techo de un número sin verificar: suponer más es acabar chocando con Meta.
    expect(status.messagingTier).toBe('TIER_250');
    expect(status.qualityRating).toBe('UNKNOWN');
    expect(status.tierSyncedAt).toBeNull();
    expect(status.tierManual).toBe(false);
  });

  it('el sondeo persiste tier, calidad y salud, y sella la fecha', async () => {
    getHealth.mockResolvedValue({
      messagingTier: 'TIER_10K',
      qualityRating: 'GREEN',
      healthStatus: 'AVAILABLE',
    });

    const status = await syncChannelTier(tenantId);

    expect(status).toMatchObject({
      messagingTier: 'TIER_10K',
      qualityRating: 'GREEN',
      healthStatus: 'AVAILABLE',
    });
    expect(status.tierSyncedAt).not.toBeNull();
  });

  it('si la sonda no responde NO lanza: conserva lo guardado', async () => {
    getHealth.mockResolvedValue({
      messagingTier: 'TIER_1K',
      qualityRating: 'GREEN',
      healthStatus: 'AVAILABLE',
    });
    await syncChannelTier(tenantId);

    // Meta deja de responder (token caducado, número sandbox, corte de red…).
    getHealth.mockResolvedValue(null);
    const status = await syncChannelTier(tenantId);

    expect(status.messagingTier).toBe('TIER_1K');
    expect(status.qualityRating).toBe('GREEN');
  });

  it('el override manual fija el tier y marca `tierManual`', async () => {
    const status = await updateChannelTier(tenantId, { messagingTier: 'TIER_100K' });

    expect(status.messagingTier).toBe('TIER_100K');
    expect(status.tierManual).toBe(true);
  });

  it('el sondeo NO pisa un tier manual, pero sí refresca la calidad (es una observación, no una decisión)', async () => {
    await updateChannelTier(tenantId, { messagingTier: 'TIER_100K' });

    getHealth.mockResolvedValue({
      messagingTier: 'TIER_250',
      qualityRating: 'YELLOW',
      healthStatus: 'LIMITED',
    });
    const status = await syncChannelTier(tenantId);

    expect(status.messagingTier).toBe('TIER_100K');
    expect(status.qualityRating).toBe('YELLOW');
    expect(status.healthStatus).toBe('LIMITED');
  });

  it('el tier de un tenant no se filtra al de otro', async () => {
    const otroTenant = new Types.ObjectId();
    await createScoped(MetaIntegration, otroTenant, {
      canal: 'whatsapp',
      wabaId: 'waba-2',
      phoneNumberId: 'phone-2',
      accessTokenEnc: encrypt('token'),
      activo: true,
    });

    await updateChannelTier(tenantId, { messagingTier: 'TIER_100K' });

    const delOtro = await findOneScoped(MetaIntegration, otroTenant, {
      canal: 'whatsapp',
    }).lean<IMetaIntegration>();
    expect(delOtro?.messagingTier).toBe('TIER_250');
  });
});
