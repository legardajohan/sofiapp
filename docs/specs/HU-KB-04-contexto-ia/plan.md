# HU-KB-04 — Plan técnico (CÓMO)

## Archivos a crear

```
apps/backend/src/
├── services/ai/
│   ├── ai-response-context.model.ts   # NUEVO — junto a ai-usage-log.model.ts (mismo dueño de escritura)
│   └── ai.service.ts                  # TOCAR — instrumentar chat(), NO cambia extract/classify/summarize
├── features/ai/                       # NUEVO feature HTTP (solo lectura, 6 archivos)
│   ├── ai.types.ts
│   ├── ai.validation.ts
│   ├── ai.service.ts                  # OJO: mismo nombre que services/ai/ai.service.ts, distinto dir/rol
│   ├── ai.controller.ts
│   └── ai.routes.ts
├── app.ts                             # TOCAR — montar `/api/ai/responses`

apps/frontend/src/
├── features/ai-context/               # NUEVO feature
│   ├── types.ts
│   ├── api.ts
│   ├── store/useAiContextStore.ts
│   ├── hooks/
│   │   ├── useAiResponses.ts
│   │   └── useAiResponseContext.ts
│   ├── components/
│   │   ├── AiResponseTable.tsx
│   │   └── AiResponseContextSheet.tsx
│   ├── pages/AiContextPage.tsx
│   └── index.ts                       # barrel (export AiContextPage)
├── router.tsx                         # TOCAR — lazy import + ruta /settings/knowledge/context
├── components/layout/nav-config.ts    # TOCAR — child item bajo "Base de Conocimiento"
├── features/knowledge-base/components/FaqTable.tsx              # TOCAR (deuda UI)
├── features/knowledge-base/components/KnowledgeDocumentTable.tsx # TOCAR (deuda UI)
├── features/admin-plans/pages/AdminPlansPage.tsx                 # TOCAR (deuda UI)
└── features/admin-tenants/pages/AdminTenantsPage.tsx             # TOCAR (deuda UI)

docs/
└── data-model.md                      # TOCAR — fichas nuevas: AiUsageLog, AiResponseContext
```

**No hay feature `features/ai/ai-response-context.model.ts`.** El modelo vive en `services/ai/`
junto a `ai-usage-log.model.ts` porque es `services/ai/ai.service.ts` (la clase `AIService`)
quien lo escribe — mismo criterio que ya aplica hoy a `AiUsageLogModel` y `PromptTemplateModel`.
`features/ai/` solo lo **lee** vía `findByIdScoped`/`findOneScoped`/`findScoped`, igual que
cualquier otro feature lee modelos de otro directorio (precedente: `lead.service.ts` importa
`Cliente` desde `features/cliente/`).

## Contratos

### `services/ai/ai-response-context.model.ts`

```ts
import { Schema, model, type Document, type Types } from 'mongoose';

export interface IPromptSnapshot {
  method: 'chat' | 'extract' | 'classify' | 'summary';
  version: string;
  systemPrompt: string;
}

export interface IRetrievedChunk {
  texto: string;
  documentId: string;
  score?: number;
}

export interface IAiResponseContext {
  tenantId: Types.ObjectId;
  usageLogId: Types.ObjectId;
  promptSnapshot: IPromptSnapshot;
  retrievedChunks: IRetrievedChunk[];
  kbVersion: number | null;
  createdAt?: Date;
}

export interface IAiResponseContextDocument extends IAiResponseContext, Document {}

const AiResponseContextSchema = new Schema<IAiResponseContextDocument>(
  {
    tenantId: { type: Schema.Types.ObjectId, required: true, index: true },
    usageLogId: { type: Schema.Types.ObjectId, required: true, ref: 'AiUsageLog' },
    promptSnapshot: {
      method: { type: String, enum: ['chat', 'extract', 'classify', 'summary'], required: true },
      version: { type: String, required: true },
      systemPrompt: { type: String, required: true },
    },
    retrievedChunks: {
      type: [
        {
          texto: { type: String, required: true },
          documentId: { type: String, required: true },
          score: { type: Number, required: false },
          _id: false,
        },
      ],
      default: [],
    },
    kbVersion: { type: Number, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

AiResponseContextSchema.index({ tenantId: 1, usageLogId: 1 }, { unique: true });
// SIN índice TTL — retención indefinida (auditoría). Ver spec.md → Fuera de alcance.

export const AiResponseContextModel = model<IAiResponseContextDocument>(
  'AiResponseContext',
  AiResponseContextSchema,
);
```

