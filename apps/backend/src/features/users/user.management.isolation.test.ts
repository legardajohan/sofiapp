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
    const ajeno = await crearUsuario(tB, { nombre: 'Ajeno', rolEmpresa: 'asesor' });
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
    const base = { nombre: 'Nueva', email: 'iso@t.com', password: '12345678', rolEmpresa: 'asesor' };
    expect((await llamar(app, 'post', '/api/users', tokenDe(ownerA), { ...base, tenantId: tB })).status).toBe(400);
    const ok = await llamar(app, 'post', '/api/users', tokenDe(ownerA), base);
    expect(ok.body.tenantId).toBe(tA);
  });

  it('reasignar conversaciones a un usuario de otro tenant → 404 y nada se mueve', async () => {
    const ownerA = await crearUsuario(tA);
    const u = await crearUsuario(tA, { rolEmpresa: 'coordinador' });
    const ajeno = await crearUsuario(tB, { rolEmpresa: 'asesor' });
    await crearClienteAsignado(tA, u.id);
    const res = await llamar(app, 'patch', `/api/users/${u.id}/estado`, tokenDe(ownerA), {
      activo: false, conversaciones: { accion: 'reasignar', destinoId: ajeno.id },
    });
    expect(res.status).toBe(404);
    expect(await Cliente.countDocuments({ asesorId: u.id })).toBe(1);
    expect((await UserModel.findById(u.id).lean())?.activo).toBe(true);
  });

  it('una revocación en el tenant A no invalida el token de un usuario del tenant B', async () => {
    const uB = await crearUsuario(tB, { rolEmpresa: 'asesor' });
    // Mismo userId, otro tenant: la revocación está scoped por tenant.
    await revokeUserSessions(tA, uB.id);
    expect((await llamar(app, 'get', '/api/users', tokenDe(uB))).status).toBe(200);
  });

  // ── AUTH-04: equipos ───────────────────────────────────────────────────────────────────────
  it('coordinadorId de otro tenant → 404, en el alta y en la edición', async () => {
    const adminA = await crearUsuario(tA);
    const asesorA = await crearUsuario(tA, { rolEmpresa: 'asesor' });
    const coordB = await crearUsuario(tB, { rolEmpresa: 'coordinador' });
    const t = tokenDe(adminA);
    const alta = { nombre: 'Nueva', email: 'iso4@t.com', password: '12345678', rolEmpresa: 'asesor', coordinadorId: coordB.id };
    expect((await llamar(app, 'post', '/api/users', t, alta)).status).toBe(404);
    expect((await llamar(app, 'patch', `/api/users/${asesorA.id}`, t, { coordinadorId: coordB.id })).status).toBe(404);
    expect((await UserModel.findById(asesorA.id).lean())?.coordinadorId).toBeNull();
  });

  it('reasignar el equipo a un coordinador de otro tenant → 404 y nada se mueve', async () => {
    const adminA = await crearUsuario(tA);
    const coordA = await crearUsuario(tA, { rolEmpresa: 'coordinador' });
    const asesorA = await crearUsuario(tA, { rolEmpresa: 'asesor', coordinadorId: coordA.id });
    const coordB = await crearUsuario(tB, { rolEmpresa: 'coordinador' });
    const res = await llamar(app, 'patch', `/api/users/${coordA.id}/estado`, tokenDe(adminA), {
      activo: false, equipo: { accion: 'reasignar', coordinadorDestinoId: coordB.id },
    });
    expect(res.status).toBe(404);
    expect(String((await UserModel.findById(asesorA.id).lean())?.coordinadorId)).toBe(coordA.id);
  });

  it('un coordinador del tenant A no ve ni toca usuarios del tenant B, aunque apunten a su id', async () => {
    const coordA = await crearUsuario(tA, { rolEmpresa: 'coordinador' });
    // Un asesor de B cuyo coordinadorId coincide con el id del coordinador de A: el filtro por tenant manda.
    const asesorB = await crearUsuario(tB, { nombre: 'Asesor B', rolEmpresa: 'asesor', coordinadorId: coordA.id });
    const t = tokenDe(coordA);
    const lista = await llamar(app, 'get', '/api/users/manage', t);
    expect(lista.body).toEqual([]);
    expect((await llamar(app, 'get', `/api/users/${asesorB.id}`, t)).status).toBe(404);
    expect((await llamar(app, 'patch', `/api/users/${asesorB.id}`, t, { nombre: 'Hack' })).status).toBe(404);
  });
});
