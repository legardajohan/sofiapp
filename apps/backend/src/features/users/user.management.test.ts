import { vi, describe, it, expect } from 'vitest';
import { Types } from 'mongoose';
import { AuditEvent } from '../audit/audit.model.js';
import { Cliente } from '../cliente/cliente.model.js';
import { Flow } from '../flow/flow.model.js';
import { Plan } from '../plan/plan.model.js';
import { Tenant } from '../tenant/tenant.model.js';
import { UserModel } from './user.model.js';
import {
  crearClienteAsignado,
  crearUsuario,
  llamar,
  tokenDe,
  type IUsuarioPrueba,
} from './user.test-helpers.js';

// Sin Redis en tests: el puente de tiempo real y el bus interno se sustituyen.
const publishRealtime = vi.fn();
const publicarSesionRevocada = vi.fn();
vi.mock('../../realtime/realtime.publisher.js', () => ({
  publishRealtime: (...a: unknown[]) => publishRealtime(...a),
  subscribeRealtime: vi.fn(),
}));
vi.mock('../../realtime/internal-bus.js', async (orig) => ({
  ...(await orig<typeof import('../../realtime/internal-bus.js')>()),
  publicarSesionRevocada: (...a: unknown[]) => publicarSesionRevocada(...a),
}));

const { default: app } = await import('../../app.js');

const tenantId = new Types.ObjectId().toString();

async function escenario(): Promise<{ owner: IUsuarioPrueba; director: IUsuarioPrueba }> {
  const owner = await crearUsuario(tenantId, { nombre: 'Propietario' });
  const director = await crearUsuario(tenantId, { nombre: 'Directora', subrol: 'director' });
  return { owner, director };
}

