# HU-KB-01 — Plan técnico (CÓMO)

> Sigue el patrón de 6 archivos de `apps/backend/CLAUDE.md`, el aislamiento de
> `docs/multi-tenancy.md` y el modelo de `docs/data-model.md`. El único punto sensible nuevo es la
> recuperación por `$vectorSearch`, que **no** pasa por el `base.repository` estándar: se blinda en
> un `kb.repository.ts` dedicado que fuerza `tenantId` en el pipeline.

## Archivos a crear / tocar

```
apps/backend/src/
├── features/kb/
│   ├── kb.types.ts                 # enums, IKbDocument(+Document), IKbChunk(+Document), DTOs, IKbDocumentResponse
│   ├── kb-document.model.ts        # schema KbDocument + tenantId req/index + { tenantId, version } + { tenantId, createdAt }
│   ├── kb-chunk.model.ts           # schema KbChunk + tenantId req/index + embedding:[Number] + { tenantId, documentId }
│   ├── kb.validation.ts            # Zod { body, params, query } para create y list
│   ├── kb.service.ts               # createDocument (crea doc + encola job), listDocuments (paginado)
│   ├── kb.controller.ts            # HTTP delgado: tenantId del token → service → IKbDocumentResponse
│   ├── kb.routes.ts                # POST / , GET /  con cadena de middlewares fija
│   ├── kb.repository.ts            # vectorSearchScoped: pipeline $vectorSearch con filter {tenantId} SIEMPRE
│   ├── kb.retrieval.service.ts     # searchKnowledge(tenantId, query, k): embeds query + vectorSearchScoped
│   └── kb.chunker.ts               # chunkText(texto, size, overlap): string[]  (pura, testeable)
├── integrations/llm/
│   ├── llm-provider.types.ts       # (TOCA) + embedTexts(...) en ILlmProvider; EmbedParams/EmbedResult
│   └── gemini.provider.ts          # (TOCA) + embedTexts vía batchEmbedContents(text-embedding-004)
├── workers/
│   └── kb-index.processor.ts       # Worker BullMQ 'kb-index': trocea→embeds→createScoped→estado
├── config/
│   ├── env.ts                      # (TOCA) GEMINI_EMBED_MODEL, KB_EMBED_DIM, KB_CHUNK_SIZE, KB_CHUNK_OVERLAP, KB_VECTOR_INDEX, KB_RETRIEVAL_K
│   └── queues.ts                   # (TOCA) KB_INDEX_QUEUE_NAME + export kbIndexQueue
├── worker.ts                       # (TOCA) monta kb-index.processor y sus listeners
├── app.ts                          # (TOCA) app.use('/api/kb', kbRoutes)
└── scripts/
    └── create-kb-vector-index.ts   # Model.createSearchIndex del índice vectorial (idempotente)

apps/frontend/src/
├── features/knowledge-base/
│   ├── pages/KnowledgeBasePage.tsx         # layout: editor + tabla (diseño generado con Stitch MCP)
│   ├── components/KnowledgeUploadEditor.tsx# textarea/título + submit; invalida query al éxito
│   ├── components/KnowledgeDocumentTable.tsx
│   ├── components/IndexingStatusBadge.tsx  # pendiente|procesando|indexado|fallido
│   └── types/{api.ts,domain.ts,index.ts}
├── api/knowledge-base.ts                   # postDocument / getDocuments vía apiClient
└── routes/                                 # (TOCA) registrar ruta admin + link de navegación

docs/
└── data-model.md                           # (TOCA) añadir kb_documents y kb_chunks
```

## Contratos

