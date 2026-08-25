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

// La generación del resumen no debe salir a Gemini: aquí solo interesa quién puede pedirla.
const { mockSummarize } = vi.hoisted(() => ({ mockSummarize: vi.fn() }));
vi.mock('../../services/ai/ai-service.singleton.js', () => ({
  getAIService: () => ({ chat: vi.fn(), classify: vi.fn(), summarize: mockSummarize }),
}));
vi.mock('../../realtime/realtime.publisher.js', () => ({
  publishRealtime: vi.fn(),
  subscribeRealtime: vi.fn(),
}));

import app from '../../app.js';
import { Cliente } from '../cliente/cliente.model.js';
import { Message } from '../message/message.model.js';
import { createScoped } from '../../repositories/base.repository.js';

const SECRET = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const ACTOR = '507f1f77bcf86cd799439012';
const CSRF = 'test-csrf-token';

const tenantId = new Types.ObjectId();

/** `subrol: null` = un `admin` sin subrol, que es lo que hoy tienen todos en producción. */
function token(subrol: string | null): string {
  return jwt.sign(
    {
      sub: ACTOR,
      tenantId: tenantId.toString(),
      email: 'u@e.com',
      nombre: 'U',
      rol: 'admin',
      activo: true,
      ...(subrol ? { subrol } : {}),
    },
    SECRET,
    { expiresIn: '1h' },
  );
}

let clienteId: string;

beforeEach(async () => {
  await Promise.all([Cliente.deleteMany({}), Message.deleteMany({})]);
  mockSummarize.mockReset().mockResolvedValue({
    data: 'Resumen generado.',
    cacheHit: false,
    promptTokens: 1,
    completionTokens: 1,
    totalTokens: 2,
    durationMs: 10,
  });

  const t = new Date();
  const doc = await createScoped(Cliente, tenantId, {
    metaUserId: `wa-${new Types.ObjectId().toString()}`,
    telefono: '573001112233',
    canalOrigen: 'whatsapp',
    estadoComercial: 'nuevo',
    ultimoMensajeAt: t,
    resumenIA: { texto: 'Resumen previo.', generadoAt: t, mensajesHasta: t, modelo: 'x' },
  });
  clienteId = (doc._id as Types.ObjectId).toString();

  await createScoped(Message, tenantId, {
    clienteId: doc._id as Types.ObjectId,
    canal: 'whatsapp',
    direccion: 'inbound',
    sender: 'user',
    tipo: 'text',
    texto: 'Hola',
    status: 'sent',
  });
});

describe('GET /api/conversations/:id/overview (HU-IA-04)', () => {
  it('sin JWT → 401', async () => {
    const res = await request(app).get(`/api/conversations/${clienteId}/overview`);
    expect(res.status).toBe(401);
  });

  it('con un rol que no es admin → 403', async () => {
    const ajeno = jwt.sign(
      { sub: ACTOR, tenantId: tenantId.toString(), email: 'u@e.com', nombre: 'U', rol: 'asesor', activo: true },
      SECRET,
      { expiresIn: '1h' },
    );
    const res = await request(app)
      .get(`/api/conversations/${clienteId}/overview`)
      .set('Cookie', [`token=${ajeno}`]);
    expect(res.status).toBe(403);
  });

  it.each([['director'], ['manager'], ['coordinator'], ['secretary']])(
    'la vista se abre para el subrol %s: nadie se queda sin cabecera ni etiquetas',
    async (subrol) => {
      const res = await request(app)
        .get(`/api/conversations/${clienteId}/overview`)
        .set('Cookie', [`token=${token(subrol)}`]);

      expect(res.status).toBe(200);
      expect(res.body.conversation.id).toBe(clienteId);
      expect(res.body.conversation).toHaveProperty('tags');
    },
  );

  it.each([['director'], ['manager']])('%s sí ve el resumen', async (subrol) => {
    const res = await request(app)
      .get(`/api/conversations/${clienteId}/overview`)
      .set('Cookie', [`token=${token(subrol)}`]);

    expect(res.body.resumen?.texto).toBe('Resumen previo.');
    expect(res.body.permisos.verResumen).toBe(true);
  });

  it.each([['coordinator'], ['secretary']])('%s NO ve el resumen', async (subrol) => {
    const res = await request(app)
      .get(`/api/conversations/${clienteId}/overview`)
      .set('Cookie', [`token=${token(subrol)}`]);

    expect(res.body.resumen).toBeNull();
    expect(res.body.permisos.verResumen).toBe(false);
  });

  it('un admin SIN subrol conserva acceso total', async () => {
    // Regla vigente de ADR-0006: hoy nadie tiene subrol asignado y romperla dejaría a todos los
    // tenants fuera de sus propios datos el día del despliegue.
    const res = await request(app)
      .get(`/api/conversations/${clienteId}/overview`)
      .set('Cookie', [`token=${token(null)}`]);

    expect(res.body.resumen?.texto).toBe('Resumen previo.');
    expect(res.body.permisos.verResumen).toBe(true);
  });

  it('AISLAMIENTO: con el token de otro tenant → 404', async () => {
    const otro = jwt.sign(
      {
        sub: ACTOR,
        tenantId: new Types.ObjectId().toString(),
        email: 'u@e.com',
        nombre: 'U',
        rol: 'admin',
        activo: true,
      },
      SECRET,
      { expiresIn: '1h' },
    );

    const res = await request(app)
      .get(`/api/conversations/${clienteId}/overview`)
      .set('Cookie', [`token=${otro}`]);

    expect(res.status).toBe(404);
  });
});

describe('POST /api/conversations/:id/summary — gate por subrol (HU-IA-04)', () => {
  function generar(subrol: string | null): request.Test {
    return request(app)
      .post(`/api/conversations/${clienteId}/summary`)
      .set('Cookie', [`token=${token(subrol)}`, `csrfToken=${CSRF}`])
      .set('X-CSRF-Token', CSRF);
  }

  it.each([['coordinator'], ['secretary']])('%s → 403: no puede pagar lo que no puede leer', async (subrol) => {
    const res = await generar(subrol);

    expect(res.status).toBe(403);
    // Y no llegó a gastar una llamada al modelo.
    expect(mockSummarize).not.toHaveBeenCalled();
  });

  it.each([['director'], ['manager']])('%s sí puede generar', async (subrol) => {
    const res = await generar(subrol);
    expect(res.status).toBe(200);
  });

  it('un admin SIN subrol sigue pudiendo generar', async () => {
    const res = await generar(null);
    expect(res.status).toBe(200);
  });
});
