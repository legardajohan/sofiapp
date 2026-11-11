# AUTH-04 — Plan técnico (CÓMO)

## Archivos a crear / tocar

```
apps/backend/src/
├── features/users/
│   ├── user.types.ts              # ROLES_EMPRESA, RolEmpresa, MAPEO_SUBROL_LEGADO, DTOs con rolEmpresa/coordinadorId,
│   │                              #   MoverEquipo, USER_HAS_DEPENDENCIES (sustituye a USER_HAS_ASSIGNED_CONVERSATIONS)
│   ├── user.model.ts              # rolEmpresa (required si rol=admin) + coordinadorId + índices; fuera subrol
│   ├── user.mapper.ts             # rolEmpresa, coordinadorId, coordinadorNombre?; fallback legado si falta rolEmpresa
│   ├── user.rol-empresa.ts        # NUEVO — resolverRolEmpresa(claims|doc): única traducción subrol → rolEmpresa
│   ├── user.validation.ts         # create/update/manage/estado con rolEmpresa, coordinadorId, equipo
│   ├── user.service.ts            # guardas por actor (administrador | coordinador), equipos, dependencias, cuotas
│   ├── user.controller.ts         # sin cambios de forma (actorDe incluye rolEmpresa)
│   ├── user.routes.ts             # gate ROLES_GESTION_USUARIOS
│   ├── user.test-helpers.ts       # crearUsuario/tokenDe con rolEmpresa y coordinadorId
│   ├── user.management.test.ts    # ADAPTAR + casos de coordinador y equipos
│   ├── user.management.isolation.test.ts  # AMPLIAR
│   └── user.roles.test.ts         # NUEVO — matriz de gates por rol (tabla de casos)
├── features/auth/
│   ├── auth.types.ts · auth.service.ts   # ISessionUser.rolEmpresa; el login firma rolEmpresa
├── features/tenant/tenant.service.ts     # adminUser → rolEmpresa 'administrador' vía createScoped({ session })
├── features/usage/usage.service.ts       # 'administradores' = rolEmpresa 'administrador'
├── features/audit/audit.types.ts         # user.role_changed, user.coordinator_changed, user.team_moved
├── middlewares/
│   ├── authorize-rol-empresa.middleware.ts       # NUEVO — sustituye a authorize-subrol.middleware.ts
│   ├── authorize-rol-empresa.middleware.test.ts  # NUEVO (reemplaza el test del middleware viejo)
│   └── authenticate-jwt.middleware.ts            # SafeUser.rolEmpresa vía resolverRolEmpresa
├── realtime/socket.gateway.ts            # handshake con resolverRolEmpresa
├── types/express.d.ts                    # SafeUser: rolEmpresa en lugar de subrol
├── features/{contact-note,pendiente,reports,conversation}/*.routes.ts  # gates de datos sensibles y reportes
├── features/{cliente,conversation,lead,pipeline}/*.controller.ts       # puedeVerDatosSensibles(rolEmpresa)
├── features/{channel,kb,kb-faq,ai (assistant, handoff),sandbox,send-window,whatsapp-template,flow,estado,
│            tag,contact-field,contact-option,semaforo,admin-profile,campaign,tenant (ajustes)}/*.routes.ts
│                                         # + authorizeRolEmpresa(ROLES_CONFIGURACION) según la tabla de Notas
├── seed/migrate-roles-empresa.ts         # NUEVO — migración (--dry-run, --unset-legacy)
├── seed/migrate-roles-empresa.test.ts    # NUEVO
└── seed/seed-inbox-demo.ts               # usuarios demo: 1 administrador, 1 coordinador, 2 asesores

apps/frontend/src/
├── stores/authStore.ts                   # RolEmpresa; SessionUser.rolEmpresa (fuera AdminSubrol)
├── lib/roles.ts                          # ROL_EMPRESA_LABEL, rolLabel, puedeVerDatosSensibles/Reportes/
│                                         #   GestionarUsuarios/Configurar, esAdministrador, esCoordinador
├── components/RequireReportes.tsx · RequireGestionUsuarios.tsx · RequireConfiguracion.tsx (NUEVO)
├── components/layout/nav-config.ts · AppSidebar.tsx   # `subroles` → `rolesEmpresa`
├── router.tsx                            # RequireConfiguracion en /settings/* (salvo users) y /flows, /campanas, /etapas, /etiquetas
├── features/auth/{api.ts, LoginPage.tsx} · components/AuthBootstrap.tsx
├── features/users/
│   ├── types.ts · api.ts · hooks/useManageUsers.ts
│   ├── components/UserFormSheet.tsx      # selector de 3 roles + coordinador (solo administrador)
│   ├── components/DeactivateUserDialog.tsx  # 409 USER_HAS_DEPENDENCIES: conversaciones + equipo
│   ├── components/ChangeRoleDialog.tsx   # NUEVO — degradar coordinador con equipo (mismo bloque de equipo)
│   ├── components/TeamResolution.tsx     # NUEVO — bloque compartido "qué pasa con sus asesores"
│   └── pages/UsersPage.tsx (+ test)      # columnas Rol/Coordinador, filtros, vista de coordinador
├── features/inbox/components/{AssigneeBadge,AssignMenu,ConversationList}.tsx · types.ts  # etiqueta de rol
├── features/contacts/lib/errors.ts       # copy "Solo el Administrador…"
└── features/reports/pages/AdvisorReportPage.tsx  # gate por rolEmpresa

docs/
├── adr/0017-roles-de-empresa.md          # NUEVO — reemplaza 0006, 0011 y §1 de 0016
├── adr/README.md · adr/0006 · 0011 · 0016  # estado "reemplazado por 0017"
├── product.md · domain.md · data-model.md · api-contract.md · apps/frontend/CLAUDE.md
```

