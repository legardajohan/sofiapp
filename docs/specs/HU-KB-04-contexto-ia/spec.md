# HU-KB-04 — Trazabilidad de fuentes y contexto de respuestas de IA (spec)

> **Spec-Driven Development.** Este es el QUÉ y el porqué. El CÓMO va en `plan.md`; la ejecución
> en `tasks.md`. HU-KB-03 cerró el ciclo de invalidación de caché (`kbVersion`); HU-KB-04 abre el
> ciclo de auditoría: hoy nadie puede ver qué prompt ni qué conocimiento sustentó una respuesta
> concreta de la IA — esta HU lo hace posible sin tocar cómo se genera esa respuesta.

**Estado:** implementado

## Historia

> Como **empresa** quiero **conocer qué configuración de contexto (texto) utiliza la IA para
> responder** para poder **auditar, depurar y explicar por qué la IA contestó lo que contestó a
> un cliente concreto.**

## Objetivo técnico

Dar trazabilidad de qué fragmentos de la KB y qué prompt de sistema fundamentaron una respuesta
de `AIService.chat()`, persistiendo esa información de forma asíncrona (sin alterar el flujo de
generación) y exponiéndola vía `GET /api/ai/responses/:id/context`, con una vista admin de
"Fuentes / Contexto" para inspeccionarla.

## Corrección de contexto previo

El enunciado original de esta HU asumía que **HU-KB-03 seguía pendiente de merge** desde
`feat/HU-KB-02`. Verificado contra el repo: **HU-KB-03 ya está mergeado a `develop`** (PR #30,
commit `9d5a942`) — `Tenant.kbVersion` existe, se bumpea en `kb.service.ts` y ya forma parte de la
cache key de `AIService.chat()`. No hay rama `feat/HU-KB-02`/`feat/HU-KB-03` con trabajo
pendiente. Esta HU parte de `develop` en limpio.

## Alcance

### Incluye

- Nueva colección `AiResponseContext` (satélite 1:1 de `AiUsageLog`, sin TTL) que guarda, por
  cada llamada a `AIService.chat()`: el snapshot del prompt de sistema vigente, `kbVersion` del
  tenant en ese momento y los `retrievedChunks` (hoy siempre `[]` — ver "Estado pre-RAG" abajo).
- Instrumentación mínima de `AIService.chat()` (`apps/backend/src/services/ai/ai.service.ts`):
  pre-generar el `_id` de `AiUsageLog` y escribir `AiResponseContext` fire-and-forget, en los tres
  caminos de retorno (cache hit, FAQ hit, generación real), sin cambiar la respuesta ni la firma
  de `AiResult<string>`.
- Nuevo feature HTTP `apps/backend/src/features/ai/` (patrón de 6 archivos) con dos endpoints:
  `GET /api/ai/responses` (listado paginado, necesario porque hoy no existe ninguna forma de
  encontrar qué `:id` inspeccionar — `AiUsageLog` no está vinculado a ninguna conversación/lead) y
  `GET /api/ai/responses/:id/context` (detalle).
- Vista frontend "Fuentes / Contexto" en `/settings/knowledge/context`, accesible desde la zona
  admin de Knowledge Base: lista de respuestas + detalle (chunks, prompt vigente, metadatos).
- Fichas nuevas de `AiUsageLog` y `AiResponseContext` en `docs/data-model.md` (hoy `AiUsageLog` no
  está documentado ahí).
- Deuda UI (incluida, no como feature aparte): reemplazar los 4 `window.confirm()` por
  `AlertDialog` de shadcn en `FaqTable.tsx`, `KnowledgeDocumentTable.tsx`, `AdminPlansPage.tsx` y
  `AdminTenantsPage.tsx`.

### Fuera de alcance

- **Conectar `searchKnowledge()` (RAG) dentro de `chat()`.** Sigue siendo Fase 3 (documentado
  desde `HU-KB-02`/`HU-KB-03`). Esta HU deja el lugar donde los chunks se guardarían ya construido
  y probado, pero `retrievedChunks` se persiste vacío hasta que Fase 3 conecte el retrieval real.
- Vincular `AiUsageLog`/`AiResponseContext` a una conversación, lead o mensaje concreto — ese
  vínculo no existe hoy en el modelo y añadirlo es un cambio de esquema mayor fuera del pedido
  original (**parámetros a registrar: solo los que existen hoy**). La lista/detalle de esta HU es
  un log plano filtrable por método y fecha, no navegable desde una conversación.
- Política de retención/expiración de `AiResponseContext` más allá de "sin TTL por ahora". Queda
  documentada como riesgo (ver `plan.md` → Notas) para una HU futura de compliance/retención.
- Cambiar el TTL de 90 días de `AiUsageLog` — sigue siendo el ciclo de vida de las métricas
  operativas, no de la auditoría.

