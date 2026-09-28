import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Types } from 'mongoose';
import { AppError } from '../../utils/AppError.js';
import { createScoped, findOneScoped } from '../../repositories/base.repository.js';
import { decrypt, encrypt } from '../../utils/crypto.util.js';
import { MetaIntegration } from './channel.model.js';

const exchangeCode = vi.fn();
const subscribeApp = vi.fn();
const registerPhone = vi.fn();
const getPhoneInfo = vi.fn();
vi.mock('../../integrations/meta/meta-onboarding.client.js', () => ({
  PIN_REQUIRED_REASON: 'pin_required',
  metaOnboardingClient: {
    exchangeCode: (...args: unknown[]) => exchangeCode(...args),
    subscribeApp: (...args: unknown[]) => subscribeApp(...args),
    registerPhone: (...args: unknown[]) => registerPhone(...args),
    getPhoneInfo: (...args: unknown[]) => getPhoneInfo(...args),
  },
}));

const getHealth = vi.fn();
vi.mock('../../integrations/meta/meta-phone-number.client.js', () => ({
  metaPhoneNumberClient: { getHealth: (...args: unknown[]) => getHealth(...args) },
}));

import {
  activateChannel,
  connectChannel,
  connectViaEmbeddedSignup,
  updateChannelTier,
} from './channel.service.js';
import type { IMetaIntegration } from './channel.types.js';

const tenantId = new Types.ObjectId();
const dto = { code: 'code-1', wabaId: 'waba-1', phoneNumberId: 'phone-1' };

function pinRequired(): AppError {
  return new AppError('PIN', 422, { reason: 'pin_required' });
}

async function leerConSecretos(tid: Types.ObjectId): Promise<IMetaIntegration | null> {
  return findOneScoped(MetaIntegration, tid, { canal: 'whatsapp' })
    .select('+accessTokenEnc +pinEnc')
    .lean<IMetaIntegration>();
}

