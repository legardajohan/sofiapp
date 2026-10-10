import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { Types } from 'mongoose';

// Mock de las colas BullMQ: evita conexión a Redis al importar `app`.
vi.mock('../../config/queues.js', () => ({
  KB_INDEX_QUEUE_NAME: 'kb-index',
  KB_INDEX_JOB_NAME: 'index-document',
  INBOUND_QUEUE_NAME: 'inbound-messages',
  inboundQueue: { add: vi.fn() },
  kbIndexQueue: { add: vi.fn().mockResolvedValue(undefined) },
}));

import app from '../../app.js';
import { createScoped } from '../../repositories/base.repository.js';
import { WhatsAppTemplate } from './whatsapp-template.model.js';

const SECRET = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const CSRF = 'test-csrf-token';

function makeToken(tenantId: string | null, rol: string): string {
  return jwt.sign(
    { sub: '507f1f77bcf86cd799439012', tenantId, email: 'u@e.com', nombre: 'U', rol, activo: true },
    SECRET,
    { expiresIn: '1h' },
  );
}

describe('GET /api/templates — cadena de middlewares y contrato HTTP', () => {
  it('sin sesión → 401', async () => {
    const res = await request(app).get('/api/templates');
    expect(res.status).toBe(401);
  });

  it('con rol distinto de admin → 403', async () => {
    const res = await request(app)
      .get('/api/templates')
      .set('Cookie', `token=${makeToken(new Types.ObjectId().toString(), 'superadmin')}`);
    expect(res.status).toBe(403);
  });

  it('admin → 200, paginado, devuelve { data, page, limit, total }', async () => {
    const tenantId = new Types.ObjectId();
    await createScoped(WhatsAppTemplate, tenantId, {
      metaTemplateId: 'meta-1',
      name: 'bienvenida',
      language: 'es',
      category: 'UTILITY',
      status: 'APPROVED',
      components: [{ type: 'BODY', text: 'Hola' }],
      parametrosBody: 0,
      syncedAt: new Date(),
      obsoleta: false,
    });

    const res = await request(app)
      .get('/api/templates')
      .set('Cookie', `token=${makeToken(tenantId.toString(), 'admin')}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ page: 1, limit: 20, total: 1 });
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].name).toBe('bienvenida');
  });
});

describe('POST /api/messages/template — guard CSRF', () => {
  it('sin X-CSRF-Token → 403 antes de llegar a autenticar', async () => {
    const res = await request(app).post('/api/messages/template').send({});
    expect(res.status).toBe(403);
  });

  it('con CSRF pero sin JWT → 401', async () => {
    const res = await request(app)
      .post('/api/messages/template')
      .set('Cookie', `csrfToken=${CSRF}`)
      .set('X-CSRF-Token', CSRF)
      .send({});
    expect(res.status).toBe(401);
  });
});

// ─── HT-WA-04 — imagen de cabecera ─────────────────────────────────────────────

function conSesion(req: request.Test, tenantId: string, rol = 'admin'): request.Test {
  return req
    .set('Cookie', [`token=${makeToken(tenantId, rol)}`, `csrfToken=${CSRF}`])
    .set('X-CSRF-Token', CSRF);
}

describe('POST /api/templates/media — imagen de muestra (HT-WA-04)', () => {
  it('rol distinto de admin → 403', async () => {
    const res = await conSesion(
      request(app).post('/api/templates/media'),
      new Types.ObjectId().toString(),
      'asesor',
    ).attach('imagen', Buffer.from('png'), { filename: 'a.png', contentType: 'image/png' });
    expect(res.status).toBe(403);
  });

  it('un GIF → 415 con mensaje legible, antes de llamar a Meta', async () => {
    const res = await conSesion(
      request(app).post('/api/templates/media'),
      new Types.ObjectId().toString(),
    ).attach('imagen', Buffer.from('gif'), { filename: 'a.gif', contentType: 'image/gif' });
    expect(res.status).toBe(415);
    expect(res.body.message).toBe('La imagen debe ser JPG o PNG.');
  });

  it('más de 5 MB → 413 (lo corta multer)', async () => {
    const res = await conSesion(
      request(app).post('/api/templates/media'),
      new Types.ObjectId().toString(),
    ).attach('imagen', Buffer.alloc(5 * 1024 * 1024 + 1), {
      filename: 'grande.png',
      contentType: 'image/png',
    });
    expect(res.status).toBe(413);
  });

  it('sin archivo → 400', async () => {
    const res = await conSesion(
      request(app).post('/api/templates/media'),
      new Types.ObjectId().toString(),
    ).send();
    expect(res.status).toBe(400);
  });
});

describe('POST /api/templates — cabecera de imagen (HT-WA-04)', () => {
  it('AUTHENTICATION con imagen → 400 en el borde', async () => {
    const res = await conSesion(request(app).post('/api/templates'), new Types.ObjectId().toString())
      .send({
        name: 'codigo',
        language: 'es',
        category: 'AUTHENTICATION',
        cuerpo: 'Tu código es {{1}}',
        ejemplos: ['1234'],
        cabecera: { formato: 'IMAGE', uploadId: new Types.ObjectId().toString() },
      });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/templates/:id (HT-WA-04)', () => {
  it('la plantilla de otro tenant → 404', async () => {
    const tenantA = new Types.ObjectId();
    const doc = await createScoped(WhatsAppTemplate, tenantA, {
      metaTemplateId: 'meta-a',
      name: 'de_a',
      language: 'es',
      category: 'UTILITY',
      status: 'APPROVED',
      components: [{ type: 'BODY', text: 'Hola' }],
      parametrosBody: 0,
    });

    const propia = await request(app)
      .get(`/api/templates/${doc._id.toString()}`)
      .set('Cookie', `token=${makeToken(tenantA.toString(), 'admin')}`);
    const ajena = await request(app)
      .get(`/api/templates/${doc._id.toString()}`)
      .set('Cookie', `token=${makeToken(new Types.ObjectId().toString(), 'admin')}`);

    expect(propia.status).toBe(200);
    expect(propia.body).toMatchObject({ name: 'de_a', imagen: null, motivoRechazo: null });
    expect(ajena.status).toBe(404);
  });
});

describe('POST /api/messages/template — imagenHeaderUploadId (HT-WA-04)', () => {
  it('un uploadId mal formado → 400 en el borde', async () => {
    const res = await conSesion(request(app).post('/api/messages/template'), new Types.ObjectId().toString())
      .send({
        clienteId: new Types.ObjectId().toString(),
        templateId: new Types.ObjectId().toString(),
        parametros: [],
        imagenHeaderUploadId: 'no-es-un-id',
      });
    expect(res.status).toBe(400);
  });

  it('un uploadId bien formado pasa la validación (la plantilla inexistente da 404 después)', async () => {
    const res = await conSesion(request(app).post('/api/messages/template'), new Types.ObjectId().toString())
      .send({
        clienteId: new Types.ObjectId().toString(),
        templateId: new Types.ObjectId().toString(),
        parametros: [],
        imagenHeaderUploadId: new Types.ObjectId().toString(),
      });
    expect(res.status).not.toBe(400);
  });
});
