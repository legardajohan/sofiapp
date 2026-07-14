# AUTH-02 — Plan técnico (CÓMO)

No hay endpoints ni modelos nuevos: es una extensión de tipos + un campo opcional + reasignación de
roles + docs. El rol se define en **cuatro sitios independientes** (no hay tipo compartido); se
editan los cuatro y se mantiene el patrón actual (sin tocar `packages/shared`).

## Archivos a tocar

```
apps/backend/src/
  features/users/
    user.types.ts          # + AdminSubrol; UserRol → 'superadmin' | 'admin'; subrol? en IUser/IUserDocument/IUserResponse
    user.model.ts          # rol.enum → ['superadmin','admin']; + campo subrol (enum, sin required)
  features/auth/
    auth.types.ts          # subrol? en ISessionUser + ISessionUserSource; mapUserToSession copia subrol
    auth.service.ts        # jwt.sign(...) incluye subrol; getProfile ya usa mapUserToSession
  types/express.d.ts       # SafeUser.rol → 'superadmin' | 'admin'; + subrol? (AdminSubrol)
  middlewares/
    authenticate-jwt.middleware.ts   # copia payload['subrol'] a req.user
  features/conversation/conversation.routes.ts   # authorize(['coordinador','asesor']) → authorize(['admin'])
  features/message/message.routes.ts             # authorize(['asesor','coordinador','admin']) → authorize(['admin'])

apps/frontend/src/
  stores/authStore.ts      # UserRol → 'superadmin' | 'admin'; + subrol? en AuthUser
  features/auth/api.ts     # subrol? en ISessionUser
  features/auth/LoginPage.tsx      # setUser({ ..., subrol: session.subrol })
  components/AuthBootstrap.tsx     # setUser({ ..., subrol: session.subrol })
  components/layout/nav-config.ts  # + import BookText; + item Base de Conocimiento; Operación roles → ['admin']
  components/layout/NavUser.tsx    # ROL_LABEL a 2 claves; + SUBROL_LABEL; render subrol
  router.tsx               # guard /inbox roles ['coordinador','asesor'] → ['admin']

docs/                      # product.md, domain.md, data-model.md (rol + comentarios asesorId), api-contract.md
README.md                  # línea resumen de roles

# tests que romperán (actualizar, no crear features):
apps/backend/tests/unit/auth.service.test.ts
apps/backend/tests/unit/socket.gateway.test.ts
apps/backend/src/features/kb/kb.routes.test.ts
# conversation.service.test.ts usa asesorId como user id (NO rompe); revisar que ningún
# token de prueba de la bandeja use rol 'asesor'/'coordinador' → migrar a 'admin' si lo hubiera.
```

> **Nota WhatsApp:** el item `WhatsApp` (`/settings/channels/whatsapp`, `roles: ['admin']`) **ya
> existe** en el grupo `Configuración` de `nav-config.ts` y la ruta ya está en `router.tsx`. No hay
> que agregarlo; solo verificar que sobrevive a la reasignación de roles (sigue `['admin']`).

## Contratos

### `features/users/user.types.ts`

```ts
export type UserRol = 'superadmin' | 'admin';
export type AdminSubrol = 'director' | 'manager' | 'coordinator' | 'secretary';

export interface IUser {
  tenantId: Types.ObjectId | null;
  nombre: string;
  email: string;
  passwordHash: string;
  rol: UserRol;
  subrol?: AdminSubrol;   // metadata; solo aplica a admin
  activo: boolean;
}

export interface IUserDocument extends IUser, Document {}

export interface IUserResponse {
  id: string;
  tenantId: string | null;
  nombre: string;
  email: string;
  rol: UserRol;
  subrol?: AdminSubrol;
  activo: boolean;
}
```

### `features/users/user.model.ts`

```ts
rol: { type: String, enum: ['superadmin', 'admin'], required: true },
subrol: { type: String, enum: ['director', 'manager', 'coordinator', 'secretary'] }, // opcional
```

### `features/auth/auth.types.ts`

```ts
import type { AdminSubrol, UserRol } from '../users/user.types.js';

export interface ISessionUser {
  sub: string;
  nombre: string;
  email: string;
  rol: UserRol;
  subrol?: AdminSubrol;
  tenantId: string | null;
}

export interface ISessionUserSource {
  _id: Types.ObjectId;
  nombre: string;
  email: string;
  rol: UserRol;
  subrol?: AdminSubrol;
  tenantId: Types.ObjectId | null;
}

// mapUserToSession copia subrol tal cual (undefined si no existe)
```

### `features/auth/auth.service.ts` (firma del token)

```ts
const token = jwt.sign(
  { sub: user._id.toString(), tenantId, rol: user.rol, subrol: user.subrol },
  env.JWT_SECRET,
  { expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'] },
);
```

### `types/express.d.ts` (`SafeUser`)

