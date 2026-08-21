import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { Types } from 'mongoose';

// Mock de la cola BullMQ: evita conexión a Redis al importar app.
vi.mock('../../config/queues.js', () => ({
  KB_INDEX_QUEUE_NAME: 'kb-index',
  KB_INDEX_JOB_NAME: 'index-document',
  INBOUND_QUEUE_NAME: 'inbound-messages',
  inboundQueue: { add: vi.fn() },
  kbIndexQueue: { add: vi.fn().mockResolvedValue(undefined) },
}));

import app from '../../app.js';
import { createDocument } from './kb.service.js';
import { createScoped } from '../../repositories/base.repository.js';
import { KbDocument } from './kb-document.model.js';
import type { KbEstructura } from './kb.types.js';

const SECRET = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const CSRF = 'test-csrf-token';

const makeToken = (tenantId: string | null, rol: string, subrol?: string) =>
  jwt.sign(
    { sub: '507f1f77bcf86cd799439012', tenantId, email: 'u@e.com', nombre: 'U', rol, subrol, activo: true },
    SECRET,
    { expiresIn: '1h' },
  );

describe('GET /api/kb/documents', () => {
  it('sin JWT → 401', async () => {
    const res = await request(app).get('/api/kb/documents');
    expect(res.status).toBe(401);
  });

  it('rol superadmin (no admin) → 403', async () => {
    const token = makeToken(new Types.ObjectId().toString(), 'superadmin');
    const res = await request(app).get('/api/kb/documents').set('Cookie', `token=${token}`);
    expect(res.status).toBe(403);
  });

  it('admin → 200 y solo ve los documentos de su tenant', async () => {
    const tenantA = new Types.ObjectId();
    const tenantB = new Types.ObjectId();
    await createDocument(tenantA, { titulo: 'Solo A', contenido: 'contenido de A' });

    const tokenB = makeToken(tenantB.toString(), 'admin');
    const resB = await request(app).get('/api/kb/documents').set('Cookie', `token=${tokenB}`);
    expect(resB.status).toBe(200);
    expect(resB.body.total).toBe(0);

    const tokenA = makeToken(tenantA.toString(), 'admin');
    const resA = await request(app).get('/api/kb/documents').set('Cookie', `token=${tokenA}`);
    expect(resA.status).toBe(200);
    expect(resA.body.total).toBe(1);
    expect(resA.body.data[0].titulo).toBe('Solo A');
  });

  it('admin con subrol → 200 (el subrol es metadata y no altera la autorización)', async () => {
    const tenantId = new Types.ObjectId();
    const token = makeToken(tenantId.toString(), 'admin', 'coordinator');
    const res = await request(app).get('/api/kb/documents').set('Cookie', `token=${token}`);
    expect(res.status).toBe(200);
  });
});

describe('POST /api/kb/documents', () => {
  it('admin con datos válidos → 201 y estado pendiente', async () => {
    const token = makeToken(new Types.ObjectId().toString(), 'admin');
    const res = await request(app)
      .post('/api/kb/documents')
      .set('Cookie', [`token=${token}`, `csrfToken=${CSRF}`])
      .set('X-CSRF-Token', CSRF)
      .send({ titulo: 'Nueva base', contenido: 'Información pertinente para entrenar la IA.' });

    expect(res.status).toBe(201);
    expect(res.body.estadoIndexacion).toBe('pendiente');
    expect(res.body.version).toBe(1);
    expect(res.body.id).toBeDefined();
  });

  it('contenido vacío → 400', async () => {
    const token = makeToken(new Types.ObjectId().toString(), 'admin');
    const res = await request(app)
      .post('/api/kb/documents')
      .set('Cookie', [`token=${token}`, `csrfToken=${CSRF}`])
      .set('X-CSRF-Token', CSRF)
      .send({ titulo: 'X', contenido: '' });

    expect(res.status).toBe(400);
  });
});

