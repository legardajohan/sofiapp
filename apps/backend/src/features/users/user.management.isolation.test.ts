import { vi, describe, it, expect } from 'vitest';
import { Types } from 'mongoose';
import { Cliente } from '../cliente/cliente.model.js';
import { revokeUserSessions } from '../auth/session.service.js';
import { UserModel } from './user.model.js';
import { crearClienteAsignado, crearUsuario, llamar, tokenDe } from './user.test-helpers.js';

// Test de aislamiento obligatorio (docs/multi-tenancy.md §8) de la gestión de usuarios — AUTH-03.
vi.mock('../../realtime/realtime.publisher.js', () => ({ publishRealtime: vi.fn(), subscribeRealtime: vi.fn() }));
vi.mock('../../realtime/internal-bus.js', async (orig) => ({
  ...(await orig<typeof import('../../realtime/internal-bus.js')>()),
  publicarSesionRevocada: vi.fn(),
}));

const { default: app } = await import('../../app.js');

describe('users — aislamiento multi-tenant (gestión, AUTH-03)', () => {
  const tA = new Types.ObjectId().toString();
  const tB = new Types.ObjectId().toString();

  it('GET/PATCH/estado/password sobre un usuario de otro tenant → 404 sin cambios', async () => {
    const ownerA = await crearUsuario(tA, { nombre: 'Owner A' });
    const ajeno = await crearUsuario(tB, { nombre: 'Ajeno', subrol: 'secretary' });
    const t = tokenDe(ownerA);

    expect((await llamar(app, 'get', `/api/users/${ajeno.id}`, t)).status).toBe(404);
    expect((await llamar(app, 'patch', `/api/users/${ajeno.id}`, t, { nombre: 'Hackeado' })).status).toBe(404);
    expect((await llamar(app, 'patch', `/api/users/${ajeno.id}/estado`, t, { activo: false })).status).toBe(404);
    expect((await llamar(app, 'post', `/api/users/${ajeno.id}/password`, t, { password: '12345678' })).status).toBe(404);

    const doc = await UserModel.findById(ajeno.id).lean();
    expect(doc?.nombre).toBe('Ajeno');
    expect(doc?.activo).toBe(true);
  });

  it('/manage nunca lista usuarios de otro tenant ni al superadmin', async () => {
    const ownerA = await crearUsuario(tA, { nombre: 'Owner A' });
    await crearUsuario(tB, { nombre: 'Ajeno' });
    await UserModel.create({ tenantId: null, nombre: 'Root', email: 'root2@t.com', passwordHash: 'h', rol: 'superadmin' });
    const res = await llamar(app, 'get', '/api/users/manage', tokenDe(ownerA));
    expect(res.body.map((u: { nombre: string }) => u.nombre)).toEqual(['Owner A']);
  });

  it('el alta ignora cualquier intento de elegir tenant: rechaza el campo y crea en el del token', async () => {
    const ownerA = await crearUsuario(tA);
    const base = { nombre: 'Nueva', email: 'iso@t.com', password: '12345678', subrol: 'secretary' };
    expect((await llamar(app, 'post', '/api/users', tokenDe(ownerA), { ...base, tenantId: tB })).status).toBe(400);
    const ok = await llamar(app, 'post', '/api/users', tokenDe(ownerA), base);
    expect(ok.body.tenantId).toBe(tA);
  });

  it('reasignar conversaciones a un usuario de otro tenant → 404 y nada se mueve', async () => {
    const ownerA = await crearUsuario(tA);
    const u = await crearUsuario(tA, { subrol: 'coordinator' });
    const ajeno = await crearUsuario(tB, { subrol: 'secretary' });
    await crearClienteAsignado(tA, u.id);
    const res = await llamar(app, 'patch', `/api/users/${u.id}/estado`, tokenDe(ownerA), {
      activo: false, conversaciones: { accion: 'reasignar', destinoId: ajeno.id },
    });
    expect(res.status).toBe(404);
    expect(await Cliente.countDocuments({ asesorId: u.id })).toBe(1);
    expect((await UserModel.findById(u.id).lean())?.activo).toBe(true);
  });

  it('una revocación en el tenant A no invalida el token de un usuario del tenant B', async () => {
    const uB = await crearUsuario(tB, { subrol: 'secretary' });
    // Mismo userId, otro tenant: la revocación está scoped por tenant.
    await revokeUserSessions(tA, uB.id);
    expect((await llamar(app, 'get', '/api/users', tokenDe(uB))).status).toBe(200);
  });
});
