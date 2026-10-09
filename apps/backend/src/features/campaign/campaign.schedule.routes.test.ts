/**
 * HU-MARK-03 — `POST /api/campaigns/schedule`, `PATCH /api/campaigns/:id/schedule` y la ruta
 * firmada de la imagen, a nivel HTTP. Aquí se ejercita lo que el test de servicio no ve: multer, los
 * campos JSON del multipart pasando por Zod y la cadena de middlewares.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { Readable } from 'node:stream';
import { Types } from 'mongoose';

vi.mock('../../config/queues.js', () => ({
  KB_INDEX_QUEUE_NAME: 'kb-index',
  KB_INDEX_JOB_NAME: 'index-document',
  INBOUND_QUEUE_NAME: 'inbound-messages',
  CAMPAIGN_QUEUE_NAME: 'campaign-broadcast',
  CAMPAIGN_BATCH_JOB: 'batch',
  CAMPAIGN_START_JOB: 'start-scheduled',
  CAMPAIGN_SCHEDULED_START_JOB: 'start-exact',
  CAMPAIGN_SWEEP_SCHEDULER_ID: 'campaign-sweep',
  inboundQueue: { add: vi.fn() },
  kbIndexQueue: { add: vi.fn().mockResolvedValue(undefined) },
  campaignQueue: { add: vi.fn().mockResolvedValue(undefined) },
}));

import app from '../../app.js';
import { createScoped } from '../../repositories/base.repository.js';
import { WhatsAppTemplate } from '../whatsapp-template/whatsapp-template.model.js';
import { setMediaStorageForTests, type IMediaStorage } from '../../integrations/storage/index.js';
import { firmarUrlMedia } from '../media/media.token.js';
import { Campaign } from './campaign.model.js';

const SECRET = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const CSRF = 'test-csrf-token';
const PNG = Buffer.from('png-falso');

const objetos = new Map<string, Buffer>();
const storage = {
  driver: 'local' as const,
  guardar: vi.fn(async ({ key, contenido, mimeType }: { key: string; contenido: Buffer; mimeType: string }) => {
    objetos.set(key, contenido);
    return { key, mimeType, tamanoBytes: contenido.byteLength };
  }),
  leer: vi.fn(async (key: string) => ({
    stream: Readable.from(objetos.get(key) ?? Buffer.alloc(0)),
    mimeType: 'image/png',
    tamanoBytes: objetos.get(key)?.byteLength ?? 0,
  })),
  urlFirmada: vi.fn(async () => null),
  eliminar: vi.fn(async () => undefined),
};

function token(tenantId: string): string {
  return jwt.sign(
    { sub: '507f1f77bcf86cd799439012', tenantId, email: 'u@e.com', nombre: 'U', rol: 'admin', activo: true },
    SECRET,
    { expiresIn: '1h' },
  );
}

function auth(req: request.Test, tenantId: string): request.Test {
  return req
    .set('Cookie', [`token=${token(tenantId)}`, `csrfToken=${CSRF}`])
    .set('X-CSRF-Token', CSRF);
}

function enUnaHora(): string {
  return new Date(Date.now() + 3_600_000).toISOString();
}

describe('HU-MARK-03 — contrato HTTP del programador de campañas', () => {
  const tenantId = new Types.ObjectId();
  let templateId: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    objetos.clear();
    setMediaStorageForTests(storage as unknown as IMediaStorage);
    await Promise.all([Campaign.deleteMany({}), WhatsAppTemplate.deleteMany({})]);

    const plantilla = await createScoped(WhatsAppTemplate, tenantId, {
      metaTemplateId: 'meta-img',
      name: 'seguimiento_img',
      language: 'es',
      category: 'MARKETING',
      status: 'APPROVED',
      components: [
        { type: 'HEADER', format: 'IMAGE' },
        { type: 'BODY', text: 'Hola, {{1}}' },
      ],
      parametrosBody: 1,
    });
    templateId = plantilla._id.toString();
  });

  function programar(campos: Record<string, string>, imagen: Buffer | null = PNG): request.Test {
    let req = auth(request(app).post('/api/campaigns/schedule'), tenantId.toString());
    for (const [k, v] of Object.entries(campos)) req = req.field(k, v);
    if (imagen) req = req.attach('imagen', imagen, { filename: 'promo.png', contentType: 'image/png' });
    return req;
  }

  const camposValidos = (): Record<string, string> => ({
    nombre: 'Seguimiento',
    filtros: JSON.stringify({ rolContacto: ['estudiante'] }),
    templateId,
    parametros: JSON.stringify(['te esperamos']),
    programadaPara: enUnaHora(),
  });

  it('multipart válido → 201 `programada` con imagen', async () => {
    const res = await programar(camposValidos());

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      estado: 'programada',
      filtros: { rolContacto: ['estudiante'] },
      parametros: ['te esperamos'],
      imagen: { mimeType: 'image/png' },
    });
  });

  it('`filtros` con JSON roto → 400 de validación, no 500', async () => {
    const res = await programar({ ...camposValidos(), filtros: '{roto' });
    expect(res.status).toBe(400);
    expect(res.body.errors.map((e: { path: string }) => e.path)).toContain('body.filtros');
  });

  it('`programadaPara` a menos de un minuto → 400', async () => {
    const res = await programar({
      ...camposValidos(),
      programadaPara: new Date(Date.now() + 10_000).toISOString(),
    });
    expect(res.status).toBe(400);
  });

  it('imagen de más de 5 MB → 413', async () => {
    const res = await programar(camposValidos(), Buffer.alloc(5 * 1024 * 1024 + 1));
    expect(res.status).toBe(413);
  });

  it('campo desconocido → 400 (`.strict()`)', async () => {
    const res = await programar({ ...camposValidos(), tenantId: new Types.ObjectId().toString() });
    expect(res.status).toBe(400);
  });

  it('PATCH /:id/schedule reprograma la hora', async () => {
    const creada = await programar(camposValidos());
    const nueva = new Date(Date.now() + 7_200_000).toISOString();

    const res = await auth(
      request(app).patch(`/api/campaigns/${creada.body.id as string}/schedule`),
      tenantId.toString(),
    ).field('programadaPara', nueva);

    expect(res.status).toBe(200);
    expect(res.body.programadaPara).toBe(nueva);
  });

  describe('ruta firmada de la imagen', () => {
    it('con el token de la campaña sirve los bytes de la imagen', async () => {
      const creada = await programar(camposValidos());

      const res = await request(app).get(`/api${creada.body.imagen.url as string}`);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toBe('image/png');
      expect(Buffer.from(res.body as Buffer).toString()).toBe('png-falso');
    });

    it('un token de mensaje (mismo id, otro recurso) no sirve → 403', async () => {
      const creada = await programar(camposValidos());
      const id = creada.body.id as string;
      const tokenDeMensaje = firmarUrlMedia(tenantId.toString(), id);

      const res = await request(app).get(`/api/media/campaigns/${id}/imagen?t=${tokenDeMensaje}`);

      expect(res.status).toBe(403);
    });
  });
});
