import { describe, it, expect } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../../app.js';
import { TenantModel } from './tenant.model.js';

// SECRET debe coincidir con la variable JWT_SECRET configurada en vitest.config.ts
const SECRET = 'test_jwt_secret_32_chars_minimum_ok';

const makeSuperadminToken = () =>
  jwt.sign(
    {
      sub: '507f1f77bcf86cd799439011',
      tenantId: null,
      email: 'super@sofiapp.com',
      nombre: 'Super Admin',
      rol: 'superadmin',
      activo: true,
    },
    SECRET,
    { expiresIn: '1h' }
  );

const makeAdminToken = (tenantId: string) =>
  jwt.sign(
    {
      sub: '507f1f77bcf86cd799439012',
      tenantId,
      email: 'admin@empresa.com',
      nombre: 'Admin',
      rol: 'admin',
      activo: true,
    },
    SECRET,
    { expiresIn: '1h' }
  );

describe('GET /api/admin/tenants — aislamiento (HU-SAAS-01)', () => {
  it('sin JWT → 401', async () => {
    const res = await request(app).get('/api/admin/tenants');
    expect(res.status).toBe(401);
  });

  it('con JWT de rol admin (no superadmin) → 403', async () => {
    const tenantId = '507f1f77bcf86cd799439013';
    const token = makeAdminToken(tenantId);
    const res = await request(app)
      .get('/api/admin/tenants')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('con JWT de superadmin → 200', async () => {
    const token = makeSuperadminToken();
    const res = await request(app)
      .get('/api/admin/tenants')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(res.body).toHaveProperty('total');
  });
});

describe('POST /api/admin/tenants (HU-SAAS-01)', () => {
  it('crea empresa con datos válidos y JWT superadmin → 201', async () => {
    const token = makeSuperadminToken();
    const res = await request(app)
      .post('/api/admin/tenants')
      .set('Authorization', `Bearer ${token}`)
      .send({
        nombre: 'Nueva Empresa',
        slug: 'nueva-empresa',
        contacto: { email: 'nueva@empresa.com', telefono: '3001234567' },
      });

    expect(res.status).toBe(201);
    expect(res.body._id).toBeDefined();
    expect(res.body.nombre).toBe('Nueva Empresa');
    expect(res.body.estado).toBe('prueba');

    const db = await TenantModel.findById(res.body._id).lean();
    expect(db).not.toBeNull();
  });

  it('slug duplicado → 409', async () => {
    const token = makeSuperadminToken();
    const payload = {
      nombre: 'Dup Empresa',
      slug: 'dup-empresa',
      contacto: { email: 'dup@empresa.com', telefono: '3001234568' },
    };

    await request(app)
      .post('/api/admin/tenants')
      .set('Authorization', `Bearer ${token}`)
      .send(payload);

    const res = await request(app)
      .post('/api/admin/tenants')
      .set('Authorization', `Bearer ${token}`)
      .send(payload);

    expect(res.status).toBe(409);
  });
});
