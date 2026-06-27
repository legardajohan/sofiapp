# INF-01 — Scaffolding del monorepo (spec)

> **Spec-Driven Development.** El QUÉ y el porqué. El CÓMO va en `plan.md`; la ejecución en
> `tasks.md`. Es el cimiento: sin esto no hay base multi-tenant ni features.

## Objetivo

Dejar el **andamiaje del monorepo** listo y compilando: estructura de carpetas de
`docs/architecture.md` §5, dos procesos del backend (web + worker), frontend SPA, paquete de tipos
compartidos, validación de entorno con Zod al arranque, tooling (TS strict, ESLint funcional,
Prettier, Vitest) y entorno local (Docker: Mongo + Redis). A partir de aquí se puede implementar
`INF-02` (núcleo multi-tenant).

## Alcance

Incluye:
- Monorepo **pnpm workspaces + Turborepo** en la raíz.
- `apps/backend` (Node 24, Express 5, TS strict, Mongoose 8, Zod 4) con la estructura de §5,
  incluyendo `app.ts` (proceso WEB) y `worker.ts` (proceso WORKER) como **bootstraps separados**.
- `apps/frontend` (React 19 + Vite + TS strict, Zustand, TanStack Query, Tailwind) con el
  `apiClient` único (cookie httpOnly + CSRF, ver `docs/adr/0002`).
- `packages/shared` para tipos/DTOs/Zod compartidos back↔front.
- `config/` en backend que **valida TODAS las env vars de `.env.example` con Zod al arranque** y
  **falla** si falta una crítica (sin fallback para `JWT_SECRET` ni `CSRF_SECRET`).
- ESLint (reglas funcionales: sin clases en backend), Prettier, `tsconfig` estricto, `turbo.json`.
- `docker-compose.yml` (Mongo + Redis locales), `.gitignore`, Vitest configurado en backend.

Fuera de alcance (otros features):
- Modelo `Tenant`, `base.repository`, `requireTenant` → `INF-02`.
- Login / emisión de JWT → `AUTH-01`. RBAC → `AUTH-02`.
- Cualquier feature de dominio (M0X).

## Criterios de aceptación

1. `pnpm install` en la raíz instala los workspaces sin errores.
2. `pnpm --filter backend typecheck` (`tsc --noEmit`) en verde con `strict` y sin `any`.
3. Existen `apps/backend`, `apps/frontend`, `packages/shared` con la estructura de §5.
4. `apps/backend/src/app.ts` y `apps/backend/src/worker.ts` arrancan como procesos separados sobre
   el mismo código de dominio (worker conecta a Redis/BullMQ; web levanta Express).
5. El módulo `config/` valida el entorno con Zod al arranque y **aborta** si falta `JWT_SECRET` o
   `CSRF_SECRET` (sin fallback inseguro).
6. `apps/frontend` compila (`pnpm --filter frontend build`) y tiene el `apiClient` con
   `withCredentials` + CSRF (sin `Bearer` desde store), conforme a `apps/frontend/CLAUDE.md`.
7. `docker-compose up` levanta Mongo + Redis locales; el backend conecta a ambos.
8. `pnpm --filter backend test` ejecuta Vitest (aunque sea con un test trivial inicial).
9. ESLint + Prettier configurados; `pnpm --filter frontend lint` en verde.

## Dependencias

- Ninguna. Es el primer feature (cimiento). Habilita `INF-02`.