### `kb.types.ts`
```ts
export type EstadoIndexacion = 'pendiente' | 'procesando' | 'indexado' | 'fallido';

export interface IKbDocument {
  tenantId: Types.ObjectId;
  titulo: string;
  contenido: string;                 // texto crudo (fuente para re-indexar)
  version: number;                   // incremental por documento (versionado por empresa)
  estadoIndexacion: EstadoIndexacion;
  chunkCount: number;                // 0 hasta indexar
  error?: string;                    // motivo si estadoIndexacion === 'fallido'
}
export interface IKbDocumentDocument extends IKbDocument, Document {}

export interface IKbChunk {
  tenantId: Types.ObjectId;
  documentId: Types.ObjectId;        // ref KbDocument
  version: number;                   // versión del documento a la que pertenece
  chunkIndex: number;
  texto: string;
  embedding: number[];               // dimensión KB_EMBED_DIM
}
export interface IKbChunkDocument extends IKbChunk, Document {}

export interface CreateKbDocumentDTO { titulo: string; contenido: string; }
export interface IKbDocumentResponse {
  id: string; titulo: string; estadoIndexacion: EstadoIndexacion;
  version: number; chunkCount: number; createdAt: string; updatedAt: string;
}
export interface KbIndexJobData { tenantId: string; documentId: string; version: number; }
```

### `kb-document.model.ts` / `kb-chunk.model.ts`
- `tenantId: { type: ObjectId, ref: 'Tenant', required: true, index: true }` en ambos.
- `KbDocument`: `estadoIndexacion` enum (default `pendiente`), `version` (default 1), `chunkCount`
  (default 0), `{ timestamps: true }`. Índices: `{ tenantId: 1, createdAt: -1 }`, `{ tenantId: 1, titulo: 1 }`.
- `KbChunk`: `embedding: { type: [Number], required: true }`, `documentId` ref+index.
  Índices: `{ tenantId: 1, documentId: 1, version: 1 }`. El **índice vectorial** NO es un índice
  Mongoose: se crea aparte (Atlas Search) vía `scripts/create-kb-vector-index.ts`.

### Índice Atlas Vector Search (`scripts/create-kb-vector-index.ts`)
```jsonc
// KbChunk.createSearchIndex({ name: env.KB_VECTOR_INDEX, type: 'vectorSearch', definition: { fields: [
//   { type: 'vector', path: 'embedding', numDimensions: KB_EMBED_DIM, similarity: 'cosine' },
//   { type: 'filter', path: 'tenantId' },
//   { type: 'filter', path: 'version' }
// ]}})
```
> `tenantId` como **filter** en el índice es obligatorio: sin él, `$vectorSearch` no puede aislar.

### `kb.repository.ts` — recuperación tenant-safe (núcleo de aislamiento)
```ts
// El ÚNICO lugar que construye el $vectorSearch. tenantId nace del argumento; nunca del caller.
export async function vectorSearchScoped(
  tenantId: string | Types.ObjectId,
  queryVector: number[],
  k: number,
): Promise<IKbChunk[]> {
  return KbChunk.aggregate([
    { $vectorSearch: {
        index: env.KB_VECTOR_INDEX,
        path: 'embedding',
        queryVector,
        numCandidates: k * 10,
        limit: k,
        filter: { tenantId: toObjectId(tenantId) },   // SIEMPRE, no sobrescribible
    }},
    { $match: { tenantId: toObjectId(tenantId) } },     // defensa en profundidad
    { $project: { embedding: 0 } },
  ]);
}
```

### `kb.retrieval.service.ts`
```ts
// Consumido por HU-IA-01/02 y por la "consulta de prueba" del DoD.
export async function searchKnowledge(
  tenantId: string | Types.ObjectId, query: string, k = env.KB_RETRIEVAL_K,
): Promise<Array<{ texto: string; documentId: string; score?: number }>>;
// 1) embedTexts([query], 'RETRIEVAL_QUERY') → vector  2) vectorSearchScoped(tenantId, vector, k)
```

### `kb.service.ts`
```ts
export async function createDocument(tenantId: string, dto: CreateKbDocumentDTO): Promise<IKbDocumentResponse>;
//   asigna version, createScoped(KbDocument, ...pendiente...), kbIndexQueue.add('kb-index', {tenantId, documentId, version}), mapea respuesta
export async function listDocuments(tenantId: string, page: number, limit: number): Promise<{ items: IKbDocumentResponse[]; total: number; page: number; limit: number }>;
//   findScoped(KbDocument, tenantId).sort({createdAt:-1}).skip().limit().lean()
```

