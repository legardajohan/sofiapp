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
