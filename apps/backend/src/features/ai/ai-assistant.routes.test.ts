import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { Types } from 'mongoose';

// Mock de las colas BullMQ: evita conexión a Redis al importar `app`.
vi.mock('../../config/queues.js', () => ({
  KB_INDEX_QUEUE_NAME: 'kb-index',
  KB_INDEX_JOB_NAME: 'index-document',
  INBOUND_QUEUE_NAME: 'inbound-messages',
  AI_REPLY_QUEUE_NAME: 'ai-reply',
  AI_REPLY_JOB_NAME: 'auto-reply',
  inboundQueue: { add: vi.fn() },
  kbIndexQueue: { add: vi.fn().mockResolvedValue(undefined) },
  aiReplyQueue: { add: vi.fn().mockResolvedValue(undefined) },
}));

// `POST /answer` no debe salir a Gemini: se sustituye el singleton por un doble.
const { mockChat } = vi.hoisted(() => ({ mockChat: vi.fn() }));
vi.mock('../../services/ai/ai-service.singleton.js', () => ({
  getAIService: () => ({ chat: mockChat }),
}));

import app from '../../app.js';
import { PromptTemplateModel } from '../../services/ai/prompt-template.model.js';

const SECRET = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const ACTOR = '507f1f77bcf86cd799439012';
const CSRF = 'test-csrf-token';

function makeToken(tenantId: string | null, rol: string): string {
  return jwt.sign(
    { sub: ACTOR, tenantId, email: 'u@e.com', nombre: 'U', rol, activo: true },
    SECRET,
    { expiresIn: '1h' },
  );
}

describe('POST /api/ai/answer (HU-IA-01)', () => {
  let tenantId: Types.ObjectId;

  beforeEach(async () => {
    tenantId = new Types.ObjectId();
    mockChat.mockReset().mockResolvedValue({
      data: 'Atendemos de 8:00 a 18:00.',
      cacheHit: false,
      fromFaq: false,
      retrievedChunks: [{ texto: 'Horario 8-18', documentId: 'doc-1', score: 0.9 }],
      promptTokens: 10,
      completionTokens: 5,
      totalTokens: 15,
      durationMs: 100,
    });
  });

  it('sin JWT → 401', async () => {
    const res = await request(app)
      .post('/api/ai/answer')
      .set('Cookie', [`csrfToken=${CSRF}`])
      .set('X-CSRF-Token', CSRF)
      .send({ mensaje: '¿Horario?' });
    expect(res.status).toBe(401);
  });

  it('rol no admin → 403', async () => {
    const res = await request(app)
      .post('/api/ai/answer')
      .set('Cookie', [`token=${makeToken(tenantId.toString(), 'asesor')}`, `csrfToken=${CSRF}`])
      .set('X-CSRF-Token', CSRF)
      .send({ mensaje: '¿Horario?' });
    expect(res.status).toBe(403);
  });

  it('mensaje vacío → 400', async () => {
    const res = await request(app)
      .post('/api/ai/answer')
      .set('Cookie', [`token=${makeToken(tenantId.toString(), 'admin')}`, `csrfToken=${CSRF}`])
      .set('X-CSRF-Token', CSRF)
      .send({ mensaje: '' });
    expect(res.status).toBe(400);
  });

  it('admin → 200 con la respuesta y cuántos fragmentos la sustentan', async () => {
    const res = await request(app)
      .post('/api/ai/answer')
      .set('Cookie', [`token=${makeToken(tenantId.toString(), 'admin')}`, `csrfToken=${CSRF}`])
      .set('X-CSRF-Token', CSRF)
      .send({ mensaje: '¿Cuál es el horario?' });

    expect(res.status).toBe(200);
    expect(res.body.respuesta).toBe('Atendemos de 8:00 a 18:00.');
    expect(res.body.fromFaq).toBe(false);
    expect(res.body.cacheHit).toBe(false);
    expect(res.body.chunksUsados).toBe(1);
  });

  it('el tenantId con el que se consulta nace del token, no del body', async () => {
    const otroTenant = new Types.ObjectId().toString();

    await request(app)
      .post('/api/ai/answer')
      .set('Cookie', [`token=${makeToken(tenantId.toString(), 'admin')}`, `csrfToken=${CSRF}`])
      .set('X-CSRF-Token', CSRF)
      .send({ mensaje: '¿Horario?', tenantId: otroTenant });

    const usado = mockChat.mock.calls[0]![0].tenantId as Types.ObjectId;
    expect(usado.toString()).toBe(tenantId.toString());
  });
});

describe('GET | PUT /api/ai/assistant (HU-IA-01)', () => {
  let tenantId: Types.ObjectId;

  beforeEach(async () => {
    tenantId = new Types.ObjectId();
    await PromptTemplateModel.deleteMany({});
    await PromptTemplateModel.create({
      tenantId: null,
      method: 'chat',
      version: '1.0.0',
      isActive: true,
      systemPrompt: 'Prompt global de fábrica',
      tono: 'profesional, claro y cercano',
    });
  });

  it('sin JWT → 401', async () => {
    const res = await request(app).get('/api/ai/assistant');
    expect(res.status).toBe(401);
  });

  it('rol no admin → 403', async () => {
    const res = await request(app)
      .get('/api/ai/assistant')
      .set('Cookie', `token=${makeToken(tenantId.toString(), 'asesor')}`);
    expect(res.status).toBe(403);
  });

  it('admin sin plantilla propia → 200 heredando la global', async () => {
    const res = await request(app)
      .get('/api/ai/assistant')
      .set('Cookie', `token=${makeToken(tenantId.toString(), 'admin')}`);

    expect(res.status).toBe(200);
    expect(res.body.heredado).toBe(true);
    expect(res.body.systemPrompt).toBe('Prompt global de fábrica');
  });

  it('PUT guarda y la lectura siguiente ya no hereda', async () => {
    const put = await request(app)
      .put('/api/ai/assistant')
      .set('Cookie', [`token=${makeToken(tenantId.toString(), 'admin')}`, `csrfToken=${CSRF}`])
      .set('X-CSRF-Token', CSRF)
      .send({ tono: 'cercano y directo', systemPrompt: 'Instrucciones propias' });

    expect(put.status).toBe(200);
    expect(put.body.heredado).toBe(false);

    const get = await request(app)
      .get('/api/ai/assistant')
      .set('Cookie', `token=${makeToken(tenantId.toString(), 'admin')}`);

    expect(get.body.tono).toBe('cercano y directo');
    expect(get.body.systemPrompt).toBe('Instrucciones propias');
    expect(get.body.heredado).toBe(false);
  });

  it('PUT con systemPrompt vacío → 400', async () => {
    const res = await request(app)
      .put('/api/ai/assistant')
      .set('Cookie', [`token=${makeToken(tenantId.toString(), 'admin')}`, `csrfToken=${CSRF}`])
      .set('X-CSRF-Token', CSRF)
      .send({ tono: 'cercano', systemPrompt: '' });
    expect(res.status).toBe(400);
  });

  it('la ruta de auditoría sigue resolviéndose pese al montaje de /api/ai', async () => {
    const res = await request(app)
      .get('/api/ai/responses')
      .set('Cookie', `token=${makeToken(tenantId.toString(), 'admin')}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
  });
});
