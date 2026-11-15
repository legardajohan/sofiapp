import { vi, describe, it, expect } from 'vitest';
import { Types } from 'mongoose';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { AuditEvent } from '../audit/audit.model.js';
import { crearUsuario, llamar, tokenDe, CSRF, SECRET } from '../users/user.test-helpers.js';

// AUTH-05, criterio 10: el usuario cambia su propia contraseña con la actual.
const publicarSesionRevocada = vi.fn();
vi.mock('../../realtime/realtime.publisher.js', () => ({ publishRealtime: vi.fn(), subscribeRealtime: vi.fn() }));
vi.mock('../../realtime/internal-bus.js', async (orig) => ({
  ...(await orig<typeof import('../../realtime/internal-bus.js')>()),
  publicarSesionRevocada: (...a: unknown[]) => publicarSesionRevocada(...a),
}));

const { default: app } = await import('../../app.js');

const URL = '/api/auth/me/password';

/** Saca el valor de la cookie `token` de un `Set-Cookie`. */
function tokenDeCookies(res: request.Response): string | undefined {
  const cookies = ([] as string[]).concat(res.headers['set-cookie'] ?? []);
  const c = cookies.find((v) => v.startsWith('token='));
  return c?.split(';')[0]?.slice('token='.length);
}

describe('PATCH /api/auth/me/password — AUTH-05 CA-10', () => {
  const tenantId = new Types.ObjectId().toString();

  it('contraseña actual incorrecta → 400 y nada cambia', async () => {
    const u = await crearUsuario(tenantId, { email: 'p@t.com', password: 'actual-123' });
    const res = await llamar(app, 'patch', URL, tokenDe(u), { actual: 'otra-cosa', nueva: 'nueva-1234' });
    expect(res.status).toBe(400);
    const login = await request(app).post('/api/auth/login').send({ email: 'p@t.com', password: 'actual-123' });
    expect(login.status).toBe(200);
  });

  it('nueva demasiado corta o campos extra → 400', async () => {
    const u = await crearUsuario(tenantId, { password: 'actual-123' });
    const t = tokenDe(u);
    expect((await llamar(app, 'patch', URL, t, { actual: 'actual-123', nueva: 'corta' })).status).toBe(400);
    expect((await llamar(app, 'patch', URL, t, { actual: 'actual-123', nueva: 'nueva-1234', userId: 'x' })).status).toBe(400);
  });

  it('correcta: revoca las sesiones viejas, reemite la cookie y audita', async () => {
    const u = await crearUsuario(tenantId, {
      rolEmpresa: 'asesor', email: 'q@t.com', password: 'actual-123', esPrincipal: false,
    });
    const viejo = tokenDe(u, -5);
    const res = await llamar(app, 'patch', URL, viejo, { actual: 'actual-123', nueva: 'nueva-1234' });
    expect(res.status).toBe(204);

    const nuevo = tokenDeCookies(res);
    expect(nuevo).toBeDefined();
    // El token nuevo nace después de la revocación: la sesión actual sigue viva.
    const conNuevo = await request(app).get('/api/auth/me').set('Cookie', [`token=${nuevo}`, `csrfToken=${CSRF}`]);
    expect(conNuevo.status).toBe(200);
    expect(jwt.verify(nuevo!, SECRET)).toMatchObject({ sub: u.id, tenantId, rolEmpresa: 'asesor' });
    // Las demás sesiones quedan fuera.
    expect((await llamar(app, 'get', '/api/users', viejo)).status).toBe(401);
    expect(publicarSesionRevocada).toHaveBeenCalledWith({ tenantId, userId: u.id });

    expect((await request(app).post('/api/auth/login').send({ email: 'q@t.com', password: 'actual-123' })).status).toBe(401);
    expect((await request(app).post('/api/auth/login').send({ email: 'q@t.com', password: 'nueva-1234' })).status).toBe(200);
    expect(await AuditEvent.countDocuments({ accion: 'user.password_changed', entidadId: u.id })).toBe(1);
  });

  it('el principal también la cambia; el reset de gestión sobre uno mismo sigue en 409', async () => {
    const p = await crearUsuario(tenantId, { esPrincipal: true, password: 'actual-123' });
    const t = tokenDe(p);
    expect((await llamar(app, 'post', `/api/users/${p.id}/password`, t, { password: '12345678' })).status).toBe(409);
    expect((await llamar(app, 'patch', URL, t, { actual: 'actual-123', nueva: 'nueva-1234' })).status).toBe(204);
  });

  it('el superadmin (sin tenant) no usa este endpoint', async () => {
    const t = jwt.sign({ sub: new Types.ObjectId().toString(), tenantId: null, rol: 'superadmin' }, SECRET);
    const res = await llamar(app, 'patch', URL, t, { actual: 'x', nueva: 'nueva-1234' });
    expect(res.status).not.toBe(204);
  });
});
