# HU-OMNI-03 — Plan técnico (CÓMO)

> El QUÉ está en `spec.md`; la ejecución (checklist) en `tasks.md`. Este plan respeta el patrón de
> 6 archivos de `apps/backend/CLAUDE.md`, el aislamiento multi-tenant de `docs/multi-tenancy.md` y
> las reglas del inbox de `apps/frontend/CLAUDE.md`. Reutiliza la capa IA de `HT-AI-01`.

## Archivos a crear / tocar

```
apps/backend/src/
  features/cliente/
    cliente.types.ts            # + IResumenIA, IResumenResponse, IContactCardResponse, IContactHistoryResponse
    cliente.model.ts            # + subdoc opcional resumenIA
    cliente.validation.ts       # + historyValidation ({ params:{id}, query:{page,limit} })
    cliente.service.ts          # + getContactHistory(tenantId, clienteId, query)
    cliente.controller.ts       # + getContactHistoryController (reemplaza placeholder 501)
    cliente.routes.ts           # + GET /:id/history (router hoy vacío)
    cliente.service.test.ts     # NUEVO: aislamiento + casos de getContactHistory
  features/conversation/
    conversation.validation.ts  # + summaryValidation ({ params:{id} })
    conversation.service.ts     # + generateConversationSummary(tenantId, clienteId)
    conversation.controller.ts  # + generateSummaryController
    conversation.routes.ts      # + POST /:id/summary
    conversation.summary.test.ts# NUEVO: aislamiento + transcript + 422 sin mensajes
  services/ai/
    ai.service.ts               # + método summarize()
    ai-service.types.ts         # + AiSummarizeParams
    ai-service.singleton.ts     # NUEVO: getAIService() (ioredis lazy singleton)
  scripts/
    seed-prompt-templates.ts    # + plantilla global method:'summary'

apps/frontend/src/features/inbox/
  api.ts                        # + fetchContactHistory, generateSummary
  types.ts                      # + ContactHistoryDTO, ContactCardDTO, ResumenDTO
  useInboxStore.ts              # + contactPanelOpen + setContactPanelOpen
  hooks/useContactHistory.ts    # NUEVO: useQuery(['contact-history', clienteId])
  hooks/useGenerateSummary.ts   # NUEVO: useMutation -> invalida ['contact-history', clienteId]
  hooks/useInboxRealtime.ts     # message:new del cliente activo -> invalida ['contact-history', id]
  components/ContactPanel.tsx    # NUEVO: drawer con ui/sheet (ficha + historial + resumen)
  components/ContactCard.tsx     # NUEVO: ficha del contacto
  components/ContactSummaryCard.tsx # NUEVO: resumen + botón + badge "desactualizado" + skeleton
  pages/InboxPage.tsx           # + disparador del panel en el header de la conversación activa
```

`app.ts` **no cambia**: `/api/clientes` y `/api/conversations` ya están montados; solo se rellenan
los routers existentes.

## Contratos

### `cliente.types.ts`
```ts
export interface IResumenIA {
  texto: string;
  generadoAt: Date;
  mensajesHasta: Date;   // = ultimoMensajeAt del cliente al generar (base de la staleness)
  modelo: string;        // env.GEMINI_MODEL usado
}

export interface IResumenResponse {
  texto: string;
  generadoAt: string;        // ISO
  desactualizado: boolean;   // ultimoMensajeAt > mensajesHasta
}

export interface IContactCardResponse {
  id: string;
  nombre: string | null;
  telefono: string;
  canalOrigen: string;
  estadoComercial: string;
  nivelInteres: string | null;
  objecionPrincipal: string | null;
  rolContacto: string | null;
  tags: string[];
  asesorId: string | null;
  ultimoMensajeAt: string | null;
  createdAt: string;
}

export interface IContactHistoryResponse {
  contacto: IContactCardResponse;
  resumen: IResumenResponse | null;
  mensajes: IPaginated<IMessageResponse>;   // IMessageResponse/IPaginated se reusan de conversation.types
}
```

### `cliente.model.ts`
```ts
// Sub-schema embebido, opcional (no rompe documentos existentes):
resumenIA: {
  texto: { type: String },
  generadoAt: { type: Date },
  mensajesHasta: { type: Date },
  modelo: { type: String },
}   // _id: false
```
No requiere índices nuevos: el historial usa el índice existente `{ tenantId, clienteId, createdAt }`
de `Message`, y la ficha usa `findByIdScoped(Cliente, ...)`.

### `cliente.validation.ts`
```ts
export const historyValidation = {
  params: z.object({ id: objectIdSchema }),
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  }),
};
export type HistoryQuery = z.infer<typeof historyValidation.query>;
```
(Reutilizar el `objectIdSchema` y el patrón de paginación ya usados en `conversation.validation.ts`.)

### `cliente.service.ts`
```ts
export async function getContactHistory(
  tenantId: string,
  clienteId: string,
  query: HistoryQuery,
): Promise<IContactHistoryResponse>;
```
- `findByIdScoped(Cliente, tenantId, clienteId).lean()` → `AppError('Contacto no encontrado.', 404)`.
- Mensajes: mismo patrón que `getThread` — `countScoped` + `findScoped(Message, tenantId,
  { clienteId })` `.sort({ createdAt: -1 }).skip().limit().lean()`, `.reverse()`, map con
  `toMessageResponse` (reusa `conversation.mapper.ts`).
- `resumen`: si `cliente.resumenIA` existe → `{ texto, generadoAt, desactualizado:
  cliente.ultimoMensajeAt > cliente.resumenIA.mensajesHasta }`, si no `null`.

### `conversation.validation.ts`
```ts
export const summaryValidation = { params: z.object({ id: objectIdSchema }) };
```

