import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Types } from 'mongoose';
import { createScoped, findOneScoped } from '../../repositories/base.repository.js';
import { decrypt, encrypt } from '../../utils/crypto.util.js';
import { MetaIntegration } from './channel.model.js';

const registerPhone = vi.fn();
vi.mock('../../integrations/meta/meta-onboarding.client.js', () => ({
  PIN_REQUIRED_REASON: 'pin_required',
  metaOnboardingClient: {
    exchangeCode: vi.fn().mockResolvedValue('token-b'),
    subscribeApp: vi.fn().mockResolvedValue(undefined),
    registerPhone: (...args: unknown[]) => registerPhone(...args),
    getPhoneInfo: vi.fn().mockResolvedValue(null),
  },
}));

vi.mock('../../integrations/meta/meta-phone-number.client.js', () => ({
  metaPhoneNumberClient: { getHealth: vi.fn().mockResolvedValue(null) },
}));

import { activateChannel, connectViaEmbeddedSignup, getChannelStatus } from './channel.service.js';
import type { IMetaIntegration } from './channel.types.js';

describe('HT-WA-03 — aislamiento multi-tenant del canal', () => {
  const tenantA = new Types.ObjectId();
  const tenantB = new Types.ObjectId();

  beforeEach(async () => {
    vi.clearAllMocks();
    registerPhone.mockResolvedValue(undefined);
    await MetaIntegration.deleteMany({});
    await createScoped(MetaIntegration, tenantA, {
      canal: 'whatsapp',
      wabaId: 'waba-a',
      phoneNumberId: 'phone-a',
      accessTokenEnc: encrypt('token-a'),
      pinEnc: encrypt('111111'),
      activo: true,
    });
  });

  it('el tenant B no ve el canal de A', async () => {
    await expect(getChannelStatus(tenantB)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('activate del tenant B sin canal propio → 404, sin tocar Meta con el token de A', async () => {
    await expect(activateChannel(tenantB)).rejects.toMatchObject({ statusCode: 404 });
    expect(registerPhone).not.toHaveBeenCalled();
  });

  it('conectar B no pisa el token ni el PIN de A, y B no hereda el PIN de A', async () => {
    await connectViaEmbeddedSignup(tenantB, { code: 'c', wabaId: 'waba-b', phoneNumberId: 'phone-b' });

    const a = await findOneScoped(MetaIntegration, tenantA, { canal: 'whatsapp' })
      .select('+accessTokenEnc +pinEnc')
      .lean<IMetaIntegration>();
    expect(decrypt(a!.accessTokenEnc)).toBe('token-a');
    expect(decrypt(a!.pinEnc!)).toBe('111111');

    expect(registerPhone).toHaveBeenCalledWith('phone-b', 'token-b', expect.not.stringMatching(/^111111$/));
  });
});