### `services/ai/ai.service.ts` — instrumentación de `chat()`

Cambios acotados, sin tocar `extract`/`classify`/`summarize`:

```ts
async chat(params: AiChatParams): Promise<AiResult<string>> {
  const start = Date.now();
  const template = await this.resolveTemplate(params.tenantId, 'chat');
  const kbVersion = await this.getTenantKbVersion(params.tenantId);
  const usageLogId = new Types.ObjectId();          // NUEVO: pre-generado para enlazar el trace
  const cacheVersion = `${template.version}:${kbVersion}`;
  // ... (cache key sin cambios) ...

  const cached = await getCached<string>(this.redis, cacheKey);
  if (cached !== null) {
    this.logUsage({ _id: usageLogId, tenantId: params.tenantId, method: 'chat', /* ... */ });
    this.writeResponseContext(usageLogId, params.tenantId, template, kbVersion, []);   // NUEVO
    return { data: cached, /* ... */ };
  }

  // ... cortocircuito FAQ: mismo patrón, this.logUsage({ _id: usageLogId, ... }) +
  //     this.writeResponseContext(usageLogId, params.tenantId, template, kbVersion, []) ...

  // ... generación real: mismo patrón tras `setCached` ...
}

private writeResponseContext(
  usageLogId: Types.ObjectId,
  tenantId: Types.ObjectId,
  template: IPromptTemplate,
  kbVersion: number,
  retrievedChunks: KbRetrievalResult[],   // [] hoy — Fase 3 pasará chunks reales
): void {
  // fire-and-forget, igual que logUsage: no bloquea la respuesta al caller
  void createScoped(AiResponseContextModel, tenantId, {
    usageLogId,
    promptSnapshot: { method: template.method, version: template.version, systemPrompt: template.systemPrompt },
    retrievedChunks,
    kbVersion,
  });
}
```

`logUsage` amplía su tipo de parámetro para aceptar un `_id` opcional (solo `chat()` lo pasa; el
resto de métodos sigue dejando que Mongoose lo autogenere):

```ts
private logUsage(log: Omit<IAiUsageLog, 'createdAt'> & { _id?: Types.ObjectId }): void {
  void createScoped(AiUsageLogModel, log.tenantId, log);
}
```

`createScoped(m, tenantId, data)` ya hace `new m({ ...data, tenantId })`; Mongoose honra un `_id`
explícito en `data`, así que no requiere cambios en `base.repository.ts`.

### `features/ai/ai.types.ts`

```ts
export interface AiResponseSummaryDTO {
  id: string;
  method: 'chat' | 'extract' | 'classify' | 'summary';
  model: string;
  cacheHit: boolean;
  fromFaq: boolean;
  durationMs: number;
  tokens: { prompt: number; completion: number; total: number };
  createdAt: string;
}

export interface AiResponseContextDTO extends AiResponseSummaryDTO {
  kbVersion: number | null;
  promptSnapshot: { method: string; version: string; systemPrompt: string } | null;
  retrievedChunks: Array<{ texto: string; documentId: string; score?: number }>;
  contextAvailable: boolean;
}

export interface Paginated<T> { data: T[]; page: number; limit: number; total: number }
```

### `features/ai/ai.validation.ts`

```ts
const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'ID inválido.');
const empty = z.object({});

export const getAiResponseContextSchema = z.object({
  body: empty,
  params: z.object({ id: objectId }),
  query: empty,
});

export const listAiResponsesSchema = z.object({
  body: empty,
  params: empty,
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    method: z.enum(['chat', 'extract', 'classify', 'summary']).optional(),
  }),
});
```

### `features/ai/ai.service.ts` (capa HTTP, solo lectura)

