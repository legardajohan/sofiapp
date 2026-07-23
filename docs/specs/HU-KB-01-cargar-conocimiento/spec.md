# HU-KB-01 — Cargar texto para entrenar la IA (spec)

> **Spec-Driven Development.** Este es el QUÉ y el porqué. El CÓMO va en `plan.md`; la ejecución
> en `tasks.md`. Habilita el RAG (Retrieval-Augmented Generation) que consumirán HU-IA-01/02.

**Estado:** implementado

## Historia

> Como **Administrador** quiero **cargar texto para entrenar la IA** (información pertinente),
> para que ese contenido quede disponible como contexto en las respuestas automáticas.

## Objetivo

Ingerir contenido de texto por tenant, trocearlo (*chunking*), generar *embeddings* con Gemini e
indexarlo en `kb_chunks` sobre **MongoDB Atlas Vector Search**, de modo que sea recuperable como
contexto relevante (RAG) en una consulta. La ingesta pesada corre **fuera del hilo HTTP** en un
worker BullMQ; el endpoint confirma la recepción y expone el estado de indexación.

## Alcance

### Incluye
- Modelos `KbDocument` (metadatos + estado de indexación + **versión por tenant**) y `KbChunk`
  (fragmento + `embedding` + `documentId` + `version`), ambos `tenantId`-scoped.
- Endpoint `POST /api/kb/documents`: recibe `{ titulo, contenido }`, crea el `KbDocument` en estado
  `pendiente`, **encola** un job `kb-index` y responde de inmediato (no procesa inline).
- Endpoint `GET /api/kb/documents`: lista paginada de los documentos del tenant con su
  `estadoIndexacion`.
- Extensión de `ILlmProvider` con `embedTexts(...)` e implementación en `GeminiProvider`
  (`text-embedding-004`, batch), detrás de la interfaz intercambiable (`docs/integrations/llm-provider.md`).
- Utilidad de *chunking* pura (`kb.chunker.ts`) con tamaño y solape configurables por env.
- Worker BullMQ `kb-index`: trocea → genera embeddings → inserta `kb_chunks` (`createScoped`) →
  actualiza `estadoIndexacion` (`pendiente → procesando → indexado | fallido`). Idempotente por
  documento+versión.
- **Repositorio de recuperación tenant-safe** (`kb.repository.ts`): construye el pipeline
  `$vectorSearch` inyectando **siempre** `filter: { tenantId }` (más `$match` defensivo), y un
  servicio interno `searchKnowledge(tenantId, query, k)` que consumirán HU-IA-01/02 y que sirve la
  "consulta de prueba" del DoD.
- **Versionado del conocimiento por empresa:** re-subir/editar un documento incrementa su `version`;
  el indexer reemplaza los chunks de la versión anterior de ese documento.
- Índice vectorial de Atlas para `kb_chunks` con `tenantId` declarado como campo de **filtro**
  (script de creación + pasos documentados).
- Frontend: feature `knowledge-base` con **editor de carga** (subir/pegar texto) y tabla con el
  **estado de indexación** en vivo (polling con TanStack Query). El diseño de la pantalla se genera
  con el **MCP de Stitch** en la fase de implementación.
- Actualizar `docs/data-model.md` con `kb_documents` y `kb_chunks`.

### Fuera de alcance
- Consumo real del contexto en la generación de respuestas de la IA → **HU-IA-01/02** (aquí solo se
  habilita y se prueba la recuperación).
- Carga de archivos binarios (PDF, DOCX, imágenes/OCR): solo **texto** plano/pegado en este HU.
- UI de edición avanzada de chunks, re-ranking, o borrado granular de fragmentos.
- Caché semántica de respuestas (excluida del MVP por arquitectura).

## Criterios de aceptación

1. **Ingesta confirmada:** `POST /api/kb/documents` con `{ titulo, contenido }` válido crea un
   `KbDocument` con `estadoIndexacion: 'pendiente'` y `version` asignada, encola el job `kb-index` y
   responde `201` con `{ id, titulo, estadoIndexacion, version }` **sin** bloquear en el troceo/embeddings.
2. **Listado con estado:** `GET /api/kb/documents` devuelve **solo** los documentos del tenant del
   token, paginados, cada uno con su `estadoIndexacion` (`pendiente|procesando|indexado|fallido`) y
   `chunkCount`.
3. **Indexación asíncrona:** el worker `kb-index` trocea el contenido, genera embeddings vía
   `ILlmProvider.embedTexts`, persiste los `KbChunk` con `createScoped` y deja el documento en
   `indexado` (o `fallido` con `error` si algo revienta). Reprocesar el mismo documento+versión no
   duplica chunks.
4. **Versionado por empresa:** re-subir un documento existente incrementa `version`; tras indexar,
   los `KbChunk` de la versión previa de ese documento ya no existen (reemplazo).
5. **Embeddings tras la interfaz:** `GeminiProvider.embedTexts` lee `GEMINI_EMBED_MODEL`/`KB_EMBED_DIM`
   del schema Zod de `config/env.ts`; devuelve vectores de dimensión `KB_EMBED_DIM`; el dominio no
   conoce a Gemini directamente (solo `ILlmProvider`).
6. **Recuperación relevante (DoD):** `searchKnowledge(tenantId, queryRelacionada, k)` devuelve entre
   sus top-`k` un chunk del texto previamente cargado por ese tenant (verificación manual contra
   Atlas: texto cargado → recuperado como contexto).
7. **Aislamiento multi-tenant (severidad máxima):**
   - `KbDocument` y `KbChunk` llevan `tenantId` requerido e indexado; todo acceso pasa por
     `*Scoped` del `base.repository`.
   - El pipeline `$vectorSearch` **siempre** incluye `filter: { tenantId }` (no puede ser
     sobrescrito por input del caller) y un `$match { tenantId }` defensivo posterior; el índice
     Atlas declara `tenantId` como filtro.
   - **Test de aislamiento:** un `KbChunk`/`KbDocument` creado para `tenantA` no aparece en
     `GET /kb/documents` de `tenantB`; el builder del `$vectorSearch` inyecta el `tenantId` del
     argumento e ignora cualquier `tenantId` provisto en el filtro del caller.
8. **`tsc --noEmit` en verde** (`pnpm --filter backend typecheck`), cero `any`, tipos de retorno
   explícitos en funciones exportadas.

## Dependencias

- `INF-02` completo: `base.repository.ts` con `*Scoped` y `requireTenant` operativos.
- `HT-AI-01` completo: `GeminiProvider`/`ILlmProvider` y `config/env.ts` con el bloque Gemini.
- Redis operativo (broker BullMQ, ya requerido).
- **MongoDB Atlas** (no `mongodb-memory-server`) para el índice `$vectorSearch`: la recuperación E2E
  se valida contra Atlas; los tests automáticos cubren aislamiento y contrato del pipeline.
- **Bloqueante de:** HU-IA-01 (debe completarse **antes** que IA-01, que consume el RAG).
