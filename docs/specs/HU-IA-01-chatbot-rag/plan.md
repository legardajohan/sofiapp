# HU-IA-01 — Plan técnico (CÓMO)

> Todos los snippets de este documento están escritos contra el código **real** del repo:
> Zod 3 (`import { z } from 'zod'`), controllers `RequestHandler`, repositorio tenant-safe y
> `zod` con la forma `{ body, params, query }`. Si un snippet contradice al codebase, gana el
> codebase — y hay que corregir este plan.

## Archivos a crear

```
apps/backend/src/
├── features/ai/
│   ├── ai-answer.routes.ts            # [CREAR] router propio: POST /answer, GET|PUT /assistant
│   ├── ai-assistant.service.ts        # [CREAR] lee/guarda el PromptTemplate 'chat' del tenant
│   └── ai-answer.controller.ts        # [CREAR] controllers delgados de answer + assistant
├── workers/
│   └── ai-reply.processor.ts          # [CREAR] processAiReplyJob() — función pura, sin `new Worker`

apps/frontend/src/features/ai-assistant/
├── api.ts                             # [CREAR] GET|PUT /ai/assistant vía apiClient
├── types.ts                           # [CREAR]
├── hooks/useAssistantConfig.ts        # [CREAR] TanStack Query (query + mutation)
├── pages/AssistantConfigPage.tsx      # [CREAR]
├── components/AssistantConfigForm.tsx # [CREAR]
└── index.ts                           # [CREAR] barrel (patrón de features/ai-context/)
```

## Archivos a modificar

```
apps/backend/src/
├── config/
│   ├── env.ts                         # [MODIFICAR] KB_MIN_SCORE
│   └── queues.ts                      # [MODIFICAR] AI_REPLY_QUEUE_NAME + AI_REPLY_JOB_NAME + aiReplyQueue
├── features/kb/
│   └── kb.retrieval.service.ts        # [MODIFICAR] filtrar por KB_MIN_SCORE (el archivo YA EXISTE)
├── services/ai/
│   ├── ai-service.types.ts            # [MODIFICAR] RetrievedChunk + KnowledgeRetriever
│   ├── ai.service.ts                  # [MODIFICAR] puerto inyectado + prompt RAG + retrievedChunks
│   └── prompt-template.model.ts       # [MODIFICAR] campo `tono?: string`
├── features/ai/
│   ├── ai.types.ts                    # [MODIFICAR] DTOs de answer y assistant
│   └── ai.validation.ts               # [MODIFICAR] aiAnswerSchema + updateAssistantSchema
├── features/message/
│   ├── message.types.ts               # [MODIFICAR] `sender?` en ISendMessageDto
│   └── message.service.ts             # [MODIFICAR] sendMessage respeta dto.sender (default 'agent')
├── features/conversation/
│   └── conversation.service.ts        # [MODIFICAR] replyFromIa()
├── seed/
│   └── seed-prompt-templates.ts       # [MODIFICAR] plantilla global `chat` (BLOCKER)
├── workers/
│   └── inbound-message.processor.ts   # [MODIFICAR] sustituir el TODO(Fase 3) por el encolado
├── worker.ts                          # [MODIFICAR] construir y registrar el Worker de ai-reply
└── app.ts                             # [MODIFICAR] app.use('/api/ai', aiAnswerRoutes)

apps/frontend/src/
├── router.tsx                         # [MODIFICAR] ruta /settings/assistant (lazy + RequireRole)
└── components/layout/nav-config.ts    # [MODIFICAR] entrada "Asistente IA"

docs/
└── data-model.md                      # [MODIFICAR] `PromptTemplate.tono` + cierre de la nota de Fase 3
```

---

## 0. Prerrequisitos (blocker)

### `seed/seed-prompt-templates.ts` — plantilla global `chat`

