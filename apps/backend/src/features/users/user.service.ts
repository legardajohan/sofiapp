import bcrypt from 'bcrypt';
import mongoose, { Types, type ClientSession, type FilterQuery } from 'mongoose';
import {
  countScoped,
  createScoped,
  findByIdScoped,
  findOneAndUpdateScoped,
  findOneScoped,
  findScoped,
  updateManyScoped,
} from '../../repositories/base.repository.js';
import { AppError } from '../../utils/AppError.js';
import { recordAuditEvent } from '../audit/audit.service.js';
import { notifySessionsRevoked, revokeUserSessions } from '../auth/session.service.js';
import {
  countAssignedConversations,
  moveAssignedConversations,
} from '../conversation/conversation-reassign.service.js';
import { countFlowsReferencingUser } from '../flow/flow.service.js';
import { assertWithinQuota, getSeatUsage } from '../usage/usage.service.js';
import { publishRealtime } from '../../realtime/realtime.publisher.js';
import type { SafeUser } from '../../types/express.js';
import { User } from './user.model.js';
import { rolEmpresaDe, toUserResponse, type IUserSource } from './user.mapper.js';
import {
  accionesSobre,
  puedeConcederPermisoAdmin,
  puedeGestionar,
  rolesCreables,
  type IObjetivoGestion,
} from './user.permisos.js';
import {
  USER_HAS_DEPENDENCIES,
  type CreateUserDTO,
  type DeleteUserDTO,
  type IActorGestion,
  type ICupoUsuarios,
  type IDependenciasUsuario,
  type IManageUsersQuery,
  type IPrincipalResponse,
  type IUserDocument,
  type IUserResponse,
  type MoverConversaciones,
  type MoverEquipo,
  type RolEmpresa,
  type SetUserEstadoDTO,
  type UpdateUserDTO,
} from './user.types.js';
import type { ListUsersQuery } from './user.validation.js';

type TenantId = string | Types.ObjectId;

/** Quién ejecuta la operación: sale de `req.user` (token), nunca del body. */
export type UserActor = Pick<SafeUser, 'sub' | 'rol' | 'rolEmpresa'>;

const BCRYPT_ROUNDS = 10;
const MAX_LISTADO = 500;

/** Un eliminado (AUTH-05) no existe para listados, selectores ni gestión. */
const NO_ELIMINADO = { eliminado: { $ne: true } } as const;

export async function listTenantUsers(
  tenantId: TenantId,
  query: ListUsersQuery,
): Promise<IUserResponse[]> {
  const { activo, rol } = query;
  const docs = await findScoped(User, tenantId, { rol, activo, ...NO_ELIMINADO })
    .sort({ nombre: 1 })
    .lean<IUserSource[]>();
  return docs.map(toUserResponse);
}

/**
 * Única guarda que impide asignar una conversación a un usuario ajeno: exige que sea `admin`
 * activo del propio tenant (el `tenantId` viene del token, nunca del body).
 */
export async function assertAssignableAdmin(
  tenantId: TenantId,
  userId: string,
): Promise<IUserResponse> {
  const doc = await findByIdScoped(User, tenantId, userId).lean<IUserSource>();
  if (!doc || doc.rol !== 'admin' || !doc.activo || doc.eliminado) {
    throw new AppError('Usuario no asignable.', 404);
  }
  return toUserResponse(doc);
}

/**
 * Resuelve varios usuarios de una sola consulta (evita N+1 al proyectar listas). No filtra a los
 * eliminados: el historial sigue mostrando su nombre.
 */
export async function findUsersByIds(
  tenantId: TenantId,
  ids: string[],
): Promise<Map<string, IUserResponse>> {
  const uniqueIds = [...new Set(ids)];
  if (uniqueIds.length === 0) return new Map();

  const docs = await findScoped(User, tenantId, {
    _id: { $in: uniqueIds.map((id) => new Types.ObjectId(id)) },
  }).lean<IUserSource[]>();
  const map = new Map<string, IUserResponse>();
  for (const doc of docs) map.set(String(doc._id), toUserResponse(doc));
  return map;
}

