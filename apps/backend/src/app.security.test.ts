import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

// Mismo mock de colas que `webhook.routes.test.ts`: evita conectar a Redis al importar `app`.
vi.mock('./config/queues.js', () => ({
  INBOUND_QUEUE_NAME: 'inbound-messages',
  KB_INDEX_QUEUE_NAME: 'kb-index',
  KB_INDEX_JOB_NAME: 'index-document',
  AI_REPLY_QUEUE_NAME: 'ai-reply',
  AI_REPLY_JOB_NAME: 'auto-reply',
  FLOW_RUNTIME_QUEUE_NAME: 'flow-runtime',
  FLOW_RESUME_JOB: 'resume',
  FLOW_REMINDER_JOB: 'reminder',
  REMINDER_SWEEP_JOB: 'sweep',
  REMINDER_SWEEP_SCHEDULER_ID: 'reminder-sweep',
  inboundQueue: { add: vi.fn() },
  aiReplyQueue: { add: vi.fn().mockResolvedValue(undefined) },
  kbIndexQueue: { add: vi.fn().mockResolvedValue(undefined) },
  flowRuntimeQueue: { add: vi.fn().mockResolvedValue(undefined), upsertJobScheduler: vi.fn() },
}));

import app from './app.js';
import { env } from './config/env.js';

describe('app: cabeceras de seguridad', () => {
  it('GET /api/health trae las cabeceras de helmet', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['referrer-policy']).toBe('no-referrer');
    expect(res.headers['cross-origin-resource-policy']).toBe('cross-origin');
    const csp = String(res.headers['content-security-policy']);
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    const hsts = String(res.headers['strict-transport-security']);
    expect(hsts).toContain('max-age=15552000');
    expect(hsts).not.toContain('includeSubDomains');
    expect(hsts).not.toContain('preload');
  });

  it('el preflight CORS responde y sigue llevando las cabeceras de seguridad', async () => {
    const res = await request(app)
      .options('/api/health')
      .set('Origin', env.WEB_ORIGIN ?? 'http://localhost:5173')
      .set('Access-Control-Request-Method', 'GET');
    expect(res.status).toBeLessThan(300);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });
});

describe('app: trust proxy', () => {
  it('app aplica TRUST_PROXY_HOPS', () => {
    expect(app.get('trust proxy')).toBe(env.TRUST_PROXY_HOPS);
  });

  const ipVista = async (saltos: number): Promise<string> => {
    const mini = express();
    mini.set('trust proxy', saltos);
    mini.get('/ip', (req, res) => {
      res.json({ ip: req.ip });
    });
    const res = await request(mini).get('/ip').set('X-Forwarded-For', '203.0.113.9');
    return String((res.body as { ip: string }).ip);
  };

  it('con 1 salto, req.ip es la del X-Forwarded-For', async () => {
    expect(await ipVista(1)).toBe('203.0.113.9');
  });

  it('con 0 saltos el encabezado se ignora', async () => {
    expect(await ipVista(0)).not.toBe('203.0.113.9');
  });
});

describe('app: límite del webhook de Wompi', () => {
  it('supera el máximo → 429 aunque la ruta no exista, y antes de express.json()', async () => {
    const ip = '192.0.2.77';
    for (let i = 0; i < env.RATE_LIMIT_WEBHOOK_PAGOS_MAX; i++) {
      await request(app).post('/api/webhooks/wompi').set('X-Forwarded-For', ip).send({});
    }
    // Un JSON inválido provocaría 400 si express.json() corriera antes que el limitador.
    const res = await request(app)
      .post('/api/webhooks/wompi')
      .set('X-Forwarded-For', ip)
      .set('Content-Type', 'application/json')
      .send('{no es json');
    expect(res.status).toBe(429);
    expect(res.headers['retry-after']).toBeDefined();
  });
});