Sin esto, **`chat()` lanza `AppError(500)` en todos los tenants**: `GLOBAL_TEMPLATES` solo trae
`summary` y `extract`. El seed ya es idempotente (`$setOnInsert`), así que basta añadir la entrada:

```ts
{
  tenantId: null,
  method: 'chat',
  version: '1.0.0',
  tono: 'profesional, claro y cercano',
  systemPrompt: [
    'Eres el asistente virtual de la empresa y atiendes a clientes por WhatsApp.',
    '',
    'Responde ÚNICAMENTE con la información del bloque CONTEXTO que se te entrega en cada consulta.',
    'No uses conocimiento general, no supongas y no completes datos que no aparezcan ahí:',
    'precios, horarios, plazos, direcciones y condiciones solo pueden salir del CONTEXTO.',
    '',
    'Si el CONTEXTO no alcanza para responder, responde exactamente:',
    '"No tengo información suficiente para responder esa pregunta. Por favor, contacta a un asesor."',
    'y no añadas nada más.',
    '',
    'Escribe en español, en mensajes breves de WhatsApp (2 a 4 frases), sin markdown ni viñetas.',
  ].join('\n'),
  isActive: true,
},
```

### `services/ai/prompt-template.model.ts` — campo `tono`

`tono?: string` en `IPromptTemplate` y en el schema (`{ type: String }`, sin `required`).
Es retrocompatible: `undefined` significa "usa el tono por defecto del código".

---

## 1. Recuperación (RAG)

### `features/kb/kb.retrieval.service.ts` — **ya existe**, solo se le añade el umbral

El archivo es `kb.retrieval.service.ts` (**punto, no guion**) y quedó así en HU-KB-01:

```ts
export async function searchKnowledge(
  tenantId: string | Types.ObjectId,
  query: string,
  k: number = env.KB_RETRIEVAL_K,
  provider: ILlmProvider = new GeminiProvider(),
): Promise<KbRetrievalResult[]> {
  const { result: vectors } = await provider.embedTexts({ texts: [query], taskType: 'RETRIEVAL_QUERY' });
  const queryVector = vectors[0];
  if (!queryVector) return [];

  const chunks = await vectorSearchScoped(tenantId, queryVector, k);
  return chunks.map((c) => ({ texto: c.texto, documentId: c.documentId.toString(), ... }));
}
```

Lo único que falta es descartar los fragmentos irrelevantes, **después** del `vectorSearchScoped`:

```ts
  return chunks
    .filter((c) => (c.score ?? 0) >= env.KB_MIN_SCORE)
    .map((c) => ({ ... }));
```

> **No** se escribe un `KbChunk.aggregate` nuevo. `kb.repository.ts` es el único lugar autorizado a
> emitir un `$vectorSearch`, y ya inyecta `filter.tenantId` desde el argumento más un `$match`
> defensivo. Duplicar el pipeline fuera de él rompería la regla nº1 de multi-tenancy.

### `config/env.ts` — `KB_MIN_SCORE`

```ts
  // Umbral de relevancia del RAG (HU-IA-01). MISMA ESCALA que FAQ_MATCH_THRESHOLD: Atlas normaliza
  // el coseno a (1 + cos) / 2, así que 0.75 ≈ coseno 0.50. Es a propósito más laxo que el 0.85 de
  // FAQ: allí un match dispara una respuesta literal; aquí solo decide qué contexto ve el modelo,
  // y el system prompt ya lo obliga a decir "no tengo información" si no alcanza.
  // Calibrar con src/scripts/kb-smoke-retrieval.ts, nunca a ojo.
  KB_MIN_SCORE: z.coerce.number().min(0).max(1).default(0.75),
```

---

## 2. Inyección del RAG en `AIService.chat()`

### El puerto, no el import (corrección arquitectónica central)

`services/ai` es un servicio transversal y **no puede importar un feature**. El repo ya resolvió
exactamente este problema para las FAQ: `ai-service.types.ts:21-30` declara el puerto `FaqMatcher`
con el comentario *"se declara aquí (y no se importa de `features/kb-faq/`) para que este servicio
transversal no dependa de un feature: el cableado real ocurre solo en `createAIService`"*.

