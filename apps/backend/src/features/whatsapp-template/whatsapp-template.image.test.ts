/**
 * HT-WA-04 — plantillas con imagen de encabezado.
 *
 * Nivel de servicio: subida de la muestra (Resumable Upload simulada), alta con HEADER, estado por
 * webhook, imagen por defecto con caché del `media id`, reemplazo por campaña y por envío, y el
 * aislamiento multi-tenant de todo lo anterior. Meta y el almacenamiento van simulados.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Readable } from 'node:stream';
import { Types } from 'mongoose';
import { createScoped, findByIdScoped } from '../../repositories/base.repository.js';
import { encrypt } from '../../utils/crypto.util.js';
import { MetaIntegration } from '../channel/channel.model.js';
import { Cliente } from '../cliente/cliente.model.js';
import { Campaign } from '../campaign/campaign.model.js';
import { MediaUpload } from '../media/media-upload.model.js';
import { setMediaStorageForTests, type IMediaStorage } from '../../integrations/storage/index.js';
import { WhatsAppTemplate } from './whatsapp-template.model.js';
import type { IImagenSubida } from '../media/media.types.js';
import type { LeanWhatsAppTemplate } from './whatsapp-template.types.js';
import type { LeanCampaign } from '../campaign/campaign.types.js';

vi.mock('../../config/queues.js', async (original) => {
  const real = await original<typeof import('../../config/queues.js')>();
  return { ...real, campaignQueue: { add: vi.fn(), upsertJobScheduler: vi.fn() } };
});

vi.mock('../../integrations/meta/meta-template.client.js', async (original) => {
  const real = await original<typeof import('../../integrations/meta/meta-template.client.js')>();
  return {
    ...real,
    metaTemplateClient: { list: vi.fn(), get: vi.fn(), create: vi.fn(), subirMuestra: vi.fn() },
  };
});

const { mockSubir, mockSendTemplate, publishRealtime } = vi.hoisted(() => ({
  mockSubir: vi.fn(),
  mockSendTemplate: vi.fn(),
  publishRealtime: vi.fn(),
}));

vi.mock('../../integrations/meta/meta-media.client.js', async () => {
  const real = await vi.importActual<typeof import('../../integrations/meta/meta-media.client.js')>(
    '../../integrations/meta/meta-media.client.js',
  );
  return { ...real, metaMediaClient: { ...real.metaMediaClient, subir: mockSubir } };
});

vi.mock('../../integrations/meta/meta-whatsapp.client.js', () => ({
  metaWhatsAppClient: { sendTemplate: mockSendTemplate, sendText: vi.fn(), sendMedia: vi.fn() },
}));

vi.mock('../../realtime/realtime.publisher.js', () => ({
  publishRealtime: (...args: unknown[]) => publishRealtime(...args),
}));

import { metaTemplateClient } from '../../integrations/meta/meta-template.client.js';
import {
  aplicarEstadoPlantilla,
  buildTemplatePayload,
  createTemplate,
  estadoDesdeMeta,
  getTemplate,
  resolverImagenPlantilla,
  subirMuestraPlantilla,
  syncTemplate,
} from './whatsapp-template.service.js';
import {
  createCampaign,
  prepararImagenCabecera,
  subirImagenReemplazo,
} from '../campaign/campaign.service.js';
import { sendOutbound } from '../message/message.service.js';

const actorId = new Types.ObjectId().toString();

/** Almacenamiento en memoria: deja ver qué claves se escriben. */
const objetos = new Map<string, Buffer>();
const storage: IMediaStorage = {
  driver: 'local',
  guardar: vi.fn(async ({ key, contenido, mimeType }) => {
    objetos.set(key, contenido);
    return { key, mimeType, tamanoBytes: contenido.byteLength };
  }),
  leer: vi.fn(async (key: string) => {
    const contenido = objetos.get(key);
    if (!contenido) throw new Error('no existe');
    return { stream: Readable.from(contenido), mimeType: 'image/png', tamanoBytes: contenido.byteLength };
  }),
  urlFirmada: vi.fn(async () => null),
  eliminar: vi.fn(async (key: string) => {
    objetos.delete(key);
  }),
};

