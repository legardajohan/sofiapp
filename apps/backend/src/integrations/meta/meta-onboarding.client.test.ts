import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { env } from '../../config/env.js';
import { metaOnboardingClient } from './meta-onboarding.client.js';

const ACCESS_TOKEN = 'test-token';
const PHONE_NUMBER_ID = 'phone-1';
const WABA_ID = 'waba-1';

function graphError(code: number, message = 'Meta error'): Response {
  return {
    ok: false,
    status: 400,
    json: () => Promise.resolve({ error: { code, message } }),
  } as Response;
}

/** Lo que lanza `fetch` cuando `AbortSignal.timeout(ms)` vence. */
function timeoutError(): DOMException {
  return new DOMException('The operation timed out.', 'TimeoutError');
}

describe('metaOnboardingClient (HT-WA-03)', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('exchangeCode sin META_APP_ID responde 503 sin llamar a Meta', async () => {
    const original = env.META_APP_ID;
    env.META_APP_ID = undefined;
    try {
      await expect(metaOnboardingClient.exchangeCode('code')).rejects.toMatchObject({
        statusCode: 503,
      });
      expect(vi.mocked(fetch)).not.toHaveBeenCalled();
    } finally {
      env.META_APP_ID = original;
    }
  });

  it('un timeout al canjear el code responde 502, no el error de red crudo', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(timeoutError());

    await expect(metaOnboardingClient.exchangeCode('code')).rejects.toMatchObject({
      statusCode: 502,
    });
  });

  it('un timeout al suscribir la WABA responde 502', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(timeoutError());

    await expect(metaOnboardingClient.subscribeApp(WABA_ID, ACCESS_TOKEN)).rejects.toMatchObject({
      statusCode: 502,
    });
  });

  it('cada llamada pasa un AbortSignal con timeout, no una llamada sin límite', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve({}) } as Response);

    await metaOnboardingClient.subscribeApp(WABA_ID, ACCESS_TOKEN);

    const init = vi.mocked(fetch).mock.calls[0]?.[1] as RequestInit;
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('demasiados intentos de PIN (133008) responden 429, no el 502 genérico', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(graphError(133008));

    await expect(
      metaOnboardingClient.registerPhone(PHONE_NUMBER_ID, ACCESS_TOKEN, '123456'),
    ).rejects.toMatchObject({ statusCode: 429 });
  });

  it('el otro código de bloqueo (133009) también responde 429', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(graphError(133009));

    await expect(
      metaOnboardingClient.registerPhone(PHONE_NUMBER_ID, ACCESS_TOKEN, '123456'),
    ).rejects.toMatchObject({ statusCode: 429 });
  });

  it('getPhoneInfo nunca lanza: un timeout devuelve null, no un error', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(timeoutError());

    await expect(
      metaOnboardingClient.getPhoneInfo(PHONE_NUMBER_ID, ACCESS_TOKEN),
    ).resolves.toBeNull();
  });
});
