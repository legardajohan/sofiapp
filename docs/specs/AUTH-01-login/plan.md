# AUTH-01 — Plan técnico (CÓMO)

> Acata `apps/backend/CLAUDE.md` (patrón de 6 archivos + montaje), `docs/adr/0002` y `0003`, y el
> invariante multi-tenant de `docs/multi-tenancy.md`. No redefine reglas; las referencia.

## Archivos a crear / tocar

```
apps/backend/
├── package.json                        # (editar) + cors, @types/cors
└── src/
    ├── config/env.ts                   # (editar) + SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD, SALT_ROUNDS
    ├── utils/
    │   └── cookies.util.ts             # (crear) setAuthCookies / clearAuthCookies
    ├── middlewares/
    │   └── csrf.middleware.ts          # (crear) csrfGuard (double-submit)
    ├── features/auth/
    │   ├── auth.types.ts               # (crear) LoginDTO, ISessionUser, mapUserToSession
    │   ├── auth.validation.ts          # (crear) loginSchema { body, params, query }
    │   ├── auth.service.ts             # (crear) login(), getProfile()
    │   ├── auth.controller.ts          # (crear) login/me/logout controllers
    │   └── auth.routes.ts              # (crear) POST /login · GET /me · POST /logout
    ├── seed/
    │   └── seed-superadmin.ts          # (crear) seedSuperadmin()
    └── app.ts                          # (editar) cors + csrfGuard global + authRoutes + await seed

apps/frontend/src/
├── features/auth/
│   ├── api.ts                          # (crear) login(dto) / fetchMe() / logout()
│   ├── LoginPage.tsx                   # (crear) formulario email+password
│   └── index.ts                        # (crear) exports
├── stores/authStore.ts                 # (editar) + status: idle|loading|authenticated|unauthenticated
└── router.tsx                          # (editar) ruta pública /login + AuthBootstrap + RequireRole respeta loading
```

> **Nota:** el feature `auth` **no** crea `auth.model.ts` — reutiliza el modelo `User` de INF-02. Es
> la única desviación al patrón de 6 archivos, y está justificada.

## Contratos

### `config/env.ts` (añadir al `EnvSchema`)

```ts
SUPERADMIN_EMAIL: z.string().email().optional(),
SUPERADMIN_PASSWORD: z.string().min(8).optional(),
SALT_ROUNDS: z.coerce.number().default(12),
```

### `auth.types.ts`

```ts
export interface LoginDTO { email: string; password: string; }

export interface ISessionUser {
  sub: string;
  nombre: string;
  email: string;
  rol: UserRol;            // reusa UserRol de user.types.ts
  tenantId: string | null; // string del ObjectId, o null para superadmin
}

// mapUserToSession(user: IUserDocument): ISessionUser  → _id/tenantId a string
```

### `auth.validation.ts`

```ts
export const loginSchema = z.object({
  body: z.object({ email: z.string().email(), password: z.string().min(1) }),
  params: z.object({}).passthrough(),
  query: z.object({}).passthrough(),
});
```