### `conversation.service.ts`
```ts
export async function generateConversationSummary(
  tenantId: string,
  clienteId: string,
): Promise<IResumenResponse>;
```
- `findByIdScoped(Cliente, tenantId, clienteId)` → 404 si no.
- Trae **todos** los mensajes de texto: `findScoped(Message, tenantId, { clienteId })
  .sort({ createdAt: 1 }).lean()`; si no hay mensajes de texto → `AppError('Sin mensajes para
  resumir.', 422)`.
- Construye `historial: ChatTurn[]` → `sender === 'user'` ⇒ `role:'user'`; `'bot' | 'agent'` ⇒
  `role:'model'`; `content = texto` (mensajes no-texto se etiquetan con `nonTextPreview` reutilizable).
- `const { data } = await getAIService().summarize({ tenantId: new Types.ObjectId(tenantId), historial })`.
- Persiste con `findOneAndUpdateScoped(Cliente, tenantId, { _id }, { resumenIA: { texto: data,
  generadoAt: now, mensajesHasta: cliente.ultimoMensajeAt ?? now, modelo: env.GEMINI_MODEL } },
  { new: true })`.
- Devuelve `{ texto, generadoAt: now.toISOString(), desactualizado: false }`.

### `ai-service.types.ts` + `ai.service.ts`
```ts
export interface AiSummarizeParams { tenantId: Types.ObjectId; historial: ChatTurn[]; }

// AIService:
async summarize(params: AiSummarizeParams): Promise<AiResult<string>> {
  const start = Date.now();
  const template = await this.resolveTemplate(params.tenantId, 'summary');   // lanza 500 si falta
  const { result, usage } = await this.provider.generateReply({
    historial: params.historial,
    tono: template.systemPrompt,
    instrucciones: template.systemPrompt,
  });
  const durationMs = Date.now() - start;
  this.logUsage({ tenantId: params.tenantId, method: 'summary', llmModel: env.GEMINI_MODEL, ...usage, cacheHit: false, durationMs });
  return { data: result, cacheHit: false, ...usage, durationMs };
}
```
Sin cache Redis: la persistencia vive en `Cliente.resumenIA`. No se toca `ILlmProvider` ni
`GeminiProvider` (se reutiliza `generateReply`).

### `ai-service.singleton.ts`
```ts
// ioredis lazy singleton (mismo patrón que realtime.publisher.ts), para no crear un AIService/Redis
// por request. Exporta getAIService(): AIService usando createAIService(redis).
export function getAIService(): AIService;
```

### `seed-prompt-templates.ts` — nueva plantilla global
```ts
{ tenantId: null, method: 'summary', version: '1.0.0', isActive: true,
  systemPrompt: `Resume la conversación entre el asesor y el prospecto en español, de forma breve y
neutral. Incluye: intención/necesidad del prospecto, objeciones, acuerdos y el próximo paso
pendiente. No inventes datos que no estén en la conversación.` }
```

### Endpoints (rutas + cadena de middlewares fija)
```ts
// cliente.routes.ts
router.get('/:id/history',
  authenticateJWT, requireTenant, authorize(['admin']),
  validate(historyValidation), asyncHandler(getContactHistoryController));

// conversation.routes.ts
router.post('/:id/summary',
  authenticateJWT, requireTenant, authorize(['admin']),
  validate(summaryValidation), asyncHandler(generateSummaryController));
```
Controllers delgados: `const tenantId = req.user!.tenantId!.toString();`, `req.params.id`, sin
try/catch, sin Mongoose; delegan al service y devuelven el DTO.

### Frontend (contratos de datos)
```ts
// api.ts
fetchContactHistory(clienteId: string, page = 1): Promise<ContactHistoryDTO>   // GET /api/clientes/:id/history
generateSummary(clienteId: string): Promise<ResumenDTO>                        // POST /api/conversations/:id/summary
```
- `useContactHistory(clienteId)` → `useQuery({ queryKey: ['contact-history', clienteId], enabled: !!clienteId })`.
- `useGenerateSummary(clienteId)` → `useMutation` con `onSuccess: () => qc.invalidateQueries({ queryKey: ['contact-history', clienteId] })`.
- `useInboxRealtime`: en `message:new` cuyo `conversationId === activeId`, invalidar `['contact-history', activeId]`.
- `ContactPanel` usa `@/components/ui/sheet`; `ContactSummaryCard` usa `button` + `badge` + `skeleton`.
  Solo tokens semánticos (`bg-background`, `text-muted-foreground`, `bg-destructive-subtle`, …).

## Notas

- **Aislamiento:** todas las lecturas/escrituras vía `*Scoped`; el historial de mensajes reusa el
  patrón tenant-safe de `getThread` (no hay `aggregate` nuevo). `tenantId` siempre del token.
- **Staleness derivada:** no se escribe nada al llegar entrantes; `desactualizado` se calcula al leer
  el historial comparando `ultimoMensajeAt` (ya mantenido por HT-WA-01) con `resumenIA.mensajesHasta`.
- **Convención de clases:** la capa `services/ai/` ya usa clases (`AIService`, `GeminiProvider`);
  `summarize()` sigue ese estilo existente, no el funcional de los features de dominio.
- **Diseño:** el panel aplica las skills *emil-design-eng* + *frontend-design* (jerarquía tipográfica,
  motion sobrio del sheet, estados vacío/carga/error). Imports relativos con extensión `.js`.

## Verificación

- `pnpm --filter backend typecheck` en verde.
- `pnpm --filter backend test` (incluye los tests de aislamiento de ambos endpoints) en verde.
- `pnpm --filter frontend build && pnpm --filter frontend lint` sin errores.
- Prueba manual: entrante nuevo → historial muestra resumen "desactualizado" → botón regenera y limpia.
