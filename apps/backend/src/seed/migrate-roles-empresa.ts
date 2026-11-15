import { pathToFileURL } from 'node:url';
import mongoose, { Types } from 'mongoose';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { findOneScoped, findScoped, updateManyScoped } from '../repositories/base.repository.js';
import { Tenant } from '../features/tenant/tenant.model.js';
import { User } from '../features/users/user.model.js';
import { HandoffSettings } from '../features/ai/ai-handoff.model.js';
import { Flow } from '../features/flow/flow.model.js';
import { resolverRolEmpresa } from '../features/users/user.rol-empresa.js';
import { ROLES_EMPRESA, type RolEmpresa } from '../features/users/user.types.js';

// Migración IDEMPOTENTE de los subroles de AUTH-02 a los roles de empresa de AUTH-04 (ADR 0017).
//
// Qué hace, tenant por tenant y siempre por el repositorio scoped:
//   - A cada usuario de empresa (`rol: 'admin'`) SIN `rolEmpresa` le fija el que resulta de la tabla
//     única `resolverRolEmpresa` (sin subrol, director y manager → administrador; coordinator →
//     coordinador; secretary → asesor) y `coordinadorId: null`. Nunca toca a quien ya lo tiene.
//   - Informa qué destinos de transferencia (`HandoffSettings.asesorDestinoId`) y de flujos
//     (`asignar_asesor.asesorId`, `handoff.notificarAsesorId`) apuntan a un usuario que NO queda
//     como asesor: siguen funcionando, pero conviene revisarlos.
//   - Con `--unset-legacy` borra el campo `subrol`. Va DESPUÉS del deploy y de que venzan los JWT
//     emitidos antes (`JWT_EXPIRES_IN`): el código viejo todavía lee `subrol`.
//
// Uso (NO se ejecuta en el arranque de la app):
//   pnpm --filter @sofiapp/api migrate:roles-empresa                    (dry-run: no escribe)
//   pnpm --filter @sofiapp/api migrate:roles-empresa --apply            (fija rolEmpresa)
//   pnpm --filter @sofiapp/api migrate:roles-empresa --unset-legacy     (borra subrol)

interface UsuarioLegado {
  _id: Types.ObjectId;
  nombre: string;
  rolEmpresa?: unknown;
  subrol?: unknown;
}

export interface DestinoNoAsesor {
  origen: 'transferencia' | 'flujo';
  userId: string;
  nombre: string;
  rolEmpresa: RolEmpresa;
  flujoId?: string;
}

export interface ReporteTenant {
  tenantId: string;
  /** Rol resultante de TODOS los usuarios de empresa del tenant (migrados o no). */
  conteos: Record<RolEmpresa, number>;
  /** Usuarios a los que la migración les fija `rolEmpresa` (0 si ya se aplicó). */
  pendientes: number;
  /** Usuarios que aún conservan el campo `subrol`. */
  conSubrolLegado: number;
  destinosNoAsesor: DestinoNoAsesor[];
}

export interface OpcionesMigracion {
  apply?: boolean;
  unsetLegacy?: boolean;
}

function idsDeFlujo(flow: { nodos?: Array<{ config?: unknown }> }): string[] {
  const ids: string[] = [];
  for (const nodo of flow.nodos ?? []) {
    const config = (nodo.config ?? {}) as {
      efecto?: { asesorId?: unknown };
      notificarAsesorId?: unknown;
    };
    if (config.efecto?.asesorId) ids.push(String(config.efecto.asesorId));
    if (config.notificarAsesorId) ids.push(String(config.notificarAsesorId));
  }
  return ids;
}

async function destinosNoAsesor(
  tenantId: Types.ObjectId,
  roles: Map<string, { nombre: string; rol: RolEmpresa }>,
): Promise<DestinoNoAsesor[]> {
  const fuera = (id: string): { nombre: string; rol: RolEmpresa } | null => {
    const u = roles.get(id);
    return u && u.rol !== 'asesor' ? u : null;
  };
  const destinos: DestinoNoAsesor[] = [];

  const handoff = await findOneScoped(HandoffSettings, tenantId, {})
    .select({ asesorDestinoId: 1 })
    .lean<{ asesorDestinoId?: Types.ObjectId | null }>();
  const destinoHandoff = handoff?.asesorDestinoId ? String(handoff.asesorDestinoId) : null;
  const u = destinoHandoff ? fuera(destinoHandoff) : null;
  if (destinoHandoff && u) {
    destinos.push({ origen: 'transferencia', userId: destinoHandoff, nombre: u.nombre, rolEmpresa: u.rol });
  }

  const flujos = await findScoped(Flow, tenantId, {})
    .select({ nodos: 1 })
    .lean<Array<{ _id: Types.ObjectId; nodos?: Array<{ config?: unknown }> }>>();
  for (const flujo of flujos) {
    for (const id of new Set(idsDeFlujo(flujo))) {
      const usuario = fuera(id);
      if (usuario) {
        destinos.push({
          origen: 'flujo',
          userId: id,
          nombre: usuario.nombre,
          rolEmpresa: usuario.rol,
          flujoId: String(flujo._id),
        });
      }
    }
  }
  return destinos;
}

