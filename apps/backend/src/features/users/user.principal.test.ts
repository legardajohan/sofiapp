import { vi, describe, it, expect } from 'vitest';
import { Types } from 'mongoose';
import { AuditEvent } from '../audit/audit.model.js';
import { UserModel } from './user.model.js';
import { crearUsuario, llamar, tokenDe, type IUsuarioPrueba } from './user.test-helpers.js';

// AUTH-05, criterios 1 y 4–7: usuario principal y permiso de gestionar administradores.
vi.mock('../../realtime/realtime.publisher.js', () => ({ publishRealtime: vi.fn(), subscribeRealtime: vi.fn() }));
vi.mock('../../realtime/internal-bus.js', async (orig) => ({
  ...(await orig<typeof import('../../realtime/internal-bus.js')>()),
  publicarSesionRevocada: vi.fn(),
}));

const { default: app } = await import('../../app.js');

const tenantId = new Types.ObjectId().toString();

const alta = (extra: object = {}): object => ({
  nombre: 'Nueva',
  email: `n-${new Types.ObjectId().toString()}@t.com`,
  password: '12345678',
  rolEmpresa: 'asesor',
  ...extra,
});

interface Empresa {
  principal: IUsuarioPrueba;
  adminCon: IUsuarioPrueba;
  adminSin: IUsuarioPrueba;
  coord: IUsuarioPrueba;
  asesor: IUsuarioPrueba;
}

async function empresa(): Promise<Empresa> {
  const principal = await crearUsuario(tenantId, { nombre: 'Pía Principal', esPrincipal: true });
  const adminCon = await crearUsuario(tenantId, { nombre: 'Ada Con', puedeGestionarAdministradores: true });
  const adminSin = await crearUsuario(tenantId, { nombre: 'Abel Sin' });
  const coord = await crearUsuario(tenantId, { nombre: 'Coro Coord', rolEmpresa: 'coordinador' });
  const asesor = await crearUsuario(tenantId, { nombre: 'Asa Asesor', rolEmpresa: 'asesor' });
  return { principal, adminCon, adminSin, coord, asesor };
}

/** Las cuatro acciones de gestión sobre `id`. */
async function acciones(token: string, id: string): Promise<number[]> {
  return [
    (await llamar(app, 'patch', `/api/users/${id}`, token, { nombre: 'Hack Eado' })).status,
    (await llamar(app, 'patch', `/api/users/${id}/estado`, token, { activo: false })).status,
    (await llamar(app, 'post', `/api/users/${id}/password`, token, { password: '12345678' })).status,
    (await llamar(app, 'delete', `/api/users/${id}`, token)).status,
  ];
}

