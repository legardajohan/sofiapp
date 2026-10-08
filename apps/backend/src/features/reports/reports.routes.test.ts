import { describe, it, expect } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../../app.js';

const SECRET = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const URL = '/api/reports/by-advisor';
const TENANT = '507f1f77bcf86cd799439013';

function token(rol: 'admin' | 'superadmin', subrol?: string): string {
  return jwt.sign(
    {
      sub: '507f1f77bcf86cd799439012',
      tenantId: rol === 'superadmin' ? null : TENANT,
      email: 'a@a.com',
      nombre: 'A',
      rol,
      ...(subrol ? { subrol } : {}),
      activo: true,
    },
    SECRET,
    { expiresIn: '1h' },
  );
}

const get = (t: string, qs = ''): request.Test => request(app).get(`${URL}${qs}`).set('Cookie', `token=${t}`);

describe('GET /api/reports/by-advisor — HU-REP-01', () => {
  it('sin JWT → 401', async () => {
    expect((await request(app).get(URL)).status).toBe(401);
  });

  it('superadmin (sin tenant) no accede: requireTenant lo corta como en toda ruta de tenant', async () => {
    expect((await get(token('superadmin'))).status).toBe(500);
  });

  it.each(['coordinator', 'secretary'])('admin con subrol %s → 403', async (subrol) => {
    expect((await get(token('admin', subrol))).status).toBe(403);
  });

  it.each([undefined, 'director', 'manager'])('admin con subrol %s → 200 con la forma del contrato', async (subrol) => {
    const res = await get(token('admin', subrol));
    expect(res.status).toBe(200);
    expect(Object.keys(res.body).sort()).toEqual(['generadoAt', 'porAsesor', 'rango', 'sinAsignar', 'totales']);
    expect(res.body.totales).toEqual({ asesores: 0, conversacionesAtendidas: 0, asignadasActivas: 0, ventas: 0, tasaCierre: 0 });
  });

  it('sin query, el rango son los últimos 30 días', async () => {
    const res = await get(token('admin'));
    const { desde, hasta } = res.body.rango as { desde: string; hasta: string };
    const dias = Math.round((Date.parse(hasta) - Date.parse(desde)) / 86_400_000);
    expect(dias).toBe(30);
  });

  it.each([
    ['hasta < desde', '?desde=2026-10-01&hasta=2026-09-01'],
    ['fecha inválida', '?desde=no-es-fecha'],
    ['rango > 366 días', '?desde=2025-01-01&hasta=2026-06-01'],
  ])('query inválida (%s) → 400', async (_caso, qs) => {
    expect((await get(token('admin'), qs)).status).toBe(400);
  });
});
