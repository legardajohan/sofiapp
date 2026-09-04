# Arquitectura — SofiApp

## 1. Estilo arquitectónico

**Monolito modular funcional + Screaming Architecture.** El código se organiza **por
feature/dominio**, no por capa técnica: no existen carpetas globales `controllers/` o
`services/` planas. Cada feature es un *vertical slice* autocontenido y, si la escala lo exige,
extraíble a microservicio sin reescribir el resto.

Estilo funcional: sin clases en el backend, solo *named exports*. Funciones puras donde sea
posible, inmutabilidad, inyección de dependencias para testear.

## 2. Dos procesos, un código

```
                         ┌───────────────────────────────────────────────┐
   Meta Cloud API ──────▶│  apps/backend  → proceso WEB (Express)         │
   (WA / IG / FB)        │   • /api/webhooks/meta  (PÚBLICO)              │
   Embedded Signup ─────▶│       valida HMAC → resuelve tenant por        │
                         │       phone_number_id → responde 200 →         │
                         │       encola job (NO procesa inline)           │
                         │   • /api/*  (rutas tenant-aware, pipeline)     │
                         │   • WebSocket gateway (bandeja en vivo)        │
                         └───────────────┬───────────────────────────────┘
                                         │  BullMQ (Redis)
                                         ▼
                         ┌───────────────────────────────────────────────┐
   Gemini 1.5 Flash ◀───▶│  apps/backend  → proceso WORKER (BullMQ)       │
                         │   • llm-process     (slot filling, scoring)    │
                         │   • outbound-send   (rate-limit Meta ~80/s)    │
                         │   • campaign-broadcast                         │
                         │   • flow-runtime    (nodos `espera` +          │
                         │     recordatorios de inactividad, HU-FLOW-02;  │
                         │     barrido periódico vía Job Scheduler)       │
                         └───────────────┬───────────────────────────────┘
            Redis (ioredis) ◀────────────┤  SOLO colas (sin caché semántica en MVP)
            MongoDB Atlas  ◀─────────────┤  datos (tenant-scoped)
            DO Spaces (S3) ◀─────────────┘  media de chat (imágenes recibidas)
```

El proceso **WEB** y el **WORKER** comparten el mismo código de dominio (mismo monorepo) pero se
ejecutan como procesos PM2 separados. Razón: mantener el SLA de *200 OK inmediato* a Meta y
aislar el trabajo pesado (LLM, difusiones) del hilo HTTP.

## 3. Capas y pipeline (ruta tenant-aware)

```
Request → authenticateJWT → requireTenant → authorize([roles]) → validate(zod)
        → asyncHandler(controller) → service → base.repository (scoped) → MongoDB
                                        └── error → errorHandler central (AppError / ZodError / 500)
```

| Capa | Responsabilidad | Prohibido |
|---|---|---|
| Routes | método + path; encadenar middlewares en orden fijo; `asyncHandler` | lógica de negocio |
| Controller | extraer `req.user!.tenantId`, `params`, `body`; llamar al service; responder | `try/catch`, `if(!user)`, Mongoose |
| Service | lógica de negocio; orquestar vía repositorio scoped; lanzar `AppError` | conocer `req`/`res`; aceptar `tenantId` del cliente |
| Repository | forzar `tenantId` en cada operación de DB | exponer queries sin tenant |
| Model | schema Mongoose + interfaces | lógica de negocio |

## 4. Stack y versiones

| Capa | Tecnología | Versión |
|---|---|---|
| Runtime | Node.js | 24.x LTS |
| Lenguaje | TypeScript | 5.6+ (`strict`) |
| API | Express | 5.x |
| ODM | Mongoose | 8.x |
| Validación | Zod | 4.x |
| Auth | jsonwebtoken 9.x + bcrypt 5/6 (cookie `httpOnly`) | — |
| Colas | BullMQ 5.x + ioredis 5.x | — |
| Tiempo real | Socket.IO 4.x | — |
| Storage | `@aws-sdk/client-s3` 3.x (DO Spaces, S3-compat) | — |
| Frontend | React 19 + Vite 6/7 | — |
| Estado | Zustand 5.x + TanStack Query 5.x | — |
| UI | Tailwind 3/4 (+ shadcn/ui opcional) | — |
| Gráficos | Recharts 2/3 | — |
| Flujos | `@xyflow/react` (React Flow) 12.x — implementado en `HU-FLOW-01-V2` | — |
| Testing | Vitest 3.x + Supertest | — |
| Monorepo | pnpm workspaces + Turborepo | — |
| Móvil (Fase 4) | React Native 0.76+ + Expo SDK 52+ | — |

> Fija estas **majors**; al hacer scaffold toma el último patch estable de cada una.

## 5. Estructura del monorepo

```
sofiapp/
├── CLAUDE.md
├── docs/ …                         # toda la documentación SDD
├── packages/
│   └── shared/                     # tipos/DTOs/Zod compartidos back↔front
├── apps/
│   ├── backend/
│   │   ├── CLAUDE.md
│   │   └── src/
│   │       ├── app.ts              # bootstrap Express + montaje de routers
│   │       ├── worker.ts           # bootstrap del proceso BullMQ
│   │       ├── config/             # validación de env al arranque (Zod)
│   │       ├── features/           # vertical slices (auth, tenant, user, cliente, message, catalogo, campaign, ...)
│   │       ├── middlewares/        # auth, require-tenant, role, validate, async-handler, error
│   │       ├── repositories/
│   │       │   └── base.repository.ts   # tenant-safe (corazón del aislamiento)
│   │       ├── workers/            # procesadores BullMQ (llm-process, outbound, campaign)
│   │       ├── integrations/       # meta/, llm/ (clientes externos)
│   │       ├── realtime/           # gateway Socket.IO
│   │       ├── services/           # soporte no atado a un feature
│   │       ├── types/              # express.d.ts, helpers Mongoose
│   │       └── utils/              # AppError, logger, crypto
│   ├── frontend/
│   │   ├── CLAUDE.md
│   │   └── src/{features,components,api,store,routes,hooks,lib}/
│   └── mobile/                     # Fase 4 (React Native + Expo)
├── .env.example
├── docker-compose.yml              # Mongo + Redis local
├── pnpm-workspace.yaml
└── turbo.json
```

Cada feature replica el patrón de **6 archivos** (`routes · controller · service · model ·
types · validation`) **+ su montaje en `app.ts`**. Ver `apps/backend/CLAUDE.md`.

## 6. Despliegue

- **Frontend:** Vercel (SPA estática + CDN + preview deploys). Configura `VITE_API_BASE_URL`.
- **Backend (web + worker):** Droplet DigitalOcean, Node 24, **PM2** (cluster para web, proceso
  aparte para worker), **Nginx** como proxy inverso con **HTTPS (certbot)**.
- **Redis:** misma máquina del Droplet (broker de BullMQ).
- **Base de datos:** MongoDB Atlas.
- **Media de chat:** DigitalOcean Spaces (S3-compatible).
- **CI/CD:** GitHub Actions (build, lint, `tsc --noEmit`, test, deploy en push a `main`).

CORS: el backend permite el origen de Vercel. La cookie del JWT es `httpOnly` con `SameSite` y
dominio configurados para el cross-site SPA↔API.