// ── Gestión de usuarios (AUTH-03, roles AUTH-04, jerarquía AUTH-05) ──────────────────────────
//
// Matriz en `user.permisos.ts` (ADR 0018): el principal es intocable dentro del tenant; un
// Administrador gestiona Coordinadores y Asesores, y a otros Administradores solo si es el principal
// o tiene el permiso; el Coordinador gestiona a los asesores de su equipo y a los sin coordinador.

function oid(id: string): Types.ObjectId {
  return new Types.ObjectId(id);
}

function idDe(v: Types.ObjectId | string | null | undefined): string | null {
  return v ? String(v) : null;
}

function escaparRegex(texto: string): string {
  return texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function esEmailDuplicado(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: number }).code === 11000;
}

/** El 409 no dice en qué empresa existe el email: el índice es global (ADR 0003). */
const EMAIL_DUPLICADO = 'Ya existe un usuario con ese email.';
const PRINCIPAL_INTOCABLE = 'El usuario principal solo lo gestiona el superadministrador.';
const SIN_PERMISO_ADMIN = 'No tienes permiso para gestionar a otros administradores.';

/** Email con el que queda un usuario eliminado: libera el original (índice único global). */
function emailEliminado(id: string): string {
  return `${id}.eliminado@invalid.sofiapp`;
}

/**
 * Completa el actor del token con lo que vive en BD (principal, permiso y rol vigente). Se lee en
 * cada petición: retirar el permiso tiene efecto inmediato, sin esperar a que expire el JWT.
 */
async function cargarActor(tenantId: TenantId, actor: UserActor): Promise<IActorGestion> {
  const doc = await findByIdScoped(User, tenantId, actor.sub)
    .select('rol rolEmpresa subrol activo eliminado esPrincipal puedeGestionarAdministradores')
    .lean<IUserSource>();
  const rolEmpresa = doc ? rolEmpresaDe(doc) : undefined;
  if (!doc || !doc.activo || doc.eliminado || !rolEmpresa) {
    throw new AppError('Sesión no válida.', 401);
  }
  return {
    sub: actor.sub,
    rolEmpresa,
    esPrincipal: doc.esPrincipal === true,
    puedeGestionarAdministradores: doc.puedeGestionarAdministradores === true,
  };
}

function objetivoDe(doc: IUserSource): IObjetivoGestion {
  return {
    id: String(doc._id),
    rolEmpresa: rolEmpresaDe(doc) ?? 'asesor',
    esPrincipal: doc.esPrincipal === true,
    coordinadorId: idDe(doc.coordinadorId),
  };
}

async function cargarDoc(tenantId: TenantId, id: string): Promise<IUserSource> {
  const doc = await findByIdScoped(User, tenantId, id).lean<IUserSource>();
  if (!doc || doc.rol !== 'admin' || doc.eliminado) throw new AppError('Usuario no encontrado.', 404);
  return doc;
}

/**
 * Carga el usuario sobre el que se actúa y exige poder **gestionarlo**. Lo que el actor no ve (para
 * el coordinador, todo lo que no es asesor de su equipo o sin coordinador) es 404, igual que un id
 * inexistente; lo que ve pero no gestiona (el principal, otro administrador sin permiso) es 403.
 */
async function cargarObjetivoPara(
  tenantId: TenantId,
  actor: IActorGestion,
  id: string,
): Promise<IUserSource> {
  const doc = await cargarDoc(tenantId, id);
  const objetivo = objetivoDe(doc);
  const resultado = puedeGestionar(actor, objetivo);
  if (resultado === 'invisible') throw new AppError('Usuario no encontrado.', 404);
  if (resultado === 'prohibido') {
    throw new AppError(objetivo.esPrincipal ? PRINCIPAL_INTOCABLE : SIN_PERMISO_ADMIN, 403);
  }
  return doc;
}

/** Variante de lectura: el administrador ve a todos (aunque no los gestione); el coordinador, su alcance. */
async function cargarVisiblePara(
  tenantId: TenantId,
  actor: IActorGestion,
  id: string,
): Promise<IUserSource> {
  const doc = await cargarDoc(tenantId, id);
  if (actor.sub !== id && puedeGestionar(actor, objetivoDe(doc)) === 'invisible') {
    throw new AppError('Usuario no encontrado.', 404);
  }
  return doc;
}

function conAcciones(actor: IActorGestion, doc: IUserSource): IUserResponse {
  return { ...toUserResponse(doc), acciones: accionesSobre(actor, objetivoDe(doc)) };
}

