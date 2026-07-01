# AUTH-01 — Sistema de autenticación (spec)

> **Spec-Driven Development.** Este es el QUÉ y el porqué. El CÓMO va en `plan.md`; la ejecución
> en `tasks.md`. Es la puerta de entrada a la app: sin esto nadie puede autenticarse.

**Estado:** implementado

## Objetivo

Disponer de la autenticación completa end-to-end de SofiApp: **seed idempotente de un usuario
superadmin** al arrancar, **login** con `email + password` que emite el JWT en una cookie
`httpOnly` (más la cookie legible `csrfToken`), perfil **`/me`**, **logout**, **CORS** con
credenciales y protección **CSRF double-submit**, y una **página de login en React** que hidrata el
`authStore` existente y restaura la sesión al recargar.

El diseño no reinventa reglas: acata `ADR 0002` (JWT en cookie `httpOnly` + CSRF double-submit) y
`ADR 0003` (login por `email + password`; el `tenantId` sale del `User` hallado, excepción
documentada a la lectura scoped — ver `docs/multi-tenancy.md` §7). El backend sigue el patrón de 6
archivos de `apps/backend/CLAUDE.md`.

## Alcance

Incluye:

- **Backend — feature `auth`** (`src/features/auth/`): `login`, `me`, `logout`. Reutiliza el modelo
  `User` de INF-02 (no crea modelo propio).
- **Seed de superadmin** idempotente en el arranque del proceso web, con credenciales desde env.
- **Helpers de cookies** (`token` `httpOnly` + `csrfToken` legible) con atributos derivados de env.
- **Middleware `csrfGuard`** (double-submit) montado global, aplicado a peticiones mutadoras.
- **CORS** en `app.ts` con `origin = WEB_ORIGIN` y `credentials: true`.
- **Nuevas env vars:** `SUPERADMIN_EMAIL`, `SUPERADMIN_PASSWORD`, `SALT_ROUNDS`.
- **Frontend:** página `/login`, `features/auth/api.ts`, bootstrap `/me` al cargar la app y gating de
  `RequireRole` mientras la sesión se resuelve.

Fuera de alcance (otros features):

- `POST /api/auth/refresh` (renovación de token) → ticket posterior.
- RBAC avanzado y gestión de usuarios del tenant → `AUTH-02`.
- CRUD de tenants del Superadmin → `SAAS-02`.
- Recuperación/cambio de contraseña, MFA, rotación de secretos.

## Criterios de aceptación

1. Al arrancar el proceso web existe un `User` superadmin (`rol = 'superadmin'`, `tenantId = null`,
   `passwordHash` con bcrypt) sembrado de forma **idempotente** desde env. En `production` el
   arranque **falla** (fail-fast) si faltan `SUPERADMIN_EMAIL`/`SUPERADMIN_PASSWORD`; en
   `development` se omite el seed con un warning.
2. `POST /api/auth/login` con `email + password` válidos responde **200** con la sesión
   (`ISessionUser`) y setea **dos** cookies: `token` (`httpOnly`, `Secure` en prod, `SameSite` de
   env) y `csrfToken` (legible). Credenciales inválidas o usuario `activo = false` → **401** con
   mensaje **genérico** (sin enumeración de usuarios ni distinción email/password).
3. `GET /api/auth/me` con cookie válida devuelve la sesión (`ISessionUser`) del `req.user.sub`; sin
   cookie o con token inválido → **401**.
4. `POST /api/auth/logout` limpia ambas cookies (`token` y `csrfToken`) y responde **200/204**.
5. CORS habilitado con `origin = WEB_ORIGIN` y `credentials: true`, permitiendo el header
   `X-CSRF-Token` y `Content-Type`.
6. `csrfGuard` rechaza con **403** toda petición mutadora (POST/PUT/PATCH/DELETE) cuyo header
   `X-CSRF-Token` no coincida con la cookie `csrfToken`. Exime métodos seguros (GET/HEAD/OPTIONS) y
   las rutas públicas `/api/auth/login` y `/api/webhooks/*`. Las rutas mutadoras existentes
   (channels, messages, clientes) siguen funcionando con el `apiClient` (que ya envía el header).
7. **Frontend:** la página `/login` permite iniciar sesión; ante éxito hidrata el `authStore` y
   redirige según el `rol`. Al **recargar**, un bootstrap `/me` restaura la sesión y `RequireRole`
   **no** redirige a `/login` mientras la sesión está cargando.
8. **Aislamiento multi-tenant (invariante):** el JWT emitido en el login lleva el `tenantId` del
   documento `User` hallado (o `null` para el superadmin) y **jamás** un `tenantId` provisto por el
   cliente; el login **ignora** cualquier `tenantId` presente en el body. Existe un test que lo
   demuestra.
9. `pnpm --filter backend typecheck` (`tsc --noEmit`) en verde.

## Dependencias

- `INF-02` (modelo `User` con `tenantId`, middlewares `authenticateJWT`/`authorize`/`validate`/
  `asyncHandler`/`errorHandler`, tipo `SafeUser`) completo.
- `HT-WA-01` (webhook, channel, cliente, message) completo — sus rutas mutadoras se ven afectadas
  por `csrfGuard`.
- `ADR 0002` (transporte del token) y `ADR 0003` (resolución del tenant en el login).
