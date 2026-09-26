/**
 * La ingesta de media entrante (HU-OMNI-06).
 *
 * Lo que hay que garantizar: que un fallo definitivo no gaste reintentos, que uno recuperable sí se
 * relance, que el job sea idempotente y que el `jobId` cumpla el contrato de BullMQ.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Types } from 'mongoose';
import { AppError } from '../utils/AppError.js';
import { createScoped } from '../repositories/base.repository.js';
import { Message } from '../features/message/message.model.js';
import { setMediaStorageForTests, type IMediaStorage } from '../integrations/storage/index.js';
import { setTranscodificadorForTests } from '../integrations/audio/index.js';

const mockObtenerMetadata = vi.fn();
const mockDescargar = vi.fn();

vi.mock('../integrations/meta/meta-media.client.js', async () => {
  const real = await vi.importActual<typeof import('../integrations/meta/meta-media.client.js')>(
    '../integrations/meta/meta-media.client.js',
  );
  return {
    ...real,
    metaMediaClient: {
      obtenerMetadata: (...a: unknown[]) => mockObtenerMetadata(...a),
      descargar: (...a: unknown[]) => mockDescargar(...a),
      subir: vi.fn(),
    },
  };
});

vi.mock('../features/channel/channel.service.js', () => ({
  getIntegrationWithToken: vi.fn(async () => ({
    phoneNumberId: '1234567890',
    accessToken: 'token-de-prueba',
  })),
}));

const mockPublish = vi.fn();
vi.mock('../realtime/realtime.publisher.js', () => ({
  publishRealtime: (...a: unknown[]) => mockPublish(...a),
  subscribeRealtime: vi.fn(),
}));

const { processMediaIngestJob, mediaIngestJobId, marcarMediaFallida } = await import(
  './media-ingest.processor.js'
);
const { mediaExpirada } = await import('../integrations/meta/meta-media.client.js');

const tenantId = new Types.ObjectId();
const clienteId = new Types.ObjectId();

function storageFalso(): { storage: IMediaStorage; guardar: ReturnType<typeof vi.fn> } {
  const guardar = vi.fn(async ({ key, mimeType }: { key: string; mimeType: string }) => ({
    key,
    mimeType,
    tamanoBytes: 1234,
  }));
  return {
    guardar,
    storage: {
      driver: 'local',
      guardar: guardar as unknown as IMediaStorage['guardar'],
      leer: vi.fn(),
      urlFirmada: vi.fn(async () => null),
      eliminar: vi.fn(),
    },
  };
}

async function sembrarPendiente(): Promise<string> {
  const doc = await createScoped(Message, tenantId, {
    clienteId,
    canal: 'whatsapp',
    direccion: 'inbound',
    sender: 'user',
    tipo: 'imagen',
    media: { estado: 'pendiente', mimeType: 'image/jpeg', metaMediaId: 'media-123', intentos: 0 },
    status: 'sent',
  });
  return String(doc._id);
}

async function mediaDe(messageId: string): Promise<Record<string, unknown> | undefined> {
  const doc = await Message.collection.findOne({ _id: new Types.ObjectId(messageId) });
  return doc?.['media'] as Record<string, unknown> | undefined;
}

describe('processMediaIngestJob (HU-OMNI-06)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const { storage } = storageFalso();
    setMediaStorageForTests(storage);
    mockObtenerMetadata.mockResolvedValue({
      id: 'media-123',
      url: 'https://lookaside.fb/media-123',
      mimeType: 'image/jpeg',
    });
    mockDescargar.mockResolvedValue({
      buffer: Buffer.from('foto'),
      mimeType: 'image/jpeg',
      tamanoBytes: 4,
    });
  });

  it('descarga, guarda y deja la media disponible', async () => {
    const messageId = await sembrarPendiente();

    await processMediaIngestJob({ tenantId: tenantId.toString(), messageId, clienteId: clienteId.toString() });

    const media = await mediaDe(messageId);
    expect(media?.['estado']).toBe('disponible');
    expect(media?.['mediaKey']).toContain(tenantId.toString());
    expect(media?.['tamanoBytes']).toBe(1234);
  });

  it('avisa al hilo con message:updated al terminar', async () => {
    const messageId = await sembrarPendiente();

    await processMediaIngestJob({ tenantId: tenantId.toString(), messageId, clienteId: clienteId.toString() });

    const evento = mockPublish.mock.calls.at(-1)?.[0] as { type: string; message: { id: string } };
    expect(evento.type).toBe('message:updated');
    expect(evento.message.id).toBe(messageId);
  });

  it('es idempotente: un mensaje ya disponible no vuelve a llamar a Meta', async () => {
    const messageId = await sembrarPendiente();
    await processMediaIngestJob({ tenantId: tenantId.toString(), messageId, clienteId: clienteId.toString() });
    mockObtenerMetadata.mockClear();

    await processMediaIngestJob({ tenantId: tenantId.toString(), messageId, clienteId: clienteId.toString() });

    // Es la guarda que aguanta cuando el job ya se purgó de Redis y Meta reenvía el webhook.
    expect(mockObtenerMetadata).not.toHaveBeenCalled();
  });

  it('media caducada en Meta: falla en el acto, sin gastar reintentos', async () => {
    const messageId = await sembrarPendiente();
    mockObtenerMetadata.mockRejectedValue(mediaExpirada('media-123'));

    // NO lanza: si lanzara, BullMQ reintentaría cinco veces algo que no se puede recuperar.
    await expect(
      processMediaIngestJob({ tenantId: tenantId.toString(), messageId, clienteId: clienteId.toString() }),
    ).resolves.toBeUndefined();

    const media = await mediaDe(messageId);
    expect(media?.['estado']).toBe('fallida');
    expect(String(media?.['error'])).toContain('expiró');
  });

  it('archivo demasiado grande: también es definitivo', async () => {
    const messageId = await sembrarPendiente();
    mockDescargar.mockRejectedValue(new AppError('El archivo supera el tamaño permitido.', 413));

    await expect(
      processMediaIngestJob({ tenantId: tenantId.toString(), messageId, clienteId: clienteId.toString() }),
    ).resolves.toBeUndefined();

    expect((await mediaDe(messageId))?.['estado']).toBe('fallida');
  });

  it('un fallo recuperable SÍ se relanza, para que BullMQ reintente', async () => {
    const messageId = await sembrarPendiente();
    mockDescargar.mockRejectedValue(new AppError('Error Graph API media (503): boom', 502));

    await expect(
      processMediaIngestJob({ tenantId: tenantId.toString(), messageId, clienteId: clienteId.toString() }),
    ).rejects.toBeInstanceOf(AppError);

    const media = await mediaDe(messageId);
    // Sigue pendiente —recuperable— pero con el intento contabilizado.
    expect(media?.['estado']).toBe('pendiente');
    expect(media?.['intentos']).toBe(1);
  });

  it('un mensaje sin metaMediaId no se queda colgado: se marca fallido', async () => {
    const doc = await createScoped(Message, tenantId, {
      clienteId,
      canal: 'whatsapp',
      direccion: 'inbound',
      sender: 'user',
      tipo: 'imagen',
      media: { estado: 'pendiente', mimeType: 'image/jpeg', intentos: 0 },
      status: 'sent',
    });

    await processMediaIngestJob({
      tenantId: tenantId.toString(),
      messageId: String(doc._id),
      clienteId: clienteId.toString(),
    });

    expect((await mediaDe(String(doc._id)))?.['estado']).toBe('fallida');
  });

  it('un mensaje que ya no existe no revienta el job', async () => {
    await expect(
      processMediaIngestJob({
        tenantId: tenantId.toString(),
        messageId: new Types.ObjectId().toString(),
        clienteId: clienteId.toString(),
      }),
    ).resolves.toBeUndefined();
  });

  it('marcarMediaFallida publica el cambio: el hilo no se queda girando', async () => {
    const messageId = await sembrarPendiente();
    mockPublish.mockClear();

    await marcarMediaFallida(tenantId.toString(), messageId, clienteId.toString(), 'sin red');

    expect(mockPublish).toHaveBeenCalledOnce();
    expect((mockPublish.mock.calls[0]?.[0] as { type: string }).type).toBe('message:updated');
  });

  it('no toca la media de otro tenant', async () => {
    const messageId = await sembrarPendiente();
    const otroTenant = new Types.ObjectId().toString();

    await processMediaIngestJob({ tenantId: otroTenant, messageId, clienteId: clienteId.toString() });

    // `findByIdScoped` no lo encuentra, así que el mensaje del tenant legítimo queda intacto.
    expect((await mediaDe(messageId))?.['estado']).toBe('pendiente');
    expect(mockObtenerMetadata).not.toHaveBeenCalled();
  });
});

/**
 * El contrato que BullMQ impone al `jobId` personalizado y que ningún mock verifica. Replicado del
 * test de `ventanaJobId`, por el mismo motivo: fue HT-AI-02 y la suite entera estaba en verde.
 */
