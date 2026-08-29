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
