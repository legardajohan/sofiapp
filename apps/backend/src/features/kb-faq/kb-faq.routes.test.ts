import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { Types } from 'mongoose';

// Mock de la cola BullMQ: evita conexión a Redis al importar app.
vi.mock('../../config/queues.js', () => ({
  KB_INDEX_QUEUE_NAME: 'kb-index',
  KB_INDEX_JOB_NAME: 'index-document',
  INBOUND_QUEUE_NAME: 'inbound-messages',
  AI_REPLY_QUEUE_NAME: 'ai-reply',
  AI_REPLY_JOB_NAME: 'auto-reply',
  inboundQueue: { add: vi.fn() },
  aiReplyQueue: { add: vi.fn().mockResolvedValue(undefined) },
  kbIndexQueue: { add: vi.fn().mockResolvedValue(undefined) },
}));

// Los controllers no inyectan provider: usan el GeminiProvider por defecto. Aquí lo
// sustituimos para no salir a la red con la API key falsa de los tests.
const { mockEmbedTexts } = vi.hoisted(() => ({
  mockEmbedTexts: vi
    .fn()
    .mockResolvedValue({
      result: [[0.1, 0.2, 0.3]],
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    }),
}));
vi.mock('../../integrations/llm/gemini.provider.js', () => ({
  GeminiProvider: class {
    embedTexts = mockEmbedTexts;
    generateReply = vi.fn();
    extractSlots = vi.fn();
    classifyLead = vi.fn();
  },
}));

// `$vectorSearch` no existe en mongodb-memory-server.
const { mockVectorSearch } = vi.hoisted(() => ({ mockVectorSearch: vi.fn().mockResolvedValue([]) }));
vi.mock('./kb-faq.repository.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./kb-faq.repository.js')>();
  return { ...actual, faqVectorSearchScoped: mockVectorSearch };
});

import app from '../../app.js';
import { env } from '../../config/env.js';
import { createFaq } from './kb-faq.service.js';
import type { IKbFaqResponse } from './kb-faq.types.js';

const SECRET = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const CSRF = 'test-csrf-token';

const makeToken = (tenantId: string | null, rol: string) =>
  jwt.sign(
    { sub: '507f1f77bcf86cd799439012', tenantId, email: 'u@e.com', nombre: 'U', rol, activo: true },
    SECRET,
    { expiresIn: '1h' },
  );

/** Deja al tenant con exactamente `n` FAQs activas y devuelve las creadas (HU-KB-02-V3). */
async function sembrarActivas(
  tenantId: Types.ObjectId,
  n: number,
): Promise<IKbFaqResponse[]> {
  const creadas: IKbFaqResponse[] = [];
  for (let i = 0; i < n; i += 1) {
    creadas.push(
      await createFaq(tenantId, {
        pregunta: `¿Pregunta número ${i}?`,
        respuesta: `Respuesta ${i}.`,
      }),
    );
  }
  return creadas;
}

const authed = (req: request.Test, token: string) =>
  req.set('Cookie', [`token=${token}`, `csrfToken=${CSRF}`]).set('X-CSRF-Token', CSRF);

beforeEach(() => {
  mockVectorSearch.mockClear();
  mockVectorSearch.mockResolvedValue([]);
});

describe('GET /api/kb/faqs', () => {
  it('sin JWT → 401', async () => {
    expect((await request(app).get('/api/kb/faqs')).status).toBe(401);
  });

  it('rol superadmin (no admin) → 403', async () => {
    const token = makeToken(new Types.ObjectId().toString(), 'superadmin');
    const res = await request(app).get('/api/kb/faqs').set('Cookie', `token=${token}`);
    expect(res.status).toBe(403);
  });

  it('admin → 200 y solo ve las FAQs de su tenant', async () => {
    const tenantA = new Types.ObjectId();
    const tenantB = new Types.ObjectId();
    await createFaq(tenantA, { pregunta: '¿Solo A?', respuesta: 'Sí.' });

    const resB = await request(app)
      .get('/api/kb/faqs')
      .set('Cookie', `token=${makeToken(tenantB.toString(), 'admin')}`);
    expect(resB.status).toBe(200);
    expect(resB.body.total).toBe(0);

    const resA = await request(app)
      .get('/api/kb/faqs')
      .set('Cookie', `token=${makeToken(tenantA.toString(), 'admin')}`);
    expect(resA.status).toBe(200);
    expect(resA.body.total).toBe(1);
    expect(resA.body.data[0].pregunta).toBe('¿Solo A?');
    expect(resA.body.data[0].embedding).toBeUndefined();
  });
});

