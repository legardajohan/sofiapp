import { vi, describe, it, expect } from 'vitest';
import { Types } from 'mongoose';
import request from 'supertest';
import { AuditEvent } from '../audit/audit.model.js';
import { Cliente } from '../cliente/cliente.model.js';
import { Plan } from '../plan/plan.model.js';
import { Tenant } from '../tenant/tenant.model.js';
import { UserModel } from './user.model.js';
import { crearClienteAsignado, crearUsuario, llamar, tokenDe } from './user.test-helpers.js';

// AUTH-05, criterios 11 y 14: borrado lógico y uso del plan.
vi.mock('../../realtime/realtime.publisher.js', () => ({ publishRealtime: vi.fn(), subscribeRealtime: vi.fn() }));
vi.mock('../../realtime/internal-bus.js', async (orig) => ({
  ...(await orig<typeof import('../../realtime/internal-bus.js')>()),
  publicarSesionRevocada: vi.fn(),
}));

const { default: app } = await import('../../app.js');

async function tenantConPlan(limites: { usuarios: number; administradores: number }): Promise<string> {
  const plan = await Plan.create({
    nombre: `Plan ${new Types.ObjectId().toString()}`,
    limites: { ...limites, mensajesMes: 10, leads: 10, campanasMes: 1 },
    precio: 0,
  });
  const slug = `t-${new Types.ObjectId().toString()}`;
  const t = await Tenant.create({
    nombre: 'Cupo', slug, contacto: { email: 'c@t.com', telefono: '3000000000' }, estado: 'activo', planId: plan._id,
  });
  return t._id.toString();
}

