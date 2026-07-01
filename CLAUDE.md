# CLAUDE.md — SofiApp

> Archivo de contexto raíz para Claude Code. Léelo **completo** al iniciar cualquier sesión
> en este repositorio. Es el índice maestro y la fuente de las reglas no negociables.

## Qué es SofiApp

**CRM SaaS multi-tenant** para cualquier entidad comercial (no solo Pre-ICFES): captación de prospectos, comunicación omnicanal con IA y cierre de ventas. Un solo despliegue para muchas empresas; cada tenant conecta su propia WhatsApp Business API (modelo BSP, tipo Mercately).

Aunque hoy opere con un cliente, **todo es multi-tenant desde el día 1** para no reescribir después.

## Stack (resumen — detalle en `docs/architecture.md`)

- **Backend:** Node.js 24 LTS · Express 5 · TypeScript 5.6 (`strict`) · Mongoose 8 · Zod 4 · JWT 9.
- **Cola/Async:** BullMQ + ioredis (Redis como **broker de colas**; la caché semántica NO va en el MVP).
- **Frontend:** React 19 · Vite · Zustand · TanStack Query · Tailwind (SPA), alojado en **Vercel**.
- **IA:** Gemini 1.5 Flash detrás de la interfaz `ILlmProvider` (proveedor intercambiable).
- **Infra:** Droplet DigitalOcean (backend + worker + Redis) · MongoDB Atlas · DO Spaces (media de chat).
- **Móvil (Fase 4):** React Native + Expo, para los asesores.

## Reglas NO negociables (severidad máxima)

1. **Aislamiento multi-tenant.** Toda consulta a Mongo pasa por el *tenant-safe repository*
   (`findScoped`, `createScoped`, …). NUNCA `Model.find/create/findById` directos.
   Ver `docs/multi-tenancy.md`. Una fuga de datos entre tenants es el peor fallo posible.
2. **`tenantId` siempre nace del token** (`req.user!.tenantId`), nunca del body/params/query.
   Excepciones documentadas y únicas: `login` y el **webhook de Meta** (resuelve tenant por
   `phone_number_id`). Ver `docs/integrations/meta-whatsapp.md`.
3. **Controllers delgados:** sin `try/catch`, sin lógica de negocio, sin acceso a Mongoose.
   La lógica vive en el `service`; los errores esperables se lanzan con `AppError(msg, code)`.
4. **Validación en el borde con Zod** (`{ body, params, query }`) antes del controller.
5. **TypeScript `strict`, prohibido `any`.** Tipos de retorno explícitos en funciones exportadas.
6. Webhooks de Meta responden **HTTP 200 inmediato** y delegan el trabajo pesado a BullMQ.

## Arquitectura en una frase

Monolito modular funcional con **Screaming Architecture** (organización por feature/dominio),
**dos procesos** (web HTTP + worker BullMQ) sobre el mismo código de dominio, aislamiento
multi-tenant concentrado en un único repositorio base.

## Mapa de documentación (orden de lectura sugerido)

| Archivo | Para qué |
|---|---|
| `docs/product.md` | **Especificaciones generales** del proyecto: visión, alcance, roles, módulos, fases. |
| `docs/architecture.md` | Arquitectura, stack con versiones, procesos web/worker, despliegue. |
| `docs/multi-tenancy.md` | Reglas de aislamiento, repositorio scoped, tests del invariante. |
| `docs/domain.md` | Glosario, entidades, estados y transiciones del dominio. |
| `docs/data-model.md` | Esquemas Mongo (fuente de verdad de datos). |
| `docs/api-contract.md` | Convenciones REST, errores, paginación, auth. |
| `docs/integrations/meta-whatsapp.md` | Webhook, Embedded Signup, plantillas HSM, rate limits. |
| `docs/integrations/llm-provider.md` | Interfaz `ILlmProvider`, Gemini, slot filling, scoring. |
| `apps/backend/CLAUDE.md` | Reglas y patrón de feature del backend (6 archivos + montaje en `app.ts`). |
| `apps/frontend/CLAUDE.md` | Reglas del frontend (apiClient único, Zustand, guards de rol). |
| `docs/adr/` | Decisiones de arquitectura registradas (ADR). |
| `docs/specs/<ID>/` | Spec-Driven: `spec.md` → `plan.md` → `tasks.md` por feature. |

## Flujo de trabajo Spec-Driven Development (SDD)

Para cada feature del backlog (IDs `INF-*`, `AUTH-*`, `SAAS-*`, `M0X-*`). Cada fase la **invoca el
usuario** con su skill; ninguna se dispara automáticamente:

1. **Planeación** — elige según la complejidad del feature:
   - `/sdd-spec <ID>-<slug> — <desc>` (**compleja**): genera la tríada `spec.md` (QUÉ) +
     `plan.md` (CÓMO) + `tasks.md` (checklist). Úsala cuando haya diseño que revisar.
   - `/sdd-spec-quick <ID>-<slug> — <desc>` (**sencilla**): un solo `spec.md` con las tasks
     embebidas, para features mecánicos/CRUD sin diseño.
   - Ambas **solo planean** (no escriben código) y se detienen a esperar tu aprobación.
2. **Implementación** — `/sdd-implement <ID>-<slug>`: crea la rama `feat/<ID>` y ejecuta las tasks.
3. **Release** — `/sdd-release <ID>-<slug>`: revisión vs criterios, semver, CHANGELOG, tag y merge.

Disciplina: **un feature a la vez**, en orden de dependencias, validando `tsc --noEmit` y los tests
de aislamiento antes de cerrar cada uno. Ejemplo de tríada completa en
`docs/specs/INF-02-tenant-middleware/`.

Cada `spec.md` lleva una línea `**Estado:** creado|implementado|liberado`, que cada skill
actualiza al cerrar su fase (`/sdd-spec(-quick)` → `creado`, `/sdd-implement` → `implementado`,
`/sdd-release` → `liberado`). Sirve para ver de un vistazo en qué punto va cada feature sin abrir
`tasks.md` ni revisar git.

## Comandos de calidad

- Backend: `pnpm --filter backend typecheck` (`tsc --noEmit`) · `pnpm --filter backend test`
- Frontend: `pnpm --filter frontend build && pnpm --filter frontend lint`