const PNG: IImagenSubida = {
  buffer: Buffer.from('png-falso'),
  mimeType: 'image/png',
  nombreArchivo: 'promo.png',
};

async function crearIntegracion(tenantId: Types.ObjectId, wabaId = 'waba-1'): Promise<void> {
  await createScoped(MetaIntegration, tenantId, {
    canal: 'whatsapp',
    wabaId,
    phoneNumberId: `phone-${tenantId.toString()}`,
    accessTokenEnc: encrypt('token'),
    activo: true,
  });
}

/** Alta completa de una plantilla con imagen, ya aprobada, como la dejaría el webhook. */
async function crearPlantillaConImagen(tenantId: Types.ObjectId): Promise<string> {
  const { uploadId } = await subirMuestraPlantilla(tenantId, PNG);
  vi.mocked(metaTemplateClient.create).mockResolvedValueOnce({ id: 'meta-promo', status: 'PENDING' });
  const creada = await createTemplate(tenantId, {
    name: 'promo_mes',
    language: 'es',
    category: 'MARKETING',
    cuerpo: 'Hola {{1}}, mira la promo',
    ejemplos: ['Ana'],
    cabecera: { formato: 'IMAGE', uploadId },
  });
  await aplicarEstadoPlantilla(tenantId, 'meta-promo', 'APPROVED', null);
  return creada.id;
}

async function leerPlantilla(tenantId: Types.ObjectId, id: string): Promise<LeanWhatsAppTemplate> {
  return (await findByIdScoped(WhatsAppTemplate, tenantId, id).lean()) as unknown as LeanWhatsAppTemplate;
}

async function leerCampana(tenantId: Types.ObjectId, id: string): Promise<LeanCampaign> {
  return (await findByIdScoped(Campaign, tenantId, id).lean()) as unknown as LeanCampaign;
}

beforeEach(() => {
  vi.clearAllMocks();
  objetos.clear();
  setMediaStorageForTests(storage);
  vi.mocked(metaTemplateClient.subirMuestra).mockResolvedValue({ headerHandle: 'handle-123' });
  let n = 0;
  mockSubir.mockImplementation(async () => ({ mediaId: `meta-media-${++n}` }));
  mockSendTemplate.mockResolvedValue({ messageId: 'wamid.1' });
});