```ts
export async function listAiResponses(
  tenantId: TenantId,
  query: { page: number; limit: number; method?: string },
): Promise<Paginated<AiResponseSummaryDTO>> {
  const filter = query.method ? { method: query.method } : {};
  const [docs, total] = await Promise.all([
    findScoped(AiUsageLogModel, tenantId, filter)
      .sort({ createdAt: -1 }).skip((query.page - 1) * query.limit).limit(query.limit)
      .lean<IAiUsageLog[]>(),
    countScoped(AiUsageLogModel, tenantId, filter),
  ]);
  return { data: docs.map(toSummaryDTO), page: query.page, limit: query.limit, total };
}

export async function getAiResponseContext(
  tenantId: TenantId,
  usageLogId: string,
): Promise<AiResponseContextDTO> {
  const usageLog = await findByIdScoped(AiUsageLogModel, tenantId, usageLogId).lean<IAiUsageLog & { _id: Types.ObjectId }>();
  if (!usageLog) throw new AppError('Respuesta de IA no encontrada.', 404);   // nunca 403 (mismo criterio que lead.service.ts)

  const context = await findOneScoped(AiResponseContextModel, tenantId, { usageLogId: usageLog._id })
    .lean<IAiResponseContext | null>();

  return toContextDTO(usageLog, context);   // context null → contextAvailable:false, promptSnapshot:null, retrievedChunks:[]
}
```

### `features/ai/ai.routes.ts` + montaje

```ts
const aiRoles = authorize(['admin']);
router.get('/', authenticateJWT, requireTenant, aiRoles, validate(listAiResponsesSchema), asyncHandler(listAiResponsesController));
router.get('/:id/context', authenticateJWT, requireTenant, aiRoles, validate(getAiResponseContextSchema), asyncHandler(getAiResponseContextController));
```

`app.ts`: `app.use('/api/ai/responses', aiRoutes);` — junto a las demás rutas tenant-aware
(`/api/leads`, `/api/kb`, ...). Con esto `router.get('/')` resuelve a
`GET /api/ai/responses` y `router.get('/:id/context')` a `GET /api/ai/responses/:id/context`,
exactamente el contrato del spec.

### Frontend — `features/ai-context/`

Patrón calcado de `features/inbox/` (lista + detalle, Zustand para la selección, TanStack Query
por selección):

```ts
// store/useAiContextStore.ts
export const useAiContextStore = create<{ selectedId: string | null; select: (id: string | null) => void }>((set) => ({
  selectedId: null,
  select: (id) => set({ selectedId: id }),
}));

// hooks/useAiResponses.ts
export function useAiResponses(page: number, method?: string) {
  return useQuery({ queryKey: ['ai-responses', page, method], queryFn: () => fetchAiResponses({ page, method }) });
}

// hooks/useAiResponseContext.ts
export function useAiResponseContext(id: string | null) {
  return useQuery({ queryKey: ['ai-response-context', id], queryFn: () => fetchAiResponseContext(id as string), enabled: !!id });
}
```

```ts
// api.ts — apiClient sin prefijo /api (baseURL ya lo incluye)
export const fetchAiResponses = (params: { page: number; limit?: number; method?: string }) =>
  apiClient.get('/ai/responses', { params }).then((r) => r.data);

export const fetchAiResponseContext = (id: string) =>
  apiClient.get(`/ai/responses/${id}/context`).then((r) => r.data);
```

- `AiResponseTable.tsx` — `components/ui/table.tsx`, fila con `onClick={() => select(row.id)}`.
- `AiResponseContextSheet.tsx` — `components/ui/sheet.tsx` (ya vendorizado), abre cuando
  `selectedId !== null`; muestra metadatos, `promptSnapshot.systemPrompt` (con `scroll-area`),
  lista de `retrievedChunks` (o estado vacío si `contextAvailable === false` /
  `retrievedChunks.length === 0`).
- Faltan vendorizar `tabs` y `scroll-area`: `pnpm dlx shadcn@3.8.5 add tabs scroll-area` (versión
  pineada, `apps/frontend/CLAUDE.md`).
