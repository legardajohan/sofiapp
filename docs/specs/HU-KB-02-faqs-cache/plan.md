# HU-KB-02 — Plan técnico (CÓMO)

> El QUÉ está en `spec.md`; la ejecución en `tasks.md`. Este documento fija archivos y contratos.
> No redefine reglas: el aislamiento multi-tenant se rige por `docs/multi-tenancy.md` y el patrón de
> feature por `apps/backend/CLAUDE.md`.

## Decisiones de diseño

| Decisión | Elección | Por qué |
|---|---|---|
| Motor de matching | `$vectorSearch` de Atlas, índice propio `kb_faqs_vector` | Reutiliza el patrón ya probado en `kb.repository.ts`; escala sin cargar embeddings en memoria |
| Momento del embedding | **Síncrono en el service**, no en worker | Es 1 solo texto corto (~1 llamada, ~200 ms), no justifica una cola; la FAQ queda usable al instante |
| Acoplamiento con IA | `FaqMatcher` **inyectado por constructor** en `AIService` | `services/ai/` es transversal y no debe importar `features/`; permite mockear el matcher en tests sin tocar Mongo ni Gemini |
| Posición del cortocircuito | Después del `getCached` de Redis, antes de `generateReply` | La caché exacta es la comprobación más barata (sin red a Gemini ni a Atlas); FAQ va segunda |
| Navegación frontend | Sub-ítem del sidebar + ruta propia | El proyecto no tiene `ui/tabs.tsx` vendorizado; el patrón `children: NavSubItem[]` ya existe (`nav-config.ts:61-66`) |

## Archivos a crear / tocar

```
apps/backend/src/
├── features/kb-faq/                        # NUEVO — 6 archivos del patrón + repositorio vectorial
│   ├── kb-faq.types.ts                     # 1. dominio + DTOs + FaqMatchResult
│   ├── kb-faq.model.ts                     # 2. schema + índice único { tenantId, pregunta }
│   ├── kb-faq.validation.ts                # 3. Zod { body, params, query }
│   ├── kb-faq.repository.ts                # 3b. ÚNICO autorizado a aggregate sobre KbFaq
│   ├── kb-faq.service.ts                   # 4. CRUD + matchFaq + testFaq
│   ├── kb-faq.controller.ts                # 5. controllers delgados
│   └── kb-faq.routes.ts                    # 6. router + cadena de middlewares
├── scripts/create-kb-faq-vector-index.ts   # NUEVO — calca create-kb-vector-index.ts
├── config/env.ts                           # TOCAR — + FAQ_VECTOR_INDEX, FAQ_MATCH_THRESHOLD
├── app.ts                                  # TOCAR — + app.use('/api/kb/faqs', kbFaqRoutes)
└── services/ai/
    ├── ai-service.types.ts                 # TOCAR — FaqMatcher + AiResult.fromFaq
    ├── ai-usage-log.model.ts               # TOCAR — + fromFaq
    └── ai.service.ts                       # TOCAR — 3er param + bloque de cortocircuito en chat()

apps/backend/src/features/kb-faq/            # tests (colocados junto al feature, como en kb/)
├── kb-faq.service.test.ts
├── kb-faq.repository.test.ts
└── kb-faq.routes.test.ts
apps/backend/src/services/ai/ai.service.test.ts   # TOCAR — casos de cortocircuito

apps/frontend/src/
├── api/kb-faqs.ts                          # NUEVO (junto a api/knowledge-base.ts)
├── features/knowledge-base/
│   ├── pages/KnowledgeFaqsPage.tsx         # NUEVO
│   ├── components/FaqTable.tsx             # NUEVO — shadcn Table
│   ├── components/FaqFormDialog.tsx        # NUEVO — shadcn Dialog
│   ├── components/FaqTester.tsx            # NUEVO — probador con score
│   ├── types/faq.ts                        # NUEVO
│   ├── types/index.ts                      # TOCAR — barrel
│   └── index.ts                            # TOCAR — export de KnowledgeFaqsPage
├── router.tsx                              # TOCAR — ruta /settings/knowledge/faqs
└── components/layout/nav-config.ts         # TOCAR — children bajo «Base de Conocimiento»

.env.example
apps/backend/.env.example                    # TOCAR — documentar las 2 envs nuevas
```

