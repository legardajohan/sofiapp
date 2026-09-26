/**
 * Notas de voz a nivel HTTP (HU-OMNI-07): `POST /api/conversations/:id/messages/audio` y
 * `GET /api/conversations/config/audio`.
 *
 * ffmpeg no se ejecuta aquí: se inyecta un transcodificador falso con
 * `setTranscodificadorForTests`. El binario real tiene su propio test (`ffmpeg.transcoder.test.ts`).
 */
import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
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

const { mockSubir, mockSendMedia, mockSendText } = vi.hoisted(() => ({
  mockSubir: vi.fn(),
  mockSendMedia: vi.fn(),
  mockSendText: vi.fn(),
}));

vi.mock('../../integrations/meta/meta-media.client.js', async () => {
  const real = await vi.importActual<typeof import('../../integrations/meta/meta-media.client.js')>(
    '../../integrations/meta/meta-media.client.js',
  );
  return { ...real, metaMediaClient: { ...real.metaMediaClient, subir: mockSubir } };
});

vi.mock('../../integrations/meta/meta-whatsapp.client.js', () => ({
  metaWhatsAppClient: { sendText: mockSendText, sendTemplate: vi.fn(), sendMedia: mockSendMedia },
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
import { Tenant } from '../tenant/tenant.model.js';
import { setMediaStorageForTests, type IMediaStorage } from '../../integrations/storage/index.js';
import {
  setTranscodificadorForTests,
  type ITranscodificadorAudio,
} from '../../integrations/audio/index.js';

const SECRET = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const ACTOR = '507f1f77bcf86cd799439012';
const CSRF = 'test-csrf-token';
const tenantId = new Types.ObjectId();

function token(tid: string = tenantId.toString()): string {
  return jwt.sign(
    { sub: ACTOR, tenantId: tid, email: 'u@e.com', nombre: 'U', rol: 'admin', activo: true },
    SECRET,
    { expiresIn: '1h' },
  );
}

const aNotaDeVoz = vi.fn<ITranscodificadorAudio['aNotaDeVoz']>();
const guardar = vi.fn();
const eliminar = vi.fn();

let clienteId: string;

async function crearCliente(ventanaAbierta: boolean): Promise<string> {
  const cliente = await Cliente.create({
    tenantId,
    metaUserId: `wa_audio_${new Types.ObjectId().toString()}`,
    telefono: '573001112233',
    canalOrigen: 'whatsapp',
    estadoComercial: 'nuevo',
    ventana24hExpiraEn: new Date(Date.now() + (ventanaAbierta ? 1 : -1) * 60 * 60 * 1000),
    customFields: {},
    tags: [],
  });
  return (cliente._id as Types.ObjectId).toString();
}

beforeEach(async () => {
  vi.clearAllMocks();
  await Promise.all([Cliente.deleteMany({}), Message.deleteMany({}), Tenant.deleteMany({})]);

  await Tenant.create({
    _id: tenantId,
    nombre: 'Empresa Audio',
    slug: `audio-${tenantId.toString()}`,
    contacto: { email: 'a@a.com', telefono: '3000000000' },
  });

  guardar.mockImplementation(async ({ key, mimeType }: { key: string; mimeType: string }) => ({
    key,
    mimeType,
    tamanoBytes: 5,
  }));
  setMediaStorageForTests({
    driver: 'local',
    guardar,
    leer: vi.fn(),
    urlFirmada: vi.fn(async () => null),
    eliminar,
  } as unknown as IMediaStorage);

  aNotaDeVoz.mockResolvedValue({
    buffer: Buffer.from('OggS-voz'),
    mimeType: 'audio/ogg',
    duracionSegundos: 12.4,
  });
  setTranscodificadorForTests({ aNotaDeVoz, medirDuracion: vi.fn(async () => null) });

  mockSubir.mockResolvedValue({ mediaId: 'meta-audio-1' });
  mockSendMedia.mockResolvedValue({ messageId: 'wamid.VOZ' });
  mockSendText.mockResolvedValue({ messageId: 'wamid.TXT' });

  clienteId = await crearCliente(true);
});

afterAll(() => {
  setTranscodificadorForTests(null);
  setMediaStorageForTests(null);
});

function enviar(id: string = clienteId, tid?: string): request.Test {
  return request(app)
    .post(`/api/conversations/${id}/messages/audio`)
    .set('Cookie', [`token=${token(tid)}`, `csrfToken=${CSRF}`])
    .set('X-CSRF-Token', CSRF);
}

function grabacion(req: request.Test, bytes = 64): request.Test {
  return req.attach('audio', Buffer.alloc(bytes, 1), {
    filename: 'grabacion.webm',
    contentType: 'audio/webm;codecs=opus',
  });
}

describe('POST /conversations/:id/messages/audio (HU-OMNI-07)', () => {
  it('transcodifica, guarda y envía la nota de voz; persiste tipo, esNotaDeVoz y duración', async () => {
    const res = await grabacion(enviar().field('duracionSegundos', '12'));

    expect(res.status).toBe(201);
    expect(res.body.tipo).toBe('audio');
    expect(res.body.media).toMatchObject({
      estado: 'disponible',
      mimeType: 'audio/ogg',
      esNotaDeVoz: true,
      duracionSegundos: 12.4,
    });

    // Lo que se guarda y se sube es la SALIDA del transcodificador, no la grabación original.
    expect(guardar.mock.calls[0]?.[0]).toMatchObject({ mimeType: 'audio/ogg' });
    expect(mockSubir.mock.calls[0]?.[2]).toMatchObject({ mimeType: 'audio/ogg' });

    const guardado = await Message.findOne({ tenantId, tipo: 'audio' }).lean();
    expect(guardado?.media?.esNotaDeVoz).toBe(true);
    expect(guardado?.media?.duracionSegundos).toBe(12.4);
  });

  it('llega a Meta como nota de voz y SIN caption', async () => {
    await grabacion(enviar());

    const [, tipo, mediaId, opciones] = mockSendMedia.mock.calls[0] as [
      string,
      string,
      string,
      { caption?: string; esNotaDeVoz?: boolean },
    ];
    expect(tipo).toBe('audio');
    expect(mediaId).toBe('meta-audio-1');
    expect(opciones.esNotaDeVoz).toBe(true);
    expect(opciones.caption).toBeUndefined();
  });

  it('la duración que vale es la medida, no la que declara el navegador', async () => {
    const res = await grabacion(enviar().field('duracionSegundos', '3'));

    expect(res.status).toBe(201);
    expect(res.body.media.duracionSegundos).toBe(12.4);
  });

  it('sin grabación responde 400', async () => {
    const res = await enviar().field('duracionSegundos', '3');
    expect(res.status).toBe(400);
  });

  it('un archivo que no es audio responde 415 sin transcodificar', async () => {
    const res = await enviar().attach('audio', Buffer.from('%PDF'), {
      filename: 'x.pdf',
      contentType: 'application/pdf',
    });

    expect(res.status).toBe(415);
    expect(aNotaDeVoz).not.toHaveBeenCalled();
  });

  it('una grabación por encima del límite del tenant responde 413 sin transcodificar', async () => {
    await Tenant.updateOne({ _id: tenantId }, { $set: { 'notasDeVoz.maxBytes': 100 * 1024 } });

    const res = await grabacion(enviar(), 100 * 1024 + 1);

    expect(res.status).toBe(413);
    expect(aNotaDeVoz).not.toHaveBeenCalled();
  });

  it('una duración medida por encima del límite del tenant responde 422 y no guarda nada', async () => {
    await Tenant.updateOne({ _id: tenantId }, { $set: { 'notasDeVoz.maxDuracionSegundos': 10 } });

    const res = await grabacion(enviar());

    expect(res.status).toBe(422);
    expect(guardar).not.toHaveBeenCalled();
    expect(mockSendMedia).not.toHaveBeenCalled();
  });

  it('fuera de la ventana de 24 h responde el MISMO 422 que el texto libre', async () => {
    const cerrada = await crearCliente(false);

    const audio = await grabacion(enviar(cerrada));
    const texto = await request(app)
      .post(`/api/conversations/${cerrada}/messages`)
      .set('Cookie', [`token=${token()}`, `csrfToken=${CSRF}`])
      .set('X-CSRF-Token', CSRF)
      .send({ texto: 'hola' });

    expect(audio.status).toBe(422);
    expect(texto.status).toBe(422);
    expect(audio.body.message).toBe(texto.body.message);
    expect(mockSendMedia).not.toHaveBeenCalled();
  });

  it('si Meta falla después de guardar, borra el archivo huérfano', async () => {
    mockSendMedia.mockRejectedValueOnce(new Error('Graph caído'));

    const res = await grabacion(enviar());

    expect(res.status).toBeGreaterThanOrEqual(500);
    await vi.waitFor(() => expect(eliminar).toHaveBeenCalledTimes(1));
  });

  it('la clave de almacenamiento va prefijada por el tenant del token', async () => {
    await grabacion(enviar());

    const { key } = guardar.mock.calls[0]?.[0] as { key: string };
    expect(key.startsWith(`${tenantId.toString()}/`)).toBe(true);
  });
});

describe('GET /conversations/config/audio (HU-OMNI-07)', () => {
  function pedir(tid?: string): request.Test {
    return request(app)
      .get('/api/conversations/config/audio')
      .set('Cookie', [`token=${token(tid)}`, `csrfToken=${CSRF}`]);
  }

  it('sin configuración devuelve los valores por defecto', async () => {
    const res = await pedir();

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ maxDuracionSegundos: 300, maxBytes: 16 * 1024 * 1024 });
  });

  it('devuelve el límite configurado para el tenant', async () => {
    await Tenant.updateOne(
      { _id: tenantId },
      { $set: { notasDeVoz: { maxDuracionSegundos: 60, maxBytes: 2 * 1024 * 1024 } } },
    );

    const res = await pedir();

    expect(res.body).toEqual({ maxDuracionSegundos: 60, maxBytes: 2 * 1024 * 1024 });
  });
});

describe('Emojis en el texto (HU-OMNI-07)', () => {
  // ZWJ + tono de piel, bandera (par de indicadores regionales), emoji con selector de variación y
  // uno del plano astral simple. Son los casos que rompen un `slice` o una normalización ingenua.
  const TEXTO = 'Hola 👩🏽‍💻 desde 🇨🇴, ¿todo bien? ❤️ 🙌🏾 ✨';

  it('un texto con emojis compuestos viaja a Meta, se persiste y vuelve byte a byte idéntico', async () => {
    const res = await request(app)
      .post(`/api/conversations/${clienteId}/messages`)
      .set('Cookie', [`token=${token()}`, `csrfToken=${CSRF}`])
      .set('X-CSRF-Token', CSRF)
      .send({ texto: TEXTO });

    expect(res.status).toBe(201);
    expect(res.body.texto).toBe(TEXTO);
    expect(mockSendText.mock.calls[0]?.[1]).toBe(TEXTO);

    const guardado = await Message.findOne({ tenantId, direccion: 'outbound' }).lean();
    expect(Buffer.from(guardado?.texto ?? '', 'utf8').equals(Buffer.from(TEXTO, 'utf8'))).toBe(true);
  });

  it('un texto de emojis por debajo del límite no se rechaza por contar unidades UTF-16', async () => {
    // 1000 banderas = 4000 unidades UTF-16 (< 4096): tiene que pasar entero.
    const banderas = '🇨🇴'.repeat(1000);

    const res = await request(app)
      .post(`/api/conversations/${clienteId}/messages`)
      .set('Cookie', [`token=${token()}`, `csrfToken=${CSRF}`])
      .set('X-CSRF-Token', CSRF)
      .send({ texto: banderas });

    expect(res.status).toBe(201);
    expect(res.body.texto).toBe(banderas);
  });
});