function assertNoEsUnoMismo(actor: IActorGestion, objetivoId: string, mensaje: string): void {
  if (actor.sub === objetivoId) throw new AppError(mensaje, 409);
}

function assertPuedeAsignarRol(actor: IActorGestion, rol: RolEmpresa): void {
  if (rolesCreables(actor).includes(rol)) return;
  throw new AppError(
    actor.rolEmpresa === 'coordinador'
      ? 'Un coordinador solo puede crear asesores.'
      : SIN_PERMISO_ADMIN,
    403,
  );
}

function assertPuedeConcederPermiso(actor: IActorGestion, valor: boolean | undefined): void {
  if (valor !== undefined && !puedeConcederPermisoAdmin(actor)) {
    throw new AppError('Solo el usuario principal concede el permiso de gestionar administradores.', 403);
  }
}

/** El coordinador de un asesor tiene que ser un coordinador **activo** del mismo tenant. */
async function assertCoordinadorValido(
  tenantId: TenantId,
  coordinadorId: string,
  session?: ClientSession,
): Promise<void> {
  const q = findOneScoped(User, tenantId, {
    _id: oid(coordinadorId),
    rol: 'admin',
    rolEmpresa: 'coordinador',
    activo: true,
  }).select('_id');
  const doc = await (session ? q.session(session) : q).lean();
  if (!doc) throw new AppError('Coordinador no válido.', 404);
}

/** Impide dejar a la empresa sin ningún Administrador activo. */
async function assertNoUltimoAdministrador(
  tenantId: TenantId,
  objetivoId: string,
  session: ClientSession,
): Promise<void> {
  const otros = await countScoped(User, tenantId, {
    rol: 'admin',
    rolEmpresa: 'administrador',
    activo: true,
    _id: { $ne: oid(objetivoId) },
  }).session(session);
  if (otros === 0) {
    throw new AppError('La empresa debe conservar al menos un Administrador activo.', 409);
  }
}

/** `usuarios` cuenta a todos; `administradores` solo al rol Administrador (AUTH-04). */
async function assertCupo(tenantId: string, rol: RolEmpresa, session: ClientSession): Promise<void> {
  await assertWithinQuota(tenantId, 'usuarios', session);
  if (rol === 'administrador') await assertWithinQuota(tenantId, 'administradores', session);
}

/** Asesores (activos o no) que cuelgan de un coordinador. */
async function contarEquipo(
  tenantId: TenantId,
  coordinadorId: string,
  session: ClientSession,
): Promise<number> {
  return countScoped(User, tenantId, { coordinadorId: oid(coordinadorId) }).session(session);
}

/** Mueve el equipo entero de un coordinador a otro, o lo deja sin coordinador. */
async function moverEquipo(
  tenantId: TenantId,
  coordinadorId: string,
  equipo: MoverEquipo,
  session: ClientSession,
): Promise<number> {
  const destino = equipo.accion === 'reasignar' ? oid(equipo.coordinadorDestinoId) : null;
  const res = await updateManyScoped(
    User,
    tenantId,
    { coordinadorId: oid(coordinadorId) },
    { $set: { coordinadorId: destino } },
  ).session(session);
  return res.modifiedCount;
}

function assertEquipoDestinoDistinto(equipo: MoverEquipo | undefined, id: string): void {
  if (equipo?.accion === 'reasignar' && equipo.coordinadorDestinoId === id) {
    throw new AppError('Elige a otro coordinador para recibir a sus asesores.', 400);
  }
}

function errorDependencias(dep: IDependenciasUsuario): AppError {
  return new AppError('El usuario tiene conversaciones o asesores a su cargo.', 409, {
    code: USER_HAS_DEPENDENCIES,
    ...dep,
  });
}

async function auditarEquipoMovido(
  tenantId: string,
  actor: IActorGestion,
  id: string,
  equipo: MoverEquipo,
  cantidad: number,
): Promise<void> {
  if (cantidad === 0) return;
  await recordAuditEvent(tenantId, {
    actorId: actor.sub,
    accion: 'user.team_moved',
    entidad: 'user',
    entidadId: id,
    antes: { coordinadorId: id },
    despues: {
      coordinadorId: equipo.accion === 'reasignar' ? equipo.coordinadorDestinoId : null,
      cantidad,
    },
  });
}