describe('Alta con imagen (criterios 1-4, 9)', () => {
  it('sube la muestra a Meta, la guarda bajo el prefijo del tenant y devuelve un uploadId', async () => {
    const tenantId = new Types.ObjectId();
    await crearIntegracion(tenantId);

    const subida = await subirMuestraPlantilla(tenantId, PNG);

    expect(subida).toMatchObject({ mimeType: 'image/png', tamanoBytes: PNG.buffer.byteLength });
    expect(metaTemplateClient.subirMuestra).toHaveBeenCalledWith('token', {
      buffer: PNG.buffer,
      mimeType: 'image/png',
    });
    const [key] = [...objetos.keys()];
    expect(key?.startsWith(`${tenantId.toString()}/templates/`)).toBe(true);
  });

  it('rechaza un tipo distinto de JPG/PNG (415) y una imagen de más de 5 MB (413) sin llamar a Meta', async () => {
    const tenantId = new Types.ObjectId();
    await crearIntegracion(tenantId);

    await expect(
      subirMuestraPlantilla(tenantId, { ...PNG, mimeType: 'image/gif' }),
    ).rejects.toMatchObject({ statusCode: 415 });
    await expect(
      subirMuestraPlantilla(tenantId, { ...PNG, buffer: Buffer.alloc(5 * 1024 * 1024 + 1) }),
    ).rejects.toMatchObject({ statusCode: 413 });
    await expect(subirMuestraPlantilla(tenantId, undefined)).rejects.toMatchObject({ statusCode: 400 });
    expect(metaTemplateClient.subirMuestra).not.toHaveBeenCalled();
  });

  it('envía HEADER(IMAGE, header_handle) + BODY + FOOTER, queda PENDING y con imagen por defecto', async () => {
    const tenantId = new Types.ObjectId();
    await crearIntegracion(tenantId);
    const { uploadId } = await subirMuestraPlantilla(tenantId, PNG);
    vi.mocked(metaTemplateClient.create).mockResolvedValueOnce({ id: 'meta-1', status: 'PENDING' });

    const creada = await createTemplate(tenantId, {
      name: 'promo',
      language: 'es',
      category: 'UTILITY',
      cuerpo: 'Hola {{1}}',
      ejemplos: ['Ana'],
      cabecera: { formato: 'IMAGE', uploadId },
      pie: 'Responde STOP para salir',
    });

    expect(vi.mocked(metaTemplateClient.create).mock.calls[0]![2].components).toEqual([
      { type: 'HEADER', format: 'IMAGE', example: { header_handle: ['handle-123'] } },
      { type: 'BODY', text: 'Hola {{1}}', example: { body_text: [['Ana']] } },
      { type: 'FOOTER', text: 'Responde STOP para salir' },
    ]);
    expect(creada).toMatchObject({ status: 'PENDING', cabecera: 'IMAGE', pie: 'Responde STOP para salir' });
    expect(creada.imagen?.url).toMatch(new RegExp(`^/media/templates/${creada.id}/imagen\\?t=`));
  });

  it('«Solo texto» manda exactamente el payload de HT-WA-02 (criterio 16)', async () => {
    const tenantId = new Types.ObjectId();
    await crearIntegracion(tenantId);
    vi.mocked(metaTemplateClient.create).mockResolvedValueOnce({ id: 'meta-t', status: 'PENDING' });

    const creada = await createTemplate(tenantId, {
      name: 'texto',
      language: 'es',
      category: 'UTILITY',
      cuerpo: 'Hola',
      ejemplos: [],
    });

    expect(vi.mocked(metaTemplateClient.create).mock.calls[0]![2].components).toEqual([
      { type: 'BODY', text: 'Hola' },
    ]);
    expect(creada.imagen).toBeNull();
    expect(metaTemplateClient.subirMuestra).not.toHaveBeenCalled();
  });

  it('AUTHENTICATION con imagen → 400, sin gastar la subida', async () => {
    const tenantId = new Types.ObjectId();
    await crearIntegracion(tenantId);
    const { uploadId } = await subirMuestraPlantilla(tenantId, PNG);

    await expect(
      createTemplate(tenantId, {
        name: 'codigo',
        language: 'es',
        category: 'AUTHENTICATION',
        cuerpo: 'Tu código',
        ejemplos: [],
        cabecera: { formato: 'IMAGE', uploadId },
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect((await MediaUpload.findById(uploadId).lean())?.usadaAt).toBeNull();
  });

  it('si Meta rechaza el alta, la subida vuelve a quedar disponible; usada una vez, no se reutiliza', async () => {
    const tenantId = new Types.ObjectId();
    await crearIntegracion(tenantId);
    const { uploadId } = await subirMuestraPlantilla(tenantId, PNG);
    const dto = {
      name: 'promo',
      language: 'es',
      category: 'MARKETING' as const,
      cuerpo: 'Hola',
      ejemplos: [],
      cabecera: { formato: 'IMAGE' as const, uploadId },
    };

    vi.mocked(metaTemplateClient.create).mockRejectedValueOnce(
      Object.assign(new Error('Ya existe'), { statusCode: 409 }),
    );
    await expect(createTemplate(tenantId, dto)).rejects.toMatchObject({ statusCode: 409 });

    vi.mocked(metaTemplateClient.create).mockResolvedValueOnce({ id: 'meta-2', status: 'PENDING' });
    await expect(createTemplate(tenantId, dto)).resolves.toMatchObject({ status: 'PENDING' });
    await expect(createTemplate(tenantId, { ...dto, name: 'otra' })).rejects.toMatchObject({
      statusCode: 404,
    });
  });
});

describe('Estado automático (criterios 5-7)', () => {
  it('APPROVED y REJECTED se aplican, guardan el motivo y avisan en vivo', async () => {
    const tenantId = new Types.ObjectId();
    await crearIntegracion(tenantId);
    vi.mocked(metaTemplateClient.create).mockResolvedValueOnce({ id: 'meta-x', status: 'PENDING' });
    const creada = await createTemplate(tenantId, {
      name: 'x',
      language: 'es',
      category: 'UTILITY',
      cuerpo: 'Hola',
      ejemplos: [],
    });

    await aplicarEstadoPlantilla(tenantId, 'meta-x', 'REJECTED', 'INVALID_FORMAT');
    const rechazada = await getTemplate(tenantId, creada.id);
    expect(rechazada.status).toBe('REJECTED');
    expect(rechazada.motivoRechazo).toEqual({
      codigo: 'INVALID_FORMAT',
      mensaje: expect.stringContaining('formato'),
    });
    expect(publishRealtime).toHaveBeenLastCalledWith(
      expect.objectContaining({
        type: 'template:status-updated',
        tenantId: tenantId.toString(),
        templateId: creada.id,
        status: 'REJECTED',
      }),
    );

    await aplicarEstadoPlantilla(tenantId, 'meta-x', 'REINSTATED', null);
    const aprobada = await getTemplate(tenantId, creada.id);
    expect(aprobada.status).toBe('APPROVED');
    expect(aprobada.motivoRechazo).toBeNull();
  });

  it('FLAGGED no cambia nada; PENDING_DELETION la marca obsoleta', async () => {
    const tenantId = new Types.ObjectId();
    await crearIntegracion(tenantId);
    vi.mocked(metaTemplateClient.create).mockResolvedValueOnce({ id: 'meta-f', status: 'APPROVED' });
    const creada = await createTemplate(tenantId, {
      name: 'f',
      language: 'es',
      category: 'UTILITY',
      cuerpo: 'Hola',
      ejemplos: [],
    });

    await expect(aplicarEstadoPlantilla(tenantId, 'meta-f', 'FLAGGED', null)).resolves.toBeNull();
    expect((await getTemplate(tenantId, creada.id)).status).toBe('APPROVED');

    await aplicarEstadoPlantilla(tenantId, 'meta-f', 'PENDING_DELETION', null);
    expect(await getTemplate(tenantId, creada.id)).toMatchObject({ obsoleta: true, status: 'DISABLED' });
  });

  it('estadoDesdeMeta aproxima los estados que SofiApp no modela', () => {
    expect(estadoDesdeMeta('approved')).toBe('APPROVED');
    expect(estadoDesdeMeta('IN_APPEAL')).toBe('IN_APPEAL');
    expect(estadoDesdeMeta('LIMIT_EXCEEDED')).toBe('REJECTED');
    expect(estadoDesdeMeta('ALGO_NUEVO')).toBe('PENDING');
  });

  it('syncTemplate refresca una plantilla con el estado y el motivo de Meta', async () => {
    const tenantId = new Types.ObjectId();
    await crearIntegracion(tenantId);
    vi.mocked(metaTemplateClient.create).mockResolvedValueOnce({ id: 'meta-s', status: 'PENDING' });
    const creada = await createTemplate(tenantId, {
      name: 's',
      language: 'es',
      category: 'MARKETING',
      cuerpo: 'Hola',
      ejemplos: [],
    });
    vi.mocked(metaTemplateClient.get).mockResolvedValueOnce({
      id: 'meta-s',
      name: 's',
      language: 'es',
      category: 'MARKETING',
      status: 'REJECTED',
      rejected_reason: 'PROMOTIONAL',
      components: [{ type: 'BODY', text: 'Hola' }],
    });

    const sincronizada = await syncTemplate(tenantId, creada.id);

    expect(metaTemplateClient.get).toHaveBeenCalledWith('meta-s', 'token');
    expect(sincronizada.motivoRechazo?.codigo).toBe('PROMOTIONAL');
  });
});

describe('Envío con imagen por defecto o de reemplazo (criterios 8, 10-13)', () => {
  it('sin reemplazo usa la imagen por defecto y la sube a Meta UNA vez para todos los envíos', async () => {
    const tenantId = new Types.ObjectId();
    await crearIntegracion(tenantId);
    const templateId = await crearPlantillaConImagen(tenantId);

    const primero = await buildTemplatePayload(tenantId, templateId, ['Ana']);
    const segundo = await buildTemplatePayload(tenantId, templateId, ['Luis']);

    expect(mockSubir).toHaveBeenCalledTimes(1);
    expect(primero.components[0]).toEqual({
      type: 'header',
      parameters: [{ type: 'image', image: { id: 'meta-media-1' } }],
    });
    expect(segundo.components[0]).toEqual(primero.components[0]);
    const tpl = await leerPlantilla(tenantId, templateId);
    expect(tpl.imagenDefecto?.metaMediaId).toBe('meta-media-1');
  });

  it('una plantilla PENDING no se puede usar en envíos (422)', async () => {
    const tenantId = new Types.ObjectId();
    await crearIntegracion(tenantId);
    vi.mocked(metaTemplateClient.create).mockResolvedValueOnce({ id: 'meta-p', status: 'PENDING' });
    const { id } = await createTemplate(tenantId, {
      name: 'p',
      language: 'es',
      category: 'UTILITY',
      cuerpo: 'Hola',
      ejemplos: [],
    });

    await expect(buildTemplatePayload(tenantId, id, [])).rejects.toMatchObject({ statusCode: 422 });
  });

  it('plantilla de imagen sin imagen por defecto ni reemplazo → 422', async () => {
    const tenantId = new Types.ObjectId();
    const tpl = await createScoped(WhatsAppTemplate, tenantId, {
      metaTemplateId: 'meta-bm',
      name: 'desde_bm',
      language: 'es',
      category: 'MARKETING',
      status: 'APPROVED',
      components: [{ type: 'HEADER', format: 'IMAGE' }, { type: 'BODY', text: 'Hola' }],
      parametrosBody: 0,
    });

    await expect(buildTemplatePayload(tenantId, tpl._id.toString(), [])).rejects.toMatchObject({
      statusCode: 422,
    });
  });

  it('dos campañas sobre la misma plantilla: una con la imagen por defecto y otra con reemplazo, sin pisarse', async () => {
    const tenantId = new Types.ObjectId();
    await crearIntegracion(tenantId);
    const templateId = await crearPlantillaConImagen(tenantId);
    await createScoped(Cliente, tenantId, {
      metaUserId: 'meta-1',
      telefono: '573001111111',
      nombre: 'Ana',
      canalOrigen: 'whatsapp',
      estadoComercial: 'nuevo',
      rolContacto: 'estudiante',
    });
    const base = {
      filtros: { rolContacto: ['estudiante'] },
      templateId,
      parametros: ['Ana'],
    };

    const porDefecto = await createCampaign(tenantId, actorId, { ...base, nombre: 'Por defecto' });
    const { uploadId } = await subirImagenReemplazo(tenantId, {
      ...PNG,
      buffer: Buffer.from('otra-imagen'),
    });
    const conReemplazo = await createCampaign(tenantId, actorId, {
      ...base,
      nombre: 'Con reemplazo',
      imagenHeaderUploadId: uploadId,
    });

    expect(porDefecto.imagen).toBeNull();
    expect(conReemplazo.imagen).not.toBeNull();

    const imagenA = await prepararImagenCabecera(tenantId, await leerCampana(tenantId, porDefecto.id));
    const imagenB = await prepararImagenCabecera(
      tenantId,
      await leerCampana(tenantId, conReemplazo.id),
    );

    expect(imagenA?.metaMediaId).toBe('meta-media-1');
    expect(imagenB?.metaMediaId).toBe('meta-media-2');
    // El reemplazo vive en la campaña: la plantilla conserva su imagen y su id de Meta.
    const tpl = await leerPlantilla(tenantId, templateId);
    expect(tpl.imagenDefecto?.metaMediaId).toBe('meta-media-1');
    expect((await leerCampana(tenantId, conReemplazo.id)).contenido.imagen?.metaMediaId).toBe(
      'meta-media-2',
    );
    // La misma subida no sirve para una segunda campaña.
    await expect(
      createCampaign(tenantId, actorId, { ...base, nombre: 'Tercera', imagenHeaderUploadId: uploadId }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('el envío desde la conversación acepta una imagen de reemplazo sin tocar la plantilla', async () => {
    const tenantId = new Types.ObjectId();
    await crearIntegracion(tenantId);
    const templateId = await crearPlantillaConImagen(tenantId);
    const cliente = await createScoped(Cliente, tenantId, {
      metaUserId: 'meta-2',
      telefono: '573002222222',
      nombre: 'Luis',
      canalOrigen: 'whatsapp',
      estadoComercial: 'nuevo',
    });
    const { uploadId } = await subirImagenReemplazo(tenantId, PNG);

    await sendOutbound(tenantId, cliente._id.toString(), {
      modo: 'plantilla',
      templateId,
      parametros: ['Luis'],
      imagenHeaderUploadId: uploadId,
    });

    const components = mockSendTemplate.mock.calls[0]![3] as unknown[];
    expect(components[0]).toEqual({
      type: 'header',
      parameters: [{ type: 'image', image: { id: 'meta-media-1' } }],
    });
    expect((await leerPlantilla(tenantId, templateId)).imagenDefecto?.metaMediaId).toBeNull();
  });
});

describe('Aislamiento multi-tenant (criterio 17)', () => {
  it('B no consume la subida de A, no ve su plantilla ni su imagen, y un evento de A no toca a B', async () => {
    const tenantA = new Types.ObjectId();
    const tenantB = new Types.ObjectId();
    await crearIntegracion(tenantA, 'waba-a');
    await crearIntegracion(tenantB, 'waba-b');
    const templateA = await crearPlantillaConImagen(tenantA);
    const subidaA = await subirImagenReemplazo(tenantA, PNG);

    await expect(getTemplate(tenantB, templateA)).rejects.toMatchObject({ statusCode: 404 });
    await expect(syncTemplate(tenantB, templateA)).rejects.toMatchObject({ statusCode: 404 });
    await expect(resolverImagenPlantilla(tenantB, templateA)).rejects.toMatchObject({
      statusCode: 404,
    });

    vi.mocked(metaTemplateClient.create).mockResolvedValueOnce({ id: 'meta-b', status: 'PENDING' });
    await expect(
      createTemplate(tenantB, {
        name: 'robada',
        language: 'es',
        category: 'MARKETING',
        cuerpo: 'Hola',
        ejemplos: [],
        cabecera: { formato: 'IMAGE', uploadId: subidaA.uploadId },
      }),
    ).rejects.toMatchObject({ statusCode: 404 });
    // La subida de A sigue intacta para A.
    expect((await MediaUpload.findById(subidaA.uploadId).lean())?.usadaAt).toBeNull();

    // Un evento del webhook resuelto a B con el id de Meta de A no encuentra nada.
    await expect(aplicarEstadoPlantilla(tenantB, 'meta-promo', 'REJECTED', 'SCAM')).resolves.toBeNull();
    expect((await getTemplate(tenantA, templateA)).status).toBe('APPROVED');
  });
});

describe('URL firmada de la imagen por defecto (criterios 9 y 17)', () => {
  it('un token de campaña o de otro tenant no sirve para la imagen de una plantilla', async () => {
    const { firmarUrlMedia, verificarTokenMedia, recursoImagenCampana, recursoImagenPlantilla } =
      await import('../media/media.token.js');
    const tenantA = new Types.ObjectId().toString();
    const id = new Types.ObjectId().toString();

    const tokenPlantilla = firmarUrlMedia(tenantA, recursoImagenPlantilla(id));
    const tokenCampana = firmarUrlMedia(tenantA, recursoImagenCampana(id));

    expect(verificarTokenMedia(tokenPlantilla, recursoImagenPlantilla(id)).tenantId).toBe(tenantA);
    expect(() => verificarTokenMedia(tokenCampana, recursoImagenPlantilla(id))).toThrow();
    // Cambiar el tenant del token invalida la firma.
    const [, exp, firma] = tokenPlantilla.split('.');
    const falsificado = `${new Types.ObjectId().toString()}.${exp}.${firma}`;
    expect(() => verificarTokenMedia(falsificado, recursoImagenPlantilla(id))).toThrow();
  });
});
