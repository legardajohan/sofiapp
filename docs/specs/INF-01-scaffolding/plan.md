# INF-01 — Plan técnico (CÓMO)

## Estructura a crear (raíz)

```
sofiapp/
├── package.json                 # raíz: scripts turbo, packageManager pnpm
├── pnpm-workspace.yaml          # packages: ["apps/*", "packages/*"]
├── turbo.json                   # pipeline: build, lint, typecheck, test
├── tsconfig.base.json           # compilerOptions strict compartidos
├── .eslintrc.cjs / eslint.config.js   # reglas funcionales (sin clases en backend)
├── .prettierrc
├── .gitignore
├── docker-compose.yml           # mongo + redis locales
├── .env.example                 # (ya existe — fuente de las env vars)
├── packages/
│   └── shared/                  # @sofiapp/shared — tipos/DTOs/Zod compartidos
│       ├── package.json
│       ├── tsconfig.json
│       └── src/index.ts
└── apps/
    ├── backend/                 # @sofiapp/api
    │   ├── package.json
    │   ├── tsconfig.json        # extends ../../tsconfig.base.json
    │   ├── vitest.config.ts
    │   └── src/                 # estructura de docs/architecture.md §5
    │       ├── app.ts           # bootstrap Express + montaje de routers
    │       ├── worker.ts        # bootstrap BullMQ (procesa colas)
    │       ├── config/          # validación Zod del entorno al arranque
    │       ├── features/        # (vacío; se llena en INF-02 y M0X)
    │       ├── middlewares/
    │       ├── repositories/
    │       ├── workers/
    │       ├── integrations/
    │       ├── realtime/
    │       ├── services/
    │       ├── types/
    │       └── utils/           # AppError, logger
    └── frontend/                # @sofiapp/web
        ├── package.json
        ├── tsconfig.json
        ├── vite.config.ts
        └── src/{features,components,api,store,routes,hooks,lib}/
```

## Contratos / piezas clave

### `config/` (backend) — validación de entorno con Zod
```ts
// config/env.ts (esqueleto)
import { z } from 'zod';
const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  WEB_ORIGIN: z.string().url(),
  JWT_SECRET: z.string().min(32),            // sin fallback: si falta, falla el arranque
  JWT_EXPIRES_IN: z.string().default('8h'),
  CSRF_SECRET: z.string().min(32),           // sin fallback
  MONGODB_URI: z.string().min(1),
  REDIS_HOST: z.string().default('127.0.0.1'),
  REDIS_PORT: z.coerce.number().default(6379),
  // ...resto de .env.example
});
export const env = EnvSchema.parse(process.env);   // lanza y aborta si algo falta
```

### `app.ts` vs `worker.ts`
- `app.ts`: crea Express, CORS con `credentials` (origen `WEB_ORIGIN`), monta routers, gateway
  Socket.IO. **No** procesa colas.
- `worker.ts`: crea los `Worker` de BullMQ (`llm-process`, `outbound-send`, `campaign-broadcast`)
  contra Redis. Importa el mismo `config/` y (más adelante) el mismo `base.repository`.

### `apiClient` (frontend)
- Conforme a `apps/frontend/CLAUDE.md`: `withCredentials: true`, header `X-CSRF-Token` en métodos
  mutadores, `401 → logout()`. **Sin** `Authorization: Bearer` desde el store.

## Convenciones

- **TS strict** en `tsconfig.base.json` (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`).
- Backend **ESM** (`"type": "module"` o `module: NodeNext`), estilo funcional (ESLint prohíbe
  `class` en `src/features/**` y `src/services/**`).
- Fijar las **majors** de `docs/architecture.md` §4; tomar el último patch estable de cada una.

## Verificación

- `pnpm install` · `pnpm --filter backend typecheck` · `pnpm --filter backend test`.
- `pnpm --filter frontend build && pnpm --filter frontend lint`.
- `docker-compose up -d` y arranque de `app.ts`/`worker.ts` conectando a Mongo + Redis.
