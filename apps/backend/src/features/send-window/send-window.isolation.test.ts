import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { Types } from 'mongoose';

vi.mock('../../config/queues.js', () => ({
  KB_INDEX_QUEUE_NAME: 'kb-index',
  KB_INDEX_JOB_NAME: 'index-document',
  INBOUND_QUEUE_NAME: 'inbound-messages',
  inboundQueue: { add: vi.fn() },
  kbIndexQueue: { add: vi.fn().mockResolvedValue(undefined) },
}));
vi.mock('../../realtime/internal-bus.js', () => ({
  SEND_WINDOW_INVALIDATE_CHANNEL: 'send-window:invalidate',
  publicarInterno: vi.fn().mockResolvedValue(undefined),
  suscribirInterno: vi.fn(),
}));

import app from '../../app.js';
import { SendWindowConfig } from './send-window.model.js';
import { assertVentanaEnvio, consultarVentana, limpiarCacheVentana } from './send-window.service.js';
import { CONFIG_DEFECTO, type IPoliticaVentana } from './send-window.types.js';

const SECRET = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const CSRF = 'test-csrf-token';

const token = (tenantId: string): string =>
  jwt.sign(
    { sub: new Types.ObjectId().toString(), tenantId, email: 'u@e.com', nombre: 'U', rol: 'admin', activo: true },
    SECRET,
    { expiresIn: '1h' },
  );

const conCookies = (r: request.Test, tenantId: string): request.Test =>
  r.set('Cookie', [`token=${token(tenantId)}`, `csrfToken=${CSRF}`]).set('X-CSRF-Token', CSRF);

/** Política activa con `campana` restringida y SIN franjas: siempre cerrada. */
function cerradaParaCampanas(): IPoliticaVentana {
  const p = structuredClone(CONFIG_DEFECTO);
  p.activo = true;
  p.reglas = p.reglas.map((r) => (r.categoria === 'campana' ? { ...r, franjas: [] } : r));
  return p;
}

describe('send-window — aislamiento multi-tenant', () => {
  let tenantA: string;
  let tenantB: string;

  beforeEach(async () => {
    await SendWindowConfig.syncIndexes();
    limpiarCacheVentana();
    tenantA = new Types.ObjectId().toString();
    tenantB = new Types.ObjectId().toString();
  });

  it('la configuración de A no aparece ni se modifica desde B', async () => {
    await conCookies(request(app).put('/api/send-window'), tenantA).send(cerradaParaCampanas());

    const vistaB = await conCookies(request(app).get('/api/send-window'), tenantB);
    expect(vistaB.body).toMatchObject({ configurado: false, activo: false });

    await conCookies(request(app).put('/api/send-window'), tenantB).send({ ...CONFIG_DEFECTO, activo: false });
    const a = await SendWindowConfig.findOne({ tenantId: tenantA }).lean();
    expect(a?.activo).toBe(true);
    expect(a?.version).toBe(1);
    expect(await SendWindowConfig.countDocuments({})).toBe(2);
  });

  it('con A cerrado y B sin política, B envía y A recibe 423; la caché no los mezcla', async () => {
    await conCookies(request(app).put('/api/send-window'), tenantA).send(cerradaParaCampanas());

    // Calienta la caché de los dos en distinto orden.
    expect((await consultarVentana(tenantB, 'campana')).permitido).toBe(true);
    expect((await consultarVentana(tenantA, 'campana')).permitido).toBe(false);

    await expect(assertVentanaEnvio(tenantA, 'campana')).rejects.toMatchObject({ statusCode: 423 });
    await expect(assertVentanaEnvio(tenantB, 'campana')).resolves.toBeUndefined();
    // Y otra vez, ahora desde la caché.
    expect((await consultarVentana(tenantB, 'campana')).permitido).toBe(true);
  });

  it('el estado de B no refleja la política de A', async () => {
    await conCookies(request(app).put('/api/send-window'), tenantA).send(cerradaParaCampanas());
    const estadoB = await conCookies(request(app).get('/api/send-window/status'), tenantB);
    expect(estadoB.body.activo).toBe(false);
    expect(estadoB.body.categorias.campana.permitido).toBe(true);
  });
});