describe('Eliminar usuario (borrado lógico) — AUTH-05 CA-11', () => {
  const tenantId = new Types.ObjectId().toString();

  it('a sí mismo → 409; al principal → 403', async () => {
    const principal = await crearUsuario(tenantId, { esPrincipal: true });
    const admin = await crearUsuario(tenantId, { puedeGestionarAdministradores: true });
    expect((await llamar(app, 'delete', `/api/users/${admin.id}`, tokenDe(admin))).status).toBe(409);
    expect((await llamar(app, 'delete', `/api/users/${principal.id}`, tokenDe(admin))).status).toBe(403);
  });

  it('con conversaciones sin decidir → 409 USER_HAS_DEPENDENCIES sin cambios; resolviéndolas → 200', async () => {
    const principal = await crearUsuario(tenantId, { esPrincipal: true });
    const asesor = await crearUsuario(tenantId, { rolEmpresa: 'asesor' });
    await crearClienteAsignado(tenantId, asesor.id);
    const t = tokenDe(principal);
    const sin = await llamar(app, 'delete', `/api/users/${asesor.id}`, t);
    expect(sin.status).toBe(409);
    expect(sin.body).toMatchObject({ code: 'USER_HAS_DEPENDENCIES', asignadas: 1 });
    expect((await UserModel.findById(asesor.id).lean())?.eliminado).toBe(false);

    const ok = await llamar(app, 'delete', `/api/users/${asesor.id}`, t, {
      conversaciones: { accion: 'reasignar', destinoId: principal.id },
    });
    expect(ok.status).toBe(200);
    expect(await Cliente.countDocuments({ asesorId: new Types.ObjectId(principal.id) })).toBe(1);
  });

  it('el eliminado desaparece, no inicia sesión, libera su email y no se reactiva', async () => {
    const principal = await crearUsuario(tenantId, { esPrincipal: true });
    const asesor = await crearUsuario(tenantId, {
      rolEmpresa: 'asesor', nombre: 'Borra Ble', email: 'borrable@t.com', password: 'clave-1234',
    });
    const t = tokenDe(principal);
    const tokenAsesor = tokenDe(asesor);
    expect((await llamar(app, 'delete', `/api/users/${asesor.id}`, t)).status).toBe(200);

    const doc = await UserModel.findById(asesor.id).lean();
    expect(doc).toMatchObject({
      eliminado: true, activo: false, emailOriginal: 'borrable@t.com', email: `${asesor.id}.eliminado@invalid.sofiapp`,
    });
    // Fuera de listados y selectores (también de los inactivos).
    const manage = await llamar(app, 'get', '/api/users/manage', t);
    expect(manage.body.map((u: { id: string }) => u.id)).not.toContain(asesor.id);
    for (const qs of ['', '?activo=false']) {
      const sel = await llamar(app, 'get', `/api/users${qs}`, t);
      expect(sel.body.map((u: { id: string }) => u.id)).not.toContain(asesor.id);
    }
    expect((await llamar(app, 'get', `/api/users/${asesor.id}`, t)).status).toBe(404);
    // Sesión revocada y login cerrado.
    expect((await llamar(app, 'get', '/api/users', tokenAsesor)).status).toBe(401);
    const login = await request(app).post('/api/auth/login').send({ email: 'borrable@t.com', password: 'clave-1234' });
    expect(login.status).toBe(401);
    // El email queda libre y el eliminado no se reactiva.
    const reuso = await llamar(app, 'post', '/api/users', t, {
      nombre: 'Otra Persona', email: 'borrable@t.com', password: '12345678', rolEmpresa: 'asesor',
    });
    expect(reuso.status).toBe(201);
    expect((await llamar(app, 'patch', `/api/users/${asesor.id}/estado`, t, { activo: true })).status).toBe(404);
    // Auditoría con el email original.
    const ev = await AuditEvent.findOne({ accion: 'user.deleted' }).lean<{ antes: { email: string } }>();
    expect(ev?.antes.email).toBe('borrable@t.com');
  });

  it('el coordinador elimina asesores de su alcance; uno de otro equipo → 404', async () => {
    const coord = await crearUsuario(tenantId, { rolEmpresa: 'coordinador' });
    const otro = await crearUsuario(tenantId, { rolEmpresa: 'coordinador' });
    const libre = await crearUsuario(tenantId, { rolEmpresa: 'asesor' });
    const ajeno = await crearUsuario(tenantId, { rolEmpresa: 'asesor', coordinadorId: otro.id });
    const t = tokenDe(coord);
    expect((await llamar(app, 'delete', `/api/users/${libre.id}`, t)).status).toBe(200);
    expect((await llamar(app, 'delete', `/api/users/${ajeno.id}`, t)).status).toBe(404);
  });

  it('el eliminado no cuenta en el cupo del plan', async () => {
    const t = await tenantConPlan({ usuarios: 2, administradores: 1 });
    const principal = await crearUsuario(t, { esPrincipal: true });
    const asesor = await crearUsuario(t, { rolEmpresa: 'asesor' });
    const tk = tokenDe(principal);
    const alta = { nombre: 'Tercera', email: 'tercera@t.com', password: '12345678', rolEmpresa: 'asesor' };
    expect((await llamar(app, 'post', '/api/users', tk, alta)).status).toBe(429);
    expect((await llamar(app, 'delete', `/api/users/${asesor.id}`, tk)).status).toBe(200);
    expect((await llamar(app, 'post', '/api/users', tk, alta)).status).toBe(201);
  });

  it('AISLAMIENTO: eliminar un usuario de otro tenant → 404 y queda intacto', async () => {
    const principal = await crearUsuario(tenantId, { esPrincipal: true });
    const ajeno = await crearUsuario(new Types.ObjectId().toString(), { rolEmpresa: 'asesor' });
    expect((await llamar(app, 'delete', `/api/users/${ajeno.id}`, tokenDe(principal))).status).toBe(404);
    expect((await UserModel.findById(ajeno.id).lean())?.eliminado).toBe(false);
  });
});

describe('GET /api/users/cupo — AUTH-05 CA-14', () => {
  it('sin plan: límites null; cuenta usuarios activos y administradores', async () => {
    const tenantId = new Types.ObjectId().toString();
    const principal = await crearUsuario(tenantId, { esPrincipal: true });
    await crearUsuario(tenantId, { rolEmpresa: 'asesor' });
    await crearUsuario(tenantId, { rolEmpresa: 'asesor', activo: false });
    const res = await llamar(app, 'get', '/api/users/cupo', tokenDe(principal));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      usuarios: { usado: 2, limite: null },
      administradores: { usado: 1, limite: null },
    });
  });

  it('con plan: devuelve sus límites; el coordinador también lo ve', async () => {
    const t = await tenantConPlan({ usuarios: 10, administradores: 3 });
    await crearUsuario(t, { esPrincipal: true });
    const coord = await crearUsuario(t, { rolEmpresa: 'coordinador' });
    const res = await llamar(app, 'get', '/api/users/cupo', tokenDe(coord));
    expect(res.body).toEqual({
      usuarios: { usado: 2, limite: 10 },
      administradores: { usado: 1, limite: 3 },
    });
  });
});