> El `loginSchema` **no** declara `tenantId`; aunque el cliente lo inyecte en el body, el service lo
> ignora y deriva el tenant del documento `User` (criterio de aislamiento #8).

### `auth.service.ts`

- `login(email: string, password: string): Promise<{ token: string; csrfToken: string; session: ISessionUser }>`
  - Lee `User.findOne({ email }).select('+passwordHash')` — **excepción documentada** al repositorio
    scoped (ADR 0003 / `multi-tenancy.md` §7): en el login todavía no hay token del que sacar tenant.
  - Si no existe, `activo === false`, o `bcrypt.compare` falla → `throw new AppError('Credenciales inválidas.', 401)`
    (**mismo** mensaje en todos los casos, sin enumeración).
  - Firma el JWT con `jwt.sign({ sub, tenantId, rol }, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN })`.
    `tenantId` sale del documento (`user.tenantId?.toString() ?? null`).
  - Genera `csrfToken` (p. ej. `randomBytes(32).toString('hex')`).
- `getProfile(sub: string): Promise<ISessionUser>`
  - Lee `User.findById(sub)` (excepción documentada; es el propio usuario del token). Si no existe o
    `activo === false` → `AppError(401)`. Mapea con `mapUserToSession`.

> El service **no** conoce `req`/`res` ni cookies: devuelve valores; el controller setea cookies.

### `utils/cookies.util.ts`

```ts
setAuthCookies(res, token: string, csrfToken: string): void
clearAuthCookies(res): void
```

- `token`: `httpOnly: true`, `secure: env.NODE_ENV === 'production'`, `sameSite: env.COOKIE_SAMESITE`,
  `domain: env.COOKIE_DOMAIN`, `maxAge` ≈ expiración del JWT. **Nombre `token`** (el que ya lee
  `authenticateJWT`).
- `csrfToken`: mismos atributos pero **`httpOnly: false`** (debe ser legible por el `apiClient`).
- `clearAuthCookies`: `res.clearCookie('token', ...)` y `res.clearCookie('csrfToken', ...)` con los
  mismos `domain`/`sameSite`.

### `auth.controller.ts`

- `loginController`: `const dto = req.body as LoginDTO;` → `authService.login(...)` → `setAuthCookies` →
  `res.status(200).json(session)`.
- `meController`: `const sub = req.user!.sub;` → `authService.getProfile(sub)` → `res.status(200).json(session)`.
- `logoutController`: `clearAuthCookies(res)` → `res.status(204).end()`.
- Sin `try/catch`, sin acceso a Mongoose (regla dura de controllers).

### `auth.routes.ts` (endpoints + middlewares)

```ts
router.post('/login',  validate(loginSchema), asyncHandler(loginController));   // público
router.get ('/me',     authenticateJWT,       asyncHandler(meController));       // sin requireTenant
router.post('/logout', authenticateJWT,       asyncHandler(logoutController));   // sin requireTenant
```

> `/me` y `/logout` **omiten `requireTenant`**: el superadmin tiene `tenantId = null` y debe poder
> consultarse a sí mismo y cerrar sesión.

### `middlewares/csrf.middleware.ts`

```ts
export const csrfGuard: RequestHandler = (req, res, next) => {
  const SAFE = ['GET', 'HEAD', 'OPTIONS'];
  const isPublic = req.path === '/api/auth/login' || req.path.startsWith('/api/webhooks/');
  if (SAFE.includes(req.method) || isPublic) return next();
  const header = req.get('X-CSRF-Token');
  const cookie = req.cookies?.csrfToken as string | undefined;
  if (!header || !cookie || header !== cookie) {
    res.status(403).json({ message: 'CSRF token inválido.' });
    return;
  }
  next();
};
```

- Montado **global** en `app.ts` tras `cookieParser()` y **antes** de los routers de features.
- La comparación usa el `path` completo montado; validar con los prefijos reales (`/api/...`).

### `seed/seed-superadmin.ts`

```ts
export async function seedSuperadmin(): Promise<void>
```

- Si faltan `SUPERADMIN_EMAIL` o `SUPERADMIN_PASSWORD`:
  - `NODE_ENV === 'production'` → `throw new Error(...)` (fail-fast).
  - otro → `logger.warn(...)` y `return` (skip).
- Idempotente: `User.findOne({ email })`; si existe → skip (log). Si no → crea
  `{ nombre: 'Superadmin', email, passwordHash: await bcrypt.hash(pass, env.SALT_ROUNDS), rol: 'superadmin', tenantId: null, activo: true }`.
- Lectura/creación directas de `User`: **excepción documentada** (arranque, no request-scoped).

### `app.ts` (montaje)

```ts
app.use(cors({ origin: env.WEB_ORIGIN, credentials: true }));  // antes de todo
app.use(express.json());
app.use(cookieParser());
app.use(csrfGuard);                                            // global, tras cookieParser
// ...routers existentes...
app.use('/api/auth', authRoutes);
// tras mongoose.connect(): await seedSuperadmin(); antes de app.listen()
```

### Frontend

- `features/auth/api.ts`:
  - `login(dto): Promise<ISessionUser>` → `apiClient.post('/auth/login', dto)`.
  - `fetchMe(): Promise<ISessionUser>` → `apiClient.get('/auth/me')`.
  - `logout(): Promise<void>` → `apiClient.post('/auth/logout')`.
- `stores/authStore.ts`: añadir `status: 'idle' | 'loading' | 'authenticated' | 'unauthenticated'` y
  su setter; `setUser` marca `authenticated`; conservar `logout()` (limpieza client-side del 401).
- `LoginPage.tsx`: formulario `email + password`, `useMutation(login)`; ante éxito `setUser(session)`
  y redirige por rol (`superadmin → /admin`, resto → `/`). Muestra error genérico en 401.
- `router.tsx`: ruta pública `/login`; envolver el árbol con `AuthBootstrap` que al montar llama
  `fetchMe()` (marca `loading`→`authenticated`/`unauthenticated`); `RequireRole` muestra loader
  mientras `status === 'loading'` y solo redirige a `/login` cuando `unauthenticated`.

## Notas

- **Excepciones al repositorio scoped:** solo el `login` (lookup por email) y el `seedSuperadmin`
  leen/crean `User` directo, ambas ya contempladas en ADR 0003 / `multi-tenancy.md` §7. El resto del
  código respeta el invariante. `getProfile` usa `findById` del propio `sub` del token (no cross-tenant).
- **Sin BullMQ:** no hay trabajo pesado; todo es síncrono.
- **CORS:** `credentials: true` es obligatorio para que el navegador acepte/envíe la cookie. En dev,
  `WEB_ORIGIN` apunta al host de Vite (p. ej. `http://localhost:5173`).

## Verificación

- `pnpm --filter backend typecheck`
- `pnpm --filter backend test`
- `pnpm --filter frontend build && pnpm --filter frontend lint`
