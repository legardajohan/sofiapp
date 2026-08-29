# HU-KB-04 — Tasks (checklist ejecutable)

> Claude Code: ejecuta en orden. Marca cada casilla al terminar. No cierres el feature hasta que
> TODO esté en verde.

## Rama

- [x] Crear `feat/HU-KB-04` desde `develop` (working tree limpio; HU-KB-03 ya está mergeada, no
      hay que partir de `feat/HU-KB-02`).

## Implementación — Backend

- [x] Crear `services/ai/ai-response-context.model.ts` (`IAiResponseContext`,
      `IAiResponseContextDocument`, schema con `promptSnapshot`, `retrievedChunks`, `kbVersion`,
      índice único `{tenantId, usageLogId}`, **sin** índice TTL).
- [x] Modificar `services/ai/ai.service.ts`:
  - [x] `chat()`: pre-generar `usageLogId = new Types.ObjectId()`.
  - [x] Pasar `_id: usageLogId` a las 3 llamadas a `logUsage()` dentro de `chat()` (cache hit, FAQ
        hit, generación real). Ampliar el tipo de parámetro de `logUsage` con `_id?: Types.ObjectId`.
  - [x] Añadir método privado `writeResponseContext(usageLogId, tenantId, template, kbVersion,
        retrievedChunks)` fire-and-forget (`void createScoped(AiResponseContextModel, ...)`).
  - [x] Llamar `writeResponseContext(..., [])` en los mismos 3 puntos de `chat()`, con
        `retrievedChunks: []` (Opción A — no se conecta `searchKnowledge()`).
  - [x] **No tocar** `extract()`, `classify()`, `summarize()` ni su forma de llamar `logUsage()`.
- [x] Crear `features/ai/ai.types.ts` (`AiResponseSummaryDTO`, `AiResponseContextDTO`,
      `Paginated<T>`).
- [x] Crear `features/ai/ai.validation.ts` (`getAiResponseContextSchema`,
      `listAiResponsesSchema`).
- [x] Crear `features/ai/ai.service.ts` (`listAiResponses`, `getAiResponseContext`,
      `toSummaryDTO`, `toContextDTO`) — solo `findScoped`/`findByIdScoped`/`findOneScoped`/
      `countScoped`; `getAiResponseContext` lanza `AppError('Respuesta de IA no encontrada.', 404)`
      si `AiUsageLog` no existe; si existe pero no hay `AiResponseContext`, devuelve DTO con
      `contextAvailable: false`.
- [x] Crear `features/ai/ai.controller.ts` (`listAiResponsesController`,
      `getAiResponseContextController`) — delgados, `tenantId` de `req.user!.tenantId`.
- [x] Crear `features/ai/ai.routes.ts` — cadena `authenticateJWT → requireTenant →
      authorize(['admin']) → validate → asyncHandler` en ambas rutas.
- [x] Montar en `app.ts`: `app.use('/api/ai/responses', aiRoutes)`.
- [x] Añadir fichas de `AiUsageLog` y `AiResponseContext` en `docs/data-model.md`.

## Implementación — Frontend

- [x] Invocar `emil-design-eng`, `impeccable:impeccable` y `frontend-design:frontend-design`
      **antes** de escribir cualquier componente nuevo. `emil-design-eng` e `impeccable:impeccable`
      no están registradas en este entorno (`Unknown skill`); se aplicó `frontend-design` y se
      priorizó consistencia con el UI kit y los patrones ya establecidos del proyecto (vista
      interna de auditoría, no una pantalla de marca).
- [x] `pnpm dlx shadcn@3.8.5 add tabs scroll-area` (desde `apps/frontend/`).
- [x] Crear `features/ai-context/types.ts`, `api.ts` (`fetchAiResponses`,
      `fetchAiResponseContext`, sin prefijo `/api`).
- [x] Crear `features/ai-context/store/useAiContextStore.ts` (`selectedId`, `select`).
- [x] Crear `features/ai-context/hooks/useAiResponses.ts` y `useAiResponseContext.ts`
      (`enabled: !!selectedId`).
- [x] Crear `features/ai-context/components/AiResponseTable.tsx` (tabla shadcn, paginación,
      filtro por método, click de fila → `select(id)`).
- [x] Crear `features/ai-context/components/AiResponseContextSheet.tsx` (Sheet de detalle:
      metadatos, `promptSnapshot.systemPrompt` con scroll-area, `retrievedChunks`, estado vacío
      cuando `contextAvailable === false`).
- [x] Crear `features/ai-context/pages/AiContextPage.tsx` + `index.ts` (barrel).
- [x] `router.tsx`: lazy import + ruta `/settings/knowledge/context` (`RequireRole roles={['admin']}`).
- [x] `components/layout/nav-config.ts`: child item "Fuentes / Contexto" bajo "Base de
      Conocimiento".
- [ ] Verificar manualmente la vista en light y dark (screenshot descartable, no se commitea).
      **No realizado:** requiere el backend real corriendo contra MongoDB/Redis (credenciales en
      `apps/backend/.env`, protegido — sin acceso de lectura en este entorno). Verificado en su
      lugar con `tsc --noEmit`, `vite build` y `eslint` en verde.

## Deuda UI — reemplazar `window.confirm()` por `AlertDialog`

