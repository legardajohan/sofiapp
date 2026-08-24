import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Types } from 'mongoose';

const { mockChat, mockReplyFromIa } = vi.hoisted(() => ({
  mockChat: vi.fn(),
  mockReplyFromIa: vi.fn(),
}));

vi.mock('../services/ai/ai-service.singleton.js', () => ({
  getAIService: () => ({ chat: mockChat }),
}));

vi.mock('../features/conversation/conversation.service.js', () => ({
  replyFromIa: mockReplyFromIa,
}));

import { processAiReplyJob } from './ai-reply.processor.js';
import { AppError } from '../utils/AppError.js';
import { createScoped } from '../repositories/base.repository.js';
import { Cliente } from '../features/cliente/cliente.model.js';
import { Message } from '../features/message/message.model.js';
import type { IClienteDocument } from '../features/cliente/cliente.types.js';

const RESPUESTA = 'Atendemos de 8:00 a 18:00.';

async function crearCliente(
  tenantId: Types.ObjectId,
  iaHabilitada: boolean,
): Promise<Types.ObjectId> {
  const cliente = await createScoped(Cliente, tenantId, {
    metaUserId: `wa_${new Types.ObjectId().toString()}`,
    telefono: '573000000000',
    canalOrigen: 'whatsapp',
    iaHabilitada,
  });
  return (cliente as unknown as IClienteDocument)._id as Types.ObjectId;
}

async function crearMensaje(
  tenantId: Types.ObjectId,
  clienteId: Types.ObjectId,
  sender: 'user' | 'bot' | 'agent',
  texto?: string,
): Promise<void> {
  await createScoped(Message, tenantId, {
    clienteId,
    canal: 'whatsapp',
    direccion: sender === 'user' ? 'inbound' : 'outbound',
    sender,
    tipo: texto ? 'text' : 'image',
    ...(texto ? { texto } : {}),
    status: 'sent',
  } as unknown as Record<string, unknown>);
}