El RAG se conecta igual, no importando `searchKnowledge` dentro de `ai.service.ts`:

```ts
// services/ai/ai-service.types.ts
/** Fragmento de KB recuperado. Estructuralmente compatible con `KbRetrievalResult`
 *  (features/kb/kb.types.ts) y con `IRetrievedChunk` (ai-response-context.model.ts):
 *  los tres son { texto, documentId, score? }, así que no hace falta conversión. */
export interface RetrievedChunk {
  texto: string;
  documentId: string;
  score?: number;
}

export type KnowledgeRetriever = (
  tenantId: Types.ObjectId,
  query: string,
) => Promise<RetrievedChunk[]>;
```

```ts
// services/ai/ai.service.ts
/** Sin retriever cableado, el servicio se comporta como antes de HU-IA-01. */
const noopRetriever: KnowledgeRetriever = async () => [];

export class AIService {
  constructor(
    private readonly provider: ILlmProvider,
    private readonly redis: Redis,
    private readonly faqMatcher: FaqMatcher = noopFaqMatcher,
    private readonly retriever: KnowledgeRetriever = noopRetriever,
  ) {}
  …
}

export function createAIService(redis: Redis): AIService {
  // Único punto de cableado entre services/ai y los features (kb-faq y kb).
  return new AIService(new GeminiProvider(), redis, matchFaq, searchKnowledge);
}
```

`searchKnowledge` encaja en `KnowledgeRetriever` sin adaptador: sus parámetros 3 y 4 tienen valor
por defecto y `KbRetrievalResult` es estructuralmente `RetrievedChunk`.

### Dónde va la llamada dentro de `chat()`

Orden obligatorio, respetando los cortocircuitos que ya existen:

1. `resolveTemplate` + `getTenantKbVersion` + caché exacta → si hay hit, **return sin RAG** (AC7).
2. Cortocircuito por FAQ → si hay match, **return sin RAG** (AC8).
3. **Aquí** entra `await this.retriever(params.tenantId, ultimaPregunta)`.
4. `provider.generateReply(...)`.
5. `writeResponseContext(..., retrievedChunks)` — ya no `[]`.

`ultimaPregunta` ya está calculada en la línea 66 para el FAQ matching: se reutiliza. Si es
`undefined` (historial sin turnos de usuario), no se recupera nada y se usa el fallback.

### Composición del prompt: `tono` e `instrucciones` son cosas distintas

`GeminiProvider.generateReply` compone `Tono: ${tono}. ${instrucciones}` (`gemini.provider.ts:114`).
Pasar el mismo texto en ambos campos lo mete **dos veces** en el system prompt y cobra sus tokens dos
veces — el repo ya lo sufrió y lo corrigió en `summarize()` (`ai.service.ts:140-141`). Por eso:

```ts
const contexto = retrievedChunks.length > 0
  ? retrievedChunks.map((c, i) => `--- Fragmento ${i + 1} ---\n${c.texto}`).join('\n\n')
  : null;

const bloqueRag = contexto
  ? `\n\n--- CONTEXTO ---\n${contexto}\n--- FIN CONTEXTO ---`
  : '\n\n--- CONTEXTO ---\n(sin información en la base de conocimiento para esta consulta)\n--- FIN CONTEXTO ---';

const { result: reply, usage } = await this.provider.generateReply({
  historial: params.historial,
  // El tono es corto y va SOLO en `tono`; las instrucciones + contexto van SOLO en `instrucciones`.
  tono: params.tono ?? template.tono ?? 'profesional, claro y cercano',
  instrucciones: (params.instrucciones ?? template.systemPrompt) + bloqueRag,
});
```

