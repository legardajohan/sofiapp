import { describe, it, expect } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../../app.js';
import { Plan } from './plan.model.js';
import { Tenant } from '../tenant/tenant.model.js';

const SECRET = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const CSRF = 'test-csrf-token';

const superadminToken = () =>
  jwt.sign(
    { sub: '507f1f77bcf86cd799439011', tenantId: null, email: 's@s.com', nombre: 'S', rol: 'superadmin', activo: true },
    SECRET,
    { expiresIn: '1h' }
  );

const adminToken = () =>
  jwt.sign(
    { sub: '507f1f77bcf86cd799439012', tenantId: '507f1f77bcf86cd799439013', email: 'a@a.com', nombre: 'A', rol: 'admin', activo: true },
    SECRET,
    { expiresIn: '1h' }
  );

const limites = { usuarios: 3, administradores: 3, mensajesMes: 1000, leads: 500, campanasMes: 2 };
const mutHeaders = (token: string) => ({ Cookie: [`token=${token}`, `csrfToken=${CSRF}`], 'X-CSRF-Token': CSRF });

describe('/api/admin/plans — HU-SAAS-02', () => {
  it('GET sin JWT → 401', async () => {
    const res = await request(app).get('/api/admin/plans');
    expect(res.status).toBe(401);
  });

  it('GET con rol admin (no superadmin) → 403', async () => {
    const res = await request(app).get('/api/admin/plans').set('Cookie', `token=${adminToken()}`);
    expect(res.status).toBe(403);
  });

  it('POST con superadmin y datos válidos → 201', async () => {
    const res = await request(app)
      .post('/api/admin/plans')
      .set(mutHeaders(superadminToken()))
      .send({ nombre: 'Pro', limites, precio: 199 });

    expect(res.status).toBe(201);
    expect(res.body._id).toBeDefined();
    expect(res.body.limites.leads).toBe(500);
  });

  it('GET ?activo=true / ?activo=false filtra correctamente (regresión validate.middleware)', async () => {
    await Plan.create({ nombre: 'RouteActivoQA', limites, precio: 0, activo: true });
    await Plan.create({ nombre: 'RouteInactivoQA', limites, precio: 0, activo: false });

    const activos = await request(app)
      .get('/api/admin/plans?activo=true')
      .set('Cookie', `token=${superadminToken()}`);
    expect(activos.status).toBe(200);
    expect(activos.body.every((p: { activo: boolean }) => p.activo === true)).toBe(true);
    expect(activos.body.some((p: { nombre: string }) => p.nombre === 'RouteActivoQA')).toBe(true);

    const inactivos = await request(app)
      .get('/api/admin/plans?activo=false')
      .set('Cookie', `token=${superadminToken()}`);
    expect(inactivos.status).toBe(200);
    expect(inactivos.body.every((p: { activo: boolean }) => p.activo === false)).toBe(true);
    expect(inactivos.body.some((p: { nombre: string }) => p.nombre === 'RouteInactivoQA')).toBe(true);
  });
});

describe('/api/admin/tenants/:id/plan y /usage — HU-SAAS-02', () => {
  it('PATCH .../plan asigna un plan activo → 200; plan inactivo → 409', async () => {
    const activo = await Plan.create({ nombre: 'Activo', limites, precio: 0, activo: true });
    const inactivo = await Plan.create({ nombre: 'Inactivo', limites, precio: 0, activo: false });
    const tenant = await Tenant.create({
      nombre: 'Empresa',
      slug: 'empresa-plan',
      contacto: { email: 'e@t.com', telefono: '3000000000' },
      estado: 'activo',
    });

    const ok = await request(app)
      .patch(`/api/admin/tenants/${tenant._id.toString()}/plan`)
      .set(mutHeaders(superadminToken()))
      .send({ planId: activo._id.toString() });
    expect(ok.status).toBe(200);
    expect(ok.body.planId).toBe(activo._id.toString());

    const bad = await request(app)
      .patch(`/api/admin/tenants/${tenant._id.toString()}/plan`)
      .set(mutHeaders(superadminToken()))
      .send({ planId: inactivo._id.toString() });
    expect(bad.status).toBe(409);
  });

  it('GET .../usage → 200 con métricas y plan', async () => {
    const plan = await Plan.create({ nombre: 'Básico', limites, precio: 0 });
    const tenant = await Tenant.create({
      nombre: 'Empresa Uso',
      slug: 'empresa-uso',
      contacto: { email: 'u@t.com', telefono: '3000000001' },
      estado: 'activo',
      planId: plan._id,
    });

    const res = await request(app)
      .get(`/api/admin/tenants/${tenant._id.toString()}/usage`)
      .set('Cookie', `token=${superadminToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.plan.nombre).toBe('Básico');
    expect(res.body.metrics.mensajesMes.limite).toBe(1000);
  });
});
