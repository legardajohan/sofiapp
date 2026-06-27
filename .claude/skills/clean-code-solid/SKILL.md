---
name: clean-code-solid
description: Aplica Clean Code y SOLID adaptados al monolito modular funcional de SofiApp (apps/backend y apps/frontend). Úsala al implementar, refactorizar, revisar estructura o cuando un archivo/función crezca demasiado. Garantiza capas delgadas, responsabilidad única, dependencias hacia abstracciones y nombres por intención.
---

# Clean Code & SOLID (estilo funcional)

SofiApp = **Screaming Architecture** (organización por feature) + **funcional** (sin clases en controllers/services). SOLID aplica a módulos y funciones. Reglas por app en sus `CLAUDE.md`.

## SOLID adaptado
- **S** — Una cosa por capa: Controller = solo HTTP; Service = solo negocio; Model = solo persistencia; Componente = solo presentación (el fetching va en store/hook con TanStack Query).
- **O** — Extiende con nuevas funciones/helpers (`build<X>Query`, `mapXToResponse`), no tocando firmas estables.
- **L** — Los DTOs derivados (`Omit`/`Pick`) usables donde se espera el tipo base, sin sorpresas.
- **I** — Tipos pequeños y específicos (`Create<X>DTO`, `Update<X>DTO`), no un mega-tipo todo-opcional.
- **D** — Depende de abstracciones del proyecto: backend → `base.repository`, modelos, `ILlmProvider` (no Gemini directo); frontend → `apiClient` y stores. Nunca `fetch`/`axios` directo ni Mongoose en controllers.

## Clean Code
1. **Funciones pequeñas** (≤ ~40 líneas), un solo nivel de abstracción.
2. **Nombres por intención:** verbos en funciones (`changeEstadoComercial`), sustantivos en datos. Campos de dominio en **español**.
3. **Capas delgadas:** cero negocio en controllers/componentes; cero Mongoose fuera de services.
4. **Errores explícitos:** backend lanza `AppError(msg, statusCode)`; el `errorHandler` central traduce a HTTP. Controllers sin `try/catch`. Frontend muestra el error desde el store/query.
5. **Sin duplicación:** extrae helpers/hooks; reutiliza componentes.
6. **Co-localización por feature:** mantén el vertical slice junto. Nada de carpetas técnicas globales (`controllers/`, `services/` planos).
7. **Trabajo pesado fuera del hilo HTTP:** LLM, difusiones, envíos → BullMQ (worker).

## Multi-tenancy = calidad
Un service "limpio" que olvida filtrar por `tenantId` es un **defecto crítico**. Toda lectura/escritura va con el tenant del token vía `*Scoped`. Ver `multi-tenancy-guard`.

## Refactor
1. Identifica la responsabilidad que sobra. 2. Extrae a service/helper/hook/subcomponente con nombre por intención. 3. `pnpm --filter backend typecheck` o `frontend build && lint`. 4. Comportamiento externo igual y tests de aislamiento en verde.