function bullmqRechazaElJobId(jobId: string): string | null {
  if (`${parseInt(jobId, 10)}` === jobId) return 'Custom Id cannot be integers';
  if (jobId.includes(':') && jobId.split(':').length !== 3) return 'Custom Id cannot contain :';
  return null;
}

describe('processMediaIngestJob — duración de los audios (HU-OMNI-07)', () => {
  const medirDuracion = vi.fn<(b: Buffer) => Promise<number | null>>();

  async function sembrarAudioPendiente(): Promise<string> {
    const doc = await createScoped(Message, tenantId, {
      clienteId,
      canal: 'whatsapp',
      direccion: 'inbound',
      sender: 'user',
      tipo: 'audio',
      media: {
        estado: 'pendiente',
        mimeType: 'audio/ogg',
        metaMediaId: 'media-voz',
        intentos: 0,
        esNotaDeVoz: true,
      },
      status: 'sent',
    });
    return String(doc._id);
  }

  beforeEach(() => {
    vi.clearAllMocks();
    setMediaStorageForTests(storageFalso().storage);
    setTranscodificadorForTests({ aNotaDeVoz: vi.fn(), medirDuracion });
    mockObtenerMetadata.mockResolvedValue({
      id: 'media-voz',
      url: 'https://lookaside.fb/media-voz',
      mimeType: 'audio/ogg',
    });
    mockDescargar.mockResolvedValue({
      buffer: Buffer.from('OggS'),
      mimeType: 'audio/ogg',
      tamanoBytes: 4,
    });
  });

  it('mide la duración del audio descargado y la guarda junto con la media', async () => {
    medirDuracion.mockResolvedValue(7.3);
    const messageId = await sembrarAudioPendiente();

    await processMediaIngestJob({ tenantId: tenantId.toString(), messageId, clienteId: clienteId.toString() });

    const media = await mediaDe(messageId);
    expect(media?.['estado']).toBe('disponible');
    expect(media?.['duracionSegundos']).toBe(7.3);
    expect(media?.['esNotaDeVoz']).toBe(true);
  });

  it('si no se puede medir, el audio queda disponible igual y sin duración', async () => {
    medirDuracion.mockResolvedValue(null);
    const messageId = await sembrarAudioPendiente();

    await processMediaIngestJob({ tenantId: tenantId.toString(), messageId, clienteId: clienteId.toString() });

    const media = await mediaDe(messageId);
    expect(media?.['estado']).toBe('disponible');
    expect(media).not.toHaveProperty('duracionSegundos');
  });

  it('no mide nada que no sea audio (ffprobe no se gasta en una imagen)', async () => {
    const messageId = await sembrarPendiente();
    mockDescargar.mockResolvedValue({ buffer: Buffer.from('foto'), mimeType: 'image/jpeg', tamanoBytes: 4 });

    await processMediaIngestJob({ tenantId: tenantId.toString(), messageId, clienteId: clienteId.toString() });

    expect(medirDuracion).not.toHaveBeenCalled();
  });
});