## Contratos

### `user.types.ts`
```ts
export const ROLES_EMPRESA = ['administrador', 'coordinador', 'asesor'] as const;
export type RolEmpresa = (typeof ROLES_EMPRESA)[number];

/** Subroles de AUTH-02. Solo los leen la migración y la traducción de tokens viejos. */
export const SUBROLES_LEGADOS = ['director', 'manager', 'coordinator', 'secretary'] as const;
export type SubrolLegado = (typeof SUBROLES_LEGADOS)[number];
export const MAPEO_SUBROL_LEGADO: Record<SubrolLegado, RolEmpresa> = {
  director: 'administrador', manager: 'administrador', coordinator: 'coordinador', secretary: 'asesor',
};
// Sin subrol (propietario) → 'administrador'.

export interface IUser { /* … */ rolEmpresa?: RolEmpresa; coordinadorId: Types.ObjectId | null }
export interface IUserResponse { /* … */ rolEmpresa?: RolEmpresa; coordinadorId: string | null }

export interface CreateUserDTO { nombre: string; email: string; password: string;
  rolEmpresa: RolEmpresa; coordinadorId?: string | null }
export interface UpdateUserDTO { nombre?: string; email?: string;
  rolEmpresa?: RolEmpresa; coordinadorId?: string | null; equipo?: MoverEquipo }
export type MoverEquipo = { accion: 'reasignar'; coordinadorDestinoId: string } | { accion: 'liberar' };
export interface SetUserEstadoDTO { activo: boolean; conversaciones?: MoverConversaciones; equipo?: MoverEquipo }
export interface IManageUsersQuery { activo?: boolean; rolEmpresa?: RolEmpresa; coordinadorId?: string | 'ninguno'; q?: string }
export const USER_HAS_DEPENDENCIES = 'USER_HAS_DEPENDENCIES';
```
`rolEmpresa` es opcional en `IUser` solo porque el superadmin no lo tiene; el schema lo exige con
`required: function () { return this.rol === 'admin' }`.

### `user.model.ts`
- `rolEmpresa: { type: String, enum: [...ROLES_EMPRESA] }` (required condicional).
- `coordinadorId: { type: ObjectId, ref: 'User', default: null }`.
- Índices: `{ tenantId: 1, coordinadorId: 1 }` y `{ tenantId: 1, rolEmpresa: 1, activo: 1 }`.
- `subrol` sale del schema. Mongoose (strict) ignora el valor viejo hasta que `--unset-legacy` lo borre.