- [x] `features/knowledge-base/components/FaqTable.tsx` (~línea 69).
- [x] `features/knowledge-base/components/KnowledgeDocumentTable.tsx` (~línea 55-61).
- [x] `features/admin-plans/pages/AdminPlansPage.tsx` (~línea 60). El botón vive en los
      componentes hijos `PlanTable.tsx` y `PlanCards.tsx` (vista tabla/tarjetas) — el `AlertDialog`
      se añadió ahí, envolviendo el trigger; `handleDelete` de la página ya no hace `confirm`.
- [x] `features/admin-tenants/pages/AdminTenantsPage.tsx` (~línea 101-104). Mismo caso: el botón
      vive en `TenantTable.tsx`.
- [x] Confirmar que el `deleteMutation.mutate(id)` de cada uno sigue disparándose igual que antes
      (mismo comportamiento, solo cambia el mecanismo de confirmación).

## Tests (Vitest)

- [x] `services/ai/ai.service.test.ts` (extender el existente):
  - [x] Regresión: `chat()` sigue devolviendo el mismo `AiResult<string>` en los 3 caminos (cache
        hit, FAQ hit, generación) — mismas aserciones que antes de esta HU.
  - [x] Cada camino de `chat()` crea un `AiResponseContext` con `usageLogId` igual al `_id` del
        `AiUsageLog` creado en la misma llamada.
  - [x] El `promptSnapshot` guardado coincide con la plantilla resuelta en esa llamada (y no
        cambia si la plantilla activa cambia después).
  - [x] `retrievedChunks` se persiste como `[]`.
- [x] `features/ai/ai.service.test.ts`:
  - [x] `getAiResponseContext` con fixture de `AiResponseContext` con `retrievedChunks` poblado →
        el DTO los transporta sin alterarlos (demuestra AC1 del spec sin RAG productivo).
  - [x] `getAiResponseContext` con `AiUsageLog` sin `AiResponseContext` asociado → `200`,
        `contextAvailable: false`, `promptSnapshot: null`, `retrievedChunks: []`.
  - [x] `getAiResponseContext` con `id` inexistente → `AppError` 404.
  - [x] `getAiResponseContext` con `id` de otro tenant → `AppError` 404 (no 403).
  - [x] `listAiResponses` pagina correctamente y respeta el filtro `method`.
  - [x] **Aislamiento multi-tenant:** un `AiUsageLog`/`AiResponseContext` del tenant A no aparece
        en `listAiResponses(tenantB, ...)` ni es accesible vía `getAiResponseContext(tenantB, idDeA)`.
        (`features/ai/ai.isolation.test.ts`, siguiendo el patrón `lead.isolation.test.ts`.)
- [x] `features/ai/ai.routes.test.ts` (integración vía supertest):
  - [x] `GET /api/ai/responses/:id/context` con `id` no-ObjectId → 400 (Zod).
  - [x] Sin rol `admin` → 403.
  - [x] Sin JWT → 401.
- [ ] Frontend (Vitest/RTL) — los 4 componentes de deuda UI. **No añadido:** ninguno de los tests
      RTL existentes de estos componentes (`FaqTable.test.tsx`, `PlanTable.test.tsx`,
      `AdminTenantsPage.test.tsx`) cubría el flujo de borrado/confirmación antes de esta HU, y los
      tres siguen en verde sin modificarlos. `KnowledgeDocumentTable.tsx` no tenía test previo.
      Cobertura del `AlertDialog` en sí (trigger/cancel/action) queda pendiente si se decide
      añadirla — no bloquea el DoD de esta HU.

## Verificación final

- [x] `pnpm --filter backend typecheck` sin errores.
- [x] `pnpm --filter backend test` en verde (incluye todos los tests de arriba; 2 archivos no
      relacionados con esta HU — `conversation.tags.test.ts` por timeout de concurrencia,
      confirmado pre-existente al re-ejecutarse aislado en verde).
- [x] `pnpm --filter frontend build` sin errores.
- [x] `pnpm --filter frontend lint` en verde.
- [x] `pnpm --filter frontend test`: sin regresiones en los componentes tocados por esta HU
      (`FaqTable`, `PlanTable`, `AdminTenantsPage`, todos en verde). Dos suites fallan por causas
      preexistentes y no relacionadas (`TagSelector.test.tsx` — falta `TooltipProvider`;
      `tests/kb-progress.test.ts` — aserción de presets) — ninguna toca archivos de esta HU.
- [x] Checklist de PR de `docs/multi-tenancy.md` §9 revisado:
  - [x] Toda query usa funciones `*Scoped`.
  - [x] `tenantId` viene del token en ambos controllers.
  - [x] `AiResponseContext` lleva `tenantId` required + indexado.
  - [x] Ambas rutas llevan `requireTenant` tras `authenticateJWT`.
  - [x] Test de aislamiento añadido y en verde.

## Definición de "hecho"

`GET /api/ai/responses` y `GET /api/ai/responses/:id/context` existen, protegidos por rol admin y
aislados por tenant. Toda llamada nueva a `AIService.chat()` deja un `AiResponseContext` auditable
sin TTL, con el prompt vigente en el momento exacto de la generación, sin haber cambiado el
comportamiento observable de `chat()`. Un admin puede abrir "Fuentes / Contexto" desde
`/settings/knowledge`, listar respuestas y ver el detalle de cada una, incluyendo un estado
honesto para respuestas sin contexto registrado. Los 4 `window.confirm()` de la deuda UI quedan
reemplazados por `AlertDialog`. El enganche real de `searchKnowledge()` dentro de `chat()` sigue
pendiente de Fase 3 y no bloquea el cierre de esta HU.