describe('processAiReplyJob — auto-reply de Sofi (HU-IA-01)', () => {
  let tenantId: Types.ObjectId;

  beforeEach(async () => {
    tenantId = new Types.ObjectId();
    mockChat.mockReset().mockResolvedValue({ data: RESPUESTA, cacheHit: false, retrievedChunks: [] });
    mockReplyFromIa.mockReset().mockResolvedValue(undefined);
    await Cliente.deleteMany({});
    await Message.deleteMany({});
  });

  it('con iaHabilitada genera y envía la respuesta por el mismo canal', async () => {
    const clienteId = await crearCliente(tenantId, true);
    await crearMensaje(tenantId, clienteId, 'user', '¿Cuál es el horario?');

    await processAiReplyJob({ tenantId: tenantId.toString(), clienteId: clienteId.toString() });

    expect(mockChat).toHaveBeenCalledTimes(1);
    expect(mockReplyFromIa).toHaveBeenCalledWith(
      tenantId.toString(),
      clienteId.toString(),
      RESPUESTA,
    );
  });

  it('con iaHabilitada en false no genera ni envía: el asesor tomó el control', async () => {
    const clienteId = await crearCliente(tenantId, false);
    await crearMensaje(tenantId, clienteId, 'user', '¿Cuál es el horario?');

    await processAiReplyJob({ tenantId: tenantId.toString(), clienteId: clienteId.toString() });

    expect(mockChat).not.toHaveBeenCalled();
    expect(mockReplyFromIa).not.toHaveBeenCalled();
  });

  it('un cliente de otro tenant es invisible: no responde', async () => {
    const clienteId = await crearCliente(tenantId, true);
    await crearMensaje(tenantId, clienteId, 'user', '¿Cuál es el horario?');
    const otroTenant = new Types.ObjectId();

    await processAiReplyJob({ tenantId: otroTenant.toString(), clienteId: clienteId.toString() });

    expect(mockChat).not.toHaveBeenCalled();
    expect(mockReplyFromIa).not.toHaveBeenCalled();
  });

  it('sin mensajes con texto no llama al modelo', async () => {
    const clienteId = await crearCliente(tenantId, true);
    await crearMensaje(tenantId, clienteId, 'user'); // imagen, sin texto

    await processAiReplyJob({ tenantId: tenantId.toString(), clienteId: clienteId.toString() });

    expect(mockChat).not.toHaveBeenCalled();
  });

  it('arma el historial en orden cronológico y traduce los roles', async () => {
    const clienteId = await crearCliente(tenantId, true);
    await crearMensaje(tenantId, clienteId, 'user', 'Hola');
    await crearMensaje(tenantId, clienteId, 'agent', '¡Hola! ¿En qué te ayudo?');
    await crearMensaje(tenantId, clienteId, 'user', '¿Cuál es el horario?');

    await processAiReplyJob({ tenantId: tenantId.toString(), clienteId: clienteId.toString() });

    const historial = mockChat.mock.calls[0]![0].historial as Array<{ role: string; content: string }>;
    expect(historial).toEqual([
      { role: 'user', content: 'Hola' },
      { role: 'model', content: '¡Hola! ¿En qué te ayudo?' },
      { role: 'user', content: '¿Cuál es el horario?' },
    ]);
  });

  it('el historial no incluye mensajes de otras conversaciones del mismo tenant', async () => {
    const clienteId = await crearCliente(tenantId, true);
    const otroCliente = await crearCliente(tenantId, true);
    await crearMensaje(tenantId, clienteId, 'user', 'Mi pregunta');
    await crearMensaje(tenantId, otroCliente, 'user', 'Pregunta de otra conversación');

    await processAiReplyJob({ tenantId: tenantId.toString(), clienteId: clienteId.toString() });

    const historial = mockChat.mock.calls[0]![0].historial as Array<{ content: string }>;
    expect(historial).toHaveLength(1);
    expect(historial[0]?.content).toBe('Mi pregunta');
  });

  it('fuera de la ventana de 24 h el job no falla: se logea y se descarta', async () => {
    const clienteId = await crearCliente(tenantId, true);
    await crearMensaje(tenantId, clienteId, 'user', '¿Cuál es el horario?');
    mockReplyFromIa.mockRejectedValue(new AppError('Fuera de la ventana de 24 h.', 422));

    await expect(
      processAiReplyJob({ tenantId: tenantId.toString(), clienteId: clienteId.toString() }),
    ).resolves.toBeUndefined();
  });

  it('un error inesperado sí propaga: eso sí es un fallo del job', async () => {
    const clienteId = await crearCliente(tenantId, true);
    await crearMensaje(tenantId, clienteId, 'user', '¿Cuál es el horario?');
    mockReplyFromIa.mockRejectedValue(new Error('Mongo caído'));

    await expect(
      processAiReplyJob({ tenantId: tenantId.toString(), clienteId: clienteId.toString() }),
    ).rejects.toThrow('Mongo caído');
  });
});

describe('processAiReplyJob — límite de historial', () => {
  it('manda a Gemini como mucho los 10 mensajes más recientes', async () => {
    const tenantId = new Types.ObjectId();
    mockChat.mockReset().mockResolvedValue({ data: RESPUESTA, cacheHit: false });
    mockReplyFromIa.mockReset().mockResolvedValue(undefined);

    const clienteId = await crearCliente(tenantId, true);
    for (let i = 0; i < 14; i += 1) {
      await crearMensaje(tenantId, clienteId, 'user', `Mensaje ${i}`);
    }

    await processAiReplyJob({ tenantId: tenantId.toString(), clienteId: clienteId.toString() });

    const historial = mockChat.mock.calls[0]![0].historial as Array<{ content: string }>;
    expect(historial).toHaveLength(10);
    // Los 10 últimos, en orden: del 4 al 13.
    expect(historial[0]?.content).toBe('Mensaje 4');
    expect(historial[9]?.content).toBe('Mensaje 13');
  });
});