## Criterios de aceptación

1. `GET /api/ai/responses/:id/context` para una respuesta `chat` devuelve `retrievedChunks` (los
   almacenados en `AiResponseContext`, `[]` hoy). Un test con fixture que pobla `retrievedChunks`
   directamente en el modelo prueba que el endpoint los transporta sin alterarlos (demuestra el AC
   sin depender de que `chat()` haga RAG en producción).
2. El mismo endpoint devuelve `promptSnapshot` con `{ method, version, systemPrompt }` de la
   plantilla que estaba vigente **en el momento de la generación**, no la plantilla activa actual
   si esta cambió después.
3. Cada llamada a `AIService.chat()` — hit de caché exacta, hit de FAQ o generación real —
   persiste su `AiResponseContext` correspondiente, sin excepción, de forma asíncrona
   (fire-and-forget) y sin bloquear ni retrasar perceptiblemente la respuesta al llamador.
4. `chat()` devuelve exactamente el mismo `AiResult<string>` (misma forma, mismos valores) que
   antes de esta HU; los tests existentes de `ai.service.test.ts` sobre `data`/`cacheHit`/
   `fromFaq`/tokens no cambian su aserción.
5. `AiResponseContext` no lleva índice TTL: sus documentos no se autoeliminan a los 90 días como
   `AiUsageLog`.
6. `GET /api/ai/responses` lista, paginado (`?page&limit`, forma `{data,page,limit,total}`) y
   scoped al tenant del token, las entradas de `AiUsageLog`; acepta filtro opcional `?method=`.
7. `GET /api/ai/responses/:id/context` devuelve `404` si el `id` no existe o pertenece a otro
   tenant (nunca `403` — no debe confirmar la existencia de un recurso ajeno).
8. Si el `AiUsageLog` existe pero no tiene `AiResponseContext` asociado (registros previos a esta
   HU), el endpoint devuelve `200` con `contextAvailable: false`, `promptSnapshot: null`,
   `retrievedChunks: []` — nunca `404` (la respuesta sí existió).
9. Ambos endpoints exigen la cadena `authenticateJWT → requireTenant → authorize(['admin']) →
   validate → asyncHandler`; un usuario autenticado sin rol `admin` recibe `403`.
10. **Aislamiento multi-tenant:** un `AiUsageLog`/`AiResponseContext` creado para el tenant A no es
    accesible, listable ni visible desde el tenant B, en un test explícito de aislamiento.
11. La vista "Fuentes / Contexto" (`/settings/knowledge/context`, solo `admin`) muestra la lista y,
    al seleccionar una fila, el detalle (chunks, prompt, metadatos), con un estado vacío explícito
    cuando `contextAvailable: false`; terminada en light y dark con tokens semánticos.
12. Los 4 `window.confirm()` de `FaqTable.tsx`, `KnowledgeDocumentTable.tsx`,
    `AdminPlansPage.tsx` y `AdminTenantsPage.tsx` quedan reemplazados por `AlertDialog` de shadcn,
    sin cambiar el comportamiento de las mutaciones que disparan.
13. `pnpm --filter backend typecheck` (`tsc --noEmit`) en verde.
14. `pnpm --filter backend test` en verde, incluyendo los tests nuevos de este criterio.
15. `pnpm --filter frontend build` y `pnpm --filter frontend lint` en verde.

## Endpoints

| Método | Ruta | Rol | Descripción |
|---|---|---|---|
| GET | `/api/ai/responses` | admin | Lista paginada de `AiUsageLog` del tenant (`?page&limit&method`). |
| GET | `/api/ai/responses/:id/context` | admin | Trazabilidad: prompt vigente, `kbVersion`, chunks recuperados y metadatos de la respuesta `:id`. |

## Dependencias

- **HU-KB-03** (`Tenant.kbVersion`, ya implementado y mergeado a `develop`) — el snapshot de
  contexto incluye el `kbVersion` que esa HU introdujo.
- **HT-AI-01** (`AIService`, caché exacta de Redis, `PromptTemplate`) — base sobre la que se
  instrumenta `chat()`.
- **Bloqueada por (no bloqueante para cerrar esta HU):** la HU de Fase 3 que conecte
  `searchKnowledge()` dentro de `chat()` es la que hará que `retrievedChunks` deje de estar vacío
  en producción.

## Definición de "hecho"

Para cualquier respuesta `chat` generada después de esta HU, un admin puede abrir "Fuentes /
Contexto", encontrarla en la lista y ver exactamente qué prompt de sistema y qué `kbVersion`
estaban vigentes al generarla — auditable incluso si el prompt activo cambió después. Los chunks
recuperados están listos para poblarse en cuanto Fase 3 conecte el RAG real, sin requerir cambios
en el modelo, el endpoint ni la vista. `chat()` no cambió su comportamiento observable.
