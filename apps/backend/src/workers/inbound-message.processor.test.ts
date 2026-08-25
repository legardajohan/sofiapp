/**
 * La decisión de si Sofi responde a un mensaje entrante (HU-IA-02). Antes de esta HU no tenía
 * cobertura alguna: `inbound-message.processor.ts` exportaba un `Worker` ya construido y no se
 * podía invocar sin Redis.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Types } from 'mongoose';

const { mockAdd, mockReplyFromIa, mockNotifyInbound } = vi.hoisted(() => ({
  mockAdd: vi.fn(),
  mockReplyFromIa: vi.fn(),
  mockNotifyInbound: vi.fn(),
}));

vi.mock('../config/queues.js', () => ({
  INBOUND_QUEUE_NAME: 'inbound-messages',
  AI_REPLY_QUEUE_NAME: 'ai-reply',
  AI_REPLY_JOB_NAME: 'auto-reply',
  KB_INDEX_QUEUE_NAME: 'kb-index',
  KB_INDEX_JOB_NAME: 'index-document',
  inboundQueue: { add: vi.fn() },
  kbIndexQueue: { add: vi.fn() },
  aiReplyQueue: { add: mockAdd },
}));

vi.mock('../features/conversation/conversation.service.js', () => ({
  replyFromIa: mockReplyFromIa,
  notifyInboundMessage: mockNotifyInbound,
}));

import { processInboundJob, ventanaJobId } from './inbound-message.processor.js';
import { env } from '../config/env.js';
import { MENSAJE_SOLO_TEXTO } from './ai-reply.messages.js';
import { Cliente } from '../features/cliente/cliente.model.js';
import { Message } from '../features/message/message.model.js';
import { MetaIntegration } from '../features/channel/channel.model.js';
import { Tenant } from '../features/tenant/tenant.model.js';
import { createScoped } from '../repositories/base.repository.js';
import type { IClienteDocument } from '../features/cliente/cliente.types.js';
import type { IWhatsAppWebhookPayload } from '../features/webhook/webhook.types.js';

const PHONE_ID = 'phone-hu-ia-02';
const WA_ID = '573001112233';

function payload(
  mensajes: Array<{ id: string; type: 'text' | 'image' | 'audio'; body?: string }>,
): IWhatsAppWebhookPayload {
  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'entry-1',
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: { display_phone_number: '573000000000', phone_number_id: PHONE_ID },
              contacts: [{ profile: { name: 'Ana' }, wa_id: WA_ID }],
              messages: mensajes.map((m) => ({
                from: WA_ID,
                id: m.id,
                timestamp: `${Math.floor(Date.now() / 1000)}`,
                type: m.type,
                ...(m.body ? { text: { body: m.body } } : {}),
              })),
            },
          },
        ],
      },
    ],
  };
}

async function crearTenantConCanal(): Promise<Types.ObjectId> {
  const tenant = await Tenant.create({
    nombre: 'Empresa HU-IA-02',
    slug: `hu-ia-02-${new Types.ObjectId().toString()}`,
    contacto: { email: 'ia02@t.com', telefono: '3000000000' },
  });
  await MetaIntegration.create({
    tenantId: tenant._id,
    canal: 'whatsapp',
    wabaId: 'waba-1',
    phoneNumberId: PHONE_ID,
    accessTokenEnc: 'x',
    activo: true,
  });
  return tenant._id;
}

async function crearCliente(tenantId: Types.ObjectId, iaHabilitada: boolean): Promise<void> {
  await createScoped(Cliente, tenantId, {
    metaUserId: WA_ID,
    telefono: WA_ID,
    canalOrigen: 'whatsapp',
    iaHabilitada,
  });
}

describe('processInboundJob — decide si Sofi responde (HU-IA-02)', () => {
  let tenantId: Types.ObjectId;

  beforeEach(async () => {
    await Promise.all([
      Cliente.deleteMany({}),
      Message.deleteMany({}),
      MetaIntegration.deleteMany({}),
    ]);
    mockAdd.mockReset().mockResolvedValue(undefined);
    mockReplyFromIa.mockReset().mockResolvedValue(undefined);
    mockNotifyInbound.mockReset().mockResolvedValue(undefined);
    tenantId = await crearTenantConCanal();
  });

  it('con iaHabilitada y texto encola un auto-reply', async () => {
    await crearCliente(tenantId, true);

    await processInboundJob({
      tenantId: tenantId.toString(),
      payload: payload([{ id: 'wamid.1', type: 'text', body: '¿Cuál es el horario?' }]),
    });

    expect(mockAdd).toHaveBeenCalledTimes(1);
    expect(mockReplyFromIa).not.toHaveBeenCalled();
  });

  it('con iaHabilitada en false no encola nada ni manda acuse', async () => {
    await crearCliente(tenantId, false);

    await processInboundJob({
      tenantId: tenantId.toString(),
      payload: payload([{ id: 'wamid.2', type: 'text', body: '¿Cuál es el horario?' }]),
    });

    expect(mockAdd).not.toHaveBeenCalled();
    expect(mockReplyFromIa).not.toHaveBeenCalled();
  });

  it('un audio no encola auto-reply pero sí acusa recibo, en vez de callar', async () => {
    await crearCliente(tenantId, true);

    await processInboundJob({
      tenantId: tenantId.toString(),
      payload: payload([{ id: 'wamid.3', type: 'audio' }]),
    });

    expect(mockAdd).not.toHaveBeenCalled();
    expect(mockReplyFromIa).toHaveBeenCalledTimes(1);
    expect(mockReplyFromIa.mock.calls[0]?.[2]).toBe(MENSAJE_SOLO_TEXTO);
  });

  it('dos mensajes no textuales seguidos no repiten el acuse', async () => {
    await crearCliente(tenantId, true);
    // El acuse se detecta por el último mensaje del hilo, así que hay que persistirlo:
    // `replyFromIa` está mockeado y no escribe nada por sí solo.
    mockReplyFromIa.mockImplementation(async (t: string, c: string, texto: string) => {
      await createScoped(Message, t, {
        clienteId: new Types.ObjectId(c),
        canal: 'whatsapp',
        direccion: 'outbound',
        sender: 'bot',
        tipo: 'text',
        texto,
        status: 'sent',
      } as unknown as Record<string, unknown>);
    });

    await processInboundJob({
      tenantId: tenantId.toString(),
      payload: payload([{ id: 'wamid.4', type: 'audio' }]),
    });
    await processInboundJob({
      tenantId: tenantId.toString(),
      payload: payload([{ id: 'wamid.5', type: 'image' }]),
    });

    expect(mockReplyFromIa).toHaveBeenCalledTimes(1);
  });

  it('si el cliente escribe entre dos audios, el acuse vuelve a tener sentido y se repite', async () => {
    await crearCliente(tenantId, true);
    mockReplyFromIa.mockImplementation(async (t: string, c: string, texto: string) => {
      await createScoped(Message, t, {
        clienteId: new Types.ObjectId(c),
        canal: 'whatsapp',
        direccion: 'outbound',
        sender: 'bot',
        tipo: 'text',
        texto,
        status: 'sent',
      } as unknown as Record<string, unknown>);
    });

    await processInboundJob({
      tenantId: tenantId.toString(),
      payload: payload([{ id: 'wamid.12', type: 'audio' }]),
    });
    // El cliente sí escribe: su texto pasa a ser lo último dicho con palabras.
    await processInboundJob({
      tenantId: tenantId.toString(),
      payload: payload([{ id: 'wamid.13', type: 'text', body: 'perdón, te escribo' }]),
    });
    await processInboundJob({
      tenantId: tenantId.toString(),
      payload: payload([{ id: 'wamid.14', type: 'audio' }]),
    });

    expect(mockReplyFromIa).toHaveBeenCalledTimes(2);
  });

  it('con iaHabilitada en false un audio tampoco recibe acuse', async () => {
    await crearCliente(tenantId, false);

    await processInboundJob({
      tenantId: tenantId.toString(),
      payload: payload([{ id: 'wamid.6', type: 'audio' }]),
    });

    expect(mockReplyFromIa).not.toHaveBeenCalled();
  });

  it('un texto vacío se trata como no-texto: acusa, no encola', async () => {
    await crearCliente(tenantId, true);

    await processInboundJob({
      tenantId: tenantId.toString(),
      payload: payload([{ id: 'wamid.7', type: 'text', body: '' }]),
    });

    expect(mockAdd).not.toHaveBeenCalled();
  });

  it('el job se encola con el delay de la ventana y con recibidoEn', async () => {
    await crearCliente(tenantId, true);

    await processInboundJob({
      tenantId: tenantId.toString(),
      payload: payload([{ id: 'wamid.8', type: 'text', body: 'Hola' }]),
    });

    const [, data, opts] = mockAdd.mock.calls[0] as [string, { recibidoEn: number }, { delay: number; jobId: string; attempts: number }];
    expect(opts.delay).toBe(env.AI_REPLY_WINDOW_MS);
    expect(opts.attempts).toBe(1);
    expect(typeof data.recibidoEn).toBe('number');
    expect(opts.jobId).toContain(tenantId.toString());
  });

  it('una ráfaga de tres mensajes comparte un único jobId', async () => {
    await crearCliente(tenantId, true);

    await processInboundJob({
      tenantId: tenantId.toString(),
      payload: payload([
        { id: 'wamid.9', type: 'text', body: 'Hola' },
        { id: 'wamid.10', type: 'text', body: 'una pregunta' },
        { id: 'wamid.11', type: 'text', body: '¿cuánto cuesta?' },
      ]),
    });

    // Se llama tres veces —una por mensaje—, pero BullMQ deduplica por `jobId`: los tres comparten
    // ventana, así que solo el primero crea job y la ráfaga recibe UNA respuesta.
    const jobIds = mockAdd.mock.calls.map((c) => (c[2] as { jobId: string }).jobId);
    expect(jobIds).toHaveLength(3);
    expect(new Set(jobIds).size).toBe(1);
  });
});

describe('ventanaJobId — aislamiento y agrupación', () => {
  const clienteId = new Types.ObjectId().toString();
  const ahora = 1_700_000_000_000;

  it('el mismo cliente en la misma ventana comparte id', () => {
    const a = ventanaJobId('tenant-a', clienteId, ahora);
    const b = ventanaJobId('tenant-a', clienteId, ahora + env.AI_REPLY_WINDOW_MS - 1);
    expect(a).toBe(b);
  });

  it('la ventana siguiente produce otro id, para que un mensaje posterior no se pierda', () => {
    const a = ventanaJobId('tenant-a', clienteId, ahora);
    const b = ventanaJobId('tenant-a', clienteId, ahora + env.AI_REPLY_WINDOW_MS);
    expect(a).not.toBe(b);
  });

  it('dos clientes distintos del mismo tenant no comparten ventana', () => {
    const a = ventanaJobId('tenant-a', clienteId, ahora);
    const b = ventanaJobId('tenant-a', new Types.ObjectId().toString(), ahora);
    expect(a).not.toBe(b);
  });

  it('AISLAMIENTO: el mismo clienteId en dos tenants nunca comparte ventana', () => {
    const a = ventanaJobId('tenant-a', clienteId, ahora);
    const b = ventanaJobId('tenant-b', clienteId, ahora);
    expect(a).not.toBe(b);
  });
});

/**
 * El silencio tras un handoff sale gratis: `handoffConversation` apaga `iaHabilitada` y las guardas
 * que ya existían hacen el resto. Precisamente por eso hacen falta estos dos tests — si alguien
 * moviera esas guardas, Sofi volvería a hablar en un hilo que ya lleva una persona, y nada más en
 * la suite lo detectaría.
 */