### `user.rol-empresa.ts`
```ts
export function resolverRolEmpresa(src: { rolEmpresa?: unknown; subrol?: unknown }): RolEmpresa
```
`rolEmpresa` válido → se usa. Si no, `subrol` legado → `MAPEO_SUBROL_LEGADO`; ausente → `'administrador'`.
Lo usan `authenticateJWT`, el handshake, `toUserResponse`, `auth.service` y la migración: **una sola**
tabla, así el token viejo y el documento migrado dan siempre el mismo rol.

### Validación (Zod)
- `createUserSchema` body `.strict()`: `nombre`, `email`, `password`, `rolEmpresa: z.enum(ROLES_EMPRESA)`,
  `coordinadorId: objectId.nullable().optional()` + `refine`: `coordinadorId` solo con `rolEmpresa === 'asesor'`.
- `updateUserSchema` body `.strict()`: `nombre?`, `email?`, `rolEmpresa?`, `coordinadorId?` (nullable),
  `equipo?` (discriminatedUnion `reasignar | liberar`); al menos un campo distinto de `equipo`.
- `setUserEstadoSchema` body: `activo`, `conversaciones?`, `equipo?`.
- `manageUsersSchema` query: `activo` (`true|false|todos`), `rolEmpresa?`, `coordinadorId?` (objectId o
  `'ninguno'`), `q?`.

### Middleware `authorize-rol-empresa.middleware.ts`
```ts
export const ROLES_DATOS_SENSIBLES: readonly RolEmpresa[] = ['administrador'];   // AUTH-05 suma 'coordinador'
export const ROLES_REPORTES: readonly RolEmpresa[] = ['administrador'];          // AUTH-05 suma 'coordinador'
export const ROLES_GESTION_USUARIOS: readonly RolEmpresa[] = ['administrador', 'coordinador'];
export const ROLES_CONFIGURACION: readonly RolEmpresa[] = ['administrador'];
export function authorizeRolEmpresa(roles: readonly RolEmpresa[]): RequestHandler; // 403 'Acceso denegado.'
export function tieneRolEmpresa(user: Pick<SafeUser, 'rol' | 'rolEmpresa'>, roles: readonly RolEmpresa[]): boolean;
export function puedeVerDatosSensibles(user: SafeUser): boolean; // = tieneRolEmpresa(user, ROLES_DATOS_SENSIBLES)
```
`SafeUser.rolEmpresa` es obligatorio para `rol: 'admin'` (lo garantiza `resolverRolEmpresa`).

### Endpoints de usuarios (todos `authenticateJWT, requireTenant, authorize(['admin'])`)

| Endpoint | Gate | Administrador | Coordinador |
|---|---|---|---|
| `GET /` (selector) | — | igual que hoy + `rolEmpresa` y `coordinadorId` en la respuesta | igual (el recorte por equipo es AUTH-05) |
| `GET /manage` | gestión | todos, con filtros | fuerza `rolEmpresa: 'asesor', coordinadorId: actor` |
| `GET /:id` | gestión | cualquiera | solo su equipo; si no → 404 |
| `POST /` | gestión | cualquier rol; `coordinadorId` opcional para asesor | solo `asesor`; `coordinadorId` = actor |
| `PATCH /:id` | gestión | todo, con guardas | solo `nombre`/`email` de su equipo |
| `PATCH /:id/estado` | gestión | con 409 de dependencias | su equipo; destinos de su equipo o él mismo |
| `POST /:id/password` | gestión | cualquiera salvo sí mismo | su equipo |

### Service — guardas (en `user.service.ts`)
- `type UserActor = Pick<SafeUser, 'sub' | 'rol' | 'rolEmpresa'>`.
- `cargarObjetivoPara(actor, tenantId, id)`: administrador → `findByIdScoped`; coordinador →
  `findOneScoped(User, tenantId, { _id: id, rolEmpresa: 'asesor', coordinadorId: actor.sub })`; no
  encontrado → 404 (no revela si existe en otro equipo).