/** Filtro de coordinador pedido por query, intersecado con el alcance del coordinador. */
function filtroCoordinador(
  actor: IActorGestion,
  pedido: string | undefined,
): Types.ObjectId | null | { $in: (Types.ObjectId | null)[] } | 'vacio' | undefined {
  const propio = oid(actor.sub);
  if (actor.rolEmpresa !== 'coordinador') {
    if (!pedido) return undefined;
    return pedido === 'ninguno' ? null : oid(pedido);
  }
  if (!pedido) return { $in: [propio, null] };
  if (pedido === 'ninguno') return null;
  return pedido === actor.sub ? propio : 'vacio';
}

export async function listManageableUsers(
  tenantId: TenantId,
  tokenActor: UserActor,
  query: IManageUsersQuery,
): Promise<IUserResponse[]> {
  const actor = await cargarActor(tenantId, tokenActor);
  const filtro: FilterQuery<IUserDocument> = { rol: 'admin', ...NO_ELIMINADO };
  const coord = filtroCoordinador(actor, query.coordinadorId);
  if (coord === 'vacio') return [];
  if (coord !== undefined) filtro.coordinadorId = coord;
  if (actor.rolEmpresa === 'coordinador') {
    // El coordinador solo ve asesores (su equipo y los sin coordinador): su filtro de rol se ignora.
    filtro.rolEmpresa = 'asesor';
  } else if (query.rolEmpresa) {
    filtro.rolEmpresa = query.rolEmpresa;
  }
  if (query.activo !== undefined) filtro.activo = query.activo;
  if (query.q) {
    const re = new RegExp(escaparRegex(query.q), 'i');
    filtro.$or = [{ nombre: re }, { email: re }];
  }
  const docs = await findScoped(User, tenantId, filtro)
    .sort({ esPrincipal: -1, activo: -1, nombre: 1 })
    .limit(MAX_LISTADO)
    .lean<IUserSource[]>();
  return docs.map((doc) => conAcciones(actor, doc));
}

export async function getTenantUser(
  tenantId: TenantId,
  tokenActor: UserActor,
  id: string,
): Promise<IUserResponse> {
  const actor = await cargarActor(tenantId, tokenActor);
  return conAcciones(actor, await cargarVisiblePara(tenantId, actor, id));
}

export async function createTenantUser(
  tenantId: string,
  tokenActor: UserActor,
  dto: CreateUserDTO,
): Promise<IUserResponse> {
  const actor = await cargarActor(tenantId, tokenActor);
  assertPuedeAsignarRol(actor, dto.rolEmpresa);
  assertPuedeConcederPermiso(actor, dto.puedeGestionarAdministradores);

  // El coordinador elige el coordinador del asesor (cualquiera, él o ninguno); si no lo dice, va a
  // su equipo. El administrador, el que indique o ninguno.
  const coordinadorId =
    dto.rolEmpresa !== 'asesor'
      ? null
      : dto.coordinadorId !== undefined
        ? dto.coordinadorId
        : actor.rolEmpresa === 'coordinador'
          ? actor.sub
          : null;
  const permiso = dto.rolEmpresa === 'administrador' && dto.puedeGestionarAdministradores === true;

  const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

  let creado: IUserSource;
  try {
    creado = await mongoose.connection.transaction(async (session) => {
      await assertCupo(tenantId, dto.rolEmpresa, session);
      if (coordinadorId) await assertCoordinadorValido(tenantId, coordinadorId, session);
      // `rol` lo fija el service: desde un tenant solo se crean `admin` (nunca `superadmin`), y
      // nunca un principal (lo crea el superadmin con la empresa).
      const doc = await createScoped(
        User,
        tenantId,
        {
          nombre: dto.nombre,
          email: dto.email,
          passwordHash,
          rol: 'admin',
          rolEmpresa: dto.rolEmpresa,
          coordinadorId: coordinadorId ? oid(coordinadorId) : null,
          activo: true,
          esPrincipal: false,
          puedeGestionarAdministradores: permiso,
        },
        { session },
      );
      return doc.toObject() as unknown as IUserSource;
    });
  } catch (err) {
    if (esEmailDuplicado(err)) throw new AppError(EMAIL_DUPLICADO, 409);
    throw err;
  }

  const id = String(creado._id);
  await recordAuditEvent(tenantId, {
    actorId: actor.sub,
    accion: 'user.created',
    entidad: 'user',
    entidadId: id,
    antes: {},
    despues: {
      nombre: creado.nombre,
      email: creado.email,
      rolEmpresa: dto.rolEmpresa,
      coordinadorId,
      ...(permiso ? { puedeGestionarAdministradores: true } : {}),
    },
  });
  return conAcciones(actor, creado);
}