describe('HT-WA-03 — conexión por Embedded Signup', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await MetaIntegration.deleteMany({});
    await MetaIntegration.syncIndexes();
    exchangeCode.mockResolvedValue('token-de-negocio');
    subscribeApp.mockResolvedValue(undefined);
    registerPhone.mockResolvedValue(undefined);
    getPhoneInfo.mockResolvedValue({ displayPhoneNumber: '+57 300 111 2233', verifiedName: 'Acme' });
    getHealth.mockResolvedValue({
      messagingTier: 'TIER_1K',
      qualityRating: 'GREEN',
      healthStatus: 'AVAILABLE',
    });
  });

  it('canjea el code, cifra el token, suscribe, registra con un PIN propio y activa', async () => {
    const status = await connectViaEmbeddedSignup(tenantId, dto);

    expect(exchangeCode).toHaveBeenCalledWith('code-1');
    expect(subscribeApp).toHaveBeenCalledWith('waba-1', 'token-de-negocio');
    const pin = registerPhone.mock.calls[0]?.[2] as string;
    expect(pin).toMatch(/^\d{6}$/);

    expect(status).toMatchObject({
      activo: true,
      phoneNumberId: 'phone-1',
      displayPhoneNumber: '+57 300 111 2233',
      verifiedName: 'Acme',
      messagingTier: 'TIER_1K',
    });
    // Ni el token ni el PIN salen del backend.
    expect(JSON.stringify(status)).not.toContain('token-de-negocio');
    expect(JSON.stringify(status)).not.toContain(pin);

    const guardada = await leerConSecretos(tenantId);
    expect(guardada?.accessTokenEnc).not.toBe('token-de-negocio');
    expect(decrypt(guardada!.accessTokenEnc)).toBe('token-de-negocio');
    expect(decrypt(guardada!.pinEnc!)).toBe(pin);
  });

  it('si Meta pide el PIN existente, el canal queda inactivo pero con token, y activate lo termina', async () => {
    registerPhone.mockRejectedValueOnce(pinRequired());

    await expect(connectViaEmbeddedSignup(tenantId, dto)).rejects.toMatchObject({
      statusCode: 422,
      details: { reason: 'pin_required' },
    });

    const pendiente = await leerConSecretos(tenantId);
    expect(pendiente?.activo).toBe(false);
    expect(decrypt(pendiente!.accessTokenEnc)).toBe('token-de-negocio');

    const status = await activateChannel(tenantId, '123456');

    expect(registerPhone).toHaveBeenLastCalledWith('phone-1', 'token-de-negocio', '123456');
    expect(status.activo).toBe(true);
    expect(decrypt((await leerConSecretos(tenantId))!.pinEnc!)).toBe('123456');
  });

  it('reactivar sin PIN reutiliza el guardado en vez de inventar otro', async () => {
    await connectViaEmbeddedSignup(tenantId, dto);
    const pinOriginal = registerPhone.mock.calls[0]?.[2] as string;

    await activateChannel(tenantId);

    expect(registerPhone).toHaveBeenLastCalledWith('phone-1', 'token-de-negocio', pinOriginal);
  });

  it('un code caducado responde 400 y no deja documento', async () => {
    exchangeCode.mockRejectedValueOnce(new AppError('caducó', 400));

    await expect(connectViaEmbeddedSignup(tenantId, dto)).rejects.toMatchObject({ statusCode: 400 });
    expect(await MetaIntegration.countDocuments({})).toBe(0);
  });

  it('un número ya conectado a otra empresa responde 409, también en la conexión manual', async () => {
    const otroTenant = new Types.ObjectId();
    await createScoped(MetaIntegration, otroTenant, {
      canal: 'whatsapp',
      wabaId: 'waba-otro',
      phoneNumberId: 'phone-1',
      accessTokenEnc: encrypt('token-otro'),
      activo: true,
    });

    await expect(connectViaEmbeddedSignup(tenantId, dto)).rejects.toMatchObject({ statusCode: 409 });
    await expect(
      connectChannel(tenantId, { wabaId: 'waba-1', phoneNumberId: 'phone-1', accessToken: 't' }),
    ).rejects.toMatchObject({ statusCode: 409 });

    // La integración del otro tenant sigue intacta.
    const delOtro = await leerConSecretos(otroTenant);
    expect(decrypt(delOtro!.accessTokenEnc)).toBe('token-otro');
  });

  it('si la sonda de tier falla, la conexión sigue activa con los valores conservadores', async () => {
    getHealth.mockRejectedValueOnce(new Error('Graph caído'));

    const status = await connectViaEmbeddedSignup(tenantId, dto);

    expect(status.activo).toBe(true);
    expect(status.messagingTier).toBe('TIER_250');
  });

  it('si Meta no devuelve los datos del número, se activa igual sin nombre legible', async () => {
    getPhoneInfo.mockResolvedValueOnce(null);

    const status = await connectViaEmbeddedSignup(tenantId, dto);

    expect(status.activo).toBe(true);
    expect(status.displayPhoneNumber).toBeNull();
  });

  describe('reconexión con otro número (CA-9)', () => {
    it('reconectar con el mismo número conserva el PIN, sin generar uno nuevo', async () => {
      await connectViaEmbeddedSignup(tenantId, dto);
      const pinOriginal = registerPhone.mock.calls[0]?.[2] as string;

      await connectViaEmbeddedSignup(tenantId, dto);

      expect(registerPhone.mock.calls[1]?.[2]).toBe(pinOriginal);
    });

    it('reconectar con OTRO número no reutiliza el PIN ni el nombre del anterior', async () => {
      await connectViaEmbeddedSignup(tenantId, dto);
      const pinOriginal = registerPhone.mock.calls[0]?.[2] as string;

      const nuevoDto = { code: 'code-2', wabaId: 'waba-2', phoneNumberId: 'phone-2' };
      getPhoneInfo.mockResolvedValueOnce(null); // Meta aún no confirma el nombre del número nuevo
      const status = await connectViaEmbeddedSignup(tenantId, nuevoDto);

      expect(registerPhone.mock.calls[1]?.[2]).not.toBe(pinOriginal);
      expect(status.phoneNumberId).toBe('phone-2');
      expect(status.displayPhoneNumber).toBeNull();
      expect(status.verifiedName).toBeNull();

      const guardada = await leerConSecretos(tenantId);
      expect(decrypt(guardada!.pinEnc!)).not.toBe(pinOriginal);
    });

    it('reconectar con otro número restablece calidad y salud, pero conserva el tier manual', async () => {
      await connectViaEmbeddedSignup(tenantId, dto);
      await updateChannelTier(tenantId, { messagingTier: 'TIER_10K' });

      const nuevoDto = { code: 'code-2', wabaId: 'waba-2', phoneNumberId: 'phone-2' };
      // La sonda falla a propósito: así el estado devuelto es el que dejó `persistIntegration`,
      // sin que `syncChannelTier` lo pise de inmediato con un valor fresco.
      getHealth.mockRejectedValueOnce(new Error('Graph caído'));
      const status = await connectViaEmbeddedSignup(tenantId, nuevoDto);

      expect(status.qualityRating).toBe('UNKNOWN');
      expect(status.healthStatus).toBe('UNKNOWN');
      expect(status.tierSyncedAt).toBeNull();
      expect(status.messagingTier).toBe('TIER_10K');
    });
  });
});
