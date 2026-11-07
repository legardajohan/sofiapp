import { describe, it, expect } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { Types } from 'mongoose';
import app from '../../app.js';
import { crearAsesor } from '../reports/reports.fixtures.js';
import { ActividadAsesor } from './activity.model.js';

const SECRET = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const URL = '/api/activity/heartbeat';
const CSRF = 'csrf-de-prueba';

function token(sub: Types.ObjectId, tenantId: Types.ObjectId | null, rol: 'admin' | 'superadmin' = 'admin'): string {
  return jwt.sign({ sub: sub.toString(), tenantId: tenantId?.toString() ?? null, rol }, SECRET, { expiresIn: '1h' });
}

const latir = (t: string, body: Record<string, unknown> = {}): request.Test =>
  request(app)
    .post(URL)
    .set('Cookie', [`token=${t}`, `csrfToken=${CSRF}`])
    .set('X-CSRF-Token', CSRF)
    .send(body);

describe('POST /api/activity/heartbeat — HU-REP-06', () => {
  const tenantId = new Types.ObjectId();

  it('sin JWT → 401', async () => {
    const res = await request(app).post(URL).set('Cookie', `csrfToken=${CSRF}`).set('X-CSRF-Token', CSRF);
    expect(res.status).toBe(401);
  });

  it('sin CSRF → 403', async () => {
    const asesor = await crearAsesor(tenantId, 'Ana');
    const res = await request(app).post(URL).set('Cookie', `token=${token(asesor, tenantId)}`);
    expect(res.status).toBe(403);
  });

  it('JWT vencido → 401', async () => {
    const asesor = await crearAsesor(tenantId, 'Ana');
    const vencido = jwt.sign({ sub: asesor.toString(), tenantId: tenantId.toString(), rol: 'admin' }, SECRET, {
      expiresIn: -10,
    });
    expect((await latir(vencido)).status).toBe(401);
  });

  it('superadmin (sin tenant) → 500 de requireTenant, como toda ruta de tenant', async () => {
    expect((await latir(token(new Types.ObjectId(), null, 'superadmin'))).status).toBe(500);
  });

  it('asesor activo → 204 y acredita tiempo', async () => {
    const asesor = await crearAsesor(tenantId, 'Ana');
    const res = await latir(token(asesor, tenantId));
    expect(res.status).toBe(204);
    const cubetas = await ActividadAsesor.find({ tenantId, userId: asesor }).lean();
    expect(cubetas.reduce((t, c) => t + c.segundosActivos, 0)).toBe(60);
  });

  it('usuario desactivado → 204 sin escritura', async () => {
    const asesor = await crearAsesor(tenantId, 'Beto', { activo: false });
    expect((await latir(token(asesor, tenantId))).status).toBe(204);
    expect(await ActividadAsesor.countDocuments({})).toBe(0);
  });

  it('el tenant, el usuario o la hora del cuerpo se ignoran', async () => {
    const asesor = await crearAsesor(tenantId, 'Caro');
    const otroTenant = new Types.ObjectId();
    const res = await latir(token(asesor, tenantId), {
      tenantId: otroTenant.toString(),
      userId: new Types.ObjectId().toString(),
      hora: '2020-01-01T00:00:00Z',
    });
    expect(res.status).toBe(204);
    expect(await ActividadAsesor.countDocuments({ tenantId: otroTenant })).toBe(0);
    const [cubeta] = await ActividadAsesor.find({ tenantId }).lean();
    expect(String(cubeta?.userId)).toBe(asesor.toString());
    expect(cubeta?.hora.getUTCFullYear()).toBeGreaterThan(2020);
  });
});
