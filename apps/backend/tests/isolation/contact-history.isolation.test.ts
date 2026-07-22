import { vi, describe, it, expect } from 'vitest';
import { Types } from 'mongoose';
import { Cliente } from '../../src/features/cliente/cliente.model.js';
import { createScoped } from '../../src/repositories/base.repository.js';
import { Message } from '../../src/features/message/message.model.js';

// El puente de tiempo real y Meta no deben abrir conexiones en tests.
vi.mock('../../src/realtime/realtime.publisher.js', () => ({
  publishRealtime: vi.fn(),
  subscribeRealtime: vi.fn(),
}));
vi.mock('../../src/integrations/meta/meta-whatsapp.client.js', () => ({
  metaWhatsAppClient: { sendText: vi.fn(), sendTemplate: vi.fn() },
}));

// La IA no debe llamarse: cualquier invocación cross-tenant es un fallo de aislamiento.
const summarizeMock = vi.fn();
vi.mock('../../src/services/ai/ai-service.singleton.js', () => ({
  getAIService: () => ({ summarize: summarizeMock }),
}));

const { getContactHistory } = await import('../../src/features/cliente/cliente.service.js');
const { generateConversationSummary } = await import(
  '../../src/features/conversation/conversation.service.js'
);

describe('Aislamiento multi-tenant — HU-OMNI-03 (historial + resumen)', () => {
  const tenantA = new Types.ObjectId();
  const tenantB = new Types.ObjectId();

  async function seedTenantA(): Promise<string> {
    const cliente = await Cliente.create({
      tenantId: tenantA,
      metaUserId: 'wa_omni03_iso',
      telefono: '521234500000',
      canalOrigen: 'whatsapp',
      estadoComercial: 'nuevo',
      ultimoMensajeAt: new Date(),
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

  it('getContactHistory de tenantB sobre un cliente de tenantA → 404', async () => {
    const clienteId = await seedTenantA();
    await expect(
      getContactHistory(tenantB.toString(), clienteId, { page: 1, limit: 50 }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('generateConversationSummary de tenantB → 404, sin llamar IA ni persistir', async () => {
    const clienteId = await seedTenantA();
    summarizeMock.mockClear();

    await expect(
      generateConversationSummary(tenantB.toString(), clienteId),
    ).rejects.toMatchObject({ statusCode: 404 });

    expect(summarizeMock).not.toHaveBeenCalled();
    const intacto = await Cliente.findById(clienteId).lean();
    expect(intacto?.resumenIA).toBeUndefined();
  });
});
