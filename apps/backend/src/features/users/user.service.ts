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
import { assertWithinQuota } from '../usage/usage.service.js';
import { publishRealtime } from '../../realtime/realtime.publisher.js';
import type { SafeUser } from '../../types/express.js';
import { User } from './user.model.js';
import { rolEmpresaDe, toUserResponse, type IUserSource } from './user.mapper.js';
import {
  USER_HAS_DEPENDENCIES,
  type CreateUserDTO,
  type IDependenciasUsuario,
  type IManageUsersQuery,
  type IUserDocument,
  type IUserResponse,
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

export async function listTenantUsers(
  tenantId: TenantId,
  query: ListUsersQuery,
): Promise<IUserResponse[]> {
  const { activo, rol } = query;
  const docs = await findScoped(User, tenantId, { rol, activo })
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
  if (!doc || doc.rol !== 'admin' || !doc.activo) {
    throw new AppError('Usuario no asignable.', 404);
  }
  return toUserResponse(doc);
}

/** Resuelve varios usuarios de una sola consulta (evita N+1 al proyectar listas). */
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

// ── Gestión de usuarios (AUTH-03, roles de empresa AUTH-04) ──────────────────────────────────
//
// Jerarquía (ADR 0017): el administrador gestiona a todos; el coordinador solo a los asesores de su
// equipo (`coordinadorId` = él); el asesor no gestiona a nadie (lo corta la ruta).

function esCoordinador(actor: UserActor): boolean {
  return actor.rolEmpresa === 'coordinador';
}

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

/**
 * Carga el usuario sobre el que se actúa **dentro del alcance del actor**. Para un coordinador, un
 * usuario que no es asesor de su equipo da 404 igual que uno inexistente: no se revela que existe.
 */
async function cargarObjetivoPara(
  tenantId: TenantId,
  actor: UserActor,
  id: string,
): Promise<IUserSource> {
  const doc = esCoordinador(actor)
    ? await findOneScoped(User, tenantId, {
        _id: oid(id),
        rol: 'admin',
        rolEmpresa: 'asesor',
        coordinadorId: oid(actor.sub),
      }).lean<IUserSource>()
    : await findByIdScoped(User, tenantId, id).lean<IUserSource>();
  if (!doc || doc.rol !== 'admin') throw new AppError('Usuario no encontrado.', 404);
  return doc;
}

function assertNoEsUnoMismo(actor: UserActor, objetivoId: string, mensaje: string): void {
  if (actor.sub === objetivoId) throw new AppError(mensaje, 409);
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
  actor: UserActor,
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

export async function listManageableUsers(
  tenantId: TenantId,
  actor: UserActor,
  query: IManageUsersQuery,
): Promise<IUserResponse[]> {
  const filtro: FilterQuery<IUserDocument> = { rol: 'admin' };
  if (esCoordinador(actor)) {
    // El coordinador solo ve su equipo: sus filtros de rol/coordinador se ignoran.
    filtro.rolEmpresa = 'asesor';
    filtro.coordinadorId = oid(actor.sub);
  } else {
    if (query.rolEmpresa) filtro.rolEmpresa = query.rolEmpresa;
    if (query.coordinadorId) {
      filtro.coordinadorId = query.coordinadorId === 'ninguno' ? null : oid(query.coordinadorId);
    }
  }
  if (query.activo !== undefined) filtro.activo = query.activo;
  if (query.q) {
    const re = new RegExp(escaparRegex(query.q), 'i');
    filtro.$or = [{ nombre: re }, { email: re }];
  }
  const docs = await findScoped(User, tenantId, filtro)
    .sort({ activo: -1, nombre: 1 })
    .limit(MAX_LISTADO)
    .lean<IUserSource[]>();
  return docs.map(toUserResponse);
}

export async function getTenantUser(
  tenantId: TenantId,
  actor: UserActor,
  id: string,
): Promise<IUserResponse> {
  return toUserResponse(await cargarObjetivoPara(tenantId, actor, id));
}

export async function createTenantUser(
  tenantId: string,
  actor: UserActor,
  dto: CreateUserDTO,
): Promise<IUserResponse> {
  let coordinadorId: string | null;
  if (esCoordinador(actor)) {
    // El coordinador solo da de alta asesores, y nacen en su equipo.
    if (dto.rolEmpresa !== 'asesor') {
      throw new AppError('Un coordinador solo puede crear asesores.', 403);
    }
    if (dto.coordinadorId && dto.coordinadorId !== actor.sub) {
      throw new AppError('Solo puedes crear asesores para tu propio equipo.', 403);
    }
    coordinadorId = actor.sub;
  } else {
    coordinadorId = dto.rolEmpresa === 'asesor' ? (dto.coordinadorId ?? null) : null;
  }

  const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

  let creado: IUserSource;
  try {
    creado = await mongoose.connection.transaction(async (session) => {
      await assertCupo(tenantId, dto.rolEmpresa, session);
      if (coordinadorId && !esCoordinador(actor)) {
        await assertCoordinadorValido(tenantId, coordinadorId, session);
      }
      // `rol` lo fija el service: desde un tenant solo se crean `admin` (nunca `superadmin`).
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
    },
  });
  return toUserResponse(creado);
}

export async function updateTenantUser(
  tenantId: string,
  actor: UserActor,
  id: string,
  dto: UpdateUserDTO,
): Promise<IUserResponse> {
  const objetivo = await cargarObjetivoPara(tenantId, actor, id);

  if (esCoordinador(actor) && (dto.rolEmpresa !== undefined || dto.coordinadorId !== undefined)) {
    throw new AppError('Solo un Administrador puede cambiar el rol o el coordinador.', 403);
  }

  const rolActual = rolEmpresaDe(objetivo) ?? 'asesor';
  const rolFinal = dto.rolEmpresa ?? rolActual;
  const cambiaRol = rolFinal !== rolActual;
  if (cambiaRol) assertNoEsUnoMismo(actor, id, 'No puedes cambiar tu propio rol.');

  if (rolFinal !== 'asesor' && dto.coordinadorId) {
    throw new AppError('Solo un asesor puede tener coordinador.', 400);
  }
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
  if (dto.equipo) await auditarEquipoMovido(tenantId, actor, id, dto.equipo, equipoMovido);
  if (cambiaRol) await notifySessionsRevoked(tenantId, id);
  return toUserResponse(actualizado);
}

export async function setTenantUserEstado(
  tenantId: string,
  actor: UserActor,
  id: string,
  dto: SetUserEstadoDTO,
): Promise<IUserResponse> {
  const objetivo = await cargarObjetivoPara(tenantId, actor, id);
  if (objetivo.activo === dto.activo) return toUserResponse(objetivo); // idempotente

  return dto.activo
    ? reactivarUsuario(tenantId, actor, objetivo)
    : desactivarUsuario(tenantId, actor, objetivo, dto);
}

async function reactivarUsuario(
  tenantId: string,
  actor: UserActor,
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
      { _id: oid(id) },
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
  return toUserResponse(doc);
}

/**
 * Destino de las conversaciones al desactivar. El administrador puede elegir a cualquier usuario
 * activo; el coordinador, solo a sí mismo o a un asesor activo de su equipo.
 */
async function assertDestinoConversaciones(
  tenantId: string,
  actor: UserActor,
  destinoId: string,
): Promise<void> {
  if (!esCoordinador(actor) || destinoId === actor.sub) {
    await assertAssignableAdmin(tenantId, destinoId);
    return;
  }
  const doc = await findOneScoped(User, tenantId, {
    _id: oid(destinoId),
    rol: 'admin',
    rolEmpresa: 'asesor',
    coordinadorId: oid(actor.sub),
    activo: true,
  })
    .select('_id')
    .lean();
  if (!doc) throw new AppError('Usuario no asignable.', 404);
}

/**
 * Desactiva al usuario. Si tiene conversaciones asignadas o (siendo coordinador) asesores a su cargo
 * y el body no dice qué hacer con ellos, responde 409 con los conteos. Mover conversaciones, mover el
 * equipo, desactivar y revocar van en **una** transacción.
 */
async function desactivarUsuario(
  tenantId: string,
  actor: UserActor,
  objetivo: IUserSource,
  dto: SetUserEstadoDTO,
): Promise<IUserResponse> {
  const id = String(objetivo._id);
  const rol = rolEmpresaDe(objetivo) ?? 'asesor';
  assertNoEsUnoMismo(actor, id, 'No puedes desactivar tu propio usuario.');

  const mover = dto.conversaciones;
  if (mover?.accion === 'reasignar') {
    if (mover.destinoId === id) {
      throw new AppError('Elige a otro usuario para recibir las conversaciones.', 400);
    }
    await assertDestinoConversaciones(tenantId, actor, mover.destinoId);
  }
  const destinoId = mover?.accion === 'reasignar' ? mover.destinoId : null;
  assertEquipoDestinoDistinto(dto.equipo, id);

  const { doc, movidas, equipoMovido } = await mongoose.connection.transaction(async (session) => {
    if (rol === 'administrador') await assertNoUltimoAdministrador(tenantId, id, session);

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
    const actualizado = await findOneAndUpdateScoped(
      User,
      tenantId,
      { _id: oid(id) },
      { $set: { activo: false } },
      { new: true, session },
    ).lean<IUserSource>();
    if (!actualizado) throw new AppError('Usuario no encontrado.', 404);
    await revokeUserSessions(tenantId, id, session);
    return { doc: actualizado, movidas: ids, equipoMovido: movidos };
  });

  await recordAuditEvent(tenantId, {
    actorId: actor.sub,
    accion: 'user.deactivated',
    entidad: 'user',
    entidadId: id,
    antes: { activo: true },
    despues: { activo: false },
  });
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

export async function resetTenantUserPassword(
  tenantId: string,
  actor: UserActor,
  id: string,
  password: string,
): Promise<void> {
  await cargarObjetivoPara(tenantId, actor, id);
  // Cambiar la propia contraseña es otro feature (perfil): aquí cerraría la sesión del propio gestor.
  assertNoEsUnoMismo(actor, id, 'Para cambiar tu propia contraseña usa tu perfil.');

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
