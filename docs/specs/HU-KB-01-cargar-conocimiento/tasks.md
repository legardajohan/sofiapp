# HU-KB-01 — Tasks (checklist ejecutable)

> Claude Code: ejecuta en orden. Marca cada casilla al terminar. No cierres el feature hasta que
> TODO esté en verde. Antes de empezar, `/sdd-implement` crea la rama `feat/HU-KB-01` desde `develop`.

## 0. Configuración previa
- [x] `config/env.ts`: añadir `GEMINI_EMBED_MODEL`, `KB_EMBED_DIM`, `KB_CHUNK_SIZE`,
      `KB_CHUNK_OVERLAP`, `KB_VECTOR_INDEX`, `KB_RETRIEVAL_K` (con defaults del plan).
- [~] `.env.example`: reflejar las nuevas vars. _(bloqueado: el archivo está fuera de los permisos
      de escritura de esta sesión; documentar manualmente. Las vars tienen default en `env.ts`.)_
- [x] `config/queues.ts`: `KB_INDEX_QUEUE_NAME = 'kb-index'` + `export const kbIndexQueue`.

## 1. Capa de embeddings (integración LLM)
- [x] `integrations/llm/llm-provider.types.ts`: añadir `EmbedTaskType` y `embedTexts(...)` a `ILlmProvider`.
- [x] `integrations/llm/gemini.provider.ts`: implementar `embedTexts` con `batchEmbedContents`
      (`env.GEMINI_EMBED_MODEL`), reusando `callWithRetry`.
      _Validación E2E: `text-embedding-004` no existe en el v1beta del SDK con esta API key →
      corregido a `gemini-embedding-001` con `outputDimensionality = KB_EMBED_DIM` (768)._

## 2. Feature backend `features/kb/` (orden del patrón de 6 archivos)
- [x] `kb.types.ts` — enums, `IKbDocument(+Document)`, `IKbChunk(+Document)`, DTOs, `IKbDocumentResponse`, `KbIndexJobData`.
- [x] `kb-document.model.ts` — schema + `tenantId` req/index + `{ tenantId, createdAt }`, `{ tenantId, titulo }` unique, `{ timestamps: true }`.
- [x] `kb-chunk.model.ts` — schema + `tenantId` req/index + `embedding:[Number]` + `{ tenantId, documentId, version }`.
- [x] `kb.validation.ts` — Zod para `createDocumentSchema` (titulo/contenido no vacíos, límites) y `listDocumentsSchema` (page/limit).
- [x] `kb.chunker.ts` — `chunkText(texto, size, overlap): string[]` (pura).
- [x] `kb.repository.ts` — `vectorSearchScoped` con `filter { tenantId }` **siempre** + `$match` defensivo + `$project` sin `embedding` (`buildVectorSearchPipeline` testeable).
- [x] `kb.service.ts` — `createDocument` (asigna/incrementa version, `createScoped`, encola job) y `listDocuments` (paginado, `findScoped` + `countScoped`).
- [x] `kb.retrieval.service.ts` — `searchKnowledge(tenantId, query, k)` (embed query + `vectorSearchScoped`; provider inyectable).
- [x] `kb.controller.ts` — `createDocumentController`, `listDocumentsController` (delgados; `tenantId` del token).
- [x] `kb.routes.ts` — `POST /documents`, `GET /documents` con la cadena de middlewares fija (`authorize(['admin'])`).
- [x] Montar en `app.ts`: `app.use('/api/kb', kbRoutes)`.
- [x] `base.repository.ts` — añadidos `deleteManyScoped` y `countScoped` (helpers tenant-safe reutilizables).

## 3. Worker de indexación
- [x] `workers/kb-index.processor.ts` — `processKbIndexJob`: guard idempotente/versión → `procesando` → chunk → `embedTexts` → reemplazo `deleteManyScoped` + `createScoped` de chunks → `indexado`/`fallido`.
- [x] `worker.ts` — instanciar el Worker `kb-index` y engancharlo a los listeners `failed`.

## 4. Índice vectorial de Atlas
- [x] `scripts/create-kb-vector-index.ts` — `KbChunk.createSearchIndex(...)` idempotente con `tenantId` y `version` como `filter` y `embedding` (`numDimensions = KB_EMBED_DIM`, `cosine`).
- [x] Pasos manuales equivalentes documentados en el encabezado del script y en `data-model.md`.