- `assertCoordinadorValido(tenantId, id, session)`: `findOneScoped` con `rolEmpresa: 'coordinador', activo: true` → 404.
- `assertNoUltimoAdministrador(tenantId, objetivoId, session)`: sustituye a `assertNoUltimoGestor`
  (`countScoped({ rolEmpresa: 'administrador', activo: true, _id: { $ne } })`).
- `contarDependencias(tenantId, user, session)` → `{ asignadas, flujos, asesores }` (asesores solo si es coordinador:
  `countScoped(User, { coordinadorId, activo: true })`, más inactivos con ese `coordinadorId`, que también se liberan).
- `moverEquipo(tenantId, coordinadorId, equipo, session)`: `updateManyScoped(User, { coordinadorId }, { coordinadorId: destino | null })`.
- `updateTenantUser`:
  - Coordinador: cualquier campo fuera de `nombre`/`email` → 403.
  - `rolEmpresa` cambia → revoca sesiones (ya existe); si deja de ser `coordinador` y tiene equipo,
    exige `equipo` (409 `USER_HAS_DEPENDENCIES` con `asesores`); si deja de ser `asesor` → `coordinadorId: null`;
    si pasa a `administrador` → `assertWithinQuota('administradores')`; si deja de ser administrador →
    `assertNoUltimoAdministrador`.
  - `coordinadorId` cambia (solo asesores) → `assertCoordinadorValido`; audita `user.coordinator_changed`.
- `setTenantUserEstado` (desactivar): `contarDependencias`; si `asignadas > 0` sin `conversaciones` o
  `asesores > 0` sin `equipo` → 409 `{ code: USER_HAS_DEPENDENCIES, asignadas, flujos, asesores }`. Mover
  conversaciones + mover equipo + desactivar + revocar en **una** transacción. Para coordinador, el
  `destinoId` debe ser él mismo o un asesor activo de su equipo (si no → 404).
- Reactivar: cupo `usuarios` siempre; `administradores` solo si es administrador. Un asesor cuyo
  coordinador ya no es válido se reactiva con `coordinadorId: null`.
- `createTenantUser`: `rol: 'admin'` forzado; coordinador → `rolEmpresa` debe ser `asesor` (403) y
  `coordinadorId` = actor (otro → 403); administrador → `assertCoordinadorValido` si viene `coordinadorId`.

### Auditoría
`user.subrol_changed` → `user.role_changed` (`antes/despues: { rolEmpresa }`); nuevos
`user.coordinator_changed` (`{ coordinadorId }`) y `user.team_moved` (`{ cantidad, coordinadorDestinoId | null }`).

### Configuración: qué se cierra (`authorizeRolEmpresa(ROLES_CONFIGURACION)`)

| Router | Escritura | Lectura |
|---|---|---|
| `channel`, `kb`, `kb-faq`, `ai-assistant`, `ai-handoff`, `sandbox`, `send-window`, `flow`, `campaign`, `admin-profile`, `tenant-ajustes` | administrador | administrador |
| `whatsapp-template` | administrador | abierta (la bandeja envía plantillas aprobadas) |
| `tag`, `estado`, `contact-field`, `contact-option`, `semaforo` | administrador | abierta (bandeja, leads, ficha) |
| `conversation` (`/config/audio`), `cliente`, `lead`, `pipeline`, `message`, `media`, `notification`, `activity`, `ai` | sin cambio | sin cambio |

Antes de cerrar una lectura se verifica con `grep` que ningún componente operativo la consume (task
explícita). Si alguna "puramente de configuración" resulta usada por la bandeja, queda abierta y se anota.

