/**
 * Aislamiento multi-tenant de las notas de voz (HU-OMNI-07).
 *
 * Lo que se prueba no es solo "devuelve 404": es que ante una conversación ajena **nada caro ni
 * nada externo llega a ejecutarse** —ni ffmpeg, ni el almacenamiento, ni Graph—, y que el límite de
 * grabación que se aplica es siempre el del tenant del token, nunca uno que venga en la petición.
 */
import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { Readable } from 'node:stream';
import { Types } from 'mongoose';

vi.mock('../../src/config/queues.js', () => ({
  KB_INDEX_QUEUE_NAME: 'kb-index',
  KB_INDEX_JOB_NAME: 'index-document',
  INBOUND_QUEUE_NAME: 'inbound-messages',
  AI_REPLY_QUEUE_NAME: 'ai-reply',
  AI_REPLY_JOB_NAME: 'auto-reply',
  MEDIA_INGEST_QUEUE_NAME: 'media-ingest',
  MEDIA_INGEST_JOB: 'descargar',
  inboundQueue: { add: vi.fn() },
  kbIndexQueue: { add: vi.fn().mockResolvedValue(undefined) },
  aiReplyQueue: { add: vi.fn().mockResolvedValue(undefined) },
  mediaIngestQueue: { add: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock('../../src/realtime/realtime.publisher.js', () => ({
  publishRealtime: vi.fn(),
  subscribeRealtime: vi.fn(),
}));

const { mockSubir, mockSendMedia } = vi.hoisted(() => ({
  mockSubir: vi.fn(),
  mockSendMedia: vi.fn(),
}));

vi.mock('../../src/integrations/meta/meta-media.client.js', async () => {
  const real = await vi.importActual<
    typeof import('../../src/integrations/meta/meta-media.client.js')
  >('../../src/integrations/meta/meta-media.client.js');
  return { ...real, metaMediaClient: { ...real.metaMediaClient, subir: mockSubir } };
});

vi.mock('../../src/integrations/meta/meta-whatsapp.client.js', () => ({
  metaWhatsAppClient: { sendText: vi.fn(), sendTemplate: vi.fn(), sendMedia: mockSendMedia },
}));

vi.mock('../../src/features/channel/channel.service.js', () => ({
  getIntegrationWithToken: vi.fn(async () => ({ phoneNumberId: '123', accessToken: 'tok' })),
}));

vi.mock('../../src/features/usage/usage.service.js', () => ({
  assertWithinQuota: vi.fn(),
  incrementUsage: vi.fn(),
}));

const { default: app } = await import('../../src/app.js');
const { firmarUrlMedia } = await import('../../src/features/media/media.service.js');
import { Cliente } from '../../src/features/cliente/cliente.model.js';
import { Message } from '../../src/features/message/message.model.js';
import { Tenant } from '../../src/features/tenant/tenant.model.js';
import { createScoped } from '../../src/repositories/base.repository.js';
import {
  setMediaStorageForTests,
  type IMediaStorage,
} from '../../src/integrations/storage/index.js';
import {
  setTranscodificadorForTests,
  type ITranscodificadorAudio,
} from '../../src/integrations/audio/index.js';

const SECRET = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const CSRF = 'test-csrf-token';
const tenantA = new Types.ObjectId();
const tenantB = new Types.ObjectId();

function token(tenantId: Types.ObjectId): string {
  return jwt.sign(
    {
      sub: new Types.ObjectId().toString(),
      tenantId: tenantId.toString(),
      email: 'u@e.com',
      nombre: 'U',
      rol: 'admin',
      activo: true,
    },
    SECRET,
    { expiresIn: '1h' },
  );
}

const aNotaDeVoz = vi.fn<ITranscodificadorAudio['aNotaDeVoz']>();
const guardar = vi.fn();
const leer = vi.fn();

async function crearTenant(id: Types.ObjectId, maxDuracionSegundos: number): Promise<void> {
  await Tenant.create({
    _id: id,
    nombre: `Empresa ${id.toString()}`,
    slug: `voz-${id.toString()}`,
    contacto: { email: 'a@a.com', telefono: '3000000000' },
    notasDeVoz: { maxDuracionSegundos, maxBytes: 1024 * 1024 },
  });
}

async function crearClienteDe(tenantId: Types.ObjectId): Promise<string> {
  const cliente = await Cliente.create({
    tenantId,
    metaUserId: `wa_${new Types.ObjectId().toString()}`,
    telefono: '573001112233',
    canalOrigen: 'whatsapp',
    estadoComercial: 'nuevo',
    ventana24hExpiraEn: new Date(Date.now() + 60 * 60 * 1000),
    customFields: {},
    tags: [],
  });
  return String(cliente._id);
}

beforeEach(async () => {
  vi.clearAllMocks();
  await Promise.all([Cliente.deleteMany({}), Message.deleteMany({}), Tenant.deleteMany({})]);
  await crearTenant(tenantA, 60);
  await crearTenant(tenantB, 600);

  guardar.mockImplementation(async ({ key, mimeType }: { key: string; mimeType: string }) => ({
    key,
    mimeType,
    tamanoBytes: 5,
  }));
  // Como el adaptador real: con rango devuelve SOLO esos bytes (el `Content-Length` lo exige).
  leer.mockImplementation(async (_key: string, rango?: { inicio: number; fin: number }) => ({
    stream: Readable.from([
      rango ? Buffer.from('OggS!').subarray(rango.inicio, rango.fin + 1) : Buffer.from('OggS!'),
    ]),
    mimeType: '',
    tamanoBytes: 5,
  }));
  setMediaStorageForTests({
    driver: 'local',
    guardar,
    leer,
    urlFirmada: vi.fn(async () => null),
    eliminar: vi.fn(),
  } as unknown as IMediaStorage);

  aNotaDeVoz.mockResolvedValue({
    buffer: Buffer.from('OggS!'),
    mimeType: 'audio/ogg',
    duracionSegundos: 5,
  });
  setTranscodificadorForTests({ aNotaDeVoz, medirDuracion: vi.fn(async () => null) });

  mockSubir.mockResolvedValue({ mediaId: 'meta-1' });
  mockSendMedia.mockResolvedValue({ messageId: 'wamid.1' });
});

afterAll(() => {
  setTranscodificadorForTests(null);
  setMediaStorageForTests(null);
});

describe('Aislamiento multi-tenant — notas de voz (HU-OMNI-07)', () => {
  it('enviar audio a la conversación de otro tenant devuelve 404 sin tocar ffmpeg, storage ni Graph', async () => {
    const clienteDeB = await crearClienteDe(tenantB);

    const res = await request(app)
      .post(`/api/conversations/${clienteDeB}/messages/audio`)
      .set('Cookie', [`token=${token(tenantA)}`, `csrfToken=${CSRF}`])
      .set('X-CSRF-Token', CSRF)
      .attach('audio', Buffer.alloc(32, 1), {
        filename: 'g.webm',
        contentType: 'audio/webm',
      });

    expect(res.status).toBe(404);
    expect(aNotaDeVoz).not.toHaveBeenCalled();
    expect(guardar).not.toHaveBeenCalled();
    expect(mockSubir).not.toHaveBeenCalled();
    expect(mockSendMedia).not.toHaveBeenCalled();
    expect(await Message.countDocuments({})).toBe(0);
  });

  it('ese 404 es idéntico al de una conversación inexistente', async () => {
    const clienteDeB = await crearClienteDe(tenantB);

    const pedir = (id: string): request.Test =>
      request(app)
        .post(`/api/conversations/${id}/messages/audio`)
        .set('Cookie', [`token=${token(tenantA)}`, `csrfToken=${CSRF}`])
        .set('X-CSRF-Token', CSRF)
        .attach('audio', Buffer.alloc(32, 1), { filename: 'g.webm', contentType: 'audio/webm' });

    const ajena = await pedir(clienteDeB);
    const fantasma = await pedir(new Types.ObjectId().toString());

    expect(ajena.status).toBe(fantasma.status);
    expect(ajena.body).toEqual(fantasma.body);
  });

  it('la nota de voz propia se guarda con clave prefijada por el tenant del token', async () => {
    const clienteDeA = await crearClienteDe(tenantA);

    const res = await request(app)
      .post(`/api/conversations/${clienteDeA}/messages/audio`)
      .set('Cookie', [`token=${token(tenantA)}`, `csrfToken=${CSRF}`])
      .set('X-CSRF-Token', CSRF)
      .attach('audio', Buffer.alloc(32, 1), { filename: 'g.webm', contentType: 'audio/webm' });

    expect(res.status).toBe(201);
    const { key } = guardar.mock.calls[0]?.[0] as { key: string };
    expect(key.startsWith(`${tenantA.toString()}/`)).toBe(true);
    expect(await Message.countDocuments({ tenantId: tenantB })).toBe(0);
  });

  it('GET /config/audio devuelve el límite del tenant del TOKEN aunque la petición nombre a otro', async () => {
    const res = await request(app)
      .get('/api/conversations/config/audio')
      .query({ tenantId: tenantB.toString() })
      .set('Cookie', [`token=${token(tenantA)}`, `csrfToken=${CSRF}`]);

    // Con `tenantId` en la query el schema lo rechaza (query vacía y estricta) o lo ignora; en
    // ningún caso puede devolver los 600 s del tenant B.
    if (res.status === 200) {
      expect(res.body.maxDuracionSegundos).toBe(60);
    } else {
      expect(res.status).toBe(400);
    }

    const limpio = await request(app)
      .get('/api/conversations/config/audio')
      .set('Cookie', [`token=${token(tenantA)}`, `csrfToken=${CSRF}`]);
    expect(limpio.body.maxDuracionSegundos).toBe(60);
  });

  it('el límite de duración aplicado al enviar es el del tenant del token', async () => {
    // Tenant A admite 60 s; la grabación mide 120 s. Aunque B admita 600 s, A no puede usar el suyo.
    aNotaDeVoz.mockResolvedValueOnce({
      buffer: Buffer.from('OggS!'),
      mimeType: 'audio/ogg',
      duracionSegundos: 120,
    });
    const clienteDeA = await crearClienteDe(tenantA);

    const res = await request(app)
      .post(`/api/conversations/${clienteDeA}/messages/audio`)
      .set('Cookie', [`token=${token(tenantA)}`, `csrfToken=${CSRF}`])
      .set('X-CSRF-Token', CSRF)
      .attach('audio', Buffer.alloc(32, 1), { filename: 'g.webm', contentType: 'audio/webm' });

    expect(res.status).toBe(422);
  });
});

describe('GET /api/media/:id con Range (HU-OMNI-07)', () => {
  async function audioDe(tenantId: Types.ObjectId): Promise<string> {
    const doc = await createScoped(Message, tenantId, {
      clienteId: new Types.ObjectId(),
      canal: 'whatsapp',
      direccion: 'inbound',
      sender: 'user',
      tipo: 'audio',
      media: {
        estado: 'disponible',
        mimeType: 'audio/ogg',
        mediaKey: `${tenantId.toString()}/msg/voz.ogg`,
        tamanoBytes: 5,
        esNotaDeVoz: true,
      },
      status: 'sent',
    });
    return String(doc._id);
  }

  it('responde 206 con Content-Range y pide al almacenamiento solo ese trozo', async () => {
    const id = await audioDe(tenantA);

    const res = await request(app)
      .get(`/api/media/${id}`)
      .query({ t: firmarUrlMedia(tenantA.toString(), id) })
      .set('Range', 'bytes=1-3');

    expect(res.status).toBe(206);
    expect(res.headers['content-range']).toBe('bytes 1-3/5');
    expect(res.headers['accept-ranges']).toBe('bytes');
    expect(leer.mock.calls[0]?.[1]).toEqual({ inicio: 1, fin: 3 });
  });

  it('un rango insatisfacible responde 416', async () => {
    const id = await audioDe(tenantA);

    const res = await request(app)
      .get(`/api/media/${id}`)
      .query({ t: firmarUrlMedia(tenantA.toString(), id) })
      .set('Range', 'bytes=10-20');

    expect(res.status).toBe(416);
    expect(res.headers['content-range']).toBe('bytes */5');
  });

  it('con Range, un audio de otro tenant sigue siendo 404 y no se lee nada', async () => {
    const deB = await audioDe(tenantB);

    const res = await request(app)
      .get(`/api/media/${deB}`)
      .query({ t: firmarUrlMedia(tenantA.toString(), deB) })
      .set('Range', 'bytes=0-');

    expect(res.status).toBe(404);
    expect(leer).not.toHaveBeenCalled();
  });
});