El "no inventes / di que no tienes información" vive en el `systemPrompt` de la plantilla (sección 0),
no incrustado en el código: así el admin puede afinarlo desde `/settings/assistant` sin desplegar.
El bloque vacío se envía igualmente (en vez de omitirlo) para que el modelo vea explícitamente que
el contexto está vacío y aplique la regla de la plantilla.

### Caché: la clave no cambia

`buildCacheKey` ya usa `historial + tono + instrucciones` con versión `template.version:kbVersion`.
Se deja **igual**, y es suficiente: misma pregunta + mismo `kbVersion` ⇒ mismos chunks recuperados,
y HU-KB-03 bumpea `kbVersion` en cada reindexado (`kb.service.ts:37`). Meter los chunks en la clave
obligaría a embeder la consulta **antes** de mirar la caché, que es justo el coste que el diseño de
HU-KB-02 evita ("va DESPUÉS de la caché exacta —que no cuesta ni un embedding—").

### Auditoría

`writeResponseContext` recibe los chunks solo en la rama generada. Las ramas de caché (línea 59) y
de FAQ (línea 72) siguen pasando `[]` **a propósito**: no hubo recuperación que auditar. Hay que
actualizar el comentario de `ai.service.ts:182-186`, que hoy dice que los chunks viajan vacíos
"hasta que una HU de Fase 3 conecte `searchKnowledge()`". Esta es esa HU.

---

## 3. Endpoints HTTP

### `features/ai/ai.types.ts`

```ts
export interface AiAnswerRequest { mensaje: string; clienteId?: string }
export interface AiAnswerResponse {
  respuesta: string;
  fromFaq: boolean;
  cacheHit: boolean;
  chunksUsados: number;
}

export interface AssistantConfigDTO {
  tono: string;
  systemPrompt: string;
  /** `true` si el tenant aún no tiene plantilla propia y está viendo la global. */
  heredado: boolean;
  version: string;
}
export interface UpdateAssistantDTO { tono: string; systemPrompt: string }
```

### `features/ai/ai.validation.ts` — Zod **3**, con el patrón `empty` que ya usa el archivo

```ts
export const aiAnswerSchema = z.object({
  body: z.object({
    mensaje: z.string().min(1).max(2000),
    clienteId: objectId.optional(),
  }),
  params: empty,
  query: empty,
});

export const getAssistantSchema = z.object({ body: empty, params: empty, query: empty });

export const updateAssistantSchema = z.object({
  body: z.object({
    tono: z.string().min(1).max(200),
    systemPrompt: z.string().min(1).max(8000),
  }),
  params: empty,
  query: empty,
});
```

> `objectId` y `empty` ya están definidos arriba en ese archivo. **No** usar `zod/v4`: el backend
> declara `zod ^3.24.0` en su `package.json`.

### `features/ai/ai-assistant.service.ts`

```ts
/** Config efectiva del asistente: la plantilla `chat` del tenant, o la global como fallback. */
export async function getAssistantConfig(tenantId: string): Promise<AssistantConfigDTO>;

/**
 * Upsert de la plantilla `chat` DEL TENANT vía `findOneAndUpdateScoped` (nunca `Model.updateOne`).
 * Bumpea `version` en cada guardado: la clave de caché de IA la incluye, así que el cambio de prompt
 * deja inalcanzables las respuestas cacheadas con el prompt viejo (AC12). Nunca toca la global.
 */
export async function updateAssistantConfig(
  tenantId: string,
  dto: UpdateAssistantDTO,
): Promise<AssistantConfigDTO>;
```

### `features/ai/ai-answer.controller.ts` — estilo real del repo

Controllers como `RequestHandler`, sin `try/catch`, `tenantId` del token, `res.status(200).json(...)`:

