import express from 'express';
import { MemoryStore, type Store } from 'express-rate-limit';
import { Types } from 'mongoose';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LIMITE_INTENTOS_PAGO, LIMITE_WEBHOOK_PAGOS } from '../config/rate-limits.js';
import { logger } from '../utils/logger.js';
import {
  crearLimitadorIntentosPago,
  crearLimitadorWebhookPagos,
} from './rate-limit.middleware.js';

afterEach(() => vi.restoreAllMocks());

const MAX = 3;

/** Store en memoria que registra las claves que recibe. */
function storeEspia(): { store: Store; claves: string[] } {
  const memoria = new MemoryStore();
  const claves: string[] = [];
  const store: Store = {
    init: (o) => memoria.init(o),
    get: (k) => memoria.get(k),
    increment: (k) => {
      claves.push(k);
      return memoria.increment(k);
    },
    decrement: (k) => memoria.decrement(k),
    resetKey: (k) => memoria.resetKey(k),
  };
  return { store, claves };
}

function appWebhook(store: Store, onBody?: (body: unknown) => void): express.Express {
  const app = express();
  app.set('trust proxy', 1);
  app.use('/hook', crearLimitadorWebhookPagos({ max: MAX, store }));
  app.use(express.json());
  app.post('/hook', (req, res) => {
    onBody?.(req.body);
    res.json({ ok: true });
  });
  return app;
}

/** Simula `authenticateJWT`: el tenant sale de un campo de prueba, no de la petición HTTP. */
function appIntentos(store: Store): express.Express {
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json());
  app.use((req, _res, next) => {
    const t = req.get('x-test-token-tenant');
    if (t) req.user = { tenantId: new Types.ObjectId(t) } as unknown as Express.Request['user'];
    next();
  });
  app.post('/intentos', crearLimitadorIntentosPago({ max: MAX, store }), (_req, res) => {
    res.json({ ok: true });
  });
  return app;
}

describe('limitador del webhook', () => {
  it('max peticiones pasan y la siguiente da 429 con Retry-After y RateLimit-*', async () => {
    const { store } = storeEspia();
    const app = appWebhook(store);
    for (let i = 0; i < MAX; i++) {
      expect((await request(app).post('/hook').send({})).status).toBe(200);
    }
    const res = await request(app).post('/hook').send({});
    expect(res.status).toBe(429);
    expect(res.body).toEqual({ message: 'Demasiadas solicitudes. Intenta de nuevo en unos minutos.' });
    expect(res.headers['retry-after']).toBeDefined();
    expect(res.headers['ratelimit']).toBeDefined();
    expect(res.headers['x-ratelimit-limit']).toBeUndefined();
  });

  it('otra IP (X-Forwarded-For) tiene su propia cuota', async () => {
    const { store } = storeEspia();
    const app = appWebhook(store);
    for (let i = 0; i < MAX; i++) await request(app).post('/hook').set('X-Forwarded-For', '203.0.113.1').send({});
    expect((await request(app).post('/hook').set('X-Forwarded-For', '203.0.113.1').send({})).status).toBe(429);
    expect((await request(app).post('/hook').set('X-Forwarded-For', '203.0.113.2').send({})).status).toBe(200);
  });

  it('no toca el cuerpo: llega sin parsear al limitador y se parsea después', async () => {
    const { store } = storeEspia();
    let visto: unknown;
    const app = appWebhook(store, (b) => {
      visto = b;
    });
    await request(app).post('/hook').send({ a: 1 });
    expect(visto).toEqual({ a: 1 });
  });
});

describe('limitador de intentos', () => {
  const A = new Types.ObjectId().toHexString();
  const B = new Types.ObjectId().toHexString();
  const post = (app: express.Express, tenant: string | null, extra: (r: request.Test) => request.Test = (r) => r) => {
    let r = request(app).post('/intentos').set('X-Forwarded-For', '198.51.100.7');
    if (tenant) r = r.set('x-test-token-tenant', tenant);
    return extra(r).send({});
  };

  it('el tenant A agota su cuota y el B sigue pasando desde la misma IP', async () => {
    const { store } = storeEspia();
    const app = appIntentos(store);
    for (let i = 0; i < MAX; i++) expect((await post(app, A)).status).toBe(200);
    expect((await post(app, A)).status).toBe(429);
    expect((await post(app, B)).status).toBe(200);
  });

  it('X-Tenant-Id, tenantId en cuerpo, query o params no cambian la cubeta', async () => {
    const { store, claves } = storeEspia();
    const app = appIntentos(store);
    for (let i = 0; i < MAX; i++) await post(app, A);
    const intentos = [
      await post(app, A, (r) => r.set('X-Tenant-Id', B)),
      await request(app)
        .post(`/intentos?tenantId=${B}`)
        .set('x-test-token-tenant', A)
        .set('X-Forwarded-For', '198.51.100.7')
        .send({ tenantId: B }),
    ];
    for (const r of intentos) expect(r.status).toBe(429);
    expect(new Set(claves)).toEqual(new Set([`tenant:${A}`]));
  });

  it('las claves del store solo contienen el tenantId de su propia cubeta', async () => {
    const { store, claves } = storeEspia();
    const app = appIntentos(store);
    await post(app, A);
    await post(app, B);
    expect(claves).toEqual([`tenant:${A}`, `tenant:${B}`]);
  });

  it('sin req.user usa la IP y no lanza', async () => {
    const { store, claves } = storeEspia();
    const app = appIntentos(store);
    const res = await post(app, null);
    expect(res.status).toBe(200);
    expect(claves).toEqual(['198.51.100.7']);
  });
});

describe('fallo abierto', () => {
  const storeRoto = (): Store => ({
    increment: () => Promise.reject(new Error('redis caído: prv_test_secreto')),
    decrement: () => Promise.resolve(),
    resetKey: () => undefined,
  });

  it('ambas variantes dejan pasar y emiten un warn sin datos de la petición', async () => {
    const avisos: unknown[] = [];
    vi.spyOn(console, 'warn').mockImplementation((l: unknown) => {
      avisos.push(l);
    });
    const a = appWebhook(storeRoto());
    const b = appIntentos(storeRoto());
    const r1 = await request(a).post('/hook').send({ cuerpo: 'DATO_DE_LA_PETICION' });
    const r2 = await request(b)
      .post('/intentos')
      .set('x-test-token-tenant', new Types.ObjectId().toHexString())
      .send({ cuerpo: 'DATO_DE_LA_PETICION' });
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    expect(avisos.length).toBeGreaterThanOrEqual(2);
    const volcado = JSON.stringify(avisos);
    expect(volcado).toContain('Rate limit: store no disponible');
    expect(volcado).not.toContain('DATO_DE_LA_PETICION');
    expect(volcado).not.toContain('prv_test_secreto');
  });

  it('el logger espiado recibe solo el nombre del limitador', async () => {
    const espia = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
    await request(appWebhook(storeRoto())).post('/hook').send({});
    expect(espia).toHaveBeenCalledWith('Rate limit: store no disponible', { limitador: 'webhook-pagos' });
  });
});

describe('configuración', () => {
  it('los prefijos de Redis son los de config/rate-limits', () => {
    expect(LIMITE_WEBHOOK_PAGOS.prefijo).toBe('rl:pagos:webhook:');
    expect(LIMITE_INTENTOS_PAGO.prefijo).toBe('rl:pagos:intentos:');
    expect(LIMITE_WEBHOOK_PAGOS.ventanaMs).toBe(60_000);
    expect(LIMITE_INTENTOS_PAGO.ventanaMs).toBe(600_000);
  });
});
