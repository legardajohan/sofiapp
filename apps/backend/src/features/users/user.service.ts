import bcrypt from 'bcrypt';
import mongoose, { Types, type ClientSession, type FilterQuery } from 'mongoose';
import {
  countScoped,
  createScoped,
  findByIdScoped,
  findOneAndUpdateScoped,
  findScoped,
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
import { toUserResponse, type IUserSource } from './user.mapper.js';
import {
  USER_HAS_ASSIGNED_CONVERSATIONS,
  type CreateUserDTO,
  type IManageUsersQuery,
  type IUserDocument,
  type IUserResponse,
  type SetUserEstadoDTO,
  type UpdateUserDTO,
} from './user.types.js';
import type { ListUsersQuery } from './user.validation.js';

type TenantId = string | Types.ObjectId;

/** Quién ejecuta la operación: sale de `req.user` (token), nunca del body. */
export type UserActor = Pick<SafeUser, 'sub' | 'rol' | 'subrol'>;

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

// ── Gestión de usuarios (AUTH-03) ────────────────────────────────────────────────────────────

/** Propietario = admin sin subrol (el primer usuario del tenant). Está por encima del director. */
function esPropietario(u: { rol: string; subrol?: string | null }): boolean {
  return u.rol === 'admin' && !u.subrol;
}

function esGestor(u: { rol: string; subrol?: string | null }): boolean {
  return esPropietario(u) || u.subrol === 'director';
}

const FILTRO_GESTORES: FilterQuery<IUserDocument> = {
  $or: [{ subrol: { $exists: false } }, { subrol: null }, { subrol: 'director' }],
};

function escaparRegex(texto: string): string {
  return texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function esEmailDuplicado(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: number }).code === 11000;
}

/** El 409 no dice en qué empresa existe el email: el índice es global (ADR 0003). */
const EMAIL_DUPLICADO = 'Ya existe un usuario con ese email.';

async function cargarObjetivo(tenantId: TenantId, id: string): Promise<IUserSource> {
  const doc = await findByIdScoped(User, tenantId, id).lean<IUserSource>();
  if (!doc || doc.rol !== 'admin') throw new AppError('Usuario no encontrado.', 404);
  return doc;
}

/** Jerarquía: propietario > director > resto. Un director no toca al propietario. */
function assertPuedeGestionar(actor: UserActor, objetivo: IUserSource): void {
  if (esPropietario(objetivo) && !esPropietario(actor)) {
    throw new AppError('No puedes modificar al propietario de la empresa.', 403);
  }
}

function assertNoEsUnoMismo(actor: UserActor, objetivoId: string, mensaje: string): void {
  if (actor.sub === objetivoId) throw new AppError(mensaje, 409);
}

/** Impide dejar al tenant sin nadie activo que pueda gestionar usuarios. */
async function assertNoUltimoGestor(
  tenantId: TenantId,
  objetivoId: string,
  session: ClientSession,
): Promise<void> {
  const otros = await countScoped(User, tenantId, {
    ...FILTRO_GESTORES,
    rol: 'admin',
    activo: true,
    _id: { $ne: new Types.ObjectId(objetivoId) },
  }).session(session);
  if (otros === 0) {
    throw new AppError('La empresa debe conservar al menos un gestor de usuarios activo.', 409);
  }
}

async function assertCupo(tenantId: string, session: ClientSession): Promise<void> {
  await assertWithinQuota(tenantId, 'usuarios', session);
  await assertWithinQuota(tenantId, 'administradores', session);
}

