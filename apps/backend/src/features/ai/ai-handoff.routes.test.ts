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

vi.mock('../../services/ai/ai-service.singleton.js', () => ({
  getAIService: () => ({ chat: vi.fn(), classify: vi.fn() }),
}));

import app from '../../app.js';
import { env } from '../../config/env.js';
import { HandoffSettings } from './ai-handoff.model.js';
import { User } from '../users/user.model.js';

const SECRET = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const ACTOR = '507f1f77bcf86cd799439012';
const CSRF = 'test-csrf-token';
const RUTA = '/api/ai/handoff-rules';

function makeToken(tenantId: string | null, rol: string): string {
  return jwt.sign(
    { sub: ACTOR, tenantId, email: 'u@e.com', nombre: 'U', rol, activo: true },
    SECRET,
    { expiresIn: '1h' },
  );
}

function body(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    activo: true,
    asesorDestinoId: null,
    mensajeTransicion: 'Te paso con un asesor.',
    reglas: {
      explicitRequest: { activa: true, frases: ['hablar con un asesor'] },
      keyword: { activa: false, palabras: [] },
      lowConfidence: { activa: false, umbral: null },
      intentPurchase: { activa: false, nivelMinimo: 'caliente' },
    },
    ...overrides,
  };
}

function put(token: string, payload: Record<string, unknown>): request.Test {
  return request(app)
    .put(RUTA)
    .set('Cookie', [`token=${token}`, `csrfToken=${CSRF}`])
    .set('X-CSRF-Token', CSRF)
    .send(payload);
}

describe('GET/PUT /api/ai/handoff-rules (HU-IA-03)', () => {
  let tenantId: Types.ObjectId;
  let token: string;

  beforeEach(async () => {
    tenantId = new Types.ObjectId();
    token = makeToken(tenantId.toString(), 'admin');
    await Promise.all([HandoffSettings.deleteMany({}), User.deleteMany({})]);
  });

  it('sin JWT → 401', async () => {
    const res = await request(app).get(RUTA);
    expect(res.status).toBe(401);
  });

  it('con un rol que no es admin → 403', async () => {
    const res = await request(app)
      .get(RUTA)
      .set('Cookie', [`token=${makeToken(tenantId.toString(), 'asesor')}`]);
    expect(res.status).toBe(403);
  });

  it('sin configuración guardada devuelve los valores de fábrica', async () => {
    const res = await request(app).get(RUTA).set('Cookie', [`token=${token}`]);

    expect(res.status).toBe(200);
    expect(res.body.heredado).toBe(true);
    expect(res.body.activo).toBe(false);
    expect(res.body.mensajeTransicion).toEqual(expect.any(String));
    // Las frases de fábrica vienen pobladas para que el disparador sirva desde el primer día.
    expect(res.body.reglas.explicitRequest.frases.length).toBeGreaterThan(0);
  });

  it('PUT guarda y el GET siguiente devuelve lo guardado', async () => {
    const guardado = await put(token, body({ mensajeTransicion: 'Ya te atiende Ana.' }));
    expect(guardado.status).toBe(200);
    expect(guardado.body.heredado).toBe(false);

    const leido = await request(app).get(RUTA).set('Cookie', [`token=${token}`]);
    expect(leido.body.mensajeTransicion).toBe('Ya te atiende Ana.');
    expect(leido.body.activo).toBe(true);
    expect(leido.body.reglas.explicitRequest.activa).toBe(true);
  });

  it('rechaza un umbral por debajo de KB_MIN_SCORE', async () => {
    // Por debajo del umbral global la regla no puede dispararse nunca: dejar guardarla sería
    // dejar al admin creyendo que configuró algo.
    const res = await put(
      token,
      body({
        reglas: {
          ...(body().reglas as Record<string, unknown>),
          lowConfidence: { activa: true, umbral: env.KB_MIN_SCORE - 0.1 },
        },
      }),
    );
    expect(res.status).toBe(400);
  });

  it('acepta un umbral por encima de KB_MIN_SCORE', async () => {
    const res = await put(
      token,
      body({
        reglas: {
          ...(body().reglas as Record<string, unknown>),
          lowConfidence: { activa: true, umbral: 0.95 },
        },
      }),
    );
    expect(res.status).toBe(200);
    expect(res.body.reglas.lowConfidence.umbral).toBe(0.95);
  });

  it('rechaza un mensaje de transición vacío', async () => {
    const res = await put(token, body({ mensajeTransicion: '   ' }));
    expect(res.status).toBe(400);
  });

  it('rechaza un asesor destino que no es de este tenant', async () => {
    const ajeno = await User.create({
      tenantId: new Types.ObjectId(),
      nombre: 'Ajeno',
      email: 'ajeno@x.com',
      passwordHash: 'x',
      rol: 'admin',
      activo: true,
    });

    const res = await put(token, body({ asesorDestinoId: (ajeno._id as Types.ObjectId).toString() }));

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(await HandoffSettings.countDocuments({ tenantId })).toBe(0);
  });

  it('AISLAMIENTO: lo guardado por un tenant no lo ve otro', async () => {
    await put(token, body({ mensajeTransicion: 'Solo de A' }));

    const otro = makeToken(new Types.ObjectId().toString(), 'admin');
    const res = await request(app).get(RUTA).set('Cookie', [`token=${otro}`]);

    expect(res.body.heredado).toBe(true);
    expect(res.body.mensajeTransicion).not.toBe('Solo de A');
  });

  it('la ruta la resuelve este router y no el genérico de /api/ai', async () => {
    // Regresión del orden de montaje en `app.ts`: si `/api/ai` se montara antes, esta ruta caería
    // en el router del asistente y devolvería 404 en vez de la configuración.
    const res = await request(app).get(RUTA).set('Cookie', [`token=${token}`]);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('reglas');
  });
});