```ts
export const aiAnswerController: RequestHandler = async (req, res) => {
  const tenantId = req.user!.tenantId!.toString();
  const { mensaje } = req.body as AiAnswerRequest;
  res.status(200).json(await answerQuestion(tenantId, mensaje));
};

export const getAssistantController: RequestHandler = async (req, res) => {
  res.status(200).json(await getAssistantConfig(req.user!.tenantId!.toString()));
};

export const updateAssistantController: RequestHandler = async (req, res) => {
  const tenantId = req.user!.tenantId!.toString();
  res.status(200).json(await updateAssistantConfig(tenantId, req.body as UpdateAssistantDTO));
};
```

`answerQuestion` vive en el service (arma el `ChatTurn[]` de un solo turno y llama a
`getAIService().chat()`); el controller no conoce `AIService` ni Mongoose.

### `features/ai/ai-answer.routes.ts` + montaje

```ts
router.post('/answer', authenticateJWT, requireTenant, authorize(['admin']), validate(aiAnswerSchema), asyncHandler(aiAnswerController));
router.get('/assistant', authenticateJWT, requireTenant, authorize(['admin']), validate(getAssistantSchema), asyncHandler(getAssistantController));
router.put('/assistant', authenticateJWT, requireTenant, authorize(['admin']), validate(updateAssistantSchema), asyncHandler(updateAssistantController));
```

En `app.ts`, **después** de la línea de auditoría, para que el prefijo más específico gane:

```ts
app.use('/api/ai/responses', aiRoutes);   // HU-KB-04 — ya existe, no se toca
app.use('/api/ai', aiAnswerRoutes);       // HU-IA-01
```

Así el endpoint queda en `POST /api/ai/answer`, tal como pide la historia, sin colgarlo de
`/api/ai/responses/answer` (una URL que mentiría: no es una respuesta de auditoría).

---

## 4. Cola y worker de auto-reply

### `config/queues.ts`

Respetando la convención `*_QUEUE_NAME` + `*_JOB_NAME` que ya usa `kb-index`:

```ts
export const AI_REPLY_QUEUE_NAME = 'ai-reply';
export const AI_REPLY_JOB_NAME = 'auto-reply';
export const aiReplyQueue = new Queue(AI_REPLY_QUEUE_NAME, { connection });
```

> ⚠️ `ai.routes.test.ts:6-14` **mockea `config/queues.js` con un objeto literal** para no abrir Redis
> al importar `app`. Añadir una cola sin actualizar ese mock rompe el import. Hay que revisar todos
> los tests que hagan `vi.mock('../../config/queues.js')` y añadirles `AI_REPLY_QUEUE_NAME`,
> `AI_REPLY_JOB_NAME` y `aiReplyQueue: { add: vi.fn() }`.

### `workers/ai-reply.processor.ts` — función pura, patrón `kb-index`

`kb-index.processor.ts` exporta `processKbIndexJob(data, provider)` y el `Worker` se construye en
`worker.ts`. Ese es el patrón a seguir (el de `inbound-message.processor.ts`, que exporta un `Worker`
ya construido, no es testeable sin Redis):

```ts
export interface AiReplyJobData {
  tenantId: string;
  clienteId: string;
}

export async function processAiReplyJob(data: AiReplyJobData): Promise<void> {
  const { tenantId, clienteId } = data;

  // 1. Re-chequeo de iaHabilitada: el asesor pudo tomar el control entre el encolado y el proceso.
  const cliente = await findByIdScoped(Cliente, tenantId, clienteId).lean();
  if (!cliente?.iaHabilitada) return;

  // 2. Historial reciente. Mismo mapeo que generateConversationSummary (conversation.service.ts:255).
  const docs = await findScoped(Message, tenantId, { clienteId: new Types.ObjectId(clienteId) })
    .sort({ createdAt: -1 })
    .limit(HISTORIAL_MAX)
    .lean();
  const historial: ChatTurn[] = docs
    .reverse()
    .map((m) => ({ role: m.sender === 'user' ? 'user' : 'model', content: m.texto ?? '' }))
    .filter((t) => t.content !== '');
  if (historial.length === 0) return;

  // 3. RAG + Gemini.
  const { data: respuesta } = await getAIService().chat({
    tenantId: new Types.ObjectId(tenantId),
    historial,
  });

  // 4. Envío + realtime + reordenado de bandeja, como Sofi (no como asesor).
  try {
    await replyFromIa(tenantId, clienteId, respuesta);
  } catch (err) {
    // Fuera de la ventana de 24 h o cuota de mensajes agotada: AppError esperable, no un fallo
    // del job. Reintentar solo volvería a pagar la generación para fallar igual.
    if (err instanceof AppError) {
      logger.warn('Auto-reply no enviado', { tenantId, clienteId, error: err.message });
      return;
    }
    throw err;
  }
}
```