export async function updateTenantUser(
  tenantId: string,
  tokenActor: UserActor,
  id: string,
  dto: UpdateUserDTO,
): Promise<IUserResponse> {
  const actor = await cargarActor(tenantId, tokenActor);
  // Uno mismo (salvo el principal) puede corregir su nombre y email; el resto de reglas siguen.
  const objetivo =
    actor.sub === id && !actor.esPrincipal
      ? await cargarDoc(tenantId, id)
      : await cargarObjetivoPara(tenantId, actor, id);

  if (actor.rolEmpresa === 'coordinador' && dto.rolEmpresa !== undefined) {
    throw new AppError('Solo un Administrador puede cambiar el rol.', 403);
  }
  assertPuedeConcederPermiso(actor, dto.puedeGestionarAdministradores);

  const rolActual = rolEmpresaDe(objetivo) ?? 'asesor';
  const rolFinal = dto.rolEmpresa ?? rolActual;
  const cambiaRol = rolFinal !== rolActual;
  if (cambiaRol) {
    assertNoEsUnoMismo(actor, id, 'No puedes cambiar tu propio rol.');
    assertPuedeAsignarRol(actor, rolFinal);
  }

  if (rolFinal !== 'asesor' && dto.coordinadorId) {
    throw new AppError('Solo un asesor puede tener coordinador.', 400);
  }
  if (rolFinal !== 'administrador' && dto.puedeGestionarAdministradores === true) {
    throw new AppError('Solo un Administrador puede gestionar a otros administradores.', 400);
  }
  const permisoActual = objetivo.puedeGestionarAdministradores === true;
  const permisoFinal =
    rolFinal === 'administrador' ? (dto.puedeGestionarAdministradores ?? permisoActual) : false;
  const cambiaPermiso = permisoFinal !== permisoActual;

  const coordActual = idDe(objetivo.coordinadorId);
  // Al dejar de ser asesor se pierde el equipo; al pasar a asesor se parte sin coordinador salvo que
  // el body diga cuál.
  const coordFinal =
    rolFinal !== 'asesor'
      ? null
      : dto.coordinadorId !== undefined
        ? dto.coordinadorId
        : cambiaRol
          ? null
          : coordActual;
  const cambiaCoord = coordFinal !== coordActual;
  assertEquipoDestinoDistinto(dto.equipo, id);

  let actualizado: IUserSource;
  let equipoMovido = 0;
  try {
    ({ actualizado, equipoMovido } = await mongoose.connection.transaction(async (session) => {
      if (cambiaRol && rolActual === 'administrador' && objetivo.activo) {
        await assertNoUltimoAdministrador(tenantId, id, session);
      }
      if (cambiaRol && rolFinal === 'administrador' && objetivo.activo) {
        await assertWithinQuota(tenantId, 'administradores', session);
      }
      if (cambiaCoord && coordFinal) await assertCoordinadorValido(tenantId, coordFinal, session);

      // Un coordinador que deja de serlo no puede dejar a sus asesores colgando.
      let movidos = 0;
      if (cambiaRol && rolActual === 'coordinador') {
        const asesores = await contarEquipo(tenantId, id, session);
        if (asesores > 0) {
          if (!dto.equipo) throw errorDependencias({ asignadas: 0, flujos: 0, asesores });
          if (dto.equipo.accion === 'reasignar') {
            await assertCoordinadorValido(tenantId, dto.equipo.coordinadorDestinoId, session);
          }
          movidos = await moverEquipo(tenantId, id, dto.equipo, session);
        }
      }

      const set: Record<string, unknown> = {};
      if (dto.nombre !== undefined) set['nombre'] = dto.nombre;
      if (dto.email !== undefined) set['email'] = dto.email;
      if (cambiaRol) set['rolEmpresa'] = rolFinal;
      if (cambiaCoord) set['coordinadorId'] = coordFinal ? oid(coordFinal) : null;
      if (cambiaPermiso) set['puedeGestionarAdministradores'] = permisoFinal;

      const doc = await findOneAndUpdateScoped(
        User,
        tenantId,
        { _id: oid(id) },
        { $set: set },
        { new: true, session },
      ).lean<IUserSource>();
      if (!doc) throw new AppError('Usuario no encontrado.', 404);
      if (cambiaRol) await revokeUserSessions(tenantId, id, session);
      return { actualizado: doc, equipoMovido: movidos };
    }));
  } catch (err) {
    if (esEmailDuplicado(err)) throw new AppError(EMAIL_DUPLICADO, 409);
    throw err;
  }

  const antes: Record<string, unknown> = {};
  const despues: Record<string, unknown> = {};
  if (dto.nombre !== undefined && dto.nombre !== objetivo.nombre) {
    antes['nombre'] = objetivo.nombre;
    despues['nombre'] = dto.nombre;
  }
  if (dto.email !== undefined && dto.email !== objetivo.email) {
    antes['email'] = objetivo.email;
    despues['email'] = dto.email;
  }
  if (Object.keys(despues).length > 0) {
    await recordAuditEvent(tenantId, {
      actorId: actor.sub,
      accion: 'user.updated',
      entidad: 'user',
      entidadId: id,
      antes,
      despues,
    });
  }
  if (cambiaRol) {
    await recordAuditEvent(tenantId, {
      actorId: actor.sub,
      accion: 'user.role_changed',
      entidad: 'user',
      entidadId: id,
      antes: { rolEmpresa: rolActual },
      despues: { rolEmpresa: rolFinal },
    });
  }
  if (cambiaCoord) {
    await recordAuditEvent(tenantId, {
      actorId: actor.sub,
      accion: 'user.coordinator_changed',
      entidad: 'user',
      entidadId: id,
      antes: { coordinadorId: coordActual },
      despues: { coordinadorId: coordFinal },
    });
  }
  if (cambiaPermiso) {
    await recordAuditEvent(tenantId, {
      actorId: actor.sub,
      accion: 'user.admin_permission_changed',
      entidad: 'user',
      entidadId: id,
      antes: { puedeGestionarAdministradores: permisoActual },
      despues: { puedeGestionarAdministradores: permisoFinal },
    });
  }
  if (dto.equipo) await auditarEquipoMovido(tenantId, actor, id, dto.equipo, equipoMovido);
  if (cambiaRol) await notifySessionsRevoked(tenantId, id);
  return conAcciones(actor, actualizado);
}