/** Migra (o, sin `apply`, solo describe) un tenant. Nunca lee ni escribe usuarios de otro tenant. */
export async function migrarRolesTenant(
  tenantId: Types.ObjectId,
  opciones: OpcionesMigracion = {},
): Promise<ReporteTenant> {
  const usuarios = await findScoped(User, tenantId, { rol: 'admin' })
    .select({ nombre: 1, rolEmpresa: 1, subrol: 1 })
    .setOptions({ strict: false })
    .lean<UsuarioLegado[]>();

  const conteos = Object.fromEntries(ROLES_EMPRESA.map((r) => [r, 0])) as Record<RolEmpresa, number>;
  const roles = new Map<string, { nombre: string; rol: RolEmpresa }>();
  const pendientesPorRol = new Map<RolEmpresa, Types.ObjectId[]>();
  let conSubrolLegado = 0;

  for (const u of usuarios) {
    const rol = resolverRolEmpresa(u);
    conteos[rol] += 1;
    roles.set(String(u._id), { nombre: u.nombre, rol });
    if (u.subrol !== undefined && u.subrol !== null) conSubrolLegado += 1;
    if (u.rolEmpresa === undefined || u.rolEmpresa === null) {
      pendientesPorRol.set(rol, [...(pendientesPorRol.get(rol) ?? []), u._id]);
    }
  }
  const pendientes = [...pendientesPorRol.values()].reduce((s, ids) => s + ids.length, 0);

  if (opciones.apply) {
    for (const [rol, ids] of pendientesPorRol) {
      await updateManyScoped(
        User,
        tenantId,
        { _id: { $in: ids }, rolEmpresa: { $exists: false } },
        { $set: { rolEmpresa: rol, coordinadorId: null } },
      );
    }
  }
  if (opciones.unsetLegacy && conSubrolLegado > 0) {
    // `subrol` ya no está en el schema y Mongoose descarta el `$unset` de un path desconocido aun
    // con `strict: false`. Va por el driver, con el `tenantId` fijado igual que en el repositorio
    // scoped: es la única escritura de este script que no pasa por él.
    await User.collection.updateMany(
      { tenantId, subrol: { $exists: true } },
      { $unset: { subrol: '' } },
    );
  }

  return {
    tenantId: String(tenantId),
    conteos,
    pendientes,
    conSubrolLegado,
    destinosNoAsesor: await destinosNoAsesor(tenantId, roles),
  };
}

export async function migrarRolesEmpresa(opciones: OpcionesMigracion = {}): Promise<ReporteTenant[]> {
  // Listar tenants es una operación de plataforma (como el superadmin): no hay tenant que filtrar.
  const tenants = await Tenant.find({}).select({ _id: 1 }).lean<Array<{ _id: Types.ObjectId }>>();
  const reportes: ReporteTenant[] = [];
  for (const t of tenants) reportes.push(await migrarRolesTenant(t._id, opciones));
  return reportes;
}

async function main(): Promise<void> {
  const opciones: OpcionesMigracion = {
    apply: process.argv.includes('--apply'),
    unsetLegacy: process.argv.includes('--unset-legacy'),
  };
  await mongoose.connect(env.MONGODB_URI);
  try {
    const reportes = await migrarRolesEmpresa(opciones);
    for (const r of reportes) logger.info('[migrate-roles-empresa] Tenant', { ...r });
    if (!opciones.apply && !opciones.unsetLegacy) {
      logger.info(
        '[migrate-roles-empresa] DRY-RUN: no se modificó nada. Usa --apply para fijar rolEmpresa ' +
          'y, tras el deploy y el vencimiento de los JWT, --unset-legacy para borrar subrol.',
      );
    }
  } finally {
    await mongoose.disconnect();
  }
}

// Ejecutar solo cuando se invoca directamente (no al importarse en tests/otros módulos).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main();
}
