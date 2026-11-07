import { describe, it, expect } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../../app.js';

const SECRET = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const URL = '/api/reports/advisor-activity';
const TENANT = '507f1f77bcf86cd799439013';

function token(rol: 'admin' | 'superadmin', subrol?: string): string {
  return jwt.sign(
    {
      sub: '507f1f77bcf86cd799439012',
      tenantId: rol === 'superadmin' ? null : TENANT,
      rol,
      ...(subrol ? { subrol } : {}),
    },
    SECRET,
    { expiresIn: '1h' },
  );
}

const get = (t: string, qs = ''): request.Test => request(app).get(`${URL}${qs}`).set('Cookie', `token=${t}`);

describe('GET /api/reports/advisor-activity — HU-REP-06', () => {
  it('sin JWT → 401', async () => {
    expect((await request(app).get(URL)).status).toBe(401);
  });

  it('superadmin (sin tenant) → 500 de requireTenant', async () => {
    expect((await get(token('superadmin'))).status).toBe(500);
  });

  it.each(['coordinator', 'secretary'])('admin con subrol %s → 403', async (subrol) => {
    expect((await get(token('admin', subrol))).status).toBe(403);
  });

  it.each([undefined, 'director', 'manager'])('admin con subrol %s → 200 con la forma del contrato', async (subrol) => {
    const res = await get(token('admin', subrol));
    expect(res.status).toBe(200);
    expect(Object.keys(res.body).sort()).toEqual([
      'asesores',
      'generadoAt',
      'granularidad',
      'periodos',
      'rango',
      'timezone',
    ]);
  });

  it('sin query: 30 días por día en UTC', async () => {
    const res = await get(token('admin'));
    expect(res.body.granularidad).toBe('dia');
    expect(res.body.timezone).toBe('UTC');
    expect(res.body.periodos).toHaveLength(30);
  });

  it('granularidad y zona viajan a la respuesta', async () => {
    const res = await get(token('admin'), '?granularidad=semana&tz=America/Bogota&desde=2026-09-01&hasta=2026-09-30');
    expect(res.status).toBe(200);
    expect(res.body.granularidad).toBe('semana');
    expect(res.body.timezone).toBe('America/Bogota');
  });

  it.each([
    ['granularidad desconocida', '?granularidad=anio'],
    ['zona desconocida', '?tz=Mars/Base'],
    ['asesorId inválido', '?asesorId=no-es-id'],
    ['hasta < desde', '?desde=2026-10-01&hasta=2026-09-01'],
    ['rango > 366 días', '?desde=2025-01-01&hasta=2026-06-01'],
  ])('query inválida (%s) → 400', async (_caso, qs) => {
    expect((await get(token('admin'), qs)).status).toBe(400);
  });
});
