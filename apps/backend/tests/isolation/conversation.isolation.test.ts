import { vi, describe, it, expect } from 'vitest';
import { Types } from 'mongoose';
import { AppError } from '../../src/utils/AppError.js';
import { Cliente } from '../../src/features/cliente/cliente.model.js';
import { createScoped } from '../../src/repositories/base.repository.js';
import { Message } from '../../src/features/message/message.model.js';

// El puente de tiempo real no debe abrir Redis en tests.
vi.mock('../../src/realtime/realtime.publisher.js', () => ({
  publishRealtime: vi.fn(),
  subscribeRealtime: vi.fn(),
}));
vi.mock('../../src/integrations/meta/meta-whatsapp.client.js', () => ({
  metaWhatsAppClient: { sendText: vi.fn(), sendTemplate: vi.fn() },
}));

const { listConversations, getThread, markRead, replyMessage } = await import(
  '../../src/features/conversation/conversation.service.js'
);

describe('Aislamiento multi-tenant — conversations', () => {
  const tenantA = new Types.ObjectId();
  const tenantB = new Types.ObjectId();

  async function seedTenantA(): Promise<string> {
    const cliente = await Cliente.create({
      tenantId: tenantA,
      metaUserId: 'wa_conv_iso',
      telefono: '521234500000',
      canalOrigen: 'whatsapp',
      estadoComercial: 'nuevo',
      ultimoMensajeAt: new Date(),
      noLeidos: 3,
      iaHabilitada: true,
      customFields: {},
      tags: [],
    });
    const clienteId = (cliente._id as Types.ObjectId).toString();
    await createScoped(Message, tenantA, {
      clienteId: cliente._id,
      canal: 'whatsapp',
      direccion: 'inbound',
      sender: 'user',
      tipo: 'text',
      texto: 'Mensaje privado de tenantA',
      status: 'sent',
    });
    return clienteId;
  }

  it('listConversations de tenantB no ve conversaciones de tenantA', async () => {
    await seedTenantA();
    const res = await listConversations(tenantB.toString(), new Types.ObjectId().toString(), {
      page: 1,
      limit: 20,
      filtro: 'todos',
    });
    expect(res.data).toHaveLength(0);
    expect(res.total).toBe(0);
  });

  it('getThread de tenantB sobre un cliente de tenantA → 404', async () => {
    const clienteId = await seedTenantA();
    await expect(
      getThread(tenantB.toString(), clienteId, { page: 1, limit: 50 }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('markRead de tenantB no toca el cliente de tenantA', async () => {
    const clienteId = await seedTenantA();
    await expect(markRead(tenantB.toString(), clienteId)).rejects.toBeInstanceOf(AppError);

    const intacto = await Cliente.findById(clienteId).lean();
    expect(intacto?.noLeidos).toBe(3);
  });

  it('replyMessage de tenantB sobre un cliente de tenantA → 404 (no envía)', async () => {
    const clienteId = await seedTenantA();
    await expect(
      replyMessage(tenantB.toString(), clienteId, 'Hola'),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});