describe('Gestión de usuarios — AUTH-03', () => {
  describe('gate de gestión (criterio 5)', () => {
    it.each(['manager', 'coordinator', 'secretary'] as const)('%s → 403 en gestión', async (subrol) => {
      await escenario();
      const u = await crearUsuario(tenantId, { subrol });
      const t = tokenDe(u);
      expect((await llamar(app, 'get', '/api/users/manage', t)).status).toBe(403);
      expect((await llamar(app, 'post', '/api/users', t, {
        nombre: 'Nuevo', email: 'n@t.com', password: '12345678', subrol: 'secretary',
      })).status).toBe(403);
      expect((await llamar(app, 'patch', `/api/users/${u.id}/estado`, t, { activo: false })).status).toBe(403);
    });

    it('el selector GET /api/users sigue abierto a cualquier admin', async () => {
      await escenario();
      const u = await crearUsuario(tenantId, { subrol: 'secretary' });
      expect((await llamar(app, 'get', '/api/users', tokenDe(u))).status).toBe(200);
    });

    it('director y propietario acceden a /manage', async () => {
      const { owner, director } = await escenario();
      expect((await llamar(app, 'get', '/api/users/manage', tokenDe(owner))).status).toBe(200);
      expect((await llamar(app, 'get', '/api/users/manage', tokenDe(director))).status).toBe(200);
    });
  });

  describe('listados (criterio 1)', () => {
    it('GET /api/users?activo=false devuelve inactivos (regresión de z.coerce.boolean)', async () => {
      const { owner } = await escenario();
      await crearUsuario(tenantId, { nombre: 'Inactivo', subrol: 'secretary', activo: false });
      const res = await llamar(app, 'get', '/api/users?activo=false', tokenDe(owner));
      expect(res.status).toBe(200);
      expect(res.body.map((u: { nombre: string }) => u.nombre)).toEqual(['Inactivo']);
    });

    it('/manage filtra por activo, subrol y q, y no expone passwordHash', async () => {
      const { owner } = await escenario();
      await crearUsuario(tenantId, { nombre: 'Carla Coordinadora', subrol: 'coordinator' });
      await crearUsuario(tenantId, { nombre: 'Inés', subrol: 'secretary', activo: false });
      const t = tokenDe(owner);

      expect((await llamar(app, 'get', '/api/users/manage', t)).body).toHaveLength(4);
      expect((await llamar(app, 'get', '/api/users/manage?activo=false', t)).body).toHaveLength(1);
      const porSubrol = await llamar(app, 'get', '/api/users/manage?subrol=coordinator', t);
      expect(porSubrol.body[0].nombre).toBe('Carla Coordinadora');
      const porTexto = await llamar(app, 'get', '/api/users/manage?q=carla', t);
      expect(porTexto.body).toHaveLength(1);
      expect(porTexto.body[0]).not.toHaveProperty('passwordHash');
    });
  });

  describe('alta (criterio 3)', () => {
    it('crea un admin con subrol en el tenant del token y audita', async () => {
      const { owner } = await escenario();
      const res = await llamar(app, 'post', '/api/users', tokenDe(owner), {
        nombre: 'Nueva', email: 'NUEVA@T.com', password: '12345678', subrol: 'coordinator',
      });
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ rol: 'admin', subrol: 'coordinator', email: 'nueva@t.com', tenantId });
      expect(await AuditEvent.countDocuments({ accion: 'user.created' })).toBe(1);
    });

    it('sin subrol → 400', async () => {
      const { owner } = await escenario();
      const res = await llamar(app, 'post', '/api/users', tokenDe(owner), {
        nombre: 'Nueva', email: 'n@t.com', password: '12345678',
      });
      expect(res.status).toBe(400);
    });

    it('rol o tenantId en el body → 400 (strict)', async () => {
      const { owner } = await escenario();
      const base = { nombre: 'Nueva', email: 'n@t.com', password: '12345678', subrol: 'secretary' };
      expect((await llamar(app, 'post', '/api/users', tokenDe(owner), { ...base, rol: 'superadmin' })).status).toBe(400);
      expect((await llamar(app, 'post', '/api/users', tokenDe(owner), {
        ...base, tenantId: new Types.ObjectId().toString(),
      })).status).toBe(400);
    });

    it('email ya usado en OTRO tenant → 409 genérico', async () => {
      const { owner } = await escenario();
      await crearUsuario(new Types.ObjectId().toString(), { email: 'dup@t.com' });
      const res = await llamar(app, 'post', '/api/users', tokenDe(owner), {
        nombre: 'Nueva', email: 'dup@t.com', password: '12345678', subrol: 'secretary',
      });
      expect(res.status).toBe(409);
      expect(JSON.stringify(res.body)).not.toContain('tenant');
    });

    it('respeta la cuota de usuarios del plan → 429', async () => {
      const plan = await Plan.create({
        nombre: 'Mini',
        limites: { usuarios: 1, administradores: 5, mensajesMes: 10, leads: 10, campanasMes: 1 },
        precio: 0,
      });
      const tenant = await Tenant.create({
        nombre: 'Cuota', slug: 'cuota-auth03', contacto: { email: 'c@t.com', telefono: '3000000000' },
        estado: 'activo', planId: plan._id,
      });
      const owner = await crearUsuario(tenant._id.toString());
      const res = await llamar(app, 'post', '/api/users', tokenDe(owner), {
        nombre: 'Nueva', email: 'n@t.com', password: '12345678', subrol: 'secretary',
      });
      expect(res.status).toBe(429);
    });
  });

  describe('edición y jerarquía (criterios 4 y 6)', () => {
    it('edita nombre y subrol; cambiar subrol revoca sus sesiones', async () => {
      const { owner } = await escenario();
      const u = await crearUsuario(tenantId, { subrol: 'secretary' });
      const tokenViejo = tokenDe(u);

      const res = await llamar(app, 'patch', `/api/users/${u.id}`, tokenDe(owner), {
        nombre: 'Renombrada', subrol: 'coordinator',
      });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ nombre: 'Renombrada', subrol: 'coordinator' });
      expect((await llamar(app, 'get', '/api/users', tokenViejo)).status).toBe(401);
      expect(publicarSesionRevocada).toHaveBeenCalledWith({ tenantId, userId: u.id });
      expect(await AuditEvent.countDocuments({ accion: 'user.subrol_changed' })).toBe(1);
    });

    it('un director no puede tocar al propietario', async () => {
      const { owner, director } = await escenario();
      const t = tokenDe(director);
      expect((await llamar(app, 'patch', `/api/users/${owner.id}`, t, { nombre: 'Xavier' })).status).toBe(403);
      expect((await llamar(app, 'patch', `/api/users/${owner.id}/estado`, t, { activo: false })).status).toBe(403);
      expect((await llamar(app, 'post', `/api/users/${owner.id}/password`, t, { password: '12345678' })).status).toBe(403);
    });

    it('nadie se cambia su propio subrol ni se desactiva a sí mismo', async () => {
      const { director } = await escenario();
      const t = tokenDe(director);
      expect((await llamar(app, 'patch', `/api/users/${director.id}`, t, { subrol: 'manager' })).status).toBe(409);
      expect((await llamar(app, 'patch', `/api/users/${director.id}/estado`, t, { activo: false })).status).toBe(409);
    });

    it('con dos gestores, degradar a uno es válido', async () => {
      const { owner, director } = await escenario();
      const res = await llamar(app, 'patch', `/api/users/${director.id}`, tokenDe(owner), { subrol: 'manager' });
      expect(res.status).toBe(200);
    });

    // La guarda del último gestor es defensa en profundidad: quien actúa ya es un gestor activo y
    // no puede operar sobre sí mismo. Se alcanza con un actor cuyo usuario quedó inactivo en BD
    // (sin revocación): p. ej. un segundo propietario legado.
    async function ultimoGestorConActorInactivo(): Promise<{ owner: IUsuarioPrueba; t: string }> {
      const owner = await crearUsuario(tenantId, { nombre: 'Propietario' });
      const owner2 = await crearUsuario(tenantId, { nombre: 'Propietario 2' });
      await UserModel.updateOne({ _id: owner2.id }, { activo: false });
      return { owner, t: tokenDe(owner2) };
    }

    it('degradar al último gestor activo → 409', async () => {
      const { owner, t } = await ultimoGestorConActorInactivo();
      const res = await llamar(app, 'patch', `/api/users/${owner.id}`, t, { subrol: 'manager' });
      expect(res.status).toBe(409);
      expect((await UserModel.findById(owner.id).lean())?.subrol).toBeUndefined();
    });

    it('desactivar al último gestor activo → 409', async () => {
      const { owner, t } = await ultimoGestorConActorInactivo();
      const res = await llamar(app, 'patch', `/api/users/${owner.id}/estado`, t, { activo: false });
      expect(res.status).toBe(409);
      expect((await UserModel.findById(owner.id).lean())?.activo).toBe(true);
    });
  });

  describe('desactivación con conversaciones (criterios 7, 8 y 12)', () => {
    it('sin decidir qué hacer → 409 con asignadas y flujos, sin cambios', async () => {
      const { owner } = await escenario();
      const u = await crearUsuario(tenantId, { subrol: 'coordinator' });
      await crearClienteAsignado(tenantId, u.id);
      await crearClienteAsignado(tenantId, u.id);
      await Flow.create({
        tenantId: new Types.ObjectId(tenantId),
        nombre: 'F',
        entrada: 'n1',
        version: 1,
        estado: 'borrador',
        activo: false,
        nodos: [{ id: 'n1', tipo: 'accion', posicion: { x: 0, y: 0 }, config: {
          tipo: 'accion', efecto: { tipo: 'asignar_asesor', asesorId: u.id },
        } }],
        aristas: [],
      });

      const res = await llamar(app, 'patch', `/api/users/${u.id}/estado`, tokenDe(owner), { activo: false });
      expect(res.status).toBe(409);
      expect(res.body).toMatchObject({ code: 'USER_HAS_ASSIGNED_CONVERSATIONS', asignadas: 2, flujos: 1 });
      expect((await UserModel.findById(u.id).lean())?.activo).toBe(true);
    });

    it('reasignar: todas pasan al destino, se desactiva y se revoca', async () => {
      const { owner } = await escenario();
      const u = await crearUsuario(tenantId, { subrol: 'coordinator' });
      const destino = await crearUsuario(tenantId, { subrol: 'secretary' });
      await crearClienteAsignado(tenantId, u.id);
      await crearClienteAsignado(tenantId, u.id);
      const tokenViejo = tokenDe(u);

      const res = await llamar(app, 'patch', `/api/users/${u.id}/estado`, tokenDe(owner), {
        activo: false, conversaciones: { accion: 'reasignar', destinoId: destino.id },
      });
      expect(res.status).toBe(200);
      expect(res.body.activo).toBe(false);
      expect(await Cliente.countDocuments({ asesorId: u.id })).toBe(0);
      expect(await Cliente.countDocuments({ asesorId: destino.id })).toBe(2);
      expect((await llamar(app, 'get', '/api/users', tokenViejo)).status).toBe(401);
      expect(publishRealtime).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'conversations:reassigned', asesorId: destino.id }),
      );
      expect(await AuditEvent.countDocuments({ accion: 'user.conversations_moved' })).toBe(1);
    });

    it('desasignar: quedan en la bandeja sin asignar', async () => {
      const { owner } = await escenario();
      const u = await crearUsuario(tenantId, { subrol: 'coordinator' });
      await crearClienteAsignado(tenantId, u.id);
      const res = await llamar(app, 'patch', `/api/users/${u.id}/estado`, tokenDe(owner), {
        activo: false, conversaciones: { accion: 'desasignar' },
      });
      expect(res.status).toBe(200);
      expect(await Cliente.countDocuments({ asesorId: u.id })).toBe(0);
      expect(await Cliente.countDocuments({ asesorId: null })).toBe(1);
    });

    it('destino inactivo → 404; destino = el mismo usuario → 400', async () => {
      const { owner } = await escenario();
      const u = await crearUsuario(tenantId, { subrol: 'coordinator' });
      const inactivo = await crearUsuario(tenantId, { subrol: 'secretary', activo: false });
      await crearClienteAsignado(tenantId, u.id);
      const t = tokenDe(owner);
      expect((await llamar(app, 'patch', `/api/users/${u.id}/estado`, t, {
        activo: false, conversaciones: { accion: 'reasignar', destinoId: inactivo.id },
      })).status).toBe(404);
      expect((await llamar(app, 'patch', `/api/users/${u.id}/estado`, t, {
        activo: false, conversaciones: { accion: 'reasignar', destinoId: u.id },
      })).status).toBe(400);
      expect(await Cliente.countDocuments({ asesorId: u.id })).toBe(1);
    });

    it('sin conversaciones se desactiva directo y el usuario no puede volver a loguearse', async () => {
      const { owner } = await escenario();
      const u = await crearUsuario(tenantId, { subrol: 'secretary', email: 'sec@t.com', password: 'clave-123' });
      expect((await llamar(app, 'patch', `/api/users/${u.id}/estado`, tokenDe(owner), { activo: false })).status).toBe(200);
      const login = await llamar(app, 'post', '/api/auth/login', '', { email: 'sec@t.com', password: 'clave-123' });
      expect(login.status).toBe(401);
    });
  });

  describe('reactivación y contraseña (criterios 9 y 10)', () => {
    it('reactivar valida la cuota del plan', async () => {
      const plan = await Plan.create({
        nombre: 'Mini',
        limites: { usuarios: 1, administradores: 5, mensajesMes: 10, leads: 10, campanasMes: 1 },
        precio: 0,
      });
      const tenant = await Tenant.create({
        nombre: 'Cuota', slug: 'cuota-reactivar', contacto: { email: 'c@t.com', telefono: '3000000000' },
        estado: 'activo', planId: plan._id,
      });
      const owner = await crearUsuario(tenant._id.toString());
      const inactivo = await crearUsuario(tenant._id.toString(), { subrol: 'secretary', activo: false });
      const res = await llamar(app, 'patch', `/api/users/${inactivo.id}/estado`, tokenDe(owner), { activo: true });
      expect(res.status).toBe(429);
    });

    it('reactivar con cupo → 200 y auditoría', async () => {
      const { owner } = await escenario();
      const inactivo = await crearUsuario(tenantId, { subrol: 'secretary', activo: false });
      const res = await llamar(app, 'patch', `/api/users/${inactivo.id}/estado`, tokenDe(owner), { activo: true });
      expect(res.status).toBe(200);
      expect(res.body.activo).toBe(true);
      expect(await AuditEvent.countDocuments({ accion: 'user.reactivated' })).toBe(1);
    });

    it('restablecer contraseña: login con la nueva y el token anterior → 401', async () => {
      const { owner } = await escenario();
      const u = await crearUsuario(tenantId, { subrol: 'secretary', email: 'pw@t.com', password: 'vieja-123' });
      const tokenViejo = tokenDe(u);
      const res = await llamar(app, 'post', `/api/users/${u.id}/password`, tokenDe(owner), { password: 'nueva-1234' });
      expect(res.status).toBe(204);
      expect((await llamar(app, 'get', '/api/users', tokenViejo)).status).toBe(401);
      const login = await llamar(app, 'post', '/api/auth/login', '', { email: 'pw@t.com', password: 'nueva-1234' });
      expect(login.status).toBe(200);
      expect(await AuditEvent.countDocuments({ accion: 'user.password_reset' })).toBe(1);
    });

    it('no se restablece la propia contraseña por aquí → 409', async () => {
      const { owner } = await escenario();
      const res = await llamar(app, 'post', `/api/users/${owner.id}/password`, tokenDe(owner), { password: 'nueva-1234' });
      expect(res.status).toBe(409);
    });
  });
});
