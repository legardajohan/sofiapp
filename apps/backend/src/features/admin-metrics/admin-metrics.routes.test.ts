import { describe, it, expect } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../../app.js';

const SECRET = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const URL = '/api/admin/metrics/global';

const superadminToken = (): string =>
  jwt.sign(
    { sub: '507f1f77bcf86cd799439011', tenantId: null, email: 's@s.com', nombre: 'S', rol: 'superadmin', activo: true },
    SECRET,
    { expiresIn: '1h' }
  );

const adminToken = (): string =>
  jwt.sign(
    { sub: '507f1f77bcf86cd799439012', tenantId: '507f1f77bcf86cd799439013', email: 'a@a.com', nombre: 'A', rol: 'admin', activo: true },
    SECRET,
    { expiresIn: '1h' }
  );

describe('GET /api/admin/metrics/global — HU-SAAS-03', () => {
  it('sin JWT → 401', async () => {
    const res = await request(app).get(URL);
    expect(res.status).toBe(401);
  });

  it('rol admin → 403', async () => {
    const res = await request(app).get(URL).set('Cookie', `token=${adminToken()}`);
    expect(res.status).toBe(403);
  });

  it('superadmin → 200 con la forma del contrato', async () => {
    const res = await request(app).get(URL).set('Cookie', `token=${superadminToken()}`);
    expect(res.status).toBe(200);
    expect(Object.keys(res.body).sort()).toEqual(
      ['consolidado', 'generadoAt', 'porEmpresa', 'rango', 'serieMensual'].sort()
    );
    expect(res.body.rango).toBeNull();
    expect(res.body.serieMensual).toHaveLength(6);
    expect(res.body.porEmpresa).toEqual({ items: [], page: 1, limit: 20, total: 0 });
  });

  it.each([
    ['hasta < desde', '?desde=2026-10-01&hasta=2026-09-01'],
    ['fecha inválida', '?desde=no-es-fecha'],
    ['limit > 100', '?limit=101'],
    ['sort desconocido', '?sort=foo'],
    ['estado desconocido', '?estado=borrado'],
  ])('query inválida (%s) → 400', async (_caso, qs) => {
    const res = await request(app).get(`${URL}${qs}`).set('Cookie', `token=${superadminToken()}`);
    expect(res.status).toBe(400);
  });
});