describe('mediaIngestJobId — contrato con BullMQ', () => {
  const messageId = new Types.ObjectId().toString();

  it('el id NO contiene dos puntos', () => {
    expect(mediaIngestJobId(tenantId.toString(), messageId)).not.toContain(':');
  });

  it('BullMQ aceptaría el id que generamos', () => {
    expect(bullmqRechazaElJobId(mediaIngestJobId(tenantId.toString(), messageId))).toBeNull();
  });

  it('el id nunca es un entero puro: el prefijo lo garantiza', () => {
    expect(Number.isNaN(Number(mediaIngestJobId(tenantId.toString(), messageId)))).toBe(true);
  });

  it('dos mensajes distintos no comparten id', () => {
    const otro = new Types.ObjectId().toString();
    expect(mediaIngestJobId(tenantId.toString(), messageId)).not.toBe(
      mediaIngestJobId(tenantId.toString(), otro),
    );
  });

  it('el mismo mensaje en tenants distintos tampoco lo comparte', () => {
    expect(mediaIngestJobId('tenant-a', messageId)).not.toBe(mediaIngestJobId('tenant-b', messageId));
  });

  it('el detector replicado sí caza un id con formato inválido, así que no es un test vacío', () => {
    expect(bullmqRechazaElJobId(`media:${tenantId.toString()}`)).toBe('Custom Id cannot contain :');
    expect(bullmqRechazaElJobId('12345')).toBe('Custom Id cannot be integers');
  });
});
