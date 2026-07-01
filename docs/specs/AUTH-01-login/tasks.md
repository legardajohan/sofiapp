# AUTH-01 — Tasks (checklist ejecutable)

> Claude Code: ejecuta en orden. Marca cada casilla al terminar. No cierres el feature hasta que
> TODO esté en verde. La rama `feat/AUTH-01` la crea `/sdd-implement`.

## Implementación — Backend (orden del patrón de 6 archivos + soporte)

- [x] `config/env.ts`: añadir `SUPERADMIN_EMAIL` (email opcional), `SUPERADMIN_PASSWORD` (min 8,
      opcional), `SALT_ROUNDS` (`z.coerce.number().default(12)`).
- [x] `apps/backend/package.json`: añadir `cors` (dep) y `@types/cors` (devDep). Instalar con
      `npm install --strict-ssl=false` (certificado corporativo, ver memoria del proyecto).
- [x] `utils/cookies.util.ts`: `setAuthCookies(res, token, csrfToken)` (cookie `token` `httpOnly` +
      `csrfToken` legible, atributos desde env) y `clearAuthCookies(res)`.
- [x] `middlewares/csrf.middleware.ts`: `csrfGuard` double-submit; exime GET/HEAD/OPTIONS y
      `/api/auth/login` + `/api/webhooks/*`.
- [x] `features/auth/auth.types.ts`: `LoginDTO`, `ISessionUser`, `mapUserToSession`.
- [x] `features/auth/auth.validation.ts`: `loginSchema { body:{email,password}, params, query }`
      (sin `tenantId`).
- [x] `features/auth/auth.service.ts`: `login()` (lookup por email, `+passwordHash`, `bcrypt.compare`,
      valida `activo`, mensaje 401 genérico, firma JWT con `tenantId` del documento, genera
      `csrfToken`) y `getProfile(sub)`.
- [x] `features/auth/auth.controller.ts`: `loginController` / `meController` / `logoutController`
      (delgados, setean/limpian cookies, mapean a `ISessionUser`).
- [x] `features/auth/auth.routes.ts`: `POST /login` (público) · `GET /me` (`authenticateJWT`) ·
      `POST /logout` (`authenticateJWT`). Sin `requireTenant`.
- [x] `seed/seed-superadmin.ts`: `seedSuperadmin()` idempotente; fail-fast en prod, warn+skip en dev.
- [x] `app.ts`: montar `cors({ origin: WEB_ORIGIN, credentials: true })`, `csrfGuard` global tras
      `cookieParser`, `app.use('/api/auth', authRoutes)`, y `await seedSuperadmin()` tras
      `mongoose.connect()` antes de `app.listen()`.

## Implementación — Frontend

- [x] `stores/authStore.ts`: añadir `status` (`idle|loading|authenticated|unauthenticated`) + setter;
      `setUser` marca `authenticated`.
- [x] `features/auth/api.ts`: `login(dto)`, `fetchMe()`, `logout()` sobre `apiClient`. Nota: se usó
      el path `/auth/...` (sin prefijo `/api`) porque `apiClient.baseURL` ya es `/api`; se detectó que
      `channels/api.ts` duplica el prefijo (`/api` + `/api/...`), un bug preexistente fuera de alcance
      de este feature — no se tocó, pero queda documentado aquí para no repetirlo.
- [x] `features/auth/LoginPage.tsx`: formulario email+password (`useMutation(login)`), éxito →
      `setUser` + redirect por rol; 401 → error genérico. Maquetado a partir del mockup de Stitch
      "Inicio de Sesión - ConversaCRM" (proyecto "SofiApp - Stich"), con la convención de colores
      hex arbitrarios de Tailwind ya usada en `ChannelConfigPage.tsx`.