describe('Usuario principal y jerarquía — AUTH-05', () => {
  describe('modelo (CA-1)', () => {
    it('un solo principal por tenant; en otro tenant sí', async () => {
      await UserModel.init();
      await crearUsuario(tenantId, { esPrincipal: true });
      await expect(crearUsuario(tenantId, { esPrincipal: true })).rejects.toMatchObject({ code: 11000 });
      await expect(crearUsuario(new Types.ObjectId().toString(), { esPrincipal: true })).resolves.toBeDefined();
    });
  });

  describe('principal intocable (CA-4)', () => {
    it('ningún Administrador edita, desactiva, restablece ni elimina al principal (403)', async () => {
      const { principal, adminCon, adminSin } = await empresa();
      for (const actor of [adminCon, adminSin]) {
        expect(await acciones(tokenDe(actor), principal.id)).toEqual([403, 403, 403, 403]);
      }
      const doc = await UserModel.findById(principal.id).lean();
      expect(doc).toMatchObject({ nombre: 'Pía Principal', activo: true, eliminado: false });
    });

    it('el principal no se edita a sí mismo (403); estado, contraseña y eliminar sobre sí → 409', async () => {
      const { principal } = await empresa();
      expect(await acciones(tokenDe(principal), principal.id)).toEqual([403, 409, 409, 409]);
    });

    it('para el coordinador el principal no existe (404)', async () => {
      const { principal, coord } = await empresa();
      expect((await llamar(app, 'get', `/api/users/${principal.id}`, tokenDe(coord))).status).toBe(404);
    });

    it('aparece en /manage con esPrincipal y sin acciones; primero en la lista', async () => {
      const { principal, adminCon } = await empresa();
      const res = await llamar(app, 'get', '/api/users/manage', tokenDe(adminCon));
      expect(res.status).toBe(200);
      expect(res.body[0]).toMatchObject({
        id: principal.id,
        esPrincipal: true,
        acciones: { editar: false, contrasena: false, estado: false, eliminar: false },
      });
    });
  });

  describe('administrador sin permiso (CA-5)', () => {
    it('gestiona coordinadores y asesores; sobre otro administrador → 403', async () => {
      const { adminSin, adminCon, coord, asesor } = await empresa();
      const t = tokenDe(adminSin);
      expect((await llamar(app, 'patch', `/api/users/${coord.id}`, t, { nombre: 'Coro Dos' })).status).toBe(200);
      expect((await llamar(app, 'post', `/api/users/${asesor.id}/password`, t, { password: '12345678' })).status).toBe(204);
      expect(await acciones(t, adminCon.id)).toEqual([403, 403, 403, 403]);
    });

    it('no crea administradores ni promueve o degrada a nadie a/desde Administrador (403)', async () => {
      const { adminSin, adminCon, coord } = await empresa();
      const t = tokenDe(adminSin);
      expect((await llamar(app, 'post', '/api/users', t, alta({ rolEmpresa: 'administrador' }))).status).toBe(403);
      expect((await llamar(app, 'post', '/api/users', t, alta({ rolEmpresa: 'coordinador' }))).status).toBe(201);
      expect((await llamar(app, 'patch', `/api/users/${coord.id}`, t, { rolEmpresa: 'administrador' })).status).toBe(403);
      expect((await llamar(app, 'patch', `/api/users/${adminCon.id}`, t, { rolEmpresa: 'asesor' })).status).toBe(403);
    });

    it('ve a los administradores en /manage, con acciones en false', async () => {
      const { adminSin, adminCon, coord } = await empresa();
      const res = await llamar(app, 'get', '/api/users/manage', tokenDe(adminSin));
      const fila = (id: string): { acciones: Record<string, boolean> } =>
        res.body.find((u: { id: string }) => u.id === id);
      expect(fila(adminCon.id).acciones.editar).toBe(false);
      expect(fila(coord.id).acciones).toEqual({ editar: true, contrasena: true, estado: true, eliminar: true });
    });
  });

  describe('administrador con permiso (CA-6)', () => {
    it('crea y gestiona administradores que no son el principal', async () => {
      const { adminCon, adminSin } = await empresa();
      const t = tokenDe(adminCon);
      const nuevo = await llamar(app, 'post', '/api/users', t, alta({ rolEmpresa: 'administrador' }));
      expect(nuevo.status).toBe(201);
      expect(nuevo.body.puedeGestionarAdministradores).toBe(false);
      expect((await llamar(app, 'patch', `/api/users/${adminSin.id}`, t, { nombre: 'Abel Dos' })).status).toBe(200);
      expect((await llamar(app, 'patch', `/api/users/${adminSin.id}/estado`, t, { activo: false })).status).toBe(200);
    });

    it('no concede ni retira el permiso (403)', async () => {
      const { adminCon, adminSin } = await empresa();
      const t = tokenDe(adminCon);
      expect(
        (await llamar(app, 'post', '/api/users', t, alta({ rolEmpresa: 'administrador', puedeGestionarAdministradores: true }))).status,
      ).toBe(403);
      expect(
        (await llamar(app, 'patch', `/api/users/${adminSin.id}`, t, { puedeGestionarAdministradores: true })).status,
      ).toBe(403);
    });
  });

  describe('permiso (CA-7)', () => {
    it('el principal lo concede al crear y lo cambia después; se audita', async () => {
      const { principal, adminSin } = await empresa();
      const t = tokenDe(principal);
      const creado = await llamar(app, 'post', '/api/users', t, alta({
        rolEmpresa: 'administrador', puedeGestionarAdministradores: true,
      }));
      expect(creado.status).toBe(201);
      expect(creado.body.puedeGestionarAdministradores).toBe(true);
      const dado = await llamar(app, 'patch', `/api/users/${adminSin.id}`, t, { puedeGestionarAdministradores: true });
      expect(dado.body.puedeGestionarAdministradores).toBe(true);
      expect(await AuditEvent.countDocuments({ accion: 'user.admin_permission_changed' })).toBe(1);
    });

    it('con un rol distinto de Administrador → 400; al degradar vuelve a false', async () => {
      const { principal, adminCon } = await empresa();
      const t = tokenDe(principal);
      expect(
        (await llamar(app, 'post', '/api/users', t, alta({ rolEmpresa: 'asesor', puedeGestionarAdministradores: true }))).status,
      ).toBe(400);
      const degradado = await llamar(app, 'patch', `/api/users/${adminCon.id}`, t, { rolEmpresa: 'coordinador' });
      expect(degradado.status).toBe(200);
      expect(degradado.body.puedeGestionarAdministradores).toBe(false);
    });

    it('retirarlo tiene efecto en la siguiente petición, con el mismo token', async () => {
      const { principal, adminCon, adminSin } = await empresa();
      const tokenAda = tokenDe(adminCon);
      expect((await llamar(app, 'patch', `/api/users/${adminSin.id}`, tokenAda, { nombre: 'Abel Uno' })).status).toBe(200);
      await llamar(app, 'patch', `/api/users/${adminCon.id}`, tokenDe(principal), { puedeGestionarAdministradores: false });
      expect((await llamar(app, 'patch', `/api/users/${adminSin.id}`, tokenAda, { nombre: 'Abel Dos' })).status).toBe(403);
    });
  });

  describe('sesión (CA-15)', () => {
    it('/auth/me expone esPrincipal y puedeGestionarAdministradores', async () => {
      const { principal } = await empresa();
      const res = await llamar(app, 'get', '/api/auth/me', tokenDe(principal));
      expect(res.body).toMatchObject({ esPrincipal: true, puedeGestionarAdministradores: false });
    });
  });

  describe('aislamiento multi-tenant (CA-16)', () => {
    it('el principal de otro tenant no gestiona nada aquí (404) y su permiso no cruza', async () => {
      const { asesor, adminSin } = await empresa();
      const ajeno = await crearUsuario(new Types.ObjectId().toString(), { esPrincipal: true });
      const t = tokenDe(ajeno);
      expect(await acciones(t, asesor.id)).toEqual([404, 404, 404, 404]);
      expect((await llamar(app, 'get', `/api/users/${adminSin.id}`, t)).status).toBe(404);
      const lista = await llamar(app, 'get', '/api/users/manage', t);
      expect(lista.body.map((u: { id: string }) => u.id)).toEqual([ajeno.id]);
    });
  });
});
