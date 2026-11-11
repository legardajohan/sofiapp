import { vi, describe, it, expect } from 'vitest';
import { Types } from 'mongoose';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { AuditEvent } from '../audit/audit.model.js';
import { crearUsuario, llamar, tokenDe, SECRET } from '../users/user.test-helpers.js';

// AUTH-05, criterio 12: el superadmin ve al principal y le restablece la contraseña.
const publicarSesionRevocada = vi.fn();
vi.mock('../../realtime/realtime.publisher.js', () => ({ publishRealtime: vi.fn(), subscribeRealtime: vi.fn() }));
vi.mock('../../realtime/internal-bus.js', async (orig) => ({
  ...(await orig<typeof import('../../realtime/internal-bus.js')>()),
  publicarSesionRevocada: (...a: unknown[]) => publicarSesionRevocada(...a),
}));

const { default: app } = await import('../../app.js');

const SUPERADMIN_ID = new Types.ObjectId().toString();
const superadmin = (): string => jwt.sign({ sub: SUPERADMIN_ID, tenantId: null, rol: 'superadmin' }, SECRET);

describe('Superadmin · usuario principal — AUTH-05 CA-12', () => {
  it('GET …/principal devuelve id, nombre y email; sin principal → 404', async () => {
    const tA = new Types.ObjectId().toString();
    const p = await crearUsuario(tA, { esPrincipal: true, nombre: 'Pía', email: 'pia@a.com' });
    await crearUsuario(tA, { nombre: 'Otro Admin' });
    const res = await llamar(app, 'get', `/api/admin/tenants/${tA}/principal`, superadmin());
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: p.id, nombre: 'Pía', email: 'pia@a.com' });

    const sinPrincipal = new Types.ObjectId().toString();
    await crearUsuario(sinPrincipal);
    expect((await llamar(app, 'get', `/api/admin/tenants/${sinPrincipal}/principal`, superadmin())).status).toBe(404);
  });

  it('POST …/principal/password restablece SOLO al principal de ese tenant, revoca y audita', async () => {
    const tA = new Types.ObjectId().toString();
    const tB = new Types.ObjectId().toString();
    const pA = await crearUsuario(tA, { esPrincipal: true, email: 'pa@a.com', password: 'vieja-123' });
    const otroA = await crearUsuario(tA, { email: 'oa@a.com', password: 'vieja-123' });
    const pB = await crearUsuario(tB, { esPrincipal: true, email: 'pb@b.com', password: 'vieja-123' });
    const sesionVieja = tokenDe(pA, -5);

    const res = await llamar(app, 'post', `/api/admin/tenants/${tA}/principal/password`, superadmin(), {
      password: 'nueva-1234',
    });
    expect(res.status).toBe(204);

    const login = (email: string, password: string): Promise<request.Response> =>
      request(app).post('/api/auth/login').send({ email, password });
    expect((await login('pa@a.com', 'nueva-1234')).status).toBe(200);
    // Ni otro usuario de su empresa ni el principal de otra empresa se tocan.
    expect((await login('oa@a.com', 'vieja-123')).status).toBe(200);
    expect((await login('pb@b.com', 'vieja-123')).status).toBe(200);
    expect((await llamar(app, 'get', '/api/users', sesionVieja)).status).toBe(401);
    expect(publicarSesionRevocada).toHaveBeenCalledWith({ tenantId: tA, userId: pA.id });

    const ev = await AuditEvent.findOne({ accion: 'user.password_reset', entidadId: pA.id }).lean<{
      actorId: Types.ObjectId; tenantId: Types.ObjectId;
    }>();
    expect(String(ev?.actorId)).toBe(SUPERADMIN_ID);
    expect(String(ev?.tenantId)).toBe(tA);
    expect(otroA.id).not.toBe(pB.id);
  });

  it('contraseña corta → 400; un usuario de empresa (incluso el principal) → 403', async () => {
    const tA = new Types.ObjectId().toString();
    const p = await crearUsuario(tA, { esPrincipal: true });
    const url = `/api/admin/tenants/${tA}/principal/password`;
    expect((await llamar(app, 'post', url, superadmin(), { password: 'corta' })).status).toBe(400);
    expect((await llamar(app, 'post', url, tokenDe(p), { password: 'nueva-1234' })).status).toBe(403);
    expect((await llamar(app, 'get', `/api/admin/tenants/${tA}/principal`, tokenDe(p))).status).toBe(403);
  });
});
