import { z } from 'zod';
import { objectIdSchema } from '../../utils/validation.js';
import { ROLES_EMPRESA } from './user.types.js';

/**
 * Booleano de query string. **No** usar `z.coerce.boolean()`: es `Boolean(valor)`, y
 * `Boolean("false") === true` — `?activo=false` devolvía los activos (bug corregido en AUTH-03).
 */
const booleanQuery = z.enum(['true', 'false']).transform((v) => v === 'true');

const idParams = z.object({ id: objectIdSchema });

const nombre = z.string().trim().min(2, 'El nombre es muy corto.').max(100);
const email = z.string().trim().toLowerCase().email('Email inválido.').max(254);
const password = z.string().min(8, 'La contraseña debe tener al menos 8 caracteres.').max(128);
const rolEmpresa = z.enum(ROLES_EMPRESA);
const coordinadorId = objectIdSchema.nullable();

// Selector de asignación (HU-OMNI-02): contrato de siempre, admins activos del tenant.
export const listUsersSchema = z.object({
  body: z.object({}),
  params: z.object({}),
  query: z.object({
    activo: booleanQuery.optional().default('true'),
    rol: z.enum(['admin']).optional().default('admin'),
  }),
});

// ── Gestión (AUTH-03) ────────────────────────────────────────────────────────────────────────

export const manageUsersSchema = z.object({
  body: z.object({}),
  params: z.object({}),
  query: z.object({
    activo: z
      .enum(['true', 'false', 'todos'])
      .optional()
      .default('todos')
      .transform((v) => (v === 'todos' ? undefined : v === 'true')),
    rolEmpresa: rolEmpresa.optional(),
    coordinadorId: z.union([objectIdSchema, z.literal('ninguno')]).optional(),
    q: z.string().trim().max(100).optional(),
  }),
});

export const getUserSchema = z.object({
  body: z.object({}),
  params: idParams,
  query: z.object({}),
});

const moverEquipo = z.discriminatedUnion('accion', [
  z.object({ accion: z.literal('reasignar'), coordinadorDestinoId: objectIdSchema }).strict(),
  z.object({ accion: z.literal('liberar') }).strict(),
]);

// `.strict()`: `tenantId`, `rol` o `activo` en el body son un 400, no un campo ignorado en silencio.
export const createUserSchema = z.object({
  body: z
    .object({
      nombre,
      email,
      password,
      rolEmpresa,
      coordinadorId: coordinadorId.optional(),
      puedeGestionarAdministradores: z.boolean().optional(),
    })
    .strict()
    .refine((b) => !b.coordinadorId || b.rolEmpresa === 'asesor', {
      message: 'Solo un asesor puede tener coordinador.',
      path: ['coordinadorId'],
    })
    .refine((b) => !b.puedeGestionarAdministradores || b.rolEmpresa === 'administrador', {
      message: 'Solo un Administrador puede gestionar a otros administradores.',
      path: ['puedeGestionarAdministradores'],
    }),
  params: z.object({}),
  query: z.object({}),
});

export const updateUserSchema = z.object({
  body: z
    .object({
      nombre: nombre.optional(),
      email: email.optional(),
      rolEmpresa: rolEmpresa.optional(),
      coordinadorId: coordinadorId.optional(),
      puedeGestionarAdministradores: z.boolean().optional(),
      equipo: moverEquipo.optional(),
    })
    .strict()
    .refine(
      (b) => Object.keys(b).some((k) => k !== 'equipo'),
      'Indica al menos un campo a modificar.',
    ),
  params: idParams,
  query: z.object({}),
});

const moverConversaciones = z.discriminatedUnion('accion', [
  z.object({ accion: z.literal('reasignar'), destinoId: objectIdSchema }).strict(),
  z.object({ accion: z.literal('desasignar') }).strict(),
]);

export const setUserEstadoSchema = z.object({
  body: z
    .object({
      activo: z.boolean(),
      conversaciones: moverConversaciones.optional(),
      equipo: moverEquipo.optional(),
    })
    .strict(),
  params: idParams,
  query: z.object({}),
});

export const resetUserPasswordSchema = z.object({
  body: z.object({ password }).strict(),
  params: idParams,
  query: z.object({}),
});

// AUTH-05: eliminar (borrado lógico) resuelve lo pendiente igual que la desactivación.
export const deleteUserSchema = z.object({
  body: z
    .object({ conversaciones: moverConversaciones.optional(), equipo: moverEquipo.optional() })
    .strict(),
  params: idParams,
  query: z.object({}),
});

export const cupoUsuariosSchema = z.object({
  body: z.object({}),
  params: z.object({}),
  query: z.object({}),
});

export type ListUsersQuery =z.infer<typeof listUsersSchema>['query'];
export type ManageUsersQuery = z.infer<typeof manageUsersSchema>['query'];
export type CreateUserBody = z.infer<typeof createUserSchema>['body'];
export type UpdateUserBody = z.infer<typeof updateUserSchema>['body'];
export type SetUserEstadoBody = z.infer<typeof setUserEstadoSchema>['body'];
export type ResetUserPasswordBody = z.infer<typeof resetUserPasswordSchema>['body'];
export type DeleteUserBody = z.infer<typeof deleteUserSchema>['body'];