export async function listManageableUsers(
  tenantId: TenantId,
  query: IManageUsersQuery,
): Promise<IUserResponse[]> {
  const filtro: FilterQuery<IUserDocument> = { rol: 'admin' };
  if (query.activo !== undefined) filtro.activo = query.activo;
  if (query.subrol) filtro.subrol = query.subrol;
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

export async function getTenantUser(tenantId: TenantId, id: string): Promise<IUserResponse> {
  return toUserResponse(await cargarObjetivo(tenantId, id));
}

export async function createTenantUser(
  tenantId: string,
  actor: UserActor,
  dto: CreateUserDTO,
): Promise<IUserResponse> {
  const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

  let creado: IUserSource;
  try {
    creado = await mongoose.connection.transaction(async (session) => {
      await assertCupo(tenantId, session);
      // `rol` lo fija el service: desde un tenant solo se crean `admin` (nunca `superadmin`).
      const doc = await createScoped(
        User,
        tenantId,
        { nombre: dto.nombre, email: dto.email, passwordHash, rol: 'admin', subrol: dto.subrol, activo: true },
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
    despues: { nombre: creado.nombre, email: creado.email, subrol: creado.subrol },
  });
  return toUserResponse(creado);
}

export async function updateTenantUser(
  tenantId: string,
  actor: UserActor,
  id: string,
  dto: UpdateUserDTO,
): Promise<IUserResponse> {
  const objetivo = await cargarObjetivo(tenantId, id);
  assertPuedeGestionar(actor, objetivo);

  const cambiaSubrol = dto.subrol !== undefined && dto.subrol !== objetivo.subrol;
  if (cambiaSubrol) assertNoEsUnoMismo(actor, id, 'No puedes cambiar tu propio subrol.');

  let actualizado: IUserSource;
  try {
    actualizado = await mongoose.connection.transaction(async (session) => {
      // Pasar a un subrol que no gestiona saca al objetivo de los gestores.
      if (cambiaSubrol && esGestor(objetivo) && dto.subrol !== 'director' && objetivo.activo) {
        await assertNoUltimoGestor(tenantId, id, session);
      }
      const doc = await findOneAndUpdateScoped(
        User,
        tenantId,
        { _id: new Types.ObjectId(id) },
        { $set: dto },
        { new: true, session },
      ).lean<IUserSource>();
      if (!doc) throw new AppError('Usuario no encontrado.', 404);
      if (cambiaSubrol) await revokeUserSessions(tenantId, id, session);
      return doc;
    });
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
  if (cambiaSubrol) {
    await recordAuditEvent(tenantId, {
      actorId: actor.sub,
      accion: 'user.subrol_changed',
      entidad: 'user',
      entidadId: id,
      antes: { subrol: objetivo.subrol ?? null },
      despues: { subrol: dto.subrol },
    });
    await notifySessionsRevoked(tenantId, id);
  }
  return toUserResponse(actualizado);
}

export async function setTenantUserEstado(
  tenantId: string,
  actor: UserActor,
  id: string,
  dto: SetUserEstadoDTO,
): Promise<IUserResponse> {
  const objetivo = await cargarObjetivo(tenantId, id);
  assertPuedeGestionar(actor, objetivo);
  if (objetivo.activo === dto.activo) return toUserResponse(objetivo); // idempotente

  return dto.activo
    ? reactivarUsuario(tenantId, actor, id)
    : desactivarUsuario(tenantId, actor, objetivo, dto);
}

async function reactivarUsuario(tenantId: string, actor: UserActor, id: string): Promise<IUserResponse> {
  const doc = await mongoose.connection.transaction(async (session) => {
    await assertCupo(tenantId, session);
    const actualizado = await findOneAndUpdateScoped(
      User,
      tenantId,
      { _id: new Types.ObjectId(id) },
      { $set: { activo: true } },
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
 * Desactiva al usuario. Si tiene conversaciones asignadas y el gestor no dijo qué hacer con ellas,
 * responde 409 con el conteo. Mover las conversaciones, desactivar y revocar van en **una**
 * transacción: separadas, podría asignársele una conversación nueva entre medias.
 */
async function desactivarUsuario(
  tenantId: string,
  actor: UserActor,
  objetivo: IUserSource,
  dto: SetUserEstadoDTO,
): Promise<IUserResponse> {
  const id = String(objetivo._id);
  assertNoEsUnoMismo(actor, id, 'No puedes desactivar tu propio usuario.');

  const mover = dto.conversaciones;
  if (mover?.accion === 'reasignar') {
    if (mover.destinoId === id) {
      throw new AppError('Elige a otro usuario para recibir las conversaciones.', 400);
    }
    await assertAssignableAdmin(tenantId, mover.destinoId);
  }
  const destinoId = mover?.accion === 'reasignar' ? mover.destinoId : null;

  const { doc, movidas } = await mongoose.connection.transaction(async (session) => {
    if (esGestor(objetivo)) await assertNoUltimoGestor(tenantId, id, session);

    const asignadas = await countAssignedConversations(tenantId, id, session);
    if (asignadas > 0 && !mover) {
      throw new AppError('El usuario tiene conversaciones asignadas.', 409, {
        code: USER_HAS_ASSIGNED_CONVERSATIONS,
        asignadas,
        flujos: await countFlowsReferencingUser(tenantId, id),
      });
    }

    const ids = mover ? await moveAssignedConversations(tenantId, id, destinoId, session) : [];
    const actualizado = await findOneAndUpdateScoped(
      User,
      tenantId,
      { _id: new Types.ObjectId(id) },
      { $set: { activo: false } },
      { new: true, session },
    ).lean<IUserSource>();
    if (!actualizado) throw new AppError('Usuario no encontrado.', 404);
    await revokeUserSessions(tenantId, id, session);
    return { doc: actualizado, movidas: ids };
  });

  await recordAuditEvent(tenantId, {
    actorId: actor.sub,
    accion: 'user.deactivated',
    entidad: 'user',
    entidadId: id,
    antes: { activo: true },
    despues: { activo: false },
  });
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
  const objetivo = await cargarObjetivo(tenantId, id);
  assertPuedeGestionar(actor, objetivo);
  // Cambiar la propia contraseña es otro feature (perfil): aquí cerraría la sesión del propio gestor.
  assertNoEsUnoMismo(actor, id, 'Para cambiar tu propia contraseña usa tu perfil.');

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  await mongoose.connection.transaction(async (session) => {
    await findOneAndUpdateScoped(
      User,
      tenantId,
      { _id: new Types.ObjectId(id) },
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