describe('PATCH /api/kb/documents/:id', () => {
  it('admin edita el contenido de su documento → 200 y versión incrementada', async () => {
    const tenantId = new Types.ObjectId();
    const doc = await createDocument(tenantId, { titulo: 'Editable', contenido: 'v1' });
    const token = makeToken(tenantId.toString(), 'admin');

    const res = await request(app)
      .patch(`/api/kb/documents/${doc.id}`)
      .set('Cookie', [`token=${token}`, `csrfToken=${CSRF}`])
      .set('X-CSRF-Token', CSRF)
      .send({ contenido: 'contenido corregido' });

    expect(res.status).toBe(200);
    expect(res.body.version).toBe(2);
    expect(res.body.estadoIndexacion).toBe('pendiente');
    expect(res.body.contenido).toBe('contenido corregido');
  });

  it('primer llenado de un preset vacío → 200 y versión 1 (no incrementa)', async () => {
    const tenantId = new Types.ObjectId();
    const preset = await createScoped(KbDocument, tenantId, {
      titulo: 'Información de la empresa',
      contenido: '',
      isPreset: true,
      obligatorio: true,
      version: 1,
      estadoIndexacion: 'pendiente',
      chunkCount: 0,
    });
    const token = makeToken(tenantId.toString(), 'admin');

    const res = await request(app)
      .patch(`/api/kb/documents/${preset._id.toString()}`)
      .set('Cookie', [`token=${token}`, `csrfToken=${CSRF}`])
      .set('X-CSRF-Token', CSRF)
      .send({ contenido: 'Somos una empresa de ejemplo.' });

    expect(res.status).toBe(200);
    expect(res.body.version).toBe(1);
    expect(res.body.estadoIndexacion).toBe('pendiente');
    expect(res.body.contenido).toBe('Somos una empresa de ejemplo.');
  });

  it('guardar el mismo contenido → 200 sin subir de versión (HU-KB-06)', async () => {
    const tenantId = new Types.ObjectId();
    const doc = await createDocument(tenantId, { titulo: 'Estable', contenido: 'texto estable' });
    const token = makeToken(tenantId.toString(), 'admin');

    const res = await request(app)
      .patch(`/api/kb/documents/${doc.id}`)
      .set('Cookie', [`token=${token}`, `csrfToken=${CSRF}`])
      .set('X-CSRF-Token', CSRF)
      .send({ contenido: 'texto estable' });

    expect(res.status).toBe(200);
    expect(res.body.version).toBe(doc.version);
    expect(res.body.updatedAt).toBe(doc.updatedAt);
  });

  it('documento de otro tenant → 404', async () => {
    const tenantA = new Types.ObjectId();
    const tenantB = new Types.ObjectId();
    const doc = await createDocument(tenantA, { titulo: 'Solo A', contenido: 'v1' });
    const tokenB = makeToken(tenantB.toString(), 'admin');

    const res = await request(app)
      .patch(`/api/kb/documents/${doc.id}`)
      .set('Cookie', [`token=${tokenB}`, `csrfToken=${CSRF}`])
      .set('X-CSRF-Token', CSRF)
      .send({ contenido: 'hackeado' });

    expect(res.status).toBe(404);
  });

  it('contenido que excede 10.000 caracteres → 400, y 10.000 exactos → 200 (HU-KB-07)', async () => {
    const tenantId = new Types.ObjectId();
    const doc = await createDocument(tenantId, { titulo: 'Largo', contenido: 'v1' });
    const token = makeToken(tenantId.toString(), 'admin');
    const patch = (contenido: string) =>
      request(app)
        .patch(`/api/kb/documents/${doc.id}`)
        .set('Cookie', [`token=${token}`, `csrfToken=${CSRF}`])
        .set('X-CSRF-Token', CSRF)
        .send({ contenido });

    expect((await patch('a'.repeat(10_001))).status).toBe(400);
    // El tope viejo (3.000) ya no rechaza: lo subió HU-KB-07 porque el texto es la suma de campos.
    expect((await patch('a'.repeat(10_000))).status).toBe(200);
  });

  it('id con formato inválido → 400', async () => {
    const token = makeToken(new Types.ObjectId().toString(), 'admin');
    const res = await request(app)
      .patch('/api/kb/documents/no-es-un-objectid')
      .set('Cookie', [`token=${token}`, `csrfToken=${CSRF}`])
      .set('X-CSRF-Token', CSRF)
      .send({ contenido: 'texto' });

    expect(res.status).toBe(400);
  });

  it('rol superadmin (no admin) → 403', async () => {
    const tenantId = new Types.ObjectId();
    const doc = await createDocument(tenantId, { titulo: 'Protegido', contenido: 'v1' });
    const token = makeToken(tenantId.toString(), 'superadmin');

    const res = await request(app)
      .patch(`/api/kb/documents/${doc.id}`)
      .set('Cookie', [`token=${token}`, `csrfToken=${CSRF}`])
      .set('X-CSRF-Token', CSRF)
      .send({ contenido: 'texto' });

    expect(res.status).toBe(403);
  });
});