### `ILlmProvider` (extensión) + `GeminiProvider.embedTexts`
```ts
// llm-provider.types.ts
export type EmbedTaskType = 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY';
export interface ILlmProvider {
  // ...existentes...
  embedTexts(input: { texts: string[]; taskType: EmbedTaskType }): Promise<LlmCallResult<number[][]>>;
}
// gemini.provider.ts → getGenerativeModel({ model: env.GEMINI_EMBED_MODEL }).batchEmbedContents(...)
```

### `config/env.ts` (añadir)
```ts
GEMINI_EMBED_MODEL: z.string().default('text-embedding-004'),
KB_EMBED_DIM: z.coerce.number().positive().default(768),
KB_CHUNK_SIZE: z.coerce.number().positive().default(1000),     // caracteres
KB_CHUNK_OVERLAP: z.coerce.number().nonnegative().default(150),
KB_VECTOR_INDEX: z.string().default('kb_chunks_vector'),
KB_RETRIEVAL_K: z.coerce.number().positive().default(5),
```

### Endpoints + cadena de middlewares (`kb.routes.ts`)
```ts
router.post('/documents',
  authenticateJWT, requireTenant, authorize(['admin']),
  validate(createDocumentSchema), asyncHandler(createDocumentController));
router.get('/documents',
  authenticateJWT, requireTenant, authorize(['admin']),
  validate(listDocumentsSchema), asyncHandler(listDocumentsController));
// Montaje: app.use('/api/kb', kbRoutes);
```

### Job BullMQ `kb-index` (`workers/kb-index.processor.ts`)
1. `findByIdScoped(KbDocument, tenantId, documentId)`; si no existe o `version` no coincide → skip (idempotencia).
2. `estadoIndexacion = 'procesando'`.
3. `chunkText(contenido, KB_CHUNK_SIZE, KB_CHUNK_OVERLAP)` → `embedTexts(chunks, 'RETRIEVAL_DOCUMENT')`.
4. `deleteMany` scoped de chunks previos `{ documentId }` (reemplazo por versión) → `createScoped` por chunk.
5. `estadoIndexacion = 'indexado'`, `chunkCount = n`. En error: `estadoIndexacion = 'fallido'`, `error`.
- Reintentos BullMQ (≤3, backoff exponencial); el paso 4 hace la operación idempotente.

## Notas

- **Aislamiento:** `kb.repository.ts` es el único que emite un `aggregate`/`$vectorSearch`; el resto
  del feature usa `*Scoped`. Prohibido `KbChunk.aggregate` fuera de ese archivo (revisión de PR).
- **`mongodb-memory-server` no soporta `$vectorSearch`**: los tests automáticos cubren aislamiento
  de `createScoped`/listado y el **contrato del builder** del pipeline (que inyecta `tenantId` y lo
  antepone a cualquier filtro del caller). La recuperación semántica E2E se valida contra Atlas (DoD).
- **Versionado:** `version` es por documento (incremental). Re-subir un `titulo` existente del tenant
  = nueva versión + reindex con reemplazo de chunks. (Editar contenido = mismo flujo.)
- **Frontend:** la pantalla del editor se **genera con el MCP de Stitch** en `/sdd-implement`; el
  estado de indexación se refresca con `refetchInterval` de TanStack Query mientras haya documentos
  en `pendiente|procesando`.
- El HU dice "Como Administrador": las rutas usan `authorize(['admin'])`.

## Verificación

- `pnpm --filter backend typecheck` (`tsc --noEmit`) en verde, sin `any`.
- `pnpm --filter backend test`: aislamiento (createScoped + listado), contrato del builder de
  `$vectorSearch`, chunker puro, `embedTexts` (mock del provider).
- `pnpm --filter frontend build && pnpm --filter frontend lint` en verde.
- Manual (DoD, contra Atlas): cargar texto → esperar `indexado` → `searchKnowledge` con una consulta
  relacionada devuelve el fragmento como contexto.