export async function setTenantUserEstado(
  tenantId: string,
  tokenActor: UserActor,
  id: string,
  dto: SetUserEstadoDTO,
): Promise<IUserResponse> {
  const actor = await cargarActor(tenantId, tokenActor);
  if (!dto.activo) assertNoEsUnoMismo(actor, id, 'No puedes desactivar tu propio usuario.');
  const objetivo = await cargarObjetivoPara(tenantId, actor, id);
  if (objetivo.activo === dto.activo) return conAcciones(actor, objetivo); // idempotente

  return dto.activo
    ? reactivarUsuario(tenantId, actor, objetivo)
    : retirarUsuario(tenantId, actor, objetivo, dto, 'desactivar');
}

async function reactivarUsuario(
  tenantId: string,
  actor: IActorGestion,
  objetivo: IUserSource,
): Promise<IUserResponse> {
  const id = String(objetivo._id);
  const rol = rolEmpresaDe(objetivo) ?? 'asesor';
  const coordinadorId = idDe(objetivo.coordinadorId);

  const doc = await mongoose.connection.transaction(async (session) => {
    await assertCupo(tenantId, rol, session);
    const set: Record<string, unknown> = { activo: true };
    // Si su coordinador ya no lo es (o está inactivo), vuelve sin coordinador: nunca colgando.
    if (coordinadorId) {
      const valido = await findOneScoped(User, tenantId, {
        _id: oid(coordinadorId),
        rolEmpresa: 'coordinador',
        activo: true,
      })
        .select('_id')
        .session(session)
        .lean();
      if (!valido) set['coordinadorId'] = null;
    }
    const actualizado = await findOneAndUpdateScoped(
      User,
      tenantId,
      { _id: oid(id), ...NO_ELIMINADO },
      { $set: set },
      { new: true, session },
    ).lean<IUserSource>();
    if (!actualizado) throw new AppError('Usuario no encontrado.', 404);
    return actualizado;
  });

  await recordAuditEvent(tenantId, {
    actorId: actor.sub,
    accion: 'user.reactivated',
    entidad: 'user',
    entidadId: id,
    antes: { activo: false },
    despues: { activo: true },
  });
  return conAcciones(actor, doc);
}

