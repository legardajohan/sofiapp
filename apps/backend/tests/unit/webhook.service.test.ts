import { createHmac } from 'crypto';
import { vi, describe, it, expect } from 'vitest';

vi.mock('../../src/config/queues.js', () => ({
  INBOUND_QUEUE_NAME: 'inbound-messages',
  inboundQueue: { add: vi.fn() },
}));

const { validateHmacSignature, verifyChallenge } = await import(
  '../../src/features/webhook/webhook.service.js'
);
const { AppError } = await import('../../src/utils/AppError.js');

describe('webhook.service', () => {
  describe('validateHmacSignature', () => {
    it('firma incorrecta → false', () => {
      const rawBody = Buffer.from(JSON.stringify({ object: 'whatsapp_business_account' }));
      expect(validateHmacSignature(rawBody, 'sha256=firma-incorrecta')).toBe(false);
    });

    it('firma correcta → true', () => {
      const rawBody = Buffer.from(JSON.stringify({ object: 'whatsapp_business_account' }));
      const sig = `sha256=${createHmac('sha256', 'test-app-secret-12345678901234').update(rawBody).digest('hex')}`;
      expect(validateHmacSignature(rawBody, sig)).toBe(true);
    });
  });

  describe('verifyChallenge', () => {
    it('token incorrecto → lanza AppError con status 403', () => {
      let caught: unknown;
      try {
        verifyChallenge({
          'hub.mode': 'subscribe',
          'hub.verify_token': 'token-equivocado',
          'hub.challenge': '1234567',
        });
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(AppError);
      expect((caught as InstanceType<typeof AppError>).statusCode).toBe(403);
    });

    it('token correcto → devuelve challenge', () => {
      const result = verifyChallenge({
        'hub.mode': 'subscribe',
        'hub.verify_token': 'test-verify-token',
        'hub.challenge': '1234567',
      });
      expect(result).toBe('1234567');
    });
  });
});
