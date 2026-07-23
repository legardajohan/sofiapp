import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../../app.js';
import { Plan } from './plan.model.js';

const SECRET = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const CSRF = 'test-csrf-token';
const token = () =>
  jwt.sign(
    { sub: '507f1f77bcf86cd799439011', tenantId: null, email: 's@s.com', nombre: 'S', rol: 'superadmin', activo: true },
    SECRET,
    { expiresIn: '1h' },
  );
const H = { Cookie: [`token=${token()}`, `csrfToken=${CSRF}`], 'X-CSRF-Token': CSRF };
const limites = { usuarios: 3, administradores: 3, mensajesMes: 1000, leads: 500, campanasMes: 2 };

// Simula una base REAL sin migrar: índice único legacy sobre `nombre` (además del compuesto).
// Antes de la corrección, chocar con este índice devolvía 500 ("Error interno del servidor").
beforeEach(async () => {
  await Plan.collection.createIndex({ nombre: 1 }, { unique: true, name: 'nombre_1' });
});

describe('plan — E11000 (índice único) se maneja como 409, no 500', () => {
  it('editar SIN renombrar funciona (200)', async () => {
    const p = await Plan.create({ nombre: 'Pro', periodicidad: 'anual', limites, precio: 100, activo: true });
    const res = await request(app)
      .patch(`/api/admin/plans/${p._id.toString()}`)
      .set(H)
      .send({ nombre: 'Pro', periodicidad: 'anual', limites, precio: 150, activo: true });
    expect(res.status).toBe(200);
    expect(res.body.precio).toBe(150);
  });

  it('renombrar chocando con el índice legacy responde 409 (no 500)', async () => {
    await Plan.create({ nombre: 'Alfa', periodicidad: 'mensual', limites, precio: 10, activo: true });
    const beta = await Plan.create({ nombre: 'Beta', periodicidad: 'anual', limites, precio: 20, activo: true });
    const res = await request(app)
      .patch(`/api/admin/plans/${beta._id.toString()}`)
      .set(H)
      .send({ nombre: 'Alfa', periodicidad: 'anual', limites, precio: 20, activo: true });
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/Ya existe un plan/i);
  });
});