/** Destino de las conversaciones al desactivar o eliminar: cualquier usuario activo (AUTH-05). */
async function assertDestinoConversaciones(
  tenantId: string,
  objetivoId: string,
  mover: MoverConversaciones | undefined,
): Promise<string | null> {
  if (mover?.accion !== 'reasignar') return null;
  if (mover.destinoId === objetivoId) {
    throw new AppError('Elige a otro usuario para recibir las conversaciones.', 400);
  }
  await assertAssignableAdmin(tenantId, mover.destinoId);
  return mover.destinoId;
}

type ModoRetiro = 'desactivar' | 'eliminar';

/**
 * Desactiva o elimina (borrado lógico) al usuario. Si tiene conversaciones asignadas o (siendo
 * coordinador) asesores a su cargo y el body no dice qué hacer con ellos, responde 409 con los
 * conteos. Mover conversaciones, mover el equipo, retirar y revocar van en **una** transacción.
 */
async function retirarUsuario(
  tenantId: string,
  actor: IActorGestion,
  objetivo: IUserSource,
  dto: DeleteUserDTO,
  modo: ModoRetiro,
): Promise<IUserResponse> {
  const id = String(objetivo._id);
  const rol = rolEmpresaDe(objetivo) ?? 'asesor';
  const mover = dto.conversaciones;
  const destinoId = await assertDestinoConversaciones(tenantId, id, mover);
  assertEquipoDestinoDistinto(dto.equipo, id);

  const { doc, movidas, equipoMovido } = await mongoose.connection.transaction(async (session) => {
    if (rol === 'administrador' && objetivo.activo) {
      await assertNoUltimoAdministrador(tenantId, id, session);
    }

    const asignadas = await countAssignedConversations(tenantId, id, session);
    const asesores = rol === 'coordinador' ? await contarEquipo(tenantId, id, session) : 0;
    if ((asignadas > 0 && !mover) || (asesores > 0 && !dto.equipo)) {
      throw errorDependencias({
        asignadas,
        flujos: await countFlowsReferencingUser(tenantId, id),
        asesores,
      });
    }

    let movidos = 0;
    if (asesores > 0 && dto.equipo) {
      if (dto.equipo.accion === 'reasignar') {
        await assertCoordinadorValido(tenantId, dto.equipo.coordinadorDestinoId, session);
      }
      movidos = await moverEquipo(tenantId, id, dto.equipo, session);
    }

    const ids = mover ? await moveAssignedConversations(tenantId, id, destinoId, session) : [];
    const set: Record<string, unknown> =
      modo === 'desactivar'
        ? { activo: false }
        : {
            activo: false,
            eliminado: true,
            eliminadoEn: new Date(),
            eliminadoPor: oid(actor.sub),
            emailOriginal: objetivo.email,
            email: emailEliminado(id),
            puedeGestionarAdministradores: false,
          };
    const actualizado = await findOneAndUpdateScoped(
      User,
      tenantId,
      { _id: oid(id) },
      { $set: set },
      { new: true, session },
    ).lean<IUserSource>();
    if (!actualizado) throw new AppError('Usuario no encontrado.', 404);
    await revokeUserSessions(tenantId, id, session);
    return { doc: actualizado, movidas: ids, equipoMovido: movidos };
  });

  if (modo === 'desactivar') {
    await recordAuditEvent(tenantId, {
      actorId: actor.sub,
      accion: 'user.deactivated',
      entidad: 'user',
      entidadId: id,
      antes: { activo: true },
      despues: { activo: false },
    });
  } else {
    await recordAuditEvent(tenantId, {
      actorId: actor.sub,
      accion: 'user.deleted',
      entidad: 'user',
      entidadId: id,
      antes: { nombre: objetivo.nombre, email: objetivo.email, rolEmpresa: rol, activo: objetivo.activo },
      despues: { eliminado: true },
    });
  }
  if (dto.equipo) await auditarEquipoMovido(tenantId, actor, id, dto.equipo, equipoMovido);
  if (movidas.length > 0) {
    await recordAuditEvent(tenantId, {
      actorId: actor.sub,
      accion: 'user.conversations_moved',
      entidad: 'user',
      entidadId: id,
      antes: { asesorId: id },
      despues: { asesorId: destinoId, cantidad: movidas.length },
    });
    await publishRealtime({
      type: 'conversations:reassigned',
      tenantId,
      conversationIds: movidas,
      asesorId: destinoId,
    });
  }
  await notifySessionsRevoked(tenantId, id);
  return toUserResponse(doc);
}