## 5. Frontend `features/knowledge-base/`
- [~] Diseño con el **MCP de Stitch**: _no disponible en esta sesión (auth del MCP:
      "does not support dynamic client registration"). Se construyó con el design system existente
      (tokens de INF-03), reutilizando los idiomas de `ChannelConfigPage` para mantener consistencia._
- [x] `types/{domain.ts,api.ts,index.ts}` — `EstadoIndexacion`, `IKbDocument`, payloads/response.
- [x] `api/knowledge-base.ts` — `createKbDocument`, `getKbDocuments` vía `apiClient` (cookie httpOnly + CSRF ya en el cliente).
- [x] `components/IndexingStatusBadge.tsx` — badge por estado (con pulso en `procesando`).
- [x] `components/KnowledgeUploadEditor.tsx` — título + textarea + submit; `useMutation` → invalida `['kb','documents']`.
- [x] `components/KnowledgeDocumentTable.tsx` — tabla con estado; `useQuery` con `refetchInterval` mientras haya `pendiente|procesando`.
- [x] `pages/KnowledgeBasePage.tsx` — compone editor + tabla.
- [x] Registrar ruta `/settings/knowledge` con guard `RequireRole(['admin'])` en `router.tsx`.
      _(No hay componente de navegación global compartido — igual que `channels`; ruta directa por URL.)_

## 6. Documentación
- [x] `docs/data-model.md` — añadidos `kb_documents` y `kb_chunks` (con índices y nota del índice vectorial Atlas).

## 7. Tests (Vitest)
- [x] `kb.chunker.test.ts` — respeta `size`/`overlap`; texto corto → 1 chunk; sin pérdida de contenido; solape correcto.
- [x] `kb.repository.test.ts` (**aislamiento / contrato del builder**):
  - [x] el `$vectorSearch` construido incluye `filter.tenantId` igual al argumento (string → ObjectId).
  - [x] hay `$match { tenantId }` posterior y `embedding` excluido del `$project`.
- [x] `kb.service.test.ts` (**aislamiento**):
  - [x] `listDocuments` de `tenantB` no ve documentos de `tenantA`.
  - [x] `createDocument` persiste con `tenantId` del argumento y encola el job con `{tenantId, documentId, version}`; re-subida incrementa versión.
- [x] `kb-index.processor.test.ts` — provider mock: trocea+embeds+persiste chunks scoped; reindex reemplaza (no duplica); versión obsoleta → skip; error → `fallido`; aislamiento A/B.
- [x] `kb.routes.test.ts` (Supertest) — 401 sin JWT; 403 rol no-admin; `GET` solo devuelve los del tenant; `POST` → `201` con `estadoIndexacion: 'pendiente'`; contenido vacío → 400.
- [x] `gemini.provider.test.ts` — `embedTexts`: lista vacía → sin llamada; un vector por texto.

## 8. Verificación final
- [x] `pnpm --filter @sofiapp/api typecheck` sin errores.
- [x] `pnpm --filter @sofiapp/api test` en verde (incluye aislamiento + contrato del builder).
- [x] `pnpm --filter @sofiapp/web build && lint` en verde.
- [x] Checklist de PR de `docs/multi-tenancy.md` §9 revisado (foco: `$vectorSearch` con `tenantId`).
- [x] **Manual (DoD, contra Atlas):** VALIDADO el 2026-07-08 contra Atlas real. Flujo: `POST /kb/documents`
      → worker indexó (`indexado`, chunkCount 1) → índice `kb_chunks_vector` READY →
      `kb-smoke-retrieval.ts "¿cuánto cuesta el plan pro?"` devolvió el fragmento del plan Pro
      (score 0.8832). Aislamiento confirmado (tenant distinto → 0 resultados).

## Definición de "hecho"

El Administrador carga texto, la plataforma confirma su indexación y el contenido queda recuperable
como contexto relevante vía `searchKnowledge` (RAG), **aislado por tenant** tanto en las colecciones
como en el `$vectorSearch`. HU-IA-01/02 pueden construirse encima consumiendo `searchKnowledge`.