- [x] `features/auth/index.ts`: exports.
- [x] `router.tsx`: ruta pública `/login`; `AuthBootstrap` que llama `fetchMe()` al montar;
      `RequireRole` muestra loader mientras `status === 'loading'` y solo redirige a `/login` cuando
      `unauthenticated`. Se añadió también `PublicOnly` para no mostrar el login si ya hay sesión.

## Tests (Vitest + mongodb-memory-server)

> Sigue el patrón de vitest del proyecto (ver memoria `feedback-vitest-setup`).

- [x] `auth.service.test.ts`:
  - [x] login OK → devuelve `token`, `csrfToken` y `session` correcta.
  - [x] password incorrecta → `AppError` 401 con mensaje genérico.
  - [x] usuario `activo: false` → 401.
  - [x] email inexistente → 401 (mismo mensaje, sin enumeración).
  - [x] `getProfile(sub)` mapea a `ISessionUser` correctamente (+ caso usuario inexistente → 401).
- [x] **Aislamiento multi-tenant** (criterio #8):
  - [x] login de un usuario de `tenantA` → el JWT decodificado lleva `tenantId === A`.
  - [x] login del superadmin → `tenantId === null` en el token.
  - [x] `login()` solo acepta `(email, password)`: es estructuralmente imposible que el cliente
        inyecte un `tenantId` (no hay parámetro para ello); el token se firma exclusivamente con el
        `tenantId` del documento `User` hallado.
- [x] `csrf.middleware.test.ts`:
  - [x] POST sin header ni cookie → 403.
  - [x] POST con header ≠ cookie → 403.
  - [x] POST con header === cookie → `next()`.
  - [x] GET → exento (`next()`), y `/api/auth/login` + `/api/webhooks/*` → exentos.
- [x] `seed-superadmin.test.ts`:
  - [x] primera llamada crea el superadmin (`rol: 'superadmin'`, `tenantId: null`, `passwordHash`
        hasheada y verificable con `bcrypt.compare`).
  - [x] segunda llamada es idempotente (no duplica).

## Verificación final

- [x] `pnpm --filter backend typecheck` sin errores (incluye `tsconfig.test.json`).
- [x] `pnpm --filter backend test` con todos los tests anteriores en verde (27/27).
- [x] `pnpm --filter frontend build` en verde. **`lint` no pudo verificarse**: el repo no tiene
      `eslint.config.js` en `apps/frontend` (gap preexistente de `INF-01`, no introducido por
      `AUTH-01`); `npm run lint` falla con "ESLint couldn't find an eslint.config.js file" antes de
      llegar a analizar ningún archivo. Fuera de alcance arreglarlo aquí; reportado al usuario.
- [x] Prueba manual: arrancado el backend real (seed logueado), `login` vía `curl` devuelve
      `Set-Cookie` con `token` (httpOnly) + `csrfToken` (legible); `/me` con cookie devuelve la
      sesión; `logout` limpia ambas cookies (204); una ruta mutadora sin `X-CSRF-Token` → 403, y con
      el header correcto pasa el `csrfGuard` (llega hasta `requireTenant`, que rechaza al superadmin
      por no tener tenant — comportamiento correcto de INF-02, no de este feature). Verificado también
      el flujo completo `login → /me` a través del proxy real de Vite (`localhost:5173` → `:4000`).
- [x] Checklist de PR de `docs/multi-tenancy.md` §9 revisado (ver notas de la excepción documentada
      en `auth.service.ts`/`seed-superadmin.ts` para el lookup de `User` en pre-auth y en el seed).

## Definición de "hecho"

Un superadmin puede iniciar sesión desde la página `/login`; la sesión persiste al recargar vía
`/me` y se cierra con `logout`. CORS y CSRF están activos sin romper las rutas existentes. El JWT
lleva siempre el `tenantId` del documento (nunca del cliente). `typecheck` y `test` del backend, y el
`build` del frontend, están en verde (ver nota sobre `lint` arriba). Sobre este feature ya pueden
construirse `AUTH-02` (RBAC/usuarios) y `SAAS-02` (tenants).
