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
  aiReplyQueue: { add: vi.fn().mockResolvedValue(undefined) },
  kbIndexQueue: { add: vi.fn().mockResolvedValue(undefined) },
}));

import app from '../../app.js';
import { createScoped } from '../../repositories/base.repository.js';
import { AiUsageLogModel } from '../../services/ai/ai-usage-log.model.js';
import { AiResponseContextModel } from '../../services/ai/ai-response-context.model.js';

const SECRET = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const ACTOR = '507f1f77bcf86cd799439012';

function makeToken(tenantId: string | null, rol: string): string {
  return jwt.sign(
    { sub: ACTOR, tenantId, email: 'u@e.com', nombre: 'U', rol, activo: true },
    SECRET,
    { expiresIn: '1h' },
  );
}

async function crearUsageLog(tenantId: Types.ObjectId): Promise<string> {
  const doc = await createScoped(AiUsageLogModel, tenantId, {
    method: 'chat',
    llmModel: 'gemini-1.5-flash',
    promptTokens: 10,
    completionTokens: 5,
    totalTokens: 15,
    cacheHit: false,
    fromFaq: false,
    durationMs: 120,
  });
  return String(doc._id);
}

describe('GET /api/ai/responses', () => {
  let tenantId: Types.ObjectId;

  beforeEach(async () => {
    await AiUsageLogModel.deleteMany({});
    tenantId = new Types.ObjectId();
  });

  it('sin JWT → 401', async () => {
    const res = await request(app).get('/api/ai/responses');
    expect(res.status).toBe(401);
  });

  it('rol superadmin (no admin) → 403', async () => {
    const res = await request(app)
      .get('/api/ai/responses')
      .set('Cookie', `token=${makeToken(tenantId.toString(), 'superadmin')}`);
    expect(res.status).toBe(403);
  });

  it('admin → 200 con la lista paginada del tenant', async () => {
    await crearUsageLog(tenantId);
    await crearUsageLog(tenantId);

    const res = await request(app)
      .get('/api/ai/responses')
      .set('Cookie', `token=${makeToken(tenantId.toString(), 'admin')}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.total).toBe(2);
    expect(res.body.page).toBe(1);
  });

  it('rango de fechas: 200 con solo desde, solo hasta o ambos (HU-REP-05-V2)', async () => {
    const cookie = `token=${makeToken(tenantId.toString(), 'admin')}`;
    const desde = '2026-10-01T05:00:00.000Z';
    const hasta = '2026-10-04T05:00:00.000Z';
    for (const qs of [`desde=${desde}`, `hasta=${hasta}`, `desde=${desde}&hasta=${hasta}`]) {
      const res = await request(app).get(`/api/ai/responses?${qs}`).set('Cookie', cookie);
      expect(res.status).toBe(200);
    }
  });

  it('un tenantId en la query se ignora: el rango se aplica solo al tenant del token', async () => {
    const otro = new Types.ObjectId();
    await crearUsageLog(otro);

    const res = await request(app)
      .get(`/api/ai/responses?tenantId=${otro.toString()}&desde=2000-01-01T00:00:00.000Z`)
      .set('Cookie', `token=${makeToken(tenantId.toString(), 'admin')}`);

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(0);
  });

  it('rango de fechas: 400 si hasta no es posterior a desde o la fecha no es válida', async () => {
    const cookie = `token=${makeToken(tenantId.toString(), 'admin')}`;
    const t = '2026-10-04T05:00:00.000Z';
    for (const qs of [
      `desde=${t}&hasta=${t}`,
      `desde=${t}&hasta=2026-10-01T05:00:00.000Z`,
      'desde=no-es-fecha',
    ]) {
      const res = await request(app).get(`/api/ai/responses?${qs}`).set('Cookie', cookie);
      expect(res.status).toBe(400);
    }
  });

  it('method inválido en query → 400', async () => {
    const res = await request(app)
      .get('/api/ai/responses?method=no-existe')
      .set('Cookie', `token=${makeToken(tenantId.toString(), 'admin')}`);
    expect(res.status).toBe(400);
  });
});

describe('GET /api/ai/responses/:id/context', () => {
  let tenantId: Types.ObjectId;

  beforeEach(async () => {
    await AiUsageLogModel.deleteMany({});
    await AiResponseContextModel.deleteMany({});
    tenantId = new Types.ObjectId();
  });

  it('sin JWT → 401', async () => {
    const res = await request(app).get(
      `/api/ai/responses/${new Types.ObjectId().toString()}/context`,
    );
    expect(res.status).toBe(401);
  });

  it('id con formato inválido → 400', async () => {
    const res = await request(app)
      .get('/api/ai/responses/no-es-un-objectid/context')
      .set('Cookie', `token=${makeToken(tenantId.toString(), 'admin')}`);
    expect(res.status).toBe(400);
  });

  it('respuesta de otro tenant → 404, nunca 403', async () => {
    const tenantA = new Types.ObjectId();
    const usageLogId = await crearUsageLog(tenantA);

    const res = await request(app)
      .get(`/api/ai/responses/${usageLogId}/context`)
      .set('Cookie', `token=${makeToken(tenantId.toString(), 'admin')}`);

    expect(res.status).toBe(404);
  });

  it('admin → 200 con el detalle (sin AiResponseContext: contextAvailable false)', async () => {
    const usageLogId = await crearUsageLog(tenantId);

    const res = await request(app)
      .get(`/api/ai/responses/${usageLogId}/context`)
      .set('Cookie', `token=${makeToken(tenantId.toString(), 'admin')}`);

    expect(res.status).toBe(200);
    expect(res.body.contextAvailable).toBe(false);
    expect(res.body.retrievedChunks).toEqual([]);
  });
});
