# HU-OMNI-03 — Tasks (checklist ejecutable)

> Claude Code: ejecuta en orden, marca cada casilla al completarla. Sigue el patrón de 6 archivos
> (`types → model → validation → service → controller → routes` + montaje) de `apps/backend/CLAUDE.md`
> y respeta el aislamiento multi-tenant (`docs/multi-tenancy.md`). La rama `feat/HU-OMNI-03` se crea
> desde `develop` al iniciar `/sdd-implement`.

## Implementación — Backend

### Capa IA (base del resumen)
- [x] `services/ai/ai-service.types.ts`: añadir `AiSummarizeParams { tenantId: Types.ObjectId; historial: ChatTurn[] }`.
- [x] `services/ai/ai.service.ts`: método `summarize(params): Promise<AiResult<string>>` (resuelve
      plantilla `'summary'`, reusa `provider.generateReply`, `logUsage`, sin cache Redis).
- [x] `services/ai/ai-service.singleton.ts` (NUEVO): `getAIService()` con ioredis lazy singleton
      (patrón de `realtime.publisher.ts`) que envuelve `createAIService(redis)`.
- [x] `scripts/seed-prompt-templates.ts`: añadir plantilla global `method:'summary'` (`tenantId:null`,
      `version '1.0.0'`, `isActive:true`) con el `systemPrompt` de resumen en español.

### Feature `cliente` — historial (rellena placeholders)
- [x] `cliente.types.ts`: `IResumenIA`, `IResumenResponse`, `IContactCardResponse`, `IContactHistoryResponse`.
- [x] `cliente.model.ts`: subdoc opcional `resumenIA { texto, generadoAt, mensajesHasta, modelo }` (`_id:false`).
- [x] `cliente.validation.ts`: `historyValidation` (`{ params:{id}, query:{page,limit} }`) + tipo `HistoryQuery`.
- [x] `cliente.service.ts`: `getContactHistory(tenantId, clienteId, query)` (404 si no existe; mensajes
      paginados tenant-safe como `getThread`; `desactualizado` derivado; DTOs vía `conversation.mapper`).
- [x] `cliente.controller.ts`: `getContactHistoryController` (delgado; `tenantId` del token).
- [x] `cliente.routes.ts`: `GET /:id/history` con la cadena de middlewares fija. **Roles:** se usa
      `authorize(['coordinador', 'asesor'])` (los mismos que la bandeja en esta rama base `develop`),
      no `admin`, para que la ficha sea alcanzable desde la conversación que la origina.

### Feature `conversation` — resumen
- [x] `conversation.validation.ts`: `summaryValidation` (`{ params:{id} }`).
- [x] `conversation.service.ts`: `generateConversationSummary(tenantId, clienteId)` (404; transcript
      `ChatTurn[]`; 422 si no hay mensajes; `getAIService().summarize`; persiste `resumenIA` con
      `findOneAndUpdateScoped`; devuelve `IResumenResponse`).
- [x] `conversation.controller.ts`: `generateSummaryController`.
- [x] `conversation.routes.ts`: `POST /:id/summary` con la cadena de middlewares fija.

### Montaje
- [x] `app.ts`: sin cambios (verificar que `/api/clientes` y `/api/conversations` sigan montados).

## Implementación — Frontend (`apps/frontend/src/features/inbox/`)
- [x] `types.ts`: `ContactHistoryDTO`, `ContactCardDTO`, `ResumenDTO`.
- [x] `api.ts`: `fetchContactHistory(clienteId, page)`, `generateSummary(clienteId)` (vía `apiClient`).
- [x] `useInboxStore.ts`: `contactPanelOpen` + `setContactPanelOpen` (solo estado UI).
- [x] `hooks/useContactHistory.ts` (NUEVO): `useQuery(['contact-history', clienteId])` gated por `enabled`.
- [x] `hooks/useGenerateSummary.ts` (NUEVO): `useMutation` → invalida `['contact-history', clienteId]`.
- [x] `hooks/useInboxRealtime.ts`: en `message:new` del cliente activo, invalidar `['contact-history', id]`.
- [x] `components/ContactCard.tsx` (NUEVO): ficha del contacto.
- [x] `components/ContactSummaryCard.tsx` (NUEVO): resumen + botón "Generar/Actualizar" + badge
      "desactualizado" + `skeleton` en carga + estado vacío/error.
- [x] `components/ContactPanel.tsx` (NUEVO): drawer con `@/components/ui/sheet` que compone card + historial + resumen.
- [x] `pages/InboxPage.tsx`: disparador del panel en el header de la conversación activa.
- [x] Diseño: aplicar *emil-design-eng* + *frontend-design*; solo tokens semánticos; imports `.js`.

## Tests (Vitest)
- [x] `cliente.service.test.ts` — **aislamiento**: `getContactHistory` de un `clienteId` del tenant A
      llamado con tenant B lanza 404; el historial nunca incluye mensajes de otro tenant.
- [x] `cliente.service.test.ts` — casos: ficha correcta; `resumen: null` sin resumen; `desactualizado:true`
      cuando `ultimoMensajeAt > mensajesHasta`; paginación de mensajes (orden ascendente).
- [x] `conversation.summary.test.ts` — **aislamiento**: resumir un `clienteId` del tenant A con tenant B
      lanza 404 y no persiste nada en el cliente ajeno.
- [x] `conversation.summary.test.ts` — casos: transcript mapea `user→user` y `bot|agent→model`;
      `AppError(422)` sin mensajes de texto; persiste `resumenIA` y devuelve `desactualizado:false`
      (con `AIService` mockeado; sin llamada real a Gemini).
- [ ] Frontend: `ContactSummaryCard.test.tsx` — **diferido**: la rama base `develop` no tiene harness
      de tests en `apps/frontend` (ni script `test` ni Vitest configurado). Se añadirá cuando exista
      la infraestructura; la lógica de negocio queda cubierta por los tests de backend.

## Verificación final
- [x] `pnpm --filter backend typecheck` (`tsc --noEmit`) en verde.
- [x] `pnpm --filter backend test` en verde (incluye ambos tests de aislamiento).
- [x] `pnpm --filter frontend build && pnpm --filter frontend lint` sin errores.
- [x] Checklist de PR de `docs/multi-tenancy.md` §9 completo (todas las queries vía `*Scoped`,
      `tenantId` del token, sin `Model.find/create/findById` directos).
- [ ] Prueba manual E2E: abrir panel desde una conversación → generar resumen → llega entrante nuevo →
      badge "desactualizado" → regenerar limpia la marca. **Pendiente**: requiere Mongo + Redis + una
      `GEMINI_API_KEY` real; ejecutar antes del release (`/sdd-release`).
- [x] `git status` sin `*.png`/`*.jpg` de verificación coladas antes del commit.

## Definición de "hecho"

El Administrador abre la ficha del contacto desde una conversación, ve su historial completo y genera
o actualiza un resumen que refleja fielmente la conversación; el resumen se marca desactualizado al
llegar mensajes nuevos y se regenera bajo demanda. Todo pasa por el repositorio tenant-safe con
`tenantId` del token, con typecheck, tests (incl. aislamiento) y build/lint del frontend en verde.