describe('POST /api/kb/faqs', () => {
  it('admin con datos válidos → 201 sin exponer el embedding', async () => {
    const token = makeToken(new Types.ObjectId().toString(), 'admin');
    const res = await authed(request(app).post('/api/kb/faqs'), token).send({
      pregunta: '¿Cuánto cuesta el curso?',
      respuesta: 'El curso cuesta $500.000 COP.',
    });

    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.activo).toBe(true);
    expect(res.body.embedding).toBeUndefined();
  });

  it('pregunta demasiado corta → 400', async () => {
    const token = makeToken(new Types.ObjectId().toString(), 'admin');
    const res = await authed(request(app).post('/api/kb/faqs'), token).send({
      pregunta: 'ab',
      respuesta: 'x',
    });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Error de validación.');
  });

  it('respuesta que supera los 2.000 caracteres → 400', async () => {
    const token = makeToken(new Types.ObjectId().toString(), 'admin');
    const res = await authed(request(app).post('/api/kb/faqs'), token).send({
      pregunta: '¿Una muy larga?',
      respuesta: 'x'.repeat(2001),
    });

    expect(res.status).toBe(400);
  });

  it('sin cabecera CSRF → rechazado', async () => {
    const token = makeToken(new Types.ObjectId().toString(), 'admin');
    const res = await request(app)
      .post('/api/kb/faqs')
      .set('Cookie', [`token=${token}`, `csrfToken=${CSRF}`])
      .send({ pregunta: '¿Sin CSRF?', respuesta: 'No pasa.' });

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).not.toBe(201);
  });

  it('pregunta duplicada en el tenant → 409', async () => {
    const tenantId = new Types.ObjectId();
    await createFaq(tenantId, { pregunta: '¿Repetida?', respuesta: 'Sí.' });
    const token = makeToken(tenantId.toString(), 'admin');

    const res = await authed(request(app).post('/api/kb/faqs'), token).send({
      pregunta: '¿Repetida?',
      respuesta: 'Otra.',
    });

    expect(res.status).toBe(409);
  });
});

describe('PATCH /api/kb/faqs/:id', () => {
  it('admin edita una FAQ de su tenant → 200', async () => {
    const tenantId = new Types.ObjectId();
    const faq = await createFaq(tenantId, { pregunta: '¿Editable?', respuesta: 'Antes.' });
    const token = makeToken(tenantId.toString(), 'admin');

    const res = await authed(request(app).patch(`/api/kb/faqs/${faq.id}`), token).send({
      respuesta: 'Después.',
    });

    expect(res.status).toBe(200);
    expect(res.body.respuesta).toBe('Después.');
  });

  it('body vacío → 400', async () => {
    const tenantId = new Types.ObjectId();
    const faq = await createFaq(tenantId, { pregunta: '¿Vacío?', respuesta: 'x' });
    const token = makeToken(tenantId.toString(), 'admin');

    const res = await authed(request(app).patch(`/api/kb/faqs/${faq.id}`), token).send({});
    expect(res.status).toBe(400);
  });

  it('aislamiento: FAQ de otro tenant → 404', async () => {
    const tenantA = new Types.ObjectId();
    const tenantB = new Types.ObjectId();
    const faq = await createFaq(tenantA, { pregunta: '¿Solo A?', respuesta: 'x' });
    const tokenB = makeToken(tenantB.toString(), 'admin');

    const res = await authed(request(app).patch(`/api/kb/faqs/${faq.id}`), tokenB).send({
      respuesta: 'Secuestrada.',
    });

    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/kb/faqs/:id', () => {
  it('admin borra una FAQ de su tenant → 200', async () => {
    const tenantId = new Types.ObjectId();
    // Con margen sobre el mínimo de activas (HU-KB-02-V3).
    await sembrarActivas(tenantId, env.FAQ_MIN_ACTIVAS);
    const faq = await createFaq(tenantId, { pregunta: '¿Borrable?', respuesta: 'x' });
    const token = makeToken(tenantId.toString(), 'admin');

    const res = await authed(request(app).delete(`/api/kb/faqs/${faq.id}`), token);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ deleted: true });
  });

  it('aislamiento: FAQ de otro tenant → 404 (no se filtra su existencia)', async () => {
    const tenantA = new Types.ObjectId();
    const tenantB = new Types.ObjectId();
    const faq = await createFaq(tenantA, { pregunta: '¿Solo A?', respuesta: 'x' });

    const res = await authed(
      request(app).delete(`/api/kb/faqs/${faq.id}`),
      makeToken(tenantB.toString(), 'admin'),
    );
    expect(res.status).toBe(404);
  });

  it('id con formato inválido → 400', async () => {
    const token = makeToken(new Types.ObjectId().toString(), 'admin');
    const res = await authed(request(app).delete('/api/kb/faqs/no-es-un-objectid'), token);
    expect(res.status).toBe(400);
  });

  it('rol asesor → 403', async () => {
    const tenantId = new Types.ObjectId();
    const faq = await createFaq(tenantId, { pregunta: '¿Protegida?', respuesta: 'x' });

    const res = await authed(
      request(app).delete(`/api/kb/faqs/${faq.id}`),
      makeToken(tenantId.toString(), 'asesor'),
    );
    expect(res.status).toBe(403);
  });
});