## Contratos

### `kb-faq.types.ts`

```ts
import type { Document, Types } from 'mongoose';

export interface IKbFaq {
  tenantId: Types.ObjectId;
  pregunta: string;
  respuesta: string;
  embedding: number[];      // dimensión KB_EMBED_DIM (768), de la PREGUNTA
  activo: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IKbFaqDocument extends IKbFaq, Document {
  _id: Types.ObjectId;
}

// ─── DTOs / contratos HTTP ──────────────────────────────────────────────────
export interface CreateFaqDTO { pregunta: string; respuesta: string; activo?: boolean }
export interface UpdateFaqDTO { pregunta?: string; respuesta?: string; activo?: boolean }
export interface TestFaqDTO { pregunta: string }

export interface IKbFaqResponse {   // NUNCA incluye embedding
  id: string;
  pregunta: string;
  respuesta: string;
  activo: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface KbFaqsListResponse {
  data: IKbFaqResponse[];
  total: number;
  page: number;
  limit: number;
}

export interface DeleteKbFaqResponse { deleted: boolean }

// ─── Matching ───────────────────────────────────────────────────────────────
export interface FaqMatchResult {
  matched: boolean;
  respuesta?: string;
  confianza?: number;       // score normalizado de Atlas, [0,1]
}

/** Diagnóstico para el probador: devuelve el mejor candidato aunque no supere el umbral. */
export interface FaqTestResult extends FaqMatchResult {
  umbral: number;
  faqId?: string;
  pregunta?: string;        // la pregunta de la FAQ candidata, no la del admin
}
```

### `kb-faq.model.ts`

```ts
const KbFaqSchema = new Schema<IKbFaqDocument>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    pregunta: { type: String, required: true, trim: true },
    respuesta: { type: String, required: true, trim: true },
    embedding: { type: [Number], required: true },
    activo: { type: Boolean, required: true, default: true },
  },
  { timestamps: true },
);

KbFaqSchema.index({ tenantId: 1, pregunta: 1 }, { unique: true });
KbFaqSchema.index({ tenantId: 1, createdAt: -1 });

// El índice de Atlas Vector Search NO es de Mongoose: se crea con
// scripts/create-kb-faq-vector-index.ts (igual que kb-chunk.model.ts).
export const KbFaq = model<IKbFaqDocument>('KbFaq', KbFaqSchema);
```

### `kb-faq.validation.ts`

Forma `{ body, params, query }`, con el mismo regex de ObjectId que `kb.validation.ts:26`.

```ts
const idParams = z.object({ id: z.string().regex(/^[0-9a-f]{24}$/i, 'ID inválido') });

export const createFaqSchema = z.object({
  body: z.object({
    pregunta: z.string().trim()
      .min(3, 'La pregunta es obligatoria.')
      .max(300, 'La pregunta no puede superar los 300 caracteres.'),
    respuesta: z.string().trim()
      .min(1, 'La respuesta es obligatoria.')
      .max(2_000, 'La respuesta no puede superar los 2,000 caracteres.'),
    activo: z.boolean().optional(),
  }),
});

export const updateFaqSchema = z.object({
  params: idParams,
  body: z.object({ /* los 3 campos, todos .optional() */ })
    .refine((b) => Object.keys(b).length > 0, 'Debes enviar al menos un campo para actualizar.'),
});

export const listFaqsSchema = z.object({
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    activo: z.coerce.boolean().optional(),
  }),
});

export const deleteFaqSchema = z.object({ params: idParams });

export const testFaqSchema = z.object({
  body: z.object({ pregunta: z.string().trim().min(3).max(300) }),
});
```

### `kb-faq.repository.ts`

