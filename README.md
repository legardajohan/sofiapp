# SofiApp

> CRM SaaS **multi-tenant** para cualquier entidad comercial. Centraliza la captación de
> prospectos, la comunicación omnicanal automatizada con IA y el cierre de ventas. Cada empresa
> conecta su propia cuenta de WhatsApp Business API (modelo BSP, equivalente a Mercately).

[![Node](https://img.shields.io/badge/node-24_LTS-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)](https://react.dev)
[![MongoDB](https://img.shields.io/badge/MongoDB-Atlas-47A248?logo=mongodb&logoColor=white)](https://www.mongodb.com)
[![License](https://img.shields.io/badge/license-Proprietary-lightgrey)](#licencia)

---

## ✨ Características

- **Bandeja omnicanal** — WhatsApp, Instagram Direct y Facebook Messenger unificados (Meta Cloud API).
- **Multi-tenant de verdad** — base compartida con discriminador `tenantId`; aislamiento forzado
  en una única capa (tenant-safe repository).
- **IA para prospectos** — *slot filling* de datos, *lead scoring* (frío/tibio/caliente) y
  detección de objeciones con **Gemini 1.5 Flash** (proveedor intercambiable).
- **Gestión por estados** — pipeline comercial basado en `estadoComercial` (sin Kanban).
- **Campañas de remarketing** — segmentación dinámica + envío masivo con rate limiting de Meta.
- **Panel Superadmin** — alta/suspensión de empresas, activación manual de planes y métricas
  globales cross-tenant.
- **Onboarding BSP** — cada empresa conecta su WABA por Embedded Signup.

## 🧱 Arquitectura

Monolito modular funcional con **Screaming Architecture** (organización por feature/dominio) y
**dos procesos** sobre el mismo código de dominio:

```
Meta Cloud API ─▶ apps/backend (WEB, Express)
                    • /api/webhooks/meta  → valida HMAC, resuelve tenant por
                      phone_number_id, responde 200 y encola (no procesa inline)
                    • /api/*  rutas tenant-aware (pipeline de middlewares)
                    • WebSocket gateway (bandeja en vivo)
                         │  BullMQ (Redis)
                         ▼
                  apps/backend (WORKER, BullMQ)
                    • llm-process · outbound-send · campaign-broadcast · (Fase 3) flow-runtime
                         │
   Redis ◀──────────────┤ colas
   MongoDB Atlas ◀───────┤ datos (tenant-scoped)
   DO Spaces ◀───────────┘ media de chat
```

Pipeline de toda ruta tenant-aware:

```
authenticateJWT → requireTenant → authorize([roles]) → validate(zod) → asyncHandler(controller)
                → service → base.repository (*Scoped) → MongoDB
```

> **Regla de oro:** el `tenantId` nace siempre del JWT y se inyecta en cada query vía el
> *tenant-safe repository*. Una fuga de datos entre tenants es el peor fallo posible. Detalle en
> [`docs/multi-tenancy.md`](docs/multi-tenancy.md).

## 🛠️ Stack

| Capa | Tecnología |
|---|---|
| Runtime | Node.js 24 LTS |
| Backend | Express 5 · TypeScript 5.6 (`strict`) · Mongoose 8 · Zod 4 · JWT 9 |
| Async | BullMQ 5 · ioredis 5 (Redis como broker de colas) |
| Tiempo real | Socket.IO 4 |
| Frontend | React 19 · Vite · Zustand · TanStack Query · Tailwind |
| IA | Gemini 1.5 Flash (tras interfaz `ILlmProvider`) |
| Infra | DigitalOcean Droplet (PM2 + Nginx) · MongoDB Atlas · DO Spaces · Vercel (frontend) |
| Móvil (Fase 4) | React Native + Expo |

## 📁 Estructura del monorepo

```
sofiapp/
├── CLAUDE.md                 # Contexto/reglas para Claude Code
├── docs/                     # Documentación Spec-Driven (fuente de verdad)
│   ├── product.md            # Especificaciones generales
│   ├── architecture.md
│   ├── multi-tenancy.md
│   ├── domain.md
│   ├── data-model.md
│   ├── api-contract.md
│   ├── integrations/         # meta-whatsapp.md · llm-provider.md
│   ├── adr/                  # Architecture Decision Records
│   └── specs/<ID>/           # spec.md → plan.md → tasks.md por feature
├── packages/shared/          # Tipos/DTOs/Zod compartidos
├── apps/
│   ├── backend/              # Express (web) + worker BullMQ
│   ├── frontend/             # SPA React + Vite
│   └── mobile/               # (Fase 4) React Native
├── .env.example
├── docker-compose.yml        # Mongo + Redis local
└── pnpm-workspace.yaml
```

## 🚀 Primeros pasos

> Requisitos: Node.js 24 LTS, pnpm, Docker (para Mongo/Redis locales).

```bash
# 1. Instalar dependencias
pnpm install

# 2. Levantar Mongo + Redis locales
docker compose up -d

# 3. Configurar variables de entorno
cp .env.example apps/backend/.env   # rellena los valores

# 4. Desarrollo
pnpm --filter backend dev           # API (web)
pnpm --filter backend worker        # worker BullMQ
pnpm --filter frontend dev          # SPA
```

Calidad:

```bash
pnpm --filter backend typecheck     # tsc --noEmit
pnpm --filter backend test          # Vitest (incluye tests de aislamiento multi-tenant)
pnpm --filter frontend build && pnpm --filter frontend lint
```

## 🔐 Variables de entorno

Todas las variables se documentan en [`.env.example`](.env.example) y se **validan al arranque**
con Zod (sin fallbacks inseguros; `JWT_SECRET` es obligatorio). Grupos: App, Auth, MongoDB,
Redis, Meta (BSP), LLM (Gemini), Storage (DO Spaces).

## 🗺️ Roadmap por fases

- **Fase 0 — Cimientos:** infraestructura multi-tenant, autenticación + RBAC, panel Superadmin.
- **Fase 1 — Núcleo CRM:** bandeja omnicanal, gestión por estados, catálogo.
- **Fase 2 — Inteligencia:** motor de IA (slot filling, scoring, objeciones).
- **Fase 3 — Crecimiento:** campañas de remarketing y constructor visual de flujos.
- **Fase 4 — Móvil:** app React Native para asesores.

## 👥 Roles

`superadmin` (global, cross-tenant) · `admin` (empresa) · `coordinador` · `asesor`.
El **cliente final / prospecto** es una entidad de datos, no un usuario del panel.

## 🤖 Desarrollo con Claude Code (Spec-Driven Development)

El repo está preparado para construirse con **Claude Code** siguiendo SDD. Cada feature se
implementa desde su `spec.md → plan.md → tasks.md`. Ver `CLAUDE_CODE_KICKOFF.md` y el ejemplo en
`docs/specs/INF-02-tenant-middleware/`.

## 📄 Documentación

Toda la documentación vive en [`docs/`](docs/). Empieza por
[`docs/product.md`](docs/product.md) (especificaciones generales) y
[`docs/architecture.md`](docs/architecture.md).

## Licencia

Proyecto privado / propietario. Todos los derechos reservados.
Proyecto privado / propietario. Todos los derechos reservados.

