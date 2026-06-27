# Kickoff para Claude Code — SofiApp

> **Cómo usar este archivo:** abre Claude Code dentro de `E:\dev\sofiapp`. Selecciona el modelo
> **Opus 4.8** (`/model`) y activa el **modo plan** (Shift+Tab hasta "plan mode"). Pega el bloque
> de "PROMPT" de abajo. Revisa el plan que proponga **antes** de aprobar la ejecución.
>
> Requisito previo: copia la carpeta de documentación generada (`CLAUDE.md`, `docs/`,
> `apps/backend/CLAUDE.md`, `apps/frontend/CLAUDE.md`, `.env.example`) en la raíz de
> `E:\dev\sofiapp`. Claude Code la usará como fuente de verdad.

---

## PROMPT (pegar en Claude Code, en modo plan, modelo Opus 4.8)

```
Eres el ingeniero que va a construir SofiApp. Trabaja en modo plan: primero PROPÓN un plan,
no ejecutes hasta que lo apruebe.

Contexto obligatorio (léelo completo antes de planear):
- CLAUDE.md (raíz)
- docs/product.md, docs/architecture.md, docs/multi-tenancy.md, docs/domain.md,
  docs/data-model.md, docs/api-contract.md
- docs/integrations/meta-whatsapp.md, docs/integrations/llm-provider.md
- apps/backend/CLAUDE.md, apps/frontend/CLAUDE.md
- docs/specs/INF-02-tenant-middleware/{spec,plan,tasks}.md  (patrón SDD de referencia)

Objetivo de esta sesión: dejar el ANDAMIAJE del monorepo listo y el primer feature núcleo
implementado, siguiendo Spec-Driven Development.

Plan que espero que propongas (ajústalo si ves algo mejor, justificándolo):

FASE A — Scaffolding del monorepo (corresponde a INF-01; ver docs/specs/INF-01-scaffolding/)
  1. Inicializar monorepo con pnpm workspaces + Turborepo en la raíz.
  2. Crear apps/backend (Node 24, Express 5, TS strict, Mongoose 8, Zod 4) con la estructura de
     carpetas de docs/architecture.md §5. Incluir app.ts y worker.ts (procesos separados).
  3. Crear apps/frontend (React 19 + Vite + TS strict, Zustand, TanStack Query, Tailwind).
  4. Crear packages/shared para tipos/DTOs/Zod compartidos.
  5. ESLint (reglas funcionales) + Prettier + tsconfig estricto + módulo config/ que valida las
     env vars de .env.example con Zod al arranque (SIN fallback para JWT_SECRET).
  6. docker-compose.yml con Mongo + Redis locales. .gitignore.
  7. Configurar Vitest en el backend.

FASE B — Núcleo multi-tenant (implementa el feature INF-02 siguiendo su tasks.md)
  8. Implementar EXACTAMENTE lo descrito en docs/specs/INF-02-tenant-middleware/tasks.md:
     modelo Tenant, User con tenantId, base.repository.ts (funciones *Scoped), requireTenant,
     tipos de Express, y los TESTS de aislamiento. No cierres hasta que tsc --noEmit y los tests
     estén en verde.

Reglas que NO puedes violar (de docs/multi-tenancy.md):
- Toda query vía funciones *Scoped del base.repository. Nunca Model.find/create/findById directo.
- tenantId SIEMPRE del token (req.user!.tenantId), nunca del body/params/query.
- Controllers delgados: sin try/catch, sin lógica de negocio, sin Mongoose.
- TypeScript strict, sin any. Validación de input con Zod en el borde.

Entregable de la sesión: monorepo que compila (tsc --noEmit en verde en backend), con el feature
INF-02 implementado y sus tests de aislamiento pasando.

Cuando termines el plan, MUÉSTRAMELO y espera mi aprobación. Después de INF-02, el orden de los
siguientes features es: AUTH-01 → AUTH-02 → AUTH-03 → SAAS-01 → SAAS-02 → SAAS-03 → M01-* →
M02-* → M08-* → M04-* → M07-* → (Fase 3) M06-*. Crearemos su spec.md/plan.md/tasks.md siguiendo
el patrón de INF-02 antes de implementar cada uno.
```

---

## Después del kickoff

Para cada feature siguiente, invoca la planeación según su complejidad (en modo plan, Opus 4.8):

- `/sdd-spec <ID>-<slug> — <descripción>` — **planeación compleja**: tríada
  `spec.md` + `plan.md` + `tasks.md` (cuando hay diseño que revisar).
- `/sdd-spec-quick <ID>-<slug> — <descripción>` — **planeación sencilla**: un solo `spec.md`
  con tasks embebidas (features mecánicos/CRUD).

Ambas solo planean y se detienen a esperar tu aprobación. Luego, cuando tú lo decidas:
`/sdd-implement <ID>-<slug>` (implementa) y `/sdd-release <ID>-<slug>` (libera).

Mantén la disciplina: **un feature a la vez**, planeación → implementación →
`tsc --noEmit` + tests de aislamiento en verde → siguiente.