Calca `kb.repository.ts:21-57`. Es el **único** archivo autorizado a emitir `aggregate` sobre `KbFaq`.

```ts
export type ScoredFaq = IKbFaq & { _id: Types.ObjectId; score?: number };

export function buildFaqVectorSearchPipeline(
  tenantId: TenantId,
  queryVector: number[],
): PipelineStage[] {
  const tid = toObjectId(tenantId);
  const vectorStage = {
    $vectorSearch: {
      index: env.FAQ_VECTOR_INDEX,
      path: 'embedding',
      queryVector,
      numCandidates: 20,          // limit(1) * 20 — margen sano con pocos documentos
      limit: 1,
      filter: { tenantId: tid, activo: true },
    },
  } as unknown as PipelineStage;  // los tipos de Mongoose no cubren $vectorSearch

  return [
    vectorStage,
    { $match: { tenantId: tid, activo: true } },              // defensivo
    { $addFields: { score: { $meta: 'vectorSearchScore' } } },
    { $project: { embedding: 0 } },                            // el vector jamás sale del repo
  ];
}

export async function faqVectorSearchScoped(
  tenantId: TenantId,
  queryVector: number[],
): Promise<ScoredFaq[]> {
  return KbFaq.aggregate<ScoredFaq>(buildFaqVectorSearchPipeline(tenantId, queryVector)).exec();
}
```

### `kb-faq.service.ts`

Provider inyectado como parámetro por defecto, igual que `kb.retrieval.service.ts:15-20`.
Todas las lecturas con `.lean<T>().exec()`. Mensajes de error en español, con punto final.

```ts
async function embedPregunta(pregunta: string, provider: ILlmProvider, taskType: EmbedTaskType): Promise<number[]>

export function mapKbFaqToResponse(doc: IKbFaq & { _id: Types.ObjectId }): IKbFaqResponse
// NO copia `embedding`. Fechas a ISO. Spread condicional por exactOptionalPropertyTypes.

export async function listFaqs(
  tenantId: string, page: number, limit: number, activo?: boolean,
): Promise<KbFaqsListResponse>
// findScoped(KbFaq, tenantId, filtro).select('-embedding').sort({ createdAt: -1 }).skip().limit()
// + countScoped para `total`.

export async function createFaq(
  tenantId: string, dto: CreateFaqDTO, provider: ILlmProvider = new GeminiProvider(),
): Promise<IKbFaqResponse>
// 1) findOneScoped por `pregunta` → si existe: AppError('Ya existe una pregunta frecuente con ese texto.', 409)
// 2) embedding = embedPregunta(dto.pregunta, provider, 'RETRIEVAL_DOCUMENT')
// 3) createScoped(KbFaq, tenantId, { ...dto, embedding, activo: dto.activo ?? true })

export async function updateFaq(
  tenantId: string, id: string, dto: UpdateFaqDTO, provider: ILlmProvider = new GeminiProvider(),
): Promise<IKbFaqResponse>
// 1) findByIdScoped → si no: AppError('No se encontró la pregunta frecuente.', 404)
// 2) Solo si dto.pregunta existe Y difiere de la actual:
//      - findOneScoped por el nuevo texto → si existe otro doc: AppError(409)
//      - re-embebe. Si NO cambia, se conserva el embedding y NO se llama a Gemini.
// 3) findOneAndUpdateScoped(KbFaq, tenantId, { _id: id }, { $set }, { new: true })

export async function deleteFaq(tenantId: string, id: string): Promise<DeleteKbFaqResponse>
// findByIdScoped → 404 si no existe; findOneAndDeleteScoped; { deleted: true }

export async function matchFaq(
  tenantId: string | Types.ObjectId, preguntaEntrante: string,
  provider: ILlmProvider = new GeminiProvider(),
): Promise<FaqMatchResult>
// 1) queryVector = embedPregunta(preguntaEntrante, provider, 'RETRIEVAL_QUERY'); si falla → { matched: false }
// 2) faqVectorSearchScoped(tenantId, queryVector)
// 3) score >= env.FAQ_MATCH_THRESHOLD ? { matched: true, respuesta, confianza: score } : { matched: false }

export async function testFaq(
  tenantId: string, preguntaEntrante: string, provider: ILlmProvider = new GeminiProvider(),
): Promise<FaqTestResult>
// Mismo camino que matchFaq pero SIEMPRE devuelve el mejor candidato + `umbral: env.FAQ_MATCH_THRESHOLD`,
// incluso si score < umbral (matched: false). Solo lectura: no escribe nada.
```

