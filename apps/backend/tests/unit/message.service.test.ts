import { vi, describe, it, expect } from 'vitest';
import { Types } from 'mongoose';
import { AppError } from '../../src/utils/AppError.js';
import { Cliente } from '../../src/features/cliente/cliente.model.js';
import { MetaIntegration } from '../../src/features/channel/channel.model.js';
import { encrypt } from '../../src/utils/crypto.util.js';

vi.mock('../../src/integrations/meta/meta-whatsapp.client.js', () => ({
  metaWhatsAppClient: {
    sendText: vi.fn().mockResolvedValue({ messageId: 'wamid.test.abc123' }),
    sendTemplate: vi.fn(),
  },
}));

// Import after mock is defined
const { sendMessage } = await import('../../src/features/message/message.service.js');

describe('message.service — sendMessage', () => {
  const tenantId = new Types.ObjectId();

  it('ventana24hExpiraEn en el pasado → lanza AppError con status 422', async () => {
    const cliente = await Cliente.create({
      tenantId,
      metaUserId: 'wa_past_window',
      telefono: '521234567890',
      canalOrigen: 'whatsapp',
      estadoComercial: 'nuevo',
      ventana24hExpiraEn: new Date(Date.now() - 1000),
      customFields: {},
      tags: [],
    });

    let caught: unknown;
    try {
      await sendMessage(tenantId.toString(), {
        clienteId: (cliente._id as Types.ObjectId).toString(),
        texto: 'Hola',
      });
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(AppError);
    expect((caught as AppError).statusCode).toBe(422);
  });

  it('ventana24hExpiraEn en el futuro → llama al provider y persiste Message', async () => {
    const cliente = await Cliente.create({
      tenantId,
      metaUserId: 'wa_open_window',
      telefono: '521234567891',
      canalOrigen: 'whatsapp',
      estadoComercial: 'nuevo',
      ventana24hExpiraEn: new Date(Date.now() + 24 * 60 * 60 * 1000),
      customFields: {},
      tags: [],
    });

    await MetaIntegration.create({
      tenantId,
      canal: 'whatsapp',
      wabaId: 'waba_test_001',
      phoneNumberId: 'phone_test_001',
      accessTokenEnc: encrypt('test-access-token'),
      activo: true,
    });

    const msg = await sendMessage(tenantId.toString(), {
      clienteId: (cliente._id as Types.ObjectId).toString(),
      texto: 'Hola desde el test!',
    });

    expect(msg.direccion).toBe('outbound');
    expect(msg.metaMessageId).toBe('wamid.test.abc123');
    expect(msg.tenantId.toString()).toBe(tenantId.toString());
  });
});
