import {
  MAPEO_SUBROL_LEGADO,
  ROLES_EMPRESA,
  SUBROLES_LEGADOS,
  type RolEmpresa,
  type SubrolLegado,
} from './user.types.js';

function esRolEmpresa(v: unknown): v is RolEmpresa {
  return typeof v === 'string' && (ROLES_EMPRESA as readonly string[]).includes(v);
}

function esSubrolLegado(v: unknown): v is SubrolLegado {
  return typeof v === 'string' && (SUBROLES_LEGADOS as readonly string[]).includes(v);
}

/**
 * Rol de empresa de un usuario a partir de un documento o de los claims de un JWT (AUTH-04, ADR 0017).
 *
 * **Única** traducción del modelo viejo: la usan el middleware de auth, el handshake del socket, el
 * mapper y la migración. Así un token emitido antes del despliegue y el documento ya migrado dan
 * siempre el mismo rol, y nadie gana permisos por la traducción:
 *
 * - `rolEmpresa` válido → se usa tal cual.
 * - `subrol` legado → `MAPEO_SUBROL_LEGADO`.
 * - sin ninguno de los dos → `administrador` (era el propietario: acceso total).
 */
export function resolverRolEmpresa(src: { rolEmpresa?: unknown; subrol?: unknown }): RolEmpresa {
  if (esRolEmpresa(src.rolEmpresa)) return src.rolEmpresa;
  if (esSubrolLegado(src.subrol)) return MAPEO_SUBROL_LEGADO[src.subrol];
  return 'administrador';
}
