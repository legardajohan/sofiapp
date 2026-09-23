/**
 * Ingesta de media y enlaces entrantes (HU-OMNI-06).
 *
 * En archivo aparte de `inbound-message.processor.test.ts` porque necesita un mock extra de la cola
 * de media; los casos de HU-IA-02 siguen donde estaban.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Types } from 'mongoose';

const { mockAdd, mockMediaAdd, mockReplyFromIa, mockNotifyInbound } = vi.hoisted(() => ({
  mockAdd: vi.fn(),
  mockMediaAdd: vi.fn(),
  mockReplyFromIa: vi.fn(),
  mockNotifyInbound: vi.fn(),
}));

vi.mock('../config/queues.js', () => ({
  INBOUND_QUEUE_NAME: 'inbound-messages',
  AI_REPLY_QUEUE_NAME: 'ai-reply',
  AI_REPLY_JOB_NAME: 'auto-reply',
  KB_INDEX_QUEUE_NAME: 'kb-index',
  KB_INDEX_JOB_NAME: 'index-document',
  MEDIA_INGEST_QUEUE_NAME: 'media-ingest',
  MEDIA_INGEST_JOB: 'descargar',
  inboundQueue: { add: vi.fn() },
  kbIndexQueue: { add: vi.fn() },
  aiReplyQueue: { add: mockAdd },
  mediaIngestQueue: { add: mockMediaAdd },
}));

vi.mock('../features/conversation/conversation.service.js', () => ({
  replyFromIa: mockReplyFromIa,
  notifyInboundMessage: mockNotifyInbound,
}));

vi.mock('../features/flow/flow.service.js', () => ({ getActiveFlow: vi.fn(async () => null) }));
vi.mock('../features/flow/flow.runtime.service.js', () => ({ ejecutarFlujo: vi.fn() }));

import { env } from '../config/env.js';
import { Cliente } from '../features/cliente/cliente.model.js';
import { Message } from '../features/message/message.model.js';
import { MetaIntegration } from '../features/channel/channel.model.js';
import { Tenant } from '../features/tenant/tenant.model.js';
import { createScoped } from '../repositories/base.repository.js';
import type { IWhatsAppWebhookPayload } from '../features/webhook/webhook.types.js';
import { processInboundJob } from './inbound-message.processor.js';

const PHONE_ID = 'phone-hu-omni-06';
const WA_ID = '573004445566';

interface MensajeDePrueba {
  id: string;
  type: 'text' | 'image' | 'audio' | 'video' | 'document';
  body?: string;
  media?: { id: string; mime_type: string; caption?: string; filename?: string };
}

function payload(mensajes: MensajeDePrueba[]): IWhatsAppWebhookPayload {
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
                ...(m.media ? { [m.type]: m.media } : {}),
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
    nombre: 'Empresa HU-OMNI-06',
    slug: `hu-omni-06-${new Types.ObjectId().toString()}`,
    contacto: { email: 'omni06@t.com', telefono: '3000000000' },
  });
  await MetaIntegration.create({
    tenantId: tenant._id,
    canal: 'whatsapp',
    wabaId: 'waba-1',
    phoneNumberId: PHONE_ID,
    accessTokenEnc: 'x',
    activo: true,
  });
  return tenant._id as Types.ObjectId;
}

describe('processInboundJob — media y enlaces entrantes (HU-OMNI-06)', () => {
  let tenantId: Types.ObjectId;

  beforeEach(async () => {
    mockAdd.mockReset().mockResolvedValue(undefined);
    mockMediaAdd.mockReset().mockResolvedValue(undefined);
    mockReplyFromIa.mockReset().mockResolvedValue(undefined);
    mockNotifyInbound.mockReset().mockResolvedValue(undefined);

    tenantId = await crearTenantConCanal();
    await createScoped(Cliente, tenantId, {
      metaUserId: WA_ID,
      telefono: WA_ID,
      canalOrigen: 'whatsapp',
      iaHabilitada: true,
    });
  });

  it('una imagen se guarda con la media pendiente y su caption como texto', async () => {
    await processInboundJob({
      tenantId: tenantId.toString(),
      payload: payload([
        {
          id: 'wamid.IMG1',
          type: 'image',
          media: { id: 'media-abc', mime_type: 'image/jpeg', caption: 'Cuanto vale esto?' },
        },
      ]),
    });

    const msg = await Message.findOne({ metaMessageId: 'wamid.IMG1' }).lean();
    expect(msg?.tipo).toBe('imagen');
    // El caption es texto del cliente a todos los efectos: la bandeja, el resumen por IA y la
    // extracción de datos lo leen del mismo campo que un mensaje escrito suelto.
    expect(msg?.texto).toBe('Cuanto vale esto?');
    expect(msg?.media?.estado).toBe('pendiente');
    expect(msg?.media?.metaMediaId).toBe('media-abc');
  });

  it('encola la descarga en la cola de media', async () => {
    await processInboundJob({
      tenantId: tenantId.toString(),
      payload: payload([
        { id: 'wamid.IMG2', type: 'image', media: { id: 'media-xyz', mime_type: 'image/jpeg' } },
      ]),
    });

    expect(mockMediaAdd).toHaveBeenCalledOnce();
  });

  it('el jobId de la descarga NO contiene dos puntos', async () => {
    await processInboundJob({
      tenantId: tenantId.toString(),
      payload: payload([
        { id: 'wamid.IMG3', type: 'image', media: { id: 'media-1', mime_type: 'image/jpeg' } },
      ]),
    });

    // Assert explícito y no inspección visual: el mock de la cola acepta cualquier id, que es
    // exactamente lo que dejó pasar HT-AI-02 con la suite entera en verde.
    const [, , opts] = mockMediaAdd.mock.calls[0] as [string, unknown, { jobId: string }];
    expect(opts.jobId).not.toContain(':');
    expect(opts.jobId).toContain(tenantId.toString());
  });

  it('un documento conserva el nombre de archivo que puso el cliente', async () => {
    await processInboundJob({
      tenantId: tenantId.toString(),
      payload: payload([
        {
          id: 'wamid.DOC1',
          type: 'document',
          media: { id: 'media-doc', mime_type: 'application/pdf', filename: 'cedula.pdf' },
        },
      ]),
    });

    const msg = await Message.findOne({ metaMessageId: 'wamid.DOC1' }).lean();
    expect(msg?.tipo).toBe('documento');
    expect(msg?.media?.nombreArchivo).toBe('cedula.pdf');
  });

  it('un video se reconoce como tal: antes caía en "otro"', async () => {
    await processInboundJob({
      tenantId: tenantId.toString(),
      payload: payload([
        { id: 'wamid.VID1', type: 'video', media: { id: 'media-vid', mime_type: 'video/mp4' } },
      ]),
    });

    expect((await Message.findOne({ metaMessageId: 'wamid.VID1' }).lean())?.tipo).toBe('video');
  });

  it('un texto con una URL se clasifica como enlace y guarda el dominio', async () => {
    await processInboundJob({
      tenantId: tenantId.toString(),
      payload: payload([
        { id: 'wamid.LINK1', type: 'text', body: 'Mira esto https://www.youtube.com/watch?v=abc' },
      ]),
    });

    const msg = await Message.findOne({ metaMessageId: 'wamid.LINK1' }).lean();
    expect(msg?.tipo).toBe('enlace');
    expect(msg?.previewEnlace?.dominio).toBe('youtube.com');
    // El texto se conserva íntegro: `enlace` acompaña al texto, no lo sustituye.
    expect(msg?.texto).toContain('Mira esto');
  });

  it('REGRESIÓN: un enlace NO dispara el acuse de "solo entiendo texto"', async () => {
    await processInboundJob({
      tenantId: tenantId.toString(),
      payload: payload([{ id: 'wamid.LINK2', type: 'text', body: 'https://ejemplo.com/curso' }]),
    });

    // Es el fallo que `esTipoConTexto` existe para evitar: un enlace se lee perfectamente, y
    // contestarle "solo entiendo texto" sería una regresión visible para el cliente final.
    expect(mockReplyFromIa).not.toHaveBeenCalled();
    expect(mockAdd).toHaveBeenCalledOnce();
  });

  it('un precio con puntos no se confunde con un enlace', async () => {
    await processInboundJob({
      tenantId: tenantId.toString(),
      payload: payload([{ id: 'wamid.TXT9', type: 'text', body: 'Cuesta 3.500.000 pesos' }]),
    });

    expect((await Message.findOne({ metaMessageId: 'wamid.TXT9' }).lean())?.tipo).toBe('texto');
  });

  it('una imagen sí acusa recibo: Sofi todavía no la sabe leer', async () => {
    await processInboundJob({
      tenantId: tenantId.toString(),
      payload: payload([
        { id: 'wamid.IMG9', type: 'image', media: { id: 'media-9', mime_type: 'image/jpeg' } },
      ]),
    });

    expect(mockReplyFromIa).toHaveBeenCalledOnce();
  });

  it('con MEDIA_INGEST_ENABLED=off guarda el mensaje pero no encola la descarga', async () => {
    const original = env.MEDIA_INGEST_ENABLED;
    (env as { MEDIA_INGEST_ENABLED: string }).MEDIA_INGEST_ENABLED = 'off';
    try {
      await processInboundJob({
        tenantId: tenantId.toString(),
        payload: payload([
          { id: 'wamid.OFF1', type: 'image', media: { id: 'media-off', mime_type: 'image/jpeg' } },
        ]),
      });

      expect(await Message.findOne({ metaMessageId: 'wamid.OFF1' }).lean()).not.toBeNull();
      expect(mockMediaAdd).not.toHaveBeenCalled();
    } finally {
      (env as { MEDIA_INGEST_ENABLED: string }).MEDIA_INGEST_ENABLED = original;
    }
  });

  it('si encolar la descarga falla, la ingesta NO se cae', async () => {
    mockMediaAdd.mockRejectedValue(new Error('Redis caído'));

    await expect(
      processInboundJob({
        tenantId: tenantId.toString(),
        payload: payload([
          { id: 'wamid.IMG8', type: 'image', media: { id: 'media-8', mime_type: 'image/jpeg' } },
        ]),
      }),
    ).resolves.toBeUndefined();

    // El mensaje ya está guardado y notificado; la media queda `pendiente`, que es recuperable.
    // Perder el mensaje entero por un fallo de Redis no lo sería.
    expect(await Message.findOne({ metaMessageId: 'wamid.IMG8' }).lean()).not.toBeNull();
  });
});
