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

interface Escenario {
  admin: IUsuarioPrueba;
  coord: IUsuarioPrueba;
  asesor: IUsuarioPrueba;
}

/** Administrador + coordinador con un asesor en su equipo. */
async function escenario(): Promise<Escenario> {
  const admin = await crearUsuario(tenantId, { nombre: 'Ana Admin' });
  const coord = await crearUsuario(tenantId, { nombre: 'Carla Coord', rolEmpresa: 'coordinador' });
  const asesor = await crearUsuario(tenantId, {
    nombre: 'Andrés Asesor',
    rolEmpresa: 'asesor',
    coordinadorId: coord.id,
  });
  return { admin, coord, asesor };
}

const alta = (extra: object = {}): object => ({
  nombre: 'Nueva',
  email: `n-${new Types.ObjectId().toString()}@t.com`,
  password: '12345678',
  rolEmpresa: 'asesor',
  ...extra,
});

async function planMini(limites: { usuarios: number; administradores: number }, slug: string): Promise<string> {
  const plan = await Plan.create({
    nombre: 'Mini',
    limites: { ...limites, mensajesMes: 10, leads: 10, campanasMes: 1 },
    precio: 0,
  });
  const tenant = await Tenant.create({
    nombre: 'Cuota', slug, contacto: { email: 'c@t.com', telefono: '3000000000' },
    estado: 'activo', planId: plan._id,
  });
  return tenant._id.toString();
}