describe('DELETE /api/kb/documents/:id', () => {
  it('admin borra un documento de su propio tenant → 200', async () => {
    const tenantId = new Types.ObjectId();
    const doc = await createDocument(tenantId, { titulo: 'Borrable', contenido: 'contenido' });
    const token = makeToken(tenantId.toString(), 'admin');

    const res = await request(app)
      .delete(`/api/kb/documents/${doc.id}`)
      .set('Cookie', [`token=${token}`, `csrfToken=${CSRF}`])
      .set('X-CSRF-Token', CSRF);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ deleted: true });
  });

  it('documento obligatorio → 400, aunque la UI ya esconda el botón (HU-KB-06)', async () => {
    const tenantId = new Types.ObjectId();
    const obligatorio = await createScoped(KbDocument, tenantId, {
      titulo: 'Información de la empresa',
      contenido: 'misión y visión',
      isPreset: true,
      obligatorio: true,
      version: 1,
      estadoIndexacion: 'pendiente',
      chunkCount: 0,
    });
    const token = makeToken(tenantId.toString(), 'admin');

    const res = await request(app)
      .delete(`/api/kb/documents/${obligatorio._id.toString()}`)
      .set('Cookie', [`token=${token}`, `csrfToken=${CSRF}`])
      .set('X-CSRF-Token', CSRF);

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('obligatorio');
  });

  it('documento de otro tenant → 404 (no se filtra existencia entre tenants)', async () => {
    const tenantA = new Types.ObjectId();
    const tenantB = new Types.ObjectId();
    const doc = await createDocument(tenantA, { titulo: 'Solo A', contenido: 'contenido' });
    const tokenB = makeToken(tenantB.toString(), 'admin');

    const res = await request(app)
      .delete(`/api/kb/documents/${doc.id}`)
      .set('Cookie', [`token=${tokenB}`, `csrfToken=${CSRF}`])
      .set('X-CSRF-Token', CSRF);

    expect(res.status).toBe(404);
  });

  it('id con formato inválido → 400', async () => {
    const token = makeToken(new Types.ObjectId().toString(), 'admin');
    const res = await request(app)
      .delete('/api/kb/documents/no-es-un-objectid')
      .set('Cookie', [`token=${token}`, `csrfToken=${CSRF}`])
      .set('X-CSRF-Token', CSRF);

    expect(res.status).toBe(400);
  });

  it('rol superadmin (no admin) → 403', async () => {
    const tenantId = new Types.ObjectId();
    const doc = await createDocument(tenantId, { titulo: 'Protegido', contenido: 'contenido' });
    const token = makeToken(tenantId.toString(), 'superadmin');

    const res = await request(app)
      .delete(`/api/kb/documents/${doc.id}`)
      .set('Cookie', [`token=${token}`, `csrfToken=${CSRF}`])
      .set('X-CSRF-Token', CSRF);

    expect(res.status).toBe(403);
  });
});