**Resiliencia:** `matchFaq` es un *optimizador*, no un camino crítico. Si el embedding o el
`$vectorSearch` fallan (Atlas sin índice, Gemini caído), registra el error y devuelve
`{ matched: false }` para que la conversación siga por el flujo normal. `testFaq`, en cambio,
propaga el error para que el admin vea qué pasa.

### `kb-faq.controller.ts`

Cinco controllers delgados, sin `try/catch` ni lógica. `tenantId` del token; la query validada se
lee de **`req.validatedQuery`** (Express 5 re-parsea el getter de `req.query` — ver comentario en
`validate.middleware.ts:31-36`).

```ts
export const listFaqsController: RequestHandler = async (req, res) => {
  const tenantId = req.user!.tenantId!.toString();
  const { page, limit, activo } = req.validatedQuery as unknown as
    { page: number; limit: number; activo?: boolean };
  res.status(200).json(await listFaqs(tenantId, page, limit, activo));
};
// createFaqController → 201 · updateFaqController → 200 · deleteFaqController → 200
// testFaqController → 200
```

### `kb-faq.routes.ts` y montaje

```ts
router.get   ('/',      authenticateJWT, requireTenant, authorize(['admin']), validate(listFaqsSchema),  asyncHandler(listFaqsController));
router.post  ('/',      authenticateJWT, requireTenant, authorize(['admin']), validate(createFaqSchema), asyncHandler(createFaqController));
router.post  ('/test',  authenticateJWT, requireTenant, authorize(['admin']), validate(testFaqSchema),   asyncHandler(testFaqController));
router.patch ('/:id',   authenticateJWT, requireTenant, authorize(['admin']), validate(updateFaqSchema), asyncHandler(updateFaqController));
router.delete('/:id',   authenticateJWT, requireTenant, authorize(['admin']), validate(deleteFaqSchema), asyncHandler(deleteFaqController));
export default router;
```

En `app.ts`, junto al `app.use('/api/kb', kbRoutes)` de la línea 55:

```ts
app.use('/api/kb/faqs', kbFaqRoutes);
```

Sin colisión: `kbRoutes` solo declara `/documents`. `POST /test` y `PATCH /:id` tampoco chocan
(distinto método), pero `/test` se registra antes de `/:id` por higiene.

### `config/env.ts`

Bloque nuevo tras el de Knowledge Base (líneas 35-41):

```ts
  // FAQ semántica (HU-KB-02)
  FAQ_VECTOR_INDEX: z.string().default('kb_faqs_vector'),
  FAQ_MATCH_THRESHOLD: z.coerce.number().min(0).max(1).default(0.85),
```

Documentar ambas en `.env.example` y `apps/backend/.env.example` con la nota de que el score de
Atlas está normalizado a `(1 + cos) / 2`.

### `scripts/create-kb-faq-vector-index.ts`

Calca `create-kb-vector-index.ts:19-42`: idempotente vía `listSearchIndexes()`.

```ts
const definition = {
  fields: [
    { type: 'vector', path: 'embedding', numDimensions: env.KB_EMBED_DIM, similarity: 'cosine' },
    { type: 'filter', path: 'tenantId' },
    { type: 'filter', path: 'activo' },
  ],
};
await KbFaq.createSearchIndex({ name: env.FAQ_VECTOR_INDEX, type: 'vectorSearch', definition });
```

Ejecución: `pnpm --filter @sofiapp/api exec tsx --env-file .env src/scripts/create-kb-faq-vector-index.ts`
(requiere Atlas M10+).

