/**
 * Aislamiento multi-tenant de la media (HU-OMNI-06).
 *
 * `GET /api/media/:id` es la única ruta del sistema que no pasa por `authenticateJWT`: su credencial
 * es el HMAC de la URL. Eso la convierte en la superficie más delicada del feature, y estos tests
 * son los que garantizan que el token **no** es lo que aísla — lo que aísla es el `findByIdScoped`.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { Types } from 'mongoose';
import { createHmac } from 'node:crypto';
import { env } from '../../src/config/env.js';
import { createScoped } from '../../src/repositories/base.repository.js';
import { Message } from '../../src/features/message/message.model.js';
import {
  getMediaStorage,
  setMediaStorageForTests,
  type IMediaStorage,
} from '../../src/integrations/storage/index.js';

vi.mock('../../src/realtime/realtime.publisher.js', () => ({
  publishRealtime: vi.fn(),
  subscribeRealtime: vi.fn(),
}));

const { default: app } = await import('../../src/app.js');
const { firmarUrlMedia } = await import('../../src/features/media/media.service.js');

const tenantA = new Types.ObjectId();
const tenantB = new Types.ObjectId();

/** Espía del almacenamiento: lo que importa es si LLEGA a llamarse, no qué devuelve. */
function espiaStorage(): { storage: IMediaStorage; leer: ReturnType<typeof vi.fn>; firmar: ReturnType<typeof vi.fn> } {
  const leer = vi.fn(async () => ({
    stream: (await import('node:stream')).Readable.from([Buffer.from('bytes')]),
    mimeType: 'image/png',
    tamanoBytes: 5,
  }));
  const firmar = vi.fn(async () => null);
  const storage: IMediaStorage = {
    driver: 'local',
    guardar: vi.fn(),
    leer: leer as unknown as IMediaStorage['leer'],
    urlFirmada: firmar as unknown as IMediaStorage['urlFirmada'],
    eliminar: vi.fn(),
  };
  return { storage, leer, firmar };
}

async function sembrarMensajeConMedia(tenantId: Types.ObjectId): Promise<string> {
  const doc = await createScoped(Message, tenantId, {
    clienteId: new Types.ObjectId(),
    canal: 'whatsapp',
    direccion: 'inbound',
    sender: 'user',
    tipo: 'imagen',
    media: {
      estado: 'disponible',
      mimeType: 'image/png',
      mediaKey: `${tenantId.toString()}/msg/archivo.png`,
      tamanoBytes: 5,
    },
    status: 'sent',
  });
  return String(doc._id);
}