```ts
import type { AdminSubrol } from '../features/users/user.types.js';

export interface SafeUser {
  sub: string;
  tenantId: Types.ObjectId | null;
  rol: 'superadmin' | 'admin';
  subrol?: AdminSubrol;
}
```

### `middlewares/authenticate-jwt.middleware.ts`

```ts
const user: SafeUser = {
  sub: String(payload['sub']),
  tenantId: tenantRaw ? new Types.ObjectId(String(tenantRaw)) : null,
  rol: payload['rol'] as SafeUser['rol'],
  subrol: payload['subrol'] as SafeUser['subrol'],
};
```

### Frontend — `stores/authStore.ts` y `features/auth/api.ts`

```ts
// authStore.ts
export type UserRol = 'superadmin' | 'admin';
export type AdminSubrol = 'director' | 'manager' | 'coordinator' | 'secretary';
interface AuthUser { sub: string; rol: UserRol; subrol?: AdminSubrol; nombre?: string; }

// features/auth/api.ts
export interface ISessionUser {
  sub: string; nombre: string; email: string;
  rol: UserRol; subrol?: AdminSubrol; tenantId: string | null;
}
```

Threading en `LoginPage.tsx` y `AuthBootstrap.tsx`:
`setUser({ sub: session.sub, rol: session.rol, subrol: session.subrol, nombre: session.nombre })`.

### `components/layout/NavUser.tsx`

```ts
const ROL_LABEL: Record<UserRol, string> = {
  superadmin: 'Superadministrador',
  admin: 'Administrador',
};

const SUBROL_LABEL: Record<AdminSubrol, string> = {
  director: 'Director',
  manager: 'Gerente',
  coordinator: 'Coordinador',
  secretary: 'Secretaria',
};

// render (líneas ~76 y ~94): mostrar ROL_LABEL[user.rol] y, si user.subrol, ` · ${SUBROL_LABEL[user.subrol]}`
```

### `components/layout/nav-config.ts`

- Importar `BookText` de `lucide-react`.
- Grupo `Configuración` — agregar (antes/junto a WhatsApp):
  ```ts
  { label: 'Base de Conocimiento', to: '/settings/knowledge', icon: BookText, roles: ['admin'] },
  ```
- Grupo `Operación` — `roles` de Bandeja omnicanal, Clientes y Campañas pasan a `['admin']`
  (conservando `disabled: true` donde ya estaba).

### Guards / rutas backend reasignadas

```ts
// conversation.routes.ts
const bandejaRoles = authorize(['admin']);
// message.routes.ts
authorize(['admin'])
// router.tsx  (/inbox)
<RequireRole roles={['admin']}>
```

## Notas

- **Cero cambios de lógica de autorización.** `authorize`, `RequireRole`, `authenticate-jwt` y
  `requireTenant` no cambian; solo cambian los **valores** de rol que reciben. Ningún guard lee
  `subrol`.
- `subrol` es **opcional en toda la cadena**: token, `SafeUser`, sesión y store. Un usuario sin
  `subrol` (p. ej. el superadmin del seed, o admins previos) sigue funcionando sin migración de
  datos.
- La ruta/página/guard de **Base de Conocimiento** ya existen (`router.tsx:62-71`); aquí solo se
  añade la entrada de navegación.
- **`asesorId` conserva su nombre** (no se renombra ni se migra): sigue siendo la FK del usuario
  asignado, que ahora es un `admin`. Solo se **aclara su semántica** en comentarios/docs:
  `data-model.md:98` (`// ref User (usuario admin asignado)`), `:109` (comentario del índice
  `{ tenantId, asesorId }`), `:272` (diagrama ER), y la mención correspondiente en `domain.md`. El
  código (`conversation.controller.ts:18` `req.user!.sub`, `conversation.service.ts` filtros
  `mios`/`sin_asignar`, `conversation.mapper.ts`, `conversation.types.ts`) **no cambia**. La room
  `asesor:<id>` del `socket.gateway` tampoco se renombra.
- El item **WhatsApp** del sidebar ya existe con `roles: ['admin']`; no se agrega, solo se verifica
  que permanece tras reducir `UserRol`.
- El seed (`seed/seed-superadmin.ts`) y `tenant.service.ts` crean usuarios con `rol` `superadmin`/
  `admin` respectivamente y sin `subrol`: siguen siendo válidos.
- Tests: los tokens de prueba con `rol: 'asesor'`/`'coordinador'` dejan de compilar/aplicar; se
  reemplazan por el rol pertinente al caso (p. ej. un rol válido que igualmente falle el `authorize`,
  o el rol correcto que ahora concede acceso), preservando la intención de cada aserción.

## Verificación

- `pnpm --filter backend typecheck`
- `pnpm --filter backend test`
- `pnpm --filter frontend build`
- `pnpm --filter frontend lint`
