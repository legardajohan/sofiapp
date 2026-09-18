/**
 * Envío saliente de media (HU-OMNI-06).
 *
 * Lo que hay que garantizar: que la validación rechace lo que Meta rechazaría, que la ventana de
 * 24 h la siga decidiendo `sendOutbound` y que un fallo no deje basura en el almacenamiento.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Types } from 'mongoose';
import { AppError } from '../../utils/AppError.js';
import { createScoped } from '../../repositories/base.repository.js';
import { Cliente } from '../cliente/cliente.model.js';
import { setMediaStorageForTests, type IMediaStorage } from '../../integrations/storage/index.js';

const mockSubir = vi.fn();
const mockSendMedia = vi.fn();

vi.mock('../../integrations/meta/meta-media.client.js', async () => {
  const real = await vi.importActual<typeof import('../../integrations/meta/meta-media.client.js')>(
    '../../integrations/meta/meta-media.client.js',
  );
  return { ...real, metaMediaClient: { ...real.metaMediaClient, subir: mockSubir } };
});

vi.mock('../../integrations/meta/meta-whatsapp.client.js', () => ({
  metaWhatsAppClient: {
    sendText: vi.fn(),
    sendTemplate: vi.fn(),
    sendMedia: mockSendMedia,
  },
}));

vi.mock('../channel/channel.service.js', () => ({
  getIntegrationWithToken: vi.fn(async () => ({
    phoneNumberId: '123',
    accessToken: 'token',
  })),
}));

vi.mock('../../config/queues.js', async (original) => {
  const real = await original<typeof import('../../config/queues.js')>();
  return { ...real, mediaIngestQueue: { add: vi.fn() } };
});

vi.mock('../usage/usage.service.js', () => ({
  assertWithinQuota: vi.fn(),
  incrementUsage: vi.fn(),
}));

const { clasificarArchivoSaliente, enviarMediaSaliente, reintentarIngesta } = await import(
  './media.service.js'
);
const { Message } = await import('../message/message.model.js');
const { mediaIngestQueue } = await import('../../config/queues.js');

const tenantId = new Types.ObjectId();

function storageEspia(): { storage: IMediaStorage; eliminar: ReturnType<typeof vi.fn> } {
  const eliminar = vi.fn(async () => undefined);
  return {
    eliminar,
    storage: {
      driver: 'local',
      guardar: vi.fn(async ({ key, mimeType }: { key: string; mimeType: string }) => ({
        key,
        mimeType,
        tamanoBytes: 100,
      })) as unknown as IMediaStorage['guardar'],
      leer: vi.fn(),
      urlFirmada: vi.fn(async () => null),
      eliminar: eliminar as unknown as IMediaStorage['eliminar'],
    },
  };
}

async function crearCliente(ventanaAbierta: boolean): Promise<string> {
  const doc = await createScoped(Cliente, tenantId, {
    metaUserId: `wa-${new Types.ObjectId().toString()}`,
    telefono: '573001234567',
    canalOrigen: 'whatsapp',
    estadoComercial: 'nuevo',
    ventana24hExpiraEn: ventanaAbierta
      ? new Date(Date.now() + 60 * 60 * 1000)
      : new Date(Date.now() - 60 * 60 * 1000),
  });
  return String(doc._id);
}

describe('clasificarArchivoSaliente — validación de tipo y tamaño', () => {
  it('reconoce los tres tipos que un asesor puede enviar', () => {
    expect(clasificarArchivoSaliente('image/jpeg', 1000)).toBe('imagen');
    expect(clasificarArchivoSaliente('video/mp4', 1000)).toBe('video');
    expect(clasificarArchivoSaliente('application/pdf', 1000)).toBe('documento');
  });

  it('tolera un mime con parámetros (`; charset=…`)', () => {
    expect(clasificarArchivoSaliente('text/plain; charset=utf-8', 10)).toBe('documento');
  });

  it('rechaza un mime que Meta no acepta, con 415', () => {
    expect(() => clasificarArchivoSaliente('application/x-msdownload', 10)).toThrow(AppError);
    try {
      clasificarArchivoSaliente('application/x-msdownload', 10);
    } catch (e) {
      expect((e as AppError).statusCode).toBe(415);
    }
  });

  it('SEGURIDAD: svg y html quedan fuera', () => {
    // No es un olvido: servir un SVG o un HTML inline desde nuestro propio origen sería XSS
    // almacenado con la cookie de sesión al alcance.
    expect(() => clasificarArchivoSaliente('image/svg+xml', 10)).toThrow(AppError);
    expect(() => clasificarArchivoSaliente('text/html', 10)).toThrow(AppError);
  });

  it('rechaza una imagen de más de 5 MB con 413', () => {
    try {
      clasificarArchivoSaliente('image/jpeg', 6 * 1024 * 1024);
      throw new Error('debería haber lanzado');
    } catch (e) {
      expect((e as AppError).statusCode).toBe(413);
    }
  });

  it('rechaza un video de más de 16 MB', () => {
    expect(() => clasificarArchivoSaliente('video/mp4', 20 * 1024 * 1024)).toThrow(AppError);
  });

  it('acepta una imagen justo en el límite', () => {
    expect(clasificarArchivoSaliente('image/jpeg', 5 * 1024 * 1024)).toBe('imagen');
  });
});

describe('enviarMediaSaliente (HU-OMNI-06)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setMediaStorageForTests(storageEspia().storage);
    mockSubir.mockResolvedValue({ mediaId: 'meta-media-1' });
    mockSendMedia.mockResolvedValue({ messageId: 'wamid.OUT1' });
  });

  it('con la ventana abierta sube, envía y persiste el mensaje disponible', async () => {
    const clienteId = await crearCliente(true);

    const msg = await enviarMediaSaliente(
      tenantId.toString(),
      clienteId,
      { buffer: Buffer.from('foto'), mimeType: 'image/jpeg', nombreArchivo: 'foto.jpg' },
      'mira',
    );

    expect(msg.tipo).toBe('imagen');
    expect(msg.media?.estado).toBe('disponible');
    expect(msg.media?.metaMediaId).toBe('meta-media-1');
    expect(msg.texto).toBe('mira');
  });

  it('guarda en NUESTRO almacenamiento antes de subir a Meta', async () => {
    const { storage } = storageEspia();
    setMediaStorageForTests(storage);
    const clienteId = await crearCliente(true);

    await enviarMediaSaliente(
      tenantId.toString(),
      clienteId,
      { buffer: Buffer.from('x'), mimeType: 'image/jpeg', nombreArchivo: 'a.jpg' },
      undefined,
    );

    // Si Meta fuera primero y el guardado fallara, el cliente ya tendría un archivo que nuestra
    // propia bandeja no sabría mostrar: una inconsistencia visible e irreversible.
    const ordenGuardar = (storage.guardar as unknown as { mock: { invocationCallOrder: number[] } })
      .mock.invocationCallOrder[0] as number;
    const ordenSubir = mockSubir.mock.invocationCallOrder[0] as number;
    expect(ordenGuardar).toBeLessThan(ordenSubir);
  });

  it('fuera de la ventana de 24 h da 422 y NO llega a enviar', async () => {
    const clienteId = await crearCliente(false);

    await expect(
      enviarMediaSaliente(
        tenantId.toString(),
        clienteId,
        { buffer: Buffer.from('x'), mimeType: 'image/jpeg', nombreArchivo: 'a.jpg' },
        undefined,
      ),
    ).rejects.toMatchObject({ statusCode: 422 });

    // La regla la decide `sendOutbound`, no este servicio: aquí solo se comprueba que se respeta.
    expect(mockSendMedia).not.toHaveBeenCalled();
  });

  it('si Meta rechaza la subida, se limpia el objeto huérfano', async () => {
    const { storage, eliminar } = storageEspia();
    setMediaStorageForTests(storage);
    const clienteId = await crearCliente(true);
    mockSubir.mockRejectedValue(new AppError('Error Graph API media (400): boom', 502));

    await expect(
      enviarMediaSaliente(
        tenantId.toString(),
        clienteId,
        { buffer: Buffer.from('x'), mimeType: 'image/jpeg', nombreArchivo: 'a.jpg' },
        undefined,
      ),
    ).rejects.toBeInstanceOf(AppError);

    expect(eliminar).toHaveBeenCalledOnce();
  });

  it('un archivo demasiado grande se rechaza ANTES de tocar el almacenamiento', async () => {
    const { storage } = storageEspia();
    setMediaStorageForTests(storage);
    const clienteId = await crearCliente(true);

    await expect(
      enviarMediaSaliente(
        tenantId.toString(),
        clienteId,
        {
          buffer: Buffer.alloc(6 * 1024 * 1024),
          mimeType: 'image/jpeg',
          nombreArchivo: 'grande.jpg',
        },
        undefined,
      ),
    ).rejects.toMatchObject({ statusCode: 413 });

    expect(storage.guardar).not.toHaveBeenCalled();
  });

  it('la clave del archivo empieza por el tenantId', async () => {
    const { storage } = storageEspia();
    setMediaStorageForTests(storage);
    const clienteId = await crearCliente(true);

    await enviarMediaSaliente(
      tenantId.toString(),
      clienteId,
      { buffer: Buffer.from('x'), mimeType: 'application/pdf', nombreArchivo: 'doc.pdf' },
      undefined,
    );

    const primeraLlamada = (
      storage.guardar as unknown as { mock: { calls: Array<[{ key: string }]> } }
    ).mock.calls[0];
    expect(primeraLlamada?.[0].key.startsWith(`${tenantId.toString()}/`)).toBe(true);
  });

  it('un cliente de otro tenant no se encuentra: 404', async () => {
    const clienteId = await crearCliente(true);
    const otroTenant = new Types.ObjectId().toString();

    await expect(
      enviarMediaSaliente(
        otroTenant,
        clienteId,
        { buffer: Buffer.from('x'), mimeType: 'image/jpeg', nombreArchivo: 'a.jpg' },
        undefined,
      ),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('reintentarIngesta — recuperar una descarga fallida (HU-OMNI-06)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  async function sembrar(estado: 'fallida' | 'disponible', conMediaId = true): Promise<string> {
    const doc = await createScoped(Message, tenantId, {
      clienteId: new Types.ObjectId(),
      canal: 'whatsapp',
      direccion: 'inbound',
      sender: 'user',
      tipo: 'imagen',
      media: {
        estado,
        mimeType: 'image/jpeg',
        error: estado === 'fallida' ? 'El enlace de Meta expiró.' : undefined,
        ...(conMediaId ? { metaMediaId: 'media-1' } : {}),
        ...(estado === 'disponible' ? { mediaKey: 'k' } : {}),
      },
      status: 'sent',
    });
    return String(doc._id);
  }

  it('devuelve la media a pendiente y limpia el error', async () => {
    const messageId = await sembrar('fallida');

    await reintentarIngesta(tenantId.toString(), messageId);

    const doc = await Message.collection.findOne({ _id: new Types.ObjectId(messageId) });
    const media = doc?.['media'] as Record<string, unknown>;
    expect(media['estado']).toBe('pendiente');
    expect(media['error']).toBeUndefined();
    expect(media['intentos']).toBe(0);
    expect(mediaIngestQueue.add).toHaveBeenCalledTimes(1);
  });

  it('sobre una media ya disponible es un no-op, no un error', async () => {
    const messageId = await sembrar('disponible');

    await expect(reintentarIngesta(tenantId.toString(), messageId)).resolves.toBeUndefined();

    const doc = await Message.collection.findOne({ _id: new Types.ObjectId(messageId) });
    expect((doc?.['media'] as Record<string, unknown>)['estado']).toBe('disponible');
  });

  it('sin metaMediaId no se puede reintentar: 409 en vez de encolar en vano', async () => {
    const messageId = await sembrar('fallida', false);

    await expect(reintentarIngesta(tenantId.toString(), messageId)).rejects.toMatchObject({
      statusCode: 409,
    });
  });

  it('un mensaje de otro tenant devuelve 404', async () => {
    const messageId = await sembrar('fallida');

    await expect(
      reintentarIngesta(new Types.ObjectId().toString(), messageId),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});