### Migración `seed/migrate-roles-empresa.ts`
- Recorre tenants y, por cada uno, `findScoped(User, tenantId, { rol: 'admin' })` (nunca `User.find` sin tenant).
- `rolEmpresa = resolverRolEmpresa(doc)`, `coordinadorId: null` si no existe. `updateManyScoped` por rol destino.
- `--dry-run`: no escribe; imprime por tenant `{ administrador, coordinador, asesor }` y la lista de
  `handoff.asesorDestinoId`, `flow asignar_asesor.asesorId` y `handoff.notificarAsesorId` que apuntan a
  usuarios que quedan como administrador o coordinador.
- `--unset-legacy`: `$unset: { subrol: '' }`. Se corre **después** de desplegar el código nuevo.
- Idempotente: un usuario con `rolEmpresa` ya fijado no se toca.

### Frontend
- `authStore`: `SessionUser { …; rolEmpresa?: RolEmpresa }`; `lib/roles.ts` con gemelos de los helpers
  del backend y `ROL_EMPRESA_LABEL = { administrador: 'Administrador', coordinador: 'Coordinador', asesor: 'Asesor' }`.
- `nav-config`: `rolesEmpresa?: readonly RolEmpresa[]` (sustituye a `subroles`). Configuración, Flujos,
  Etapas, Etiquetas y Campañas → `['administrador']`; Reportes → `ROLES_REPORTES`; Usuarios → `ROLES_GESTION_USUARIOS`.
- `UsersPage`: columnas Nombre · Email · Rol · Coordinador · Estado; filtros rol / coordinador / estado /
  búsqueda (rol y coordinador solo para administrador). Acciones: "Cambiar coordinador" (administrador,
  asesores), "Cambiar rol" abre `ChangeRoleDialog` cuando el objetivo es coordinador con equipo.
- `UserFormSheet`: `Select` de rol con ayuda por rol; si `asesor` y el actor es administrador, `Select`
  de coordinador con opción "Sin coordinador"; el coordinador no ve ninguno de los dos.
- `DeactivateUserDialog`: lee `asignadas`, `flujos` y `asesores` del 409 y muestra los bloques que
  aplican (conversaciones y `TeamResolution`) antes de un único "Desactivar".
- Bandeja: `AssigneeBadge`/`AssignMenu`/`ConversationList` muestran "Nombre · Rol" con `rolLabel`.

## Notas

- **Despliegue en tres pasos:** (1) `migrate-roles-empresa --dry-run` para revisar; (2) migración real
  (el código viejo ignora `rolEmpresa` y sigue leyendo `subrol`, así que es segura antes del deploy);
  (3) deploy; (4) pasadas ≥ 8 h (`JWT_EXPIRES_IN`), `--unset-legacy`. Los tokens viejos se traducen
  mientras tanto con la misma tabla.
- **No escalamiento por traducción:** la tabla solo mapea a un rol con permisos iguales o menores que
  los que tenía el subrol: `coordinator`/`secretary` no veían datos sensibles ni reportes, y como
  `coordinador`/`asesor` tampoco los ven en AUTH-04.
- `manager` pierde una restricción (no gestionaba usuarios) al pasar a administrador: es la decisión 5.
- `tenant.service` deja `UserModel.create` directo por `createScoped(User, tenantId, …, { session })`.
- Los 37 tests que firman JWT sin `subrol` siguen siendo administradores por la traducción.
- `USER_HAS_ASSIGNED_CONVERSATIONS` (AUTH-03, sin liberar) se renombra a `USER_HAS_DEPENDENCIES`; no hay
  clientes externos del contrato.
- Al implementar frontend: invocar `emil-design-eng`, `impeccable:impeccable` y
  `frontend-design:frontend-design` (las que estén instaladas) antes de cada componente.

## Verificación

`pnpm --filter @sofiapp/api typecheck` · `pnpm --filter @sofiapp/api test` ·
`pnpm --filter @sofiapp/web build && pnpm --filter @sofiapp/web lint` · `grep -rn "subrol" apps/*/src`
solo en `user.rol-empresa.ts`, `user.types.ts` (legado), la migración y sus tests · prueba manual:
migración en dry-run sobre la BD local → login como coordinador → crear asesor → como administrador
moverlo a otro coordinador → desactivar al coordinador (409 → liberar equipo).