/** Borrado lógico (AUTH-05): mismas reglas de alcance y dependencias que la desactivación. */
export async function deleteTenantUser(
  tenantId: string,
  tokenActor: UserActor,
  id: string,
  dto: DeleteUserDTO,
): Promise<IUserResponse> {
  const actor = await cargarActor(tenantId, tokenActor);
  assertNoEsUnoMismo(actor, id, 'No puedes eliminar tu propio usuario.');
  const objetivo = await cargarObjetivoPara(tenantId, actor, id);
  return retirarUsuario(tenantId, actor, objetivo, dto, 'eliminar');
}

export async function resetTenantUserPassword(
  tenantId: string,
  tokenActor: UserActor,
  id: string,
  password: string,
): Promise<void> {
  const actor = await cargarActor(tenantId, tokenActor);
  // La propia contraseña se cambia con la actual (`PATCH /api/auth/me/password`): aquí cerraría la
  // sesión del propio gestor.
  assertNoEsUnoMismo(actor, id, 'Para cambiar tu propia contraseña usa tu perfil.');
  await cargarObjetivoPara(tenantId, actor, id);
  await guardarPasswordYRevocar(tenantId, id, password);

  await recordAuditEvent(tenantId, {
    actorId: actor.sub,
    accion: 'user.password_reset',
    entidad: 'user',
    entidadId: id,
    antes: {},
    despues: {},
  });
  await notifySessionsRevoked(tenantId, id);
}

async function guardarPasswordYRevocar(tenantId: TenantId, id: string, password: string): Promise<void> {
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  await mongoose.connection.transaction(async (session) => {
    await findOneAndUpdateScoped(
      User,
      tenantId,
      { _id: oid(id) },
      { $set: { passwordHash } },
      { session },
    );
    await revokeUserSessions(tenantId, id, session);
  });
}

/** Uso del plan en la pantalla Usuarios (AUTH-05). */
export async function getCupoUsuarios(tenantId: TenantId): Promise<ICupoUsuarios> {
  return getSeatUsage(tenantId);
}

// ── Superadmin (AUTH-05): el único que recupera la contraseña del principal ──────────────────
//
// `tenantId` llega del `:id` de `/api/admin/tenants/:id/principal*` (ruta de superadmin, mismo
// precedente que `/:id/plan` y `/:id/usage`); la consulta sigue pasando por el repositorio scoped.

async function cargarPrincipal(tenantId: string): Promise<IUserSource> {
  const doc = await findOneScoped(User, tenantId, {
    esPrincipal: true,
    rol: 'admin',
    ...NO_ELIMINADO,
  }).lean<IUserSource>();
  if (!doc) throw new AppError('La empresa no tiene usuario principal.', 404);
  return doc;
}

export async function getPrincipal(tenantId: string): Promise<IPrincipalResponse> {
  const doc = await cargarPrincipal(tenantId);
  return { id: String(doc._id), nombre: doc.nombre, email: doc.email };
}

export async function resetPrincipalPassword(
  tenantId: string,
  superadminId: string,
  password: string,
): Promise<void> {
  const principal = await cargarPrincipal(tenantId);
  const id = String(principal._id);
  await guardarPasswordYRevocar(tenantId, id, password);
  await recordAuditEvent(tenantId, {
    actorId: superadminId,
    accion: 'user.password_reset',
    entidad: 'user',
    entidadId: id,
    antes: {},
    despues: { porSuperadmin: true },
  });
  await notifySessionsRevoked(tenantId, id);
}
