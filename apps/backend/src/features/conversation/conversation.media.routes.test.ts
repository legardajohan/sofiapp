/**
 * `POST /api/conversations/:id/messages/media` a nivel HTTP (HU-OMNI-06).
 *
 * Los tests de servicio no cubren el multipart: multer, la cadena de middlewares y el paso de los
 * campos de texto del formulario solo se ejercitan por aquí.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { Types } from 'mongoose';

vi.mock('../../config/queues.js', () => ({
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

vi.mock('../../realtime/realtime.publisher.js', () => ({
  publishRealtime: vi.fn(),
  subscribeRealtime: vi.fn(),
}));

const { mockSubir, mockSendMedia } = vi.hoisted(() => ({
  mockSubir: vi.fn(),
  mockSendMedia: vi.fn(),
}));

vi.mock('../../integrations/meta/meta-media.client.js', async () => {
  const real = await vi.importActual<typeof import('../../integrations/meta/meta-media.client.js')>(
    '../../integrations/meta/meta-media.client.js',
  );
  return { ...real, metaMediaClient: { ...real.metaMediaClient, subir: mockSubir } };
});

vi.mock('../../integrations/meta/meta-whatsapp.client.js', () => ({
  metaWhatsAppClient: { sendText: vi.fn(), sendTemplate: vi.fn(), sendMedia: mockSendMedia },
}));

vi.mock('../channel/channel.service.js', () => ({
  getIntegrationWithToken: vi.fn(async () => ({ phoneNumberId: '123', accessToken: 'tok' })),
}));

vi.mock('../usage/usage.service.js', () => ({
  assertWithinQuota: vi.fn(),
  incrementUsage: vi.fn(),
}));

import app from '../../app.js';
import { Cliente } from '../cliente/cliente.model.js';
import { Message } from '../message/message.model.js';
import { setMediaStorageForTests, type IMediaStorage } from '../../integrations/storage/index.js';

const SECRET = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const ACTOR = '507f1f77bcf86cd799439012';
const CSRF = 'test-csrf-token';
const tenantId = new Types.ObjectId();

function token(): string {
  return jwt.sign(
    {
      sub: ACTOR,
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

let clienteId: string;

beforeEach(async () => {
  vi.clearAllMocks();
  await Promise.all([Cliente.deleteMany({}), Message.deleteMany({})]);

  setMediaStorageForTests({
    driver: 'local',
    guardar: vi.fn(async ({ key, mimeType }: { key: string; mimeType: string }) => ({
      key,
      mimeType,
      tamanoBytes: 3,
    })),
    leer: vi.fn(),
    urlFirmada: vi.fn(async () => null),
    eliminar: vi.fn(),
  } as unknown as IMediaStorage);

  mockSubir.mockResolvedValue({ mediaId: 'meta-media-1' });
  mockSendMedia.mockResolvedValue({ messageId: 'wamid.OUT' });

  const cliente = await Cliente.create({
    tenantId,
    metaUserId: 'wa_media_http',
    telefono: '573001112233',
    canalOrigen: 'whatsapp',
    estadoComercial: 'nuevo',
    // Ventana abierta: lo que se prueba aquí es el multipart, no la regla de las 24 h.
    ventana24hExpiraEn: new Date(Date.now() + 60 * 60 * 1000),
    customFields: {},
    tags: [],
  });
  clienteId = (cliente._id as Types.ObjectId).toString();
});

function enviar(): request.Test {
  return request(app)
    .post(`/api/conversations/${clienteId}/messages/media`)
    .set('Cookie', [`token=${token()}`, `csrfToken=${CSRF}`])
    .set('X-CSRF-Token', CSRF);
}

describe('POST /conversations/:id/messages/media (HU-OMNI-06)', () => {
  it('envía una imagen sin comentario', async () => {
    const res = await enviar().attach('archivo', Buffer.from('jpg'), {
      filename: 'foto.jpg',
      contentType: 'image/jpeg',
    });

    expect(res.status).toBe(201);
    expect(res.body.tipo).toBe('imagen');
    expect(res.body.media.estado).toBe('disponible');
  });

  it('REGRESIÓN: envía una imagen ACOMPAÑADA DE TEXTO', async () => {
    // El caso que fallaba: con `texto` en el formulario la petición no llegaba a crear el mensaje.
    const res = await enviar()
      .field('texto', 'mira este comprobante')
      .attach('archivo', Buffer.from('jpg'), {
        filename: 'foto.jpg',
        contentType: 'image/jpeg',
      });

    expect(res.status).toBe(201);
    expect(res.body.texto).toBe('mira este comprobante');
  });

  it('REGRESIÓN: el texto llega aunque vaya DESPUÉS del archivo en el formulario', async () => {
    // El navegador hace `append('archivo')` y LUEGO `append('texto')`; supertest, por su parte,
    // manda los campos antes que los ficheros. Si multer solo viera los campos que llegan antes
    // del archivo, el caso real fallaría y el test con el orden inverso pasaría igual.
    const res = await enviar()
      .attach('archivo', Buffer.from('jpg'), {
        filename: 'foto.jpg',
        contentType: 'image/jpeg',
      })
      .field('texto', 'el texto va detrás');

    expect(res.status).toBe(201);
    expect(res.body.texto).toBe('el texto va detrás');
  });

  it('el comentario llega a Meta como `caption` del adjunto', async () => {
    await enviar()
      .field('texto', 'el comprobante')
      .attach('archivo', Buffer.from('jpg'), {
        filename: 'foto.jpg',
        contentType: 'image/jpeg',
      });

    const opciones = mockSendMedia.mock.calls[0]?.[3] as { caption?: string };
    expect(opciones.caption).toBe('el comprobante');
  });

  it('un documento conserva su nombre para el destinatario', async () => {
    const res = await enviar()
      .field('texto', 'el contrato firmado')
      .attach('archivo', Buffer.from('%PDF'), {
        filename: 'contrato.pdf',
        contentType: 'application/pdf',
      });

    expect(res.status).toBe(201);
    expect(res.body.tipo).toBe('documento');
    expect(res.body.media.nombreArchivo).toBe('contrato.pdf');
  });

  it('sin archivo responde 400, no un 500 opaco', async () => {
    const res = await enviar().field('texto', 'solo texto');

    expect(res.status).toBe(400);
  });

  it('un mime que Meta no admite responde 415', async () => {
    const res = await enviar().attach('archivo', Buffer.from('MZ'), {
      filename: 'virus.exe',
      contentType: 'application/x-msdownload',
    });

    expect(res.status).toBe(415);
  });

  it('un comentario de más de 1024 caracteres se rechaza con 400', async () => {
    const res = await enviar()
      .field('texto', 'x'.repeat(1025))
      .attach('archivo', Buffer.from('jpg'), {
        filename: 'foto.jpg',
        contentType: 'image/jpeg',
      });

    expect(res.status).toBe(400);
  });

  it('una conversación de otro tenant devuelve 404', async () => {
    const ajeno = jwt.sign(
      {
        sub: ACTOR,
        tenantId: new Types.ObjectId().toString(),
        email: 'u@e.com',
        nombre: 'U',
        rol: 'admin',
        activo: true,
      },
      SECRET,
      { expiresIn: '1h' },
    );

    const res = await request(app)
      .post(`/api/conversations/${clienteId}/messages/media`)
      .set('Cookie', [`token=${ajeno}`, `csrfToken=${CSRF}`])
      .set('X-CSRF-Token', CSRF)
      .attach('archivo', Buffer.from('jpg'), {
        filename: 'foto.jpg',
        contentType: 'image/jpeg',
      });

    expect(res.status).toBe(404);
  });
});
