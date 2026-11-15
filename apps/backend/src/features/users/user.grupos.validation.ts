import { z } from 'zod';
import {
  CRITERIOS_DESTINO,
  ROLES_DESTINO,
  parsearGrupoQuery,
  type DestinoAsignacion,
  type FiltroGrupo,
  type GrupoUsuarios,
  type ReservaDestino,
} from '@sofiapp/shared';
import { objectIdSchema } from '../../utils/validation.js';

/**
 * AUTH-06 — Esquemas Zod de grupos y destinos. Archivo aparte y **sin dependencias de servicios**: lo
 * importan `flow.validation` y `ai-handoff.validation`, y si viviera en `user.grupos` (que importa
 * `user.service` → `flow.service` → `flow.validation`) cerraría un ciclo de módulos que, según el
 * orden de carga, dejaría el esquema sin inicializar al construir el de los nodos.
 */

/**
 * Esquemas de grupo y destino. `estricto` exige ids completos; la versión de borrador (la de un flujo
 * guardado sin activar) acepta `''` mientras el admin no elige, igual que el resto de nodos: la
 * completitud la reporta `analizarGrafo` y la exige la activación.
 */
function construirEsquemas(estricto: boolean): {
  grupo: z.ZodType<GrupoUsuarios>;
  destino: z.ZodType<DestinoAsignacion>;
} {
  const id = estricto ? objectIdSchema : z.string().regex(/^([0-9a-fA-F]{24})?$/, 'ID inválido.');
  const grupo: z.ZodType<GrupoUsuarios> = z
    .discriminatedUnion('tipo', [
      z.object({ tipo: z.literal('todos') }).strict(),
      z
        .object({ tipo: z.literal('rol'), rol: z.enum(ROLES_DESTINO), excluirPrincipal: z.boolean().optional() })
        .strict(),
      z
        .object({ tipo: z.literal('equipo'), coordinadorId: id, incluirCoordinador: z.boolean().optional() })
        .strict(),
    ])
    .superRefine((g, ctx) => {
      if (g.tipo === 'rol' && g.excluirPrincipal && g.rol !== 'administrador') {
        ctx.addIssue({
          code: 'custom',
          path: ['excluirPrincipal'],
          message: 'Solo se excluye al principal de los administradores.',
        });
      }
    });

  const reserva: z.ZodType<ReservaDestino> = z.discriminatedUnion('tipo', [
    z.object({ tipo: z.literal('cualquiera') }).strict(),
    z.object({ tipo: z.literal('grupo'), grupo }).strict(),
    z.object({ tipo: z.literal('sin_asignar') }).strict(),
  ]);

  const destino: z.ZodType<DestinoAsignacion> = z.discriminatedUnion('modo', [
    z.object({ modo: z.literal('usuario'), usuarioId: id, reserva }).strict(),
    z
      .object({
        modo: z.literal('grupo'),
        grupo,
        criterio: z.enum(CRITERIOS_DESTINO),
        soloEnLinea: z.boolean(),
        reserva,
      })
      .strict(),
  ]);
  return { grupo, destino };
}

const estrictos = construirEsquemas(true);
const borradores = construirEsquemas(false);

export const grupoUsuariosSchema = estrictos.grupo;
export const destinoAsignacionSchema = estrictos.destino;
/** Para nodos de flujo en borrador (ids vacíos permitidos). */
export const destinoAsignacionBorradorSchema = borradores.destino;

/** `?grupo=` de los reportes, con la sintaxis de `serializarGrupoQuery`. */
export const grupoQuerySchema = z
  .string()
  .trim()
  .max(80)
  .transform((s, ctx): FiltroGrupo => {
    const grupo = parsearGrupoQuery(s);
    if (!grupo) {
      ctx.addIssue({ code: 'custom', message: 'Grupo inválido. Usa p. ej. rol:asesor o equipo:<id>.' });
      return z.NEVER;
    }
    return grupo;
  });