El mensaje entrante **no** se pasa en el job: ya está persistido cuando se encola, así que sale del
historial. Eso evita que el texto viaje duplicado y que el job se desincronice del hilo real.

> Nota sobre el turno final: Gemini rechaza peticiones cuyo último turno sea del modelo (por eso
> existe `conTurnoDeTarea`). Aquí no aplica: el último mensaje del hilo es siempre el inbound del
> cliente que disparó el job.

### `worker.ts`

```ts
const aiReplyWorker = new Worker<AiReplyJobData>(
  AI_REPLY_QUEUE_NAME,
  async (job) => { await processAiReplyJob(job.data); },
  { connection: redisConnection },
);
```

Y añadirlo al array del bucle de handlers `failed` (`worker.ts:59`), que hoy es
`[llmWorker, outboundWorker, campaignWorker, kbIndexWorker]`.

### `workers/inbound-message.processor.ts`

Sustituir el `TODO(Fase 3)` de la línea 71 (justo después de `notifyInboundMessage`):

```ts
if (cliente.iaHabilitada && msg.type === 'text' && msg.text?.body) {
  await aiReplyQueue.add(
    AI_REPLY_JOB_NAME,
    { tenantId, clienteId: clienteId.toString() },
    // Sin reintentos: cada intento vuelve a pagar embedding + generación.
    { attempts: 1, removeOnComplete: true, removeOnFail: 100 },
  );
}
```

---

## 5. Envío de la respuesta de Sofi

### `features/message/message.types.ts` + `message.service.ts`

`sendMessage` hoy escribe `sender: 'agent'` fijo (`message.service.ts:54`). Se abre el DTO:

```ts
export interface ISendMessageDto {
  clienteId: string;
  texto: string;
  /** Quién escribe. Default `'agent'`: todo lo que existía hoy sigue igual. */
  sender?: Extract<Sender, 'agent' | 'bot'>;
}
```

y en el `createScoped`: `sender: dto.sender ?? 'agent'`. Sin esto, las respuestas de la IA quedan
indistinguibles de las de un asesor en la bandeja, en la auditoría y en el transcript que alimenta
`generateConversationSummary`.

### `features/conversation/conversation.service.ts` — `replyFromIa`

`sendMessage` por sí solo **no publica realtime** ni actualiza `ultimoMensajeAt`: eso lo hace
`replyMessage` (líneas 202-234). Si el worker llamara a `sendMessage` directo, la respuesta de Sofi
no aparecería en vivo ni reordenaría la bandeja.

Se extrae el cuerpo de `replyMessage` a un helper privado parametrizado por `sender`, y se exponen
las dos puertas:

```ts
export async function replyMessage(tenantId, clienteId, texto): Promise<IMessageResponse> {
  return enviarYNotificar(tenantId, clienteId, texto, 'agent');
}

/** Respuesta automática de Sofi (HU-IA-01). Idéntica a `replyMessage` salvo el `sender`. */
export async function replyFromIa(tenantId, clienteId, texto): Promise<IMessageResponse> {
  return enviarYNotificar(tenantId, clienteId, texto, 'bot');
}
```

---

## 6. Frontend — configuración del asistente