// ─── Mínimo de FAQs activas (HU-KB-02-V3) ─────────────────────────────────────
describe('mínimo de preguntas activas', () => {
  const MINIMO = env.FAQ_MIN_ACTIVAS;

  it('DELETE que rompería el mínimo → 409 con las activas y el mínimo en el cuerpo', async () => {
    const tenantId = new Types.ObjectId();
    const [primera] = await sembrarActivas(tenantId, MINIMO);
    const token = makeToken(tenantId.toString(), 'admin');

    const res = await authed(request(app).delete(`/api/kb/faqs/${primera!.id}`), token);

    expect(res.status).toBe(409);
    expect(res.body.message).toContain(String(MINIMO));
    expect(res.body.activas).toBe(MINIMO);
    expect(res.body.minimo).toBe(MINIMO);
  });

  it('PATCH { activo: false } que rompería el mínimo → 409', async () => {
    const tenantId = new Types.ObjectId();
    const [primera] = await sembrarActivas(tenantId, MINIMO);
    const token = makeToken(tenantId.toString(), 'admin');

    const res = await authed(request(app).patch(`/api/kb/faqs/${primera!.id}`), token).send({
      activo: false,
    });

    expect(res.status).toBe(409);
    expect(res.body.activas).toBe(MINIMO);
  });

  it('POST sigue devolviendo 201 aunque el tenant esté por debajo del mínimo', async () => {
    // Al mínimo se sube escribiendo: crear nunca se limita.
    const token = makeToken(new Types.ObjectId().toString(), 'admin');

    const res = await authed(request(app).post('/api/kb/faqs'), token).send({
      pregunta: '¿La primera de todas?',
      respuesta: 'Sí.',
    });

    expect(res.status).toBe(201);
  });

  it('GET expone las activas del tenant y el mínimo vigente', async () => {
    const tenantId = new Types.ObjectId();
    await sembrarActivas(tenantId, 2);
    const token = makeToken(tenantId.toString(), 'admin');

    const res = await authed(request(app).get('/api/kb/faqs'), token);

    expect(res.status).toBe(200);
    expect(res.body.activas).toBe(2);
    expect(res.body.minimoActivas).toBe(MINIMO);
  });

  it('GET ?activo=false sigue informando las activas del tenant, no 0', async () => {
    // Donde se notaría confundir `total` (que respeta el filtro) con `activas` (que no).
    const tenantId = new Types.ObjectId();
    await sembrarActivas(tenantId, 3);
    const token = makeToken(tenantId.toString(), 'admin');

    const res = await authed(request(app).get('/api/kb/faqs?activo=false'), token);

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(0);
    expect(res.body.activas).toBe(3);
  });
});

describe('POST /api/kb/faqs/test', () => {
  it('admin prueba una pregunta → 200 con los tres mínimos vigentes', async () => {
    const token = makeToken(new Types.ObjectId().toString(), 'admin');

    const res = await authed(request(app).post('/api/kb/faqs/test'), token).send({
      pregunta: '¿Cuánto cuesta?',
    });

    expect(res.status).toBe(200);
    expect(res.body.matched).toBe(false);
    expect(res.body.umbral).toBe(env.FAQ_MATCH_THRESHOLD);
    expect(res.body.margenMinimo).toBe(env.FAQ_MATCH_MIN_MARGIN);
    expect(res.body.overlapMinimo).toBe(env.FAQ_MATCH_MIN_OVERLAP);
  });

  it('devuelve el candidato con su score aunque no supere el umbral', async () => {
    const score = env.FAQ_MATCH_THRESHOLD - 0.1;
    mockVectorSearch.mockResolvedValue([
      {
        _id: new Types.ObjectId(),
        tenantId: new Types.ObjectId(),
        pregunta: '¿Cuánto cuesta el curso?',
        respuesta: '$500.000 COP.',
        activo: true,
        embedding: [],
        score,
      },
    ]);
    const token = makeToken(new Types.ObjectId().toString(), 'admin');

    const res = await authed(request(app).post('/api/kb/faqs/test'), token).send({
      pregunta: '¿Vale mucho?',
    });

    expect(res.status).toBe(200);
    expect(res.body.matched).toBe(false);
    expect(res.body.confianza).toBeCloseTo(score);
    expect(res.body.pregunta).toBe('¿Cuánto cuesta el curso?');
  });

  it('rol asesor → 403', async () => {
    const token = makeToken(new Types.ObjectId().toString(), 'asesor');
    const res = await authed(request(app).post('/api/kb/faqs/test'), token).send({
      pregunta: '¿Cuánto cuesta?',
    });
    expect(res.status).toBe(403);
  });
});