- **Antes de escribir los componentes:** invocar `emil-design-eng`, `impeccable:impeccable` y
  `frontend-design:frontend-design` (regla raíz §7), y validar light/dark con tokens semánticos.

### `router.tsx`

```tsx
const AiContextPage = lazy(() =>
  import('./features/ai-context/index.js').then((m) => ({ default: m.AiContextPage })),
);
// ...
{
  path: '/settings/knowledge/context',
  element: (
    <RequireRole roles={['admin']}>
      <Suspense fallback={<Loading />}>
        <AiContextPage />
      </Suspense>
    </RequireRole>
  ),
},
```

### `nav-config.ts`

Nuevo `NavSubItem` bajo "Base de Conocimiento": `{ label: 'Fuentes / Contexto', to:
'/settings/knowledge/context', icon: History }` (import `History` de `lucide-react`).

### Deuda UI — patrón único para los 4 archivos

```tsx
<AlertDialog>
  <AlertDialogTrigger asChild>{/* botón de borrar existente, sin el onClick con window.confirm */}</AlertDialogTrigger>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>{/* mismo texto que tenía el confirm */}</AlertDialogTitle>
      <AlertDialogDescription>Esta acción no se puede deshacer.</AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel>Cancelar</AlertDialogCancel>
      <AlertDialogAction onClick={() => deleteMutation.mutate(id)}>Eliminar</AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

## Notas

- **Dónde vive el trace:** colección nueva `AiResponseContext`, no subdocumento en `AiUsageLog`.
  `AiUsageLog` sigue siendo la entidad "respuesta" (`:id` del endpoint). Razón: `AiUsageLog` se
  escribe en TODAS las llamadas (incluyendo `extract`/`classify`/`summary`) y tiene TTL de 90 días
  para métricas operativas; mezclar ahí un `systemPrompt` y chunks de tamaño variable infla cada
  fila y pisa un ciclo de vida que hoy es intencional. Dos colecciones = dos ciclos de vida.
- **Estado pre-RAG (Opción A):** `chat()` no cambia su lógica de negocio, solo se instrumenta.
  `retrievedChunks: []` hasta que una HU de Fase 3 conecte `searchKnowledge()`. El AC "se ven los
  chunks recuperados" se demuestra con un test que puebla `retrievedChunks` directamente en el
  modelo (simulando el estado post-RAG), separado del test que cubre el estado real de hoy
  (`[]`). Ningún test miente sobre lo que el producto hace en producción.
- **Retención:** sin TTL, indefinida por ahora (decisión confirmada). Riesgo documentado en
  `spec.md` → Fuera de alcance: una HU futura de compliance define la política real.
- **Escritura sin bloquear:** `usageLogId` se pre-genera (`new Types.ObjectId()`) para poder
  enlazar `AiResponseContext` sin awaitear el insert de `AiUsageLog` — ambas escrituras siguen
  siendo fire-and-forget, en paralelo, después de que `chat()` ya tiene la respuesta lista.
- **Endpoint de listado añadido al alcance original** (el HU solo pedía el de detalle): sin él la
  vista frontend no tiene forma de encontrar qué `:id` inspeccionar, porque `AiUsageLog` no está
  vinculado a ninguna conversación/lead hoy. Decisión confirmada explícitamente antes de planear.
- **Naming:** `features/ai/ai.service.ts` (HTTP, funciones) y `services/ai/ai.service.ts` (clase
  `AIService`, dominio) son archivos distintos en directorios distintos — no hay colisión de
  imports, pero conviene que quien implemente lo tenga presente al nombrar tests
  (`features/ai/ai.service.test.ts` vs `services/ai/ai.service.test.ts`).

## Verificación

- `pnpm --filter backend typecheck` (`tsc --noEmit`).
- `pnpm --filter backend test` — incluye `services/ai/ai.service.test.ts` (regresión: `chat()` no
  cambia su `AiResult`) y los tests nuevos de `features/ai/`.
- `pnpm --filter frontend build && pnpm --filter frontend lint`.
- Revisión visual manual de `/settings/knowledge/context` en light y dark (screenshots
  descartables, no se commitean).