describe('estructura en el borde HTTP (HU-KB-07)', () => {
  const estructura: KbEstructura = {
    schemaVersion: 1,
    schemaId: 'generico',
    campos: { nombre: { tipo: 'texto', valor: 'Acme' } },
    adicional: 'Notas',
  };

  const post = (token: string, body: Record<string, unknown>) =>
    request(app)
      .post('/api/kb/documents')
      .set('Cookie', [`token=${token}`, `csrfToken=${CSRF}`])
      .set('X-CSRF-Token', CSRF)
      .send(body);

  it('POST con estructura → 201, la devuelve y el GET la lista', async () => {
    const tenantId = new Types.ObjectId();
    const token = makeToken(tenantId.toString(), 'admin');

    const res = await post(token, { titulo: 'Empresa', contenido: 'Nombre: Acme', estructura });
    expect(res.status).toBe(201);
    expect(res.body.estructura).toEqual(estructura);

    const lista = await request(app).get('/api/kb/documents').set('Cookie', `token=${token}`);
    expect(lista.body.data[0].estructura).toEqual(estructura);
  });

  it('PATCH con estructura → 200 y la devuelve', async () => {
    const tenantId = new Types.ObjectId();
    const doc = await createDocument(tenantId, { titulo: 'Empresa', contenido: 'v1' });
    const token = makeToken(tenantId.toString(), 'admin');

    const res = await request(app)
      .patch(`/api/kb/documents/${doc.id}`)
      .set('Cookie', [`token=${token}`, `csrfToken=${CSRF}`])
      .set('X-CSRF-Token', CSRF)
      .send({ contenido: 'Nombre: Acme', estructura });

    expect(res.status).toBe(200);
    expect(res.body.estructura).toEqual(estructura);
  });

  it('sobre inválido → 400 (falta `adicional`, y `schemaVersion: 0`)', async () => {
    const tenantId = new Types.ObjectId();
    const token = makeToken(tenantId.toString(), 'admin');

    const sinAdicional = await post(token, {
      titulo: 'A',
      contenido: 'x',
      estructura: { schemaVersion: 1, schemaId: 'generico', campos: {} },
    });
    expect(sinAdicional.status).toBe(400);

    const versionCero = await post(token, {
      titulo: 'B',
      contenido: 'x',
      estructura: { ...estructura, schemaVersion: 0 },
    });
    expect(versionCero.status).toBe(400);
  });

  it('estructura que supera el tope de tamaño → 400', async () => {
    const tenantId = new Types.ObjectId();
    const token = makeToken(tenantId.toString(), 'admin');

    const gorda = {
      ...estructura,
      campos: Object.fromEntries(
        Array.from({ length: 400 }, (_, i) => [`campo${i}`, { tipo: 'texto', valor: 'x'.repeat(100) }]),
      ),
    };

    const res = await post(token, { titulo: 'Gorda', contenido: 'x', estructura: gorda });
    expect(res.status).toBe(400);
  });

  it('un documento sin estructura recorre create/list/update igual que antes', async () => {
    const tenantId = new Types.ObjectId();
    const token = makeToken(tenantId.toString(), 'admin');

    const creado = await post(token, { titulo: 'Libre', contenido: 'Texto suelto' });
    expect(creado.status).toBe(201);
    expect(creado.body.estructura).toBeUndefined();

    const editado = await request(app)
      .patch(`/api/kb/documents/${creado.body.id}`)
      .set('Cookie', [`token=${token}`, `csrfToken=${CSRF}`])
      .set('X-CSRF-Token', CSRF)
      .send({ contenido: 'Texto corregido' });

    expect(editado.status).toBe(200);
    expect(editado.body.version).toBe(2);
    expect(editado.body.estructura).toBeUndefined();
  });

  it('cross-tenant: PATCH con estructura sobre un documento ajeno → 404 y no lo toca', async () => {
    const tenantA = new Types.ObjectId();
    const tenantB = new Types.ObjectId();
    const doc = await createDocument(tenantA, {
      titulo: 'Solo A',
      contenido: 'Nombre: Acme',
      estructura,
    });
    const tokenB = makeToken(tenantB.toString(), 'admin');

    const res = await request(app)
      .patch(`/api/kb/documents/${doc.id}`)
      .set('Cookie', [`token=${tokenB}`, `csrfToken=${CSRF}`])
      .set('X-CSRF-Token', CSRF)
      .send({ contenido: 'hackeado', estructura: { ...estructura, adicional: 'hackeado' } });

    expect(res.status).toBe(404);

    const saved = await KbDocument.findById(doc.id).lean<{ estructura?: unknown }>();
    expect(saved?.estructura).toEqual(estructura);
  });
});