### Integración con `AIService`

**`ai-service.types.ts`** — el matcher se declara aquí para que `services/ai/` no importe
`features/kb-faq/`:

```ts
export interface FaqMatchResult { matched: boolean; respuesta?: string; confianza?: number }

export type FaqMatcher = (
  tenantId: Types.ObjectId,
  pregunta: string,
) => Promise<FaqMatchResult>;

export interface AiResult<T> {
  data: T;
  cacheHit: boolean;
  fromFaq?: boolean;        // NUEVO
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  durationMs: number;
}
```

`FaqMatchResult` vive en `kb-faq.types.ts` como fuente de dominio y se **re-declara estructuralmente
idéntico** aquí; el compilador valida la compatibilidad al cablear `matchFaq` en `createAIService`.

**`ai-usage-log.model.ts`** — `fromFaq: { type: Boolean, required: true, default: false }` y el
campo correspondiente en `IAiUsageLog`. Deja los datos listos para medir el ahorro sin otra
migración.

**`ai.service.ts`** — tercer parámetro del constructor con no-op por defecto (los tests existentes
siguen compilando sin tocarlos):

```ts
constructor(
  private readonly provider: ILlmProvider,
  private readonly redis: Redis,
  private readonly faqMatcher: FaqMatcher = async () => ({ matched: false }),
) {}
```

Bloque nuevo en `chat()`, **después** del `getCached` (línea 35) y **antes** del `generateReply`
(línea 37):

```ts
const ultimaPregunta = [...params.historial].reverse().find((t) => t.role === 'user')?.content;
if (ultimaPregunta) {
  const faq = await this.faqMatcher(params.tenantId, ultimaPregunta);
  if (faq.matched && faq.respuesta) {
    const durationMs = Date.now() - start;
    this.logUsage({
      tenantId: params.tenantId, method: 'chat', llmModel: env.GEMINI_MODEL,
      promptTokens: 0, completionTokens: 0, totalTokens: 0,
      cacheHit: true, fromFaq: true, durationMs,
    });
    return {
      data: faq.respuesta, cacheHit: true, fromFaq: true,
      promptTokens: 0, completionTokens: 0, totalTokens: 0, durationMs,
    };
  }
}
```

`createAIService(redis)` pasa `matchFaq` como tercer argumento — **único punto de cableado** entre
`services/ai/` y `features/kb-faq/`. La firma de `matchFaq` acepta `string | Types.ObjectId`, así que
encaja en `FaqMatcher` sin adaptador.

Los dos `logUsage` preexistentes de `chat()`, `extract()` y `classify()` pasan a incluir
`fromFaq: false` explícito.

### Frontend

**`api/kb-faqs.ts`** — mismo estilo que `api/knowledge-base.ts`; rutas **sin** prefijo `/api` (lo
aporta el `baseURL` del `apiClient`):

```ts
getKbFaqs(params)      → GET    '/kb/faqs'      → KbFaqsListResponse
createKbFaq(payload)   → POST   '/kb/faqs'      → IKbFaq
updateKbFaq(id, patch) → PATCH  `/kb/faqs/${id}`→ IKbFaq
deleteKbFaq(id)        → DELETE `/kb/faqs/${id}`→ { deleted: boolean }
testKbFaq(pregunta)    → POST   '/kb/faqs/test' → FaqTestResult
```

**Estado servidor** — TanStack Query con queryKey `['kb', 'faqs']`, invalidación en cada mutación
igual que `KnowledgeDocumentTable.tsx:29-34`. El probador es una `useMutation` (acción puntual, no
cacheable).

**Componentes** — todos de `src/components/ui/`, ya vendorizados: `Table`, `Badge` (variante
`success` para Activo / `secondary` para Inactivo), `Dialog`, `Button`, `Input`, `Textarea`,
`Label`, `Switch`, `Skeleton`. Iconos `lucide-react`: `Plus`, `Pencil`, `Trash2`, `FlaskConical`.

