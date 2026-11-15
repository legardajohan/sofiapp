import { pathToFileURL } from 'node:url';
import mongoose, { Types } from 'mongoose';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { countScoped, findOneAndUpdateScoped, findOneScoped } from '../repositories/base.repository.js';
import { Tenant } from '../features/tenant/tenant.model.js';
import { User } from '../features/users/user.model.js';

// Migración IDEMPOTENTE del usuario principal de AUTH-05 (ADR 0018).
//
// Tenant por tenant y siempre por el repositorio scoped: si la empresa aún no tiene principal, marca
// como tal al Administrador activo más antiguo (`createdAt` asc). Nunca toca a una empresa que ya
// tiene principal. Las empresas sin ningún Administrador activo se reportan para revisarlas a mano.
//
// Uso (NO se ejecuta en el arranque de la app):
//   pnpm --filter @sofiapp/api migrate:usuario-principal            (dry-run: no escribe)
//   pnpm --filter @sofiapp/api migrate:usuario-principal --apply    (marca al principal)

export type EstadoPrincipal = 'ya_tiene' | 'a_marcar' | 'marcado' | 'sin_administrador';

export interface ReportePrincipal {
  tenantId: string;
  estado: EstadoPrincipal;
  /** Usuario que se marca (o se marcaría en dry-run) como principal. */
  userId?: string;
  email?: string;
}

export interface OpcionesMigracionPrincipal {
  apply?: boolean;
}

interface CandidatoPrincipal {
  _id: Types.ObjectId;
  email: string;
}

export async function migrarPrincipalTenant(
  tenantId: Types.ObjectId | string,
  opciones: OpcionesMigracionPrincipal = {},
): Promise<ReportePrincipal> {
  const id = String(tenantId);
  if ((await countScoped(User, tenantId, { esPrincipal: true })) > 0) {
    return { tenantId: id, estado: 'ya_tiene' };
  }
  const candidato = await findOneScoped(User, tenantId, {
    rol: 'admin',
    rolEmpresa: 'administrador',
    activo: true,
    eliminado: { $ne: true },
  })
    .sort({ createdAt: 1, _id: 1 })
    .select('_id email')
    .lean<CandidatoPrincipal>();
  if (!candidato) return { tenantId: id, estado: 'sin_administrador' };

  const base = { tenantId: id, userId: String(candidato._id), email: candidato.email };
  if (!opciones.apply) return { ...base, estado: 'a_marcar' };

  await findOneAndUpdateScoped(
    User,
    tenantId,
    { _id: candidato._id },
    { $set: { esPrincipal: true, puedeGestionarAdministradores: false } },
  );
  return { ...base, estado: 'marcado' };
}

export async function migrarUsuarioPrincipal(
  opciones: OpcionesMigracionPrincipal = {},
): Promise<ReportePrincipal[]> {
  // `Tenant` es catálogo global (sin `tenantId`): se recorre directo, como en migrate-roles-empresa.
  const tenants = await Tenant.find({}).select({ _id: 1 }).lean<Array<{ _id: Types.ObjectId }>>();
  const reportes: ReportePrincipal[] = [];
  for (const t of tenants) reportes.push(await migrarPrincipalTenant(t._id, opciones));
  return reportes;
}

async function main(): Promise<void> {
  const opciones: OpcionesMigracionPrincipal = { apply: process.argv.includes('--apply') };
  await mongoose.connect(env.MONGODB_URI);
  try {
    const reportes = await migrarUsuarioPrincipal(opciones);
    for (const r of reportes) logger.info('[migrate-usuario-principal] Tenant', { ...r });
    const sinAdmin = reportes.filter((r) => r.estado === 'sin_administrador').length;
    if (sinAdmin > 0) {
      logger.warn(`[migrate-usuario-principal] ${sinAdmin} empresa(s) sin Administrador activo: revisar.`);
    }
    if (!opciones.apply) {
      logger.info('[migrate-usuario-principal] DRY-RUN: no se modificó nada. Usa --apply para escribir.');
    }
  } finally {
    await mongoose.disconnect();
  }
}

// Ejecutar solo cuando se invoca directamente (no al importarse en tests/otros módulos).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main();
}
