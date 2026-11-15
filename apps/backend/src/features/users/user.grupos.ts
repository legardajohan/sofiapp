import { perteneceAlGrupo, type DestinoAsignacion, type FiltroGrupo, type GrupoUsuarios } from '@sofiapp/shared';
import type { Types } from 'mongoose';
import { countScoped, findByIdScoped, findScoped } from '../../repositories/base.repository.js';
import { AppError } from '../../utils/AppError.js';
import { User } from './user.model.js';
import { toUserResponse, type IUserSource } from './user.mapper.js';
import { assertAssignableAdmin, assertCoordinadorValido, listTenantUsers } from './user.service.js';
import type { IUserResponse } from './user.types.js';

/**
 * AUTH-06 — Grupos de usuarios. ÚNICO sitio que traduce un `GrupoUsuarios` a personas concretas:
 * lo usan el resolvedor de destinos (transferencia IA y nodos de flujo), la validación al guardar y
 * los filtros de reportes. Nadie más filtra usuarios por rol para asignar.
 *
 * Se filtra **en memoria** sobre la lista de usuarios del tenant, no con un `$match` por
 * `rolEmpresa`: los documentos aún no migrados de AUTH-02 solo tienen `subrol`, y la traducción
 * (`resolverRolEmpresa`) vive en el mapper. Una empresa tiene como mucho los usuarios de su plan, así
 * que leerlos todos es una consulta pequeña y acotada.
 */

type TenantId = string | Types.ObjectId;

/** Un equipo solo existe mientras su coordinador sea coordinador activo; si no, el grupo es vacío. */
function equipoVigente(usuarios: IUserResponse[], grupo: GrupoUsuarios): boolean {
  if (grupo.tipo !== 'equipo') return true;
  return usuarios.some((u) => u.id === grupo.coordinadorId && u.rolEmpresa === 'coordinador' && u.activo);
}

// ─── Resolución contra el tenant ─────────────────────────────────────────────────

/**
 * Usuarios activos y no eliminados del tenant que forman el grupo, por nombre. **No lanza**: un
 * equipo cuyo coordinador ya no es válido (o de otra empresa) da `[]`, y la reserva decide. El
 * worker no puede tumbar un handoff por una configuración que quedó vieja.
 */
export async function miembrosDelGrupo(tenantId: TenantId, grupo: GrupoUsuarios): Promise<IUserResponse[]> {
  const activos = await listTenantUsers(tenantId, { rol: 'admin', activo: true });
  return miembrosEntre(activos, grupo);
}

/** Igual que `miembrosDelGrupo` pero sobre una lista ya cargada (evita releer en la reserva). */
export function miembrosEntre(usuarios: IUserResponse[], grupo: GrupoUsuarios): IUserResponse[] {
  if (!equipoVigente(usuarios, grupo)) return [];
  return usuarios.filter((u) => u.rol === 'admin' && perteneceAlGrupo(u, grupo));
}

/** Al **guardar**: un equipo tiene que apuntar a un coordinador activo de este tenant (404 si no). */
export async function validarGrupo(tenantId: TenantId, grupo: GrupoUsuarios): Promise<void> {
  if (grupo.tipo === 'equipo') await assertCoordinadorValido(tenantId, grupo.coordinadorId);
}

/**
 * Al **guardar** un destino (transferencia IA, nodos de flujo): todo id que llega del cuerpo de la
 * petición se resuelve contra el tenant del token. Es el único punto por el que un usuario o un
 * coordinador de otra empresa podría colarse en una configuración.
 */
export async function validarDestino(tenantId: TenantId, destino: DestinoAsignacion): Promise<void> {
  if (destino.modo === 'usuario') await assertAssignableAdmin(String(tenantId), destino.usuarioId);
  else await validarGrupo(tenantId, destino.grupo);
  if (destino.reserva.tipo === 'grupo') await validarGrupo(tenantId, destino.reserva.grupo);
}

/**
 * Ids de los usuarios que abarca un filtro de **reporte**. A diferencia de la asignación incluye a
 * inactivos y eliminados (un reporte muestra lo que hicieron), pero el coordinador o el usuario
 * nombrado tiene que ser de este tenant: 404 si no, para no revelar si existe en otro.
 */
export async function idsDelFiltro(tenantId: TenantId, filtro: FiltroGrupo): Promise<Set<string>> {
  if (filtro.tipo === 'usuario') {
    const doc = await findByIdScoped(User, tenantId, filtro.usuarioId).select('_id').lean();
    if (!doc) throw new AppError('Usuario no encontrado.', 404);
    return new Set([filtro.usuarioId]);
  }
  const docs = await findScoped(User, tenantId, { rol: 'admin' })
    .select('rol rolEmpresa subrol coordinadorId activo esPrincipal nombre email tenantId')
    .lean<IUserSource[]>();
  const usuarios = docs.map(toUserResponse);
  if (filtro.tipo === 'equipo' && !usuarios.some((u) => u.id === filtro.coordinadorId && u.rolEmpresa === 'coordinador')) {
    throw new AppError('Coordinador no encontrado.', 404);
  }
  return new Set(usuarios.filter((u) => perteneceAlGrupo(u, filtro)).map((u) => u.id));
}

/** Ids de usuario que nombra un destino (usuario fijo y coordinadores de grupos), sin vacíos. */
export function idsDelDestino(destino: DestinoAsignacion): string[] {
  const ids: string[] = [];
  const delGrupo = (g: GrupoUsuarios): void => {
    if (g.tipo === 'equipo' && g.coordinadorId) ids.push(g.coordinadorId);
  };
  if (destino.modo === 'usuario') {
    if (destino.usuarioId) ids.push(destino.usuarioId);
  } else delGrupo(destino.grupo);
  if (destino.reserva.tipo === 'grupo') delGrupo(destino.reserva.grupo);
  return [...new Set(ids)];
}

/**
 * Al guardar un **flujo**: los ids de sus destinos tienen que ser usuarios de este tenant (404 si no).
 * Más laxo que `validarDestino` a propósito: un flujo se guarda entero, y que un usuario nombrado en
 * un nodo se haya desactivado después no puede impedir editar otro nodo — en ejecución ese caso ya
 * lo cubre la reserva. Lo que nunca se acepta es un id de otra empresa.
 */
export async function assertDestinoDelTenant(tenantId: TenantId, destino: DestinoAsignacion): Promise<void> {
  const ids = idsDelDestino(destino);
  if (ids.length === 0) return;
  const encontrados = await countScoped(User, tenantId, { _id: { $in: ids }, rol: 'admin' });
  if (encontrados !== ids.length) throw new AppError('Usuario o coordinador no encontrado.', 404);
}