- `KnowledgeFaqsPage.tsx` — cabecera + `FaqTester` + `FaqTable`, con el estado de apertura del
  diálogo y la FAQ en edición en `useState` local (el patrón de store Zustand de `admin-tenants` es
  excesivo para una sola vista).
- `FaqTable.tsx` — referencia de calidad: `admin-tenants/components/TenantTable.tsx`. Respuesta
  truncada con `line-clamp` + `title`; fila vacía con `colSpan`; acciones con `aria-label` y
  `disabled` durante mutaciones; borrado con `window.confirm` (patrón vigente del repo).
- `FaqFormDialog.tsx` — referencia: `admin-tenants/components/TenantForm.tsx` dentro de `Dialog`.
  Contrato de props `{ faq?: IKbFaq; open; onOpenChange }`; el padre decide crear vs editar por la
  presencia de `faq`. Estado con `useState` + validación HTML5 (`required`, `minLength`,
  `maxLength`) — el frontend **no** usa react-hook-form ni zod. Contador de caracteres en la
  respuesta. Al cambiar de FAQ o volver a modo crear, resetea campos y mensajes.
- `FaqTester.tsx` — `Input` + botón; muestra `confianza` como porcentaje, el `umbral` vigente y la
  pregunta de la FAQ candidata; `Badge` `success` si `matched`, `secondary` si no. Copy que explique
  que un score bajo el umbral significa que esa consulta iría al LLM.

**Ruta y navegación** — en `router.tsx`, entrada hermana de `/settings/knowledge` con `lazy` +
`Suspense` + `RequireRole roles={['admin']}`. En `nav-config.ts`, `children: NavSubItem[]` sobre el
ítem «Base de Conocimiento» con «Documentos» (`/settings/knowledge`) y «Preguntas frecuentes»
(`/settings/knowledge/faqs`), siguiendo el patrón de Bandeja omnicanal (`nav-config.ts:61-66`).

**Antes de escribir un solo componente** hay que invocar `emil-design-eng`, `impeccable:impeccable`
y `frontend-design:frontend-design` (regla no negociable del `CLAUDE.md` raíz) y revisar el
resultado en light **y** dark con tokens semánticos.

## Notas

- **Escala del score.** Atlas normaliza el coseno a `(1 + cos) / 2`. El default `0.85` equivale a
  coseno ≈ `0.70`. La calibración se hace con el probador y la env, nunca tocando código.
- **El índice de Atlas es un prerrequisito operativo.** Sin `kb_faqs_vector` creado, `$vectorSearch`
  falla y `matchFaq` degrada a `{ matched: false }` — el sistema sigue funcionando, pero sin ahorro.
  Hay que correr el script en cada entorno.
- **`embedTexts` devuelve `usage` en cero** (`ZERO_USAGE` en `gemini.provider.ts`): el coste del
  embedding de matching no se contabiliza en `AiUsageLog`. Es de todos modos órdenes de magnitud
  menor que una generación, y `fromFaq: true` marca claramente la fila como "no hubo generación".
- **La clase `AIService` no depende de `features/kb-faq/`**: solo conoce el tipo `FaqMatcher`, así
  que se puede instanciar y testear con un matcher falso. El único punto que importa el feature es
  la factoría `createAIService`, al final de `ai.service.ts`.
- **`$vectorSearch` no existe en `mongodb-memory-server`**: los tests validan el pipeline construido
  (patrón de `kb.repository.test.ts`), no su ejecución. La verificación real del matching es manual
  contra Atlas.
- **Los presets no aplican.** A diferencia de los documentos de HU-KB-01-V2, no se siembra ninguna
  FAQ al crear un tenant: el admin las escribe a mano.

## Verificación

```bash
pnpm --filter @sofiapp/api typecheck
pnpm --filter @sofiapp/api test
pnpm --filter @sofiapp/web build && pnpm --filter @sofiapp/web lint
```

Más el checklist de PR de `docs/multi-tenancy.md` §9 y, en el entorno destino, la ejecución del
script de creación del índice de Atlas.
