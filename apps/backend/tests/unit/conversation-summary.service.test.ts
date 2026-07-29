import { vi, describe, it, expect, beforeEach } from 'vitest';
import { Types } from 'mongoose';
import { Cliente } from '../../src/features/cliente/cliente.model.js';
import { createScoped } from '../../src/repositories/base.repository.js';
import { Message } from '../../src/features/message/message.model.js';
import type { AiSummarizeParams } from '../../src/services/ai/ai-service.types.js';

vi.mock('../../src/realtime/realtime.publisher.js', () => ({
  publishRealtime: vi.fn(),
  subscribeRealtime: vi.fn(),
}));
vi.mock('../../src/integrations/meta/meta-whatsapp.client.js', () => ({
  metaWhatsAppClient: { sendText: vi.fn(), sendTemplate: vi.fn() },
}));

const summarizeMock = vi.fn();
vi.mock('../../src/services/ai/ai-service.singleton.js', () => ({
  getAIService: () => ({ summarize: summarizeMock }),
}));

const { generateConversationSummary } = await import(
  '../../src/features/conversation/conversation.service.js'
);

const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

describe('conversation.service — generateConversationSummary', () => {
  const tenantId = new Types.ObjectId();
  let seq = 0;

  beforeEach(() => {
    summarizeMock.mockReset();
    summarizeMock.mockResolvedValue({
      data: 'Resumen generado',
      cacheHit: false,
      promptTokens: 1,
      completionTokens: 1,
      totalTokens: 2,
      durationMs: 1,
    });
  });

  async function seedCliente(over: Record<string, unknown> = {}): Promise<Types.ObjectId> {
    const c = await Cliente.create({
      tenantId,
      metaUserId: `wa_sum_${seq++}`,
      telefono: '5212222',
      canalOrigen: 'whatsapp',
      estadoComercial: 'nuevo',
      customFields: {},
      tags: [],
      ...over,
    });
    return c._id as Types.ObjectId;
  }

  async function addMessage(
    clienteId: Types.ObjectId,
    sender: 'user' | 'bot' | 'agent',
    direccion: 'inbound' | 'outbound',
    texto: string,
  ): Promise<void> {
    await createScoped(Message, tenantId, {
      clienteId,
      canal: 'whatsapp',
      direccion,
      sender,
      tipo: 'text',
      texto,
      status: 'sent',
    });
    await delay(10);
  }

  it('sin mensajes → AppError 422 y no invoca la IA', async () => {
    const id = await seedCliente({ ultimoMensajeAt: new Date() });
    await expect(
      generateConversationSummary(tenantId.toString(), id.toString()),
    ).rejects.toMatchObject({ statusCode: 422 });
    expect(summarizeMock).not.toHaveBeenCalled();
  });

  it('arma el transcript (user→user, bot/agent→model), persiste y devuelve el resumen', async () => {
    let captured: AiSummarizeParams | undefined;
    summarizeMock.mockImplementation((p: AiSummarizeParams) => {
      captured = p;
      return Promise.resolve({
        data: 'Resumen generado',
        cacheHit: false,
        promptTokens: 1,
        completionTokens: 1,
        totalTokens: 2,
        durationMs: 1,
      });
    });

    const id = await seedCliente({ ultimoMensajeAt: new Date() });
    await addMessage(id, 'user', 'inbound', 'Hola, ¿precio?');
    await addMessage(id, 'bot', 'outbound', 'Cuesta X');
    await addMessage(id, 'agent', 'outbound', 'Te ayudo con el cierre');

    const res = await generateConversationSummary(tenantId.toString(), id.toString());

    expect(summarizeMock).toHaveBeenCalledTimes(1);
    expect(captured?.historial).toEqual([
      { role: 'user', content: 'Hola, ¿precio?' },
      { role: 'model', content: 'Cuesta X' },
      { role: 'model', content: 'Te ayudo con el cierre' },
    ]);
    expect(res.texto).toBe('Resumen generado');
    expect(res.desactualizado).toBe(false);

    const fresco = await Cliente.findById(id).lean();
    expect(fresco?.resumenIA?.texto).toBe('Resumen generado');
    expect(fresco?.resumenIA?.modelo).toBe('gemini-2.5-flash');
  });

  it('conversación inexistente → 404', async () => {
    await expect(
      generateConversationSummary(tenantId.toString(), new Types.ObjectId().toString()),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(summarizeMock).not.toHaveBeenCalled();
  });
});
