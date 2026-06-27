# INF-01 — Tasks (checklist ejecutable)

> Claude Code: ejecuta en orden. Marca cada casilla al terminar. No cierres el feature hasta que
> TODO esté en verde.

## Monorepo (raíz)

- [ ] `git init` (el repo aún no es git) + `.gitignore` (node_modules, dist, .env, coverage).
- [ ] `package.json` raíz con `packageManager: pnpm@...` y scripts que delegan en Turbo.
- [ ] `pnpm-workspace.yaml` con `packages: ["apps/*", "packages/*"]`.
- [ ] `turbo.json` con pipeline `build`, `lint`, `typecheck`, `test`.
- [ ] `tsconfig.base.json` estricto compartido.
- [ ] ESLint (reglas funcionales: sin `class` en backend) + Prettier.

## packages/shared

- [ ] `@sofiapp/shared` con `package.json`, `tsconfig.json` y `src/index.ts` (export inicial vacío
      o un tipo de ejemplo).

## apps/backend (@sofiapp/api)

- [ ] `package.json` (Express 5, Mongoose 8, Zod 4, BullMQ, ioredis, jsonwebtoken, bcrypt) + scripts
      `dev:web`, `dev:worker`, `typecheck`, `test`.
- [ ] `tsconfig.json` extendiendo `tsconfig.base.json`; **ESM**.
- [ ] Estructura `src/` de `plan.md` (carpetas de `architecture.md` §5).
- [ ] `config/env.ts` — validación Zod de TODAS las vars de `.env.example`; **falla** sin
      `JWT_SECRET`/`CSRF_SECRET` (sin fallback).
- [ ] `utils/AppError.ts` y `utils/logger.ts`.
- [ ] `app.ts` — Express + CORS (`credentials`, origen `WEB_ORIGIN`) + healthcheck `/api/health`.
- [ ] `worker.ts` — bootstrap BullMQ (conexión a Redis; workers vacíos/placeholder).
- [ ] `vitest.config.ts` + un test trivial que importe `config` con env de prueba.

## apps/frontend (@sofiapp/web)

- [ ] Proyecto Vite + React 19 + TS strict; Tailwind; Zustand; TanStack Query.
- [ ] `src/api/apiClient.ts` conforme a `apps/frontend/CLAUDE.md` (withCredentials + CSRF, sin
      Bearer desde store).
- [ ] `useAuthStore` mínimo (usuario + `rol` + `logout()`, **sin** token).

## Entorno local

- [ ] `docker-compose.yml` con `mongo` y `redis`; backend conecta a ambos vía `.env`.

## Verificación final

- [ ] `pnpm install` sin errores.
- [ ] `pnpm --filter backend typecheck` en verde (strict, sin `any`).
- [ ] `pnpm --filter backend test` en verde.
- [ ] `pnpm --filter frontend build && pnpm --filter frontend lint` en verde.
- [ ] `docker-compose up -d` y arranque de `app.ts` + `worker.ts` conectando a Mongo + Redis.

## Definición de "hecho"

El monorepo compila y arranca: web y worker como procesos separados, frontend que construye, tipos
compartidos, validación de entorno estricta y entorno local con Docker. Queda listo para `INF-02`.