describe('Aislamiento multi-tenant — GET /api/media/:id', () => {
  beforeEach(() => {
    setMediaStorageForTests(null);
  });

  it('un token del tenant A contra un mensaje del tenant B devuelve 404', async () => {
    const mensajeDeB = await sembrarMensajeConMedia(tenantB);

    // Token perfectamente válido... pero firmado para otra empresa.
    const token = firmarUrlMedia(tenantA.toString(), mensajeDeB);

    const res = await request(app).get(`/api/media/${mensajeDeB}`).query({ t: token });

    expect(res.status).toBe(404);
  });

  it('ese 404 es indistinguible del de un id inexistente: sin oráculo de existencia', async () => {
    const mensajeDeB = await sembrarMensajeConMedia(tenantB);
    const inexistente = new Types.ObjectId().toString();

    const ajeno = await request(app)
      .get(`/api/media/${mensajeDeB}`)
      .query({ t: firmarUrlMedia(tenantA.toString(), mensajeDeB) });
    const fantasma = await request(app)
      .get(`/api/media/${inexistente}`)
      .query({ t: firmarUrlMedia(tenantA.toString(), inexistente) });

    expect(ajeno.status).toBe(fantasma.status);
    expect(ajeno.body).toEqual(fantasma.body);
  });

  it('con un mensaje de otro tenant, el almacenamiento NO llega a invocarse', async () => {
    const { storage, leer, firmar } = espiaStorage();
    setMediaStorageForTests(storage);

    const mensajeDeB = await sembrarMensajeConMedia(tenantB);
    await request(app)
      .get(`/api/media/${mensajeDeB}`)
      .query({ t: firmarUrlMedia(tenantA.toString(), mensajeDeB) });

    // Que el corte ocurra ANTES de tocar el objeto es la diferencia entre un fallo de autorización
    // y una fuga: si el adaptador se llamara y solo después se descartara la respuesta, la media ya
    // habría salido del bucket.
    expect(leer).not.toHaveBeenCalled();
    expect(firmar).not.toHaveBeenCalled();
  });

  it('el dueño legítimo sí puede descargar su propio archivo', async () => {
    const { storage } = espiaStorage();
    setMediaStorageForTests(storage);

    const mensajeDeA = await sembrarMensajeConMedia(tenantA);
    const res = await request(app)
      .get(`/api/media/${mensajeDeA}`)
      .query({ t: firmarUrlMedia(tenantA.toString(), mensajeDeA) });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('image/png');
  });

  it('un token manipulado da 403', async () => {
    const mensajeDeA = await sembrarMensajeConMedia(tenantA);
    const bueno = firmarUrlMedia(tenantA.toString(), mensajeDeA);
    // Se cambia el tenant del token dejando la firma intacta: es el ataque obvio, porque el tenant
    // viaja en claro dentro del token.
    const manipulado = bueno.replace(tenantA.toString(), tenantB.toString());

    const res = await request(app).get(`/api/media/${mensajeDeA}`).query({ t: manipulado });

    expect(res.status).toBe(403);
  });

  it('un token de otro mensaje del MISMO tenant no sirve', async () => {
    const uno = await sembrarMensajeConMedia(tenantA);
    const otro = await sembrarMensajeConMedia(tenantA);

    const res = await request(app)
      .get(`/api/media/${otro}`)
      .query({ t: firmarUrlMedia(tenantA.toString(), uno) });

    expect(res.status).toBe(403);
  });

  it('un token vencido da 403, aunque la firma sea legítima', async () => {
    const mensajeDeA = await sembrarMensajeConMedia(tenantA);

    // El token se fabrica con un `exp` en el pasado y su firma CORRECTA para ese `exp`. Adelantar
    // el reloj con `vi.useFakeTimers()` congelaría también el event loop de supertest y la petición
    // no llegaría nunca; firmar un vencimiento pasado prueba exactamente lo mismo sin ese efecto.
    const exp = Math.floor(Date.now() / 1000) - 60;
    const firma = createHmac('sha256', env.MEDIA_URL_SECRET as string)
      .update(`${tenantA.toString()}.${mensajeDeA}.${exp}`)
      .digest('hex');

    const res = await request(app)
      .get(`/api/media/${mensajeDeA}`)
      .query({ t: `${tenantA.toString()}.${exp}.${firma}` });

    expect(res.status).toBe(403);
  });

  it('sin token da 400 (falta un parámetro obligatorio), nunca el archivo', async () => {
    const mensajeDeA = await sembrarMensajeConMedia(tenantA);

    const res = await request(app).get(`/api/media/${mensajeDeA}`);

    expect(res.status).toBe(400);
  });

  it('la media de un tenant no aparece en un findScoped del otro', async () => {
    await sembrarMensajeConMedia(tenantA);

    const { findScoped } = await import('../../src/repositories/base.repository.js');
    const deB = await findScoped(Message, tenantB, { 'media.estado': 'disponible' }).lean();

    expect(deB).toHaveLength(0);
  });

  it('la clave de almacenamiento empieza siempre por el tenantId', async () => {
    const { construirMediaKey } = await import('../../src/integrations/storage/index.js');
    const messageId = new Types.ObjectId().toString();

    const key = construirMediaKey(tenantA.toString(), messageId, 'image/png');

    expect(key.startsWith(`${tenantA.toString()}/`)).toBe(true);
    expect(key).not.toContain(tenantB.toString());
  });

  it('el DTO del hilo no expone jamás la clave de almacenamiento', async () => {
    const { toMessageResponse } = await import(
      '../../src/features/conversation/conversation.mapper.js'
    );
    const mensajeDeA = await sembrarMensajeConMedia(tenantA);
    const doc = await Message.collection.findOne({ _id: new Types.ObjectId(mensajeDeA) });

    const dto = toMessageResponse(
      doc as unknown as Parameters<typeof toMessageResponse>[0],
      tenantA.toString(),
    );

    expect(JSON.stringify(dto)).not.toContain('archivo.png');
    expect(dto.media?.urlArchivo).toContain(`/media/${mensajeDeA}?t=`);
  });
});

describe('getMediaStorage — selección de adaptador', () => {
  it('con MEDIA_DRIVER=local devuelve el adaptador de disco', () => {
    setMediaStorageForTests(null);
    expect(getMediaStorage().driver).toBe('local');
  });
});