> **Antes de escribir un solo componente** hay que invocar `emil-design-eng`,
> `impeccable:impeccable` y `frontend-design:frontend-design` y aplicar sus criterios. Es la regla
> nº7 del `CLAUDE.md` raíz y no es opcional. Y se usan los componentes de shadcn/ui ya vendorizados
> en `src/components/ui/` (`card`, `input`, `textarea`, `label`, `button`, `sonner`, `skeleton`) en
> vez de reinventar controles.

Estructura espejo de `features/ai-context/` (el feature más parecido y más reciente):

- `api.ts` — `apiClient.get('/ai/assistant')` / `apiClient.put('/ai/assistant', dto)`. Las rutas
  **no** llevan el prefijo `/api`: lo aporta el `baseURL` del `apiClient`.
- `hooks/useAssistantConfig.ts` — `useQuery(['ai-assistant'])` + `useMutation` que invalida esa key
  y lanza un toast de `sonner`.
- `pages/AssistantConfigPage.tsx` + `components/AssistantConfigForm.tsx`:
  - Campo **Tono** (`input`, una línea) y **Instrucciones del asistente** (`textarea`, varias líneas,
    con contador contra el máximo de 8000).
  - Aviso cuando `heredado === true`: "Estás viendo la configuración por defecto; al guardar se
    creará la de tu empresa."
  - Estados de carga (`skeleton`) y de guardado (botón deshabilitado), y guardado deshabilitado si
    no hay cambios.
  - Prolijo en **light y dark** con los tokens semánticos del proyecto.
- `index.ts` — barrel que exporta `AssistantConfigPage`, para el `lazy()` del router.

Cableado:
- `router.tsx`: `/settings/assistant` con `lazy` + `Suspense fallback={<Loading />}` +
  `RequireRole roles={['admin']}`, junto a las demás rutas de `/settings/*`.
- `components/layout/nav-config.ts`: entrada **"Asistente IA"** en el grupo Configuración, al lado de
  "Base de Conocimiento", con `roles: ['admin']`.

---

## Notas

- El endpoint `POST /api/ai/answer` es la puerta **de depuración y de integraciones**: el flujo real
  de auto-reply llama a `AIService.chat()` dentro del worker, sin salto HTTP. Se documenta así para
  que nadie lo convierta en el camino caliente.
- `KB_MIN_SCORE` y `FAQ_MATCH_THRESHOLD` comparten escala pero **no** valor: un match de FAQ dispara
  una respuesta literal (caro equivocarse), mientras que un chunk solo entra en el contexto (barato,
  y el prompt ya cubre el caso de contexto insuficiente).
- Si `searchKnowledge` lanza (Gemini caído al embeder la consulta), `chat()` **no** debe caerse
  entero: se captura, se logea `warn` y se sigue con contexto vacío — mismo criterio que
  `matchFaq` (`kb-faq.service.ts:205-210`), que degrada en vez de romper la conversación.
- El worker de auto-reply es independiente del de inbound: el inbound persiste y notifica, el
  auto-reply genera y envía. Así un fallo de Gemini no reintenta la ingesta del mensaje.

## Verificación

```bash
pnpm --filter backend typecheck                 # tsc --noEmit
pnpm --filter backend test                      # unitarios + aislamiento
pnpm --filter frontend build && pnpm --filter frontend lint
```

Y el cierre del DoD, contra Atlas real (índice vectorial en READY y al menos un `KbDocument`
en estado `indexado`):

```bash
pnpm --filter @sofiapp/api exec tsx --env-file .env \
  src/scripts/kb-smoke-retrieval.ts "<una pregunta frecuente real>"
```

seguido de la prueba end-to-end por WhatsApp: enviar esa misma pregunta a un `Cliente` con
`iaHabilitada: true` y comprobar (a) la respuesta recibida, (b) el `Message` outbound con
`sender: 'bot'`, y (c) el `AiResponseContext` con `retrievedChunks` no vacío en
`/settings/knowledge/context`.