describe('processInboundJob — tras un handoff, Sofi se calla (HU-IA-03)', () => {
  let tenantId: Types.ObjectId;

  async function crearClienteTransferido(): Promise<void> {
    await createScoped(Cliente, tenantId, {
      metaUserId: WA_ID,
      telefono: WA_ID,
      canalOrigen: 'whatsapp',
      iaHabilitada: false,
      handoffAt: new Date(),
      handoffMotivo: 'explicit_request',
    });
  }

  beforeEach(async () => {
    await Promise.all([
      Cliente.deleteMany({}),
      Message.deleteMany({}),
      MetaIntegration.deleteMany({}),
    ]);
    mockAdd.mockReset().mockResolvedValue(undefined);
    mockReplyFromIa.mockReset().mockResolvedValue(undefined);
    mockNotifyInbound.mockReset().mockResolvedValue(undefined);
    tenantId = await crearTenantConCanal();
  });

  it('un mensaje de texto nuevo no encola auto-reply', async () => {
    await crearClienteTransferido();

    await processInboundJob({
      tenantId: tenantId.toString(),
      payload: payload([{ id: 'wamid.h1', type: 'text', body: '¿sigue ahí?' }]),
    });

    expect(mockAdd).not.toHaveBeenCalled();
    // Pero el mensaje sí se guarda y sube a la bandeja: es lo que el asesor tiene que leer.
    expect(mockNotifyInbound).toHaveBeenCalledTimes(1);
  });

  it('una nota de voz tampoco recibe el acuse de solo-texto', async () => {
    await crearClienteTransferido();

    await processInboundJob({
      tenantId: tenantId.toString(),
      payload: payload([{ id: 'wamid.h2', type: 'audio' }]),
    });

    expect(mockReplyFromIa).not.toHaveBeenCalled();
    expect(mockAdd).not.toHaveBeenCalled();
  });
});