describe('Gestión de usuarios — AUTH-03 / AUTH-04', () => {
  describe('gate de gestión por rol (criterios 6–8)', () => {
    it('asesor → 403 en todos los endpoints de gestión', async () => {
      const { asesor, coord } = await escenario();
      const t = tokenDe(asesor);
      expect((await llamar(app, 'get', '/api/users/manage', t)).status).toBe(403);
      expect((await llamar(app, 'get', `/api/users/${coord.id}`, t)).status).toBe(403);
      expect((await llamar(app, 'post', '/api/users', t, alta())).status).toBe(403);
      expect((await llamar(app, 'patch', `/api/users/${coord.id}`, t, { nombre: 'Xavier' })).status).toBe(403);
      expect((await llamar(app, 'patch', `/api/users/${coord.id}/estado`, t, { activo: false })).status).toBe(403);
      expect((await llamar(app, 'post', `/api/users/${coord.id}/password`, t, { password: '12345678' })).status).toBe(403);
    });

    it('el selector GET /api/users sigue abierto al asesor y trae rolEmpresa', async () => {
      const { asesor, coord } = await escenario();
      const res = await llamar(app, 'get', '/api/users', tokenDe(asesor));
      expect(res.status).toBe(200);
      const fila = res.body.find((u: { id: string }) => u.id === asesor.id);
      expect(fila).toMatchObject({ rolEmpresa: 'asesor', coordinadorId: coord.id });
    });

    it('un token viejo con subrol se traduce: secretary → asesor (403), director → administrador', async () => {
      const { admin } = await escenario();
      const jwt = (await import('jsonwebtoken')).default;
      const firmar = (subrol?: string): string =>
        jwt.sign({ sub: admin.id, tenantId, rol: 'admin', ...(subrol ? { subrol } : {}) }, 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
      expect((await llamar(app, 'get', '/api/users/manage', firmar('secretary'))).status).toBe(403);
      expect((await llamar(app, 'get', '/api/users/manage', firmar('director'))).status).toBe(200);
      expect((await llamar(app, 'get', '/api/users/manage', firmar())).status).toBe(200);
    });
  });

  describe('listados (criterio 1 de AUTH-03)', () => {
    it('GET /api/users?activo=false devuelve inactivos (regresión de z.coerce.boolean)', async () => {
      const { admin } = await escenario();
      await crearUsuario(tenantId, { nombre: 'Inactivo', rolEmpresa: 'asesor', activo: false });
      const res = await llamar(app, 'get', '/api/users?activo=false', tokenDe(admin));
      expect(res.body.map((u: { nombre: string }) => u.nombre)).toEqual(['Inactivo']);
    });

    it('/manage del administrador filtra por rol, coordinador, activo y q', async () => {
      const { admin, coord } = await escenario();
      await crearUsuario(tenantId, { nombre: 'Libre', rolEmpresa: 'asesor' });
      await crearUsuario(tenantId, { nombre: 'Inés', rolEmpresa: 'asesor', activo: false });
      const t = tokenDe(admin);
      const nombres = async (qs: string): Promise<string[]> =>
        (await llamar(app, 'get', `/api/users/manage${qs}`, t)).body.map((u: { nombre: string }) => u.nombre);
      expect(await nombres('?rolEmpresa=coordinador')).toEqual(['Carla Coord']);
      expect(await nombres(`?coordinadorId=${coord.id}`)).toEqual(['Andrés Asesor']);
      expect(await nombres('?coordinadorId=ninguno&rolEmpresa=asesor&activo=true')).toEqual(['Libre']);
      expect(await nombres('?q=inés')).toEqual(['Inés']);
      const res = await llamar(app, 'get', '/api/users/manage', t);
      expect(JSON.stringify(res.body)).not.toContain('passwordHash');
    });

    it('/manage del coordinador devuelve solo su equipo, aunque pida otro filtro', async () => {
      const { coord } = await escenario();
      const otro = await crearUsuario(tenantId, { nombre: 'Otro Coord', rolEmpresa: 'coordinador' });
      await crearUsuario(tenantId, { nombre: 'Ajeno', rolEmpresa: 'asesor', coordinadorId: otro.id });
      const res = await llamar(app, 'get', '/api/users/manage?rolEmpresa=administrador', tokenDe(coord));
      expect(res.status).toBe(200);
      expect(res.body.map((u: { nombre: string }) => u.nombre)).toEqual(['Andrés Asesor']);
    });

    it('GET /:id de un usuario fuera del equipo del coordinador → 404', async () => {
      const { coord, admin, asesor } = await escenario();
      expect((await llamar(app, 'get', `/api/users/${admin.id}`, tokenDe(coord))).status).toBe(404);
      expect((await llamar(app, 'get', `/api/users/${asesor.id}`, tokenDe(coord))).status).toBe(200);
    });
  });

  describe('alta (criterios 6 y 7)', () => {
    it('el administrador crea cada rol en el tenant del token y audita', async () => {
      const { admin } = await escenario();
      for (const rolEmpresa of ['administrador', 'coordinador', 'asesor'] as const) {
        const res = await llamar(app, 'post', '/api/users', tokenDe(admin), alta({ rolEmpresa }));
        expect(res.status).toBe(201);
        expect(res.body).toMatchObject({ rol: 'admin', rolEmpresa, coordinadorId: null, tenantId });
      }
      expect(await AuditEvent.countDocuments({ accion: 'user.created' })).toBe(3);
    });

    it('asesor con coordinador válido, inactivo (404) o que no es coordinador (404)', async () => {
      const { admin, coord, asesor } = await escenario();
      const inactivo = await crearUsuario(tenantId, { rolEmpresa: 'coordinador', activo: false });
      const t = tokenDe(admin);
      const ok = await llamar(app, 'post', '/api/users', t, alta({ coordinadorId: coord.id }));
      expect(ok.status).toBe(201);
      expect(ok.body.coordinadorId).toBe(coord.id);
      expect((await llamar(app, 'post', '/api/users', t, alta({ coordinadorId: inactivo.id }))).status).toBe(404);
      expect((await llamar(app, 'post', '/api/users', t, alta({ coordinadorId: asesor.id }))).status).toBe(404);
    });

    it('coordinadorId con un rol distinto de asesor → 400; sin rolEmpresa → 400', async () => {
      const { admin, coord } = await escenario();
      const t = tokenDe(admin);
      expect((await llamar(app, 'post', '/api/users', t, alta({ rolEmpresa: 'coordinador', coordinadorId: coord.id }))).status).toBe(400);
      expect((await llamar(app, 'post', '/api/users', t, { nombre: 'Nueva', email: 'x@t.com', password: '12345678' })).status).toBe(400);
    });

    it('rol, tenantId o subrol en el body → 400 (strict)', async () => {
      const { admin } = await escenario();
      const t = tokenDe(admin);
      for (const extra of [{ rol: 'superadmin' }, { tenantId: new Types.ObjectId().toString() }, { subrol: 'director' }]) {
        expect((await llamar(app, 'post', '/api/users', t, alta(extra))).status).toBe(400);
      }
    });

    it('el coordinador crea asesores que nacen en su equipo; otro rol u otro equipo → 403', async () => {
      const { coord } = await escenario();
      const otro = await crearUsuario(tenantId, { rolEmpresa: 'coordinador' });
      const t = tokenDe(coord);
      const ok = await llamar(app, 'post', '/api/users', t, alta());
      expect(ok.status).toBe(201);
      expect(ok.body).toMatchObject({ rolEmpresa: 'asesor', coordinadorId: coord.id });
      expect((await llamar(app, 'post', '/api/users', t, alta({ rolEmpresa: 'coordinador' }))).status).toBe(403);
      expect((await llamar(app, 'post', '/api/users', t, alta({ coordinadorId: otro.id }))).status).toBe(403);
    });

    it('email ya usado en OTRO tenant → 409 genérico', async () => {
      const { admin } = await escenario();
      await crearUsuario(new Types.ObjectId().toString(), { email: 'dup@t.com' });
      const res = await llamar(app, 'post', '/api/users', tokenDe(admin), alta({ email: 'dup@t.com' }));
      expect(res.status).toBe(409);
      expect(JSON.stringify(res.body)).not.toContain('tenant');
    });
  });

  describe('cuotas (criterio 11)', () => {
    it('cupo de usuarios agotado → 429 para cualquier rol', async () => {
      const t = await planMini({ usuarios: 1, administradores: 5 }, 'cuota-usuarios');
      const admin = await crearUsuario(t);
      expect((await llamar(app, 'post', '/api/users', tokenDe(admin), alta())).status).toBe(429);
    });

    it('cupo de administradores agotado: crear asesor OK, crear o promover administrador → 429', async () => {
      const t = await planMini({ usuarios: 10, administradores: 1 }, 'cuota-admins');
      const admin = await crearUsuario(t);
      const tk = tokenDe(admin);
      const asesor = await llamar(app, 'post', '/api/users', tk, alta());
      expect(asesor.status).toBe(201);
      expect((await llamar(app, 'post', '/api/users', tk, alta({ rolEmpresa: 'administrador' }))).status).toBe(429);
      expect((await llamar(app, 'patch', `/api/users/${asesor.body.id}`, tk, { rolEmpresa: 'administrador' })).status).toBe(429);
    });

    it('reactivar valida la cuota; con cupo → 200 y auditoría', async () => {
      const t = await planMini({ usuarios: 1, administradores: 5 }, 'cuota-reactivar');
      const admin = await crearUsuario(t);
      const inactivo = await crearUsuario(t, { rolEmpresa: 'asesor', activo: false });
      expect((await llamar(app, 'patch', `/api/users/${inactivo.id}/estado`, tokenDe(admin), { activo: true })).status).toBe(429);

      const { admin: a2 } = await escenario();
      const otro = await crearUsuario(tenantId, { rolEmpresa: 'asesor', activo: false });
      const res = await llamar(app, 'patch', `/api/users/${otro.id}/estado`, tokenDe(a2), { activo: true });
      expect(res.status).toBe(200);
      expect(await AuditEvent.countDocuments({ accion: 'user.reactivated' })).toBe(1);
    });
  });

  describe('edición, roles y equipos (criterios 6, 7 y 9)', () => {
    it('cambiar el rol revoca sesiones y audita user.role_changed', async () => {
      const { admin, asesor } = await escenario();
      const tokenViejo = tokenDe(asesor);
      const res = await llamar(app, 'patch', `/api/users/${asesor.id}`, tokenDe(admin), {
        nombre: 'Renombrado', rolEmpresa: 'coordinador',
      });
      expect(res.status).toBe(200);
      // Al dejar de ser asesor pierde el coordinador.
      expect(res.body).toMatchObject({ nombre: 'Renombrado', rolEmpresa: 'coordinador', coordinadorId: null });
      expect((await llamar(app, 'get', '/api/users', tokenViejo)).status).toBe(401);
      expect(await AuditEvent.countDocuments({ accion: 'user.role_changed' })).toBe(1);
    });

    it('mover un asesor entre coordinadores y liberarlo: audita, no revoca sesión', async () => {
      const { admin, asesor } = await escenario();
      const otro = await crearUsuario(tenantId, { rolEmpresa: 'coordinador' });
      const t = tokenDe(admin);
      const mov = await llamar(app, 'patch', `/api/users/${asesor.id}`, t, { coordinadorId: otro.id });
      expect(mov.body.coordinadorId).toBe(otro.id);
      const lib = await llamar(app, 'patch', `/api/users/${asesor.id}`, t, { coordinadorId: null });
      expect(lib.body.coordinadorId).toBeNull();
      expect(await AuditEvent.countDocuments({ accion: 'user.coordinator_changed' })).toBe(2);
      expect((await llamar(app, 'get', '/api/users', tokenDe(asesor))).status).toBe(200);
    });

    it('coordinadorId a un no-coordinador → 404; coordinadorId en un no-asesor → 400', async () => {
      const { admin, coord, asesor } = await escenario();
      const t = tokenDe(admin);
      expect((await llamar(app, 'patch', `/api/users/${asesor.id}`, t, { coordinadorId: admin.id })).status).toBe(404);
      expect((await llamar(app, 'patch', `/api/users/${coord.id}`, t, { coordinadorId: coord.id })).status).toBe(400);
    });

    it('el coordinador edita nombre/email de su equipo; rol o coordinador → 403; fuera del equipo → 404', async () => {
      const { coord, asesor, admin } = await escenario();
      const t = tokenDe(coord);
      expect((await llamar(app, 'patch', `/api/users/${asesor.id}`, t, { nombre: 'Nuevo Nombre' })).status).toBe(200);
      expect((await llamar(app, 'patch', `/api/users/${asesor.id}`, t, { rolEmpresa: 'coordinador' })).status).toBe(403);
      expect((await llamar(app, 'patch', `/api/users/${asesor.id}`, t, { coordinadorId: null })).status).toBe(403);
      expect((await llamar(app, 'patch', `/api/users/${admin.id}`, t, { nombre: 'Hack' })).status).toBe(404);
    });

    it('nadie se cambia su propio rol ni se desactiva a sí mismo (409)', async () => {
      const { admin } = await escenario();
      const t = tokenDe(admin);
      expect((await llamar(app, 'patch', `/api/users/${admin.id}`, t, { rolEmpresa: 'asesor' })).status).toBe(409);
      expect((await llamar(app, 'patch', `/api/users/${admin.id}/estado`, t, { activo: false })).status).toBe(409);
    });

    it('un administrador puede gestionar a otro administrador', async () => {
      const { admin } = await escenario();
      const otro = await crearUsuario(tenantId, { rolEmpresa: 'administrador' });
      const res = await llamar(app, 'patch', `/api/users/${otro.id}`, tokenDe(admin), { rolEmpresa: 'coordinador' });
      expect(res.status).toBe(200);
    });

    it('no se puede degradar ni desactivar al último Administrador activo (409)', async () => {
      const tB = new Types.ObjectId().toString();
      const admin = await crearUsuario(tB);
      // El actor es un administrador INACTIVO en BD con sesión aún válida: único camino al guard.
      const fantasma = await crearUsuario(tB, { activo: false });
      const t = tokenDe(fantasma);
      expect((await llamar(app, 'patch', `/api/users/${admin.id}`, t, { rolEmpresa: 'asesor' })).status).toBe(409);
      expect((await llamar(app, 'patch', `/api/users/${admin.id}/estado`, t, { activo: false })).status).toBe(409);
      expect((await UserModel.findById(admin.id).lean())?.rolEmpresa).toBe('administrador');
    });
  });

  describe('dependencias al desactivar o degradar (criterio 10)', () => {
    it('conversaciones sin decidir → 409 USER_HAS_DEPENDENCIES con asignadas y flujos, sin cambios', async () => {
      const { admin, asesor } = await escenario();
      await crearClienteAsignado(tenantId, asesor.id);
      await crearClienteAsignado(tenantId, asesor.id);
      await Flow.create({
        tenantId: new Types.ObjectId(tenantId),
        nombre: 'F', entrada: 'n1', version: 1, estado: 'borrador', activo: false,
        nodos: [{ id: 'n1', tipo: 'accion', posicion: { x: 0, y: 0 }, config: {
          tipo: 'accion', efecto: { tipo: 'asignar_asesor', asesorId: asesor.id },
        } }],
        aristas: [],
      });
      const res = await llamar(app, 'patch', `/api/users/${asesor.id}/estado`, tokenDe(admin), { activo: false });
      expect(res.status).toBe(409);
      expect(res.body).toMatchObject({ code: 'USER_HAS_DEPENDENCIES', asignadas: 2, flujos: 1, asesores: 0 });
      expect((await UserModel.findById(asesor.id).lean())?.activo).toBe(true);
    });

    it('reasignar conversaciones: pasan al destino, se desactiva, se revoca y se publica', async () => {
      const { admin, asesor } = await escenario();
      const destino = await crearUsuario(tenantId, { rolEmpresa: 'asesor' });
      await crearClienteAsignado(tenantId, asesor.id);
      await crearClienteAsignado(tenantId, asesor.id);
      const tokenViejo = tokenDe(asesor);
      const res = await llamar(app, 'patch', `/api/users/${asesor.id}/estado`, tokenDe(admin), {
        activo: false, conversaciones: { accion: 'reasignar', destinoId: destino.id },
      });
      expect(res.status).toBe(200);
      expect(await Cliente.countDocuments({ asesorId: asesor.id })).toBe(0);
      expect(await Cliente.countDocuments({ asesorId: destino.id })).toBe(2);
      expect((await llamar(app, 'get', '/api/users', tokenViejo)).status).toBe(401);
      expect(publishRealtime).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'conversations:reassigned', asesorId: destino.id }),
      );
      expect(await AuditEvent.countDocuments({ accion: 'user.conversations_moved' })).toBe(1);
    });

    it('desasignar: quedan en la bandeja sin asignar; destino inactivo → 404; mismo usuario → 400', async () => {
      const { admin, asesor } = await escenario();
      const inactivo = await crearUsuario(tenantId, { rolEmpresa: 'asesor', activo: false });
      await crearClienteAsignado(tenantId, asesor.id);
      const t = tokenDe(admin);
      const url = `/api/users/${asesor.id}/estado`;
      expect((await llamar(app, 'patch', url, t, { activo: false, conversaciones: { accion: 'reasignar', destinoId: inactivo.id } })).status).toBe(404);
      expect((await llamar(app, 'patch', url, t, { activo: false, conversaciones: { accion: 'reasignar', destinoId: asesor.id } })).status).toBe(400);
      expect((await llamar(app, 'patch', url, t, { activo: false, conversaciones: { accion: 'desasignar' } })).status).toBe(200);
      expect(await Cliente.countDocuments({ asesorId: null })).toBe(1);
    });

    it('coordinador con equipo sin `equipo` → 409 con asesores; liberar deja a los asesores sin coordinador', async () => {
      const { admin, coord } = await escenario();
      await crearUsuario(tenantId, { rolEmpresa: 'asesor', coordinadorId: coord.id, activo: false });
      const t = tokenDe(admin);
      const url = `/api/users/${coord.id}/estado`;
      const sin = await llamar(app, 'patch', url, t, { activo: false });
      expect(sin.status).toBe(409);
      expect(sin.body).toMatchObject({ code: 'USER_HAS_DEPENDENCIES', asesores: 2 });
      expect((await llamar(app, 'patch', url, t, { activo: false, equipo: { accion: 'liberar' } })).status).toBe(200);
      expect(await UserModel.countDocuments({ coordinadorId: coord.id })).toBe(0);
      expect(await AuditEvent.countDocuments({ accion: 'user.team_moved' })).toBe(1);
    });

    it('reasignar el equipo a otro coordinador activo; a uno inactivo → 404', async () => {
      const { admin, coord, asesor } = await escenario();
      const otro = await crearUsuario(tenantId, { rolEmpresa: 'coordinador' });
      const inactivo = await crearUsuario(tenantId, { rolEmpresa: 'coordinador', activo: false });
      const t = tokenDe(admin);
      const url = `/api/users/${coord.id}/estado`;
      expect((await llamar(app, 'patch', url, t, {
        activo: false, equipo: { accion: 'reasignar', coordinadorDestinoId: inactivo.id },
      })).status).toBe(404);
      expect((await llamar(app, 'patch', url, t, {
        activo: false, equipo: { accion: 'reasignar', coordinadorDestinoId: otro.id },
      })).status).toBe(200);
      expect(String((await UserModel.findById(asesor.id).lean())?.coordinadorId)).toBe(otro.id);
    });

    it('degradar a un coordinador con equipo exige resolver el equipo (409 → liberar)', async () => {
      const { admin, coord, asesor } = await escenario();
      const t = tokenDe(admin);
      const sin = await llamar(app, 'patch', `/api/users/${coord.id}`, t, { rolEmpresa: 'asesor' });
      expect(sin.status).toBe(409);
      expect(sin.body).toMatchObject({ code: 'USER_HAS_DEPENDENCIES', asesores: 1 });
      const ok = await llamar(app, 'patch', `/api/users/${coord.id}`, t, {
        rolEmpresa: 'asesor', equipo: { accion: 'liberar' },
      });
      expect(ok.status).toBe(200);
      expect((await UserModel.findById(asesor.id).lean())?.coordinadorId).toBeNull();
    });

    it('el coordinador desactiva a su asesor reasignando a sí mismo o a su equipo; a un ajeno → 404', async () => {
      const { coord, asesor, admin } = await escenario();
      const companero = await crearUsuario(tenantId, { rolEmpresa: 'asesor', coordinadorId: coord.id });
      await crearClienteAsignado(tenantId, asesor.id);
      const t = tokenDe(coord);
      const url = `/api/users/${asesor.id}/estado`;
      expect((await llamar(app, 'patch', url, t, {
        activo: false, conversaciones: { accion: 'reasignar', destinoId: admin.id },
      })).status).toBe(404);
      expect((await llamar(app, 'patch', url, t, {
        activo: false, conversaciones: { accion: 'reasignar', destinoId: companero.id },
      })).status).toBe(200);
      expect(await Cliente.countDocuments({ asesorId: companero.id })).toBe(1);
    });

    it('sin dependencias se desactiva directo y el usuario no puede volver a loguearse', async () => {
      const { admin } = await escenario();
      const u = await crearUsuario(tenantId, { rolEmpresa: 'asesor', email: 'sec@t.com', password: 'clave-123' });
      expect((await llamar(app, 'patch', `/api/users/${u.id}/estado`, tokenDe(admin), { activo: false })).status).toBe(200);
      const login = await llamar(app, 'post', '/api/auth/login', '', { email: 'sec@t.com', password: 'clave-123' });
      expect(login.status).toBe(401);
    });

    it('reactivar a un asesor cuyo coordinador ya no es válido lo deja sin coordinador', async () => {
      const { admin } = await escenario();
      const exCoord = await crearUsuario(tenantId, { rolEmpresa: 'coordinador', activo: false });
      const u = await crearUsuario(tenantId, { rolEmpresa: 'asesor', coordinadorId: exCoord.id, activo: false });
      const res = await llamar(app, 'patch', `/api/users/${u.id}/estado`, tokenDe(admin), { activo: true });
      expect(res.status).toBe(200);
      expect(res.body.coordinadorId).toBeNull();
    });
  });

  describe('contraseña (criterio 10 de AUTH-03)', () => {
    it('restablecer: login con la nueva y el token anterior → 401', async () => {
      const { admin } = await escenario();
      const u = await crearUsuario(tenantId, { rolEmpresa: 'asesor', email: 'pw@t.com', password: 'vieja-123' });
      const tokenViejo = tokenDe(u);
      const res = await llamar(app, 'post', `/api/users/${u.id}/password`, tokenDe(admin), { password: 'nueva-1234' });
      expect(res.status).toBe(204);
      expect((await llamar(app, 'get', '/api/users', tokenViejo)).status).toBe(401);
      const login = await llamar(app, 'post', '/api/auth/login', '', { email: 'pw@t.com', password: 'nueva-1234' });
      expect(login.status).toBe(200);
      expect(login.body.user?.rolEmpresa ?? login.body.rolEmpresa).toBe('asesor');
      expect(await AuditEvent.countDocuments({ accion: 'user.password_reset' })).toBe(1);
    });

    it('el coordinador restablece la de su equipo; la de otro → 404; la propia → 409', async () => {
      const { coord, asesor, admin } = await escenario();
      const t = tokenDe(coord);
      expect((await llamar(app, 'post', `/api/users/${asesor.id}/password`, t, { password: 'nueva-1234' })).status).toBe(204);
      expect((await llamar(app, 'post', `/api/users/${admin.id}/password`, t, { password: 'nueva-1234' })).status).toBe(404);
      expect((await llamar(app, 'post', `/api/users/${admin.id}/password`, tokenDe(admin), { password: 'nueva-1234' })).status).toBe(409);
    });
  });
});
