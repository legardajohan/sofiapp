# HU-IA-01 — Tasks (checklist ejecutable)

> Claude Code: ejecuta en orden. Marca cada casilla al terminar. No cierres el feature hasta que
> TODO esté en verde.
>
> Las casillas ya marcadas `[x]` corresponden a trabajo **entregado por HUs anteriores** y verificado
> en el codebase: no se rehacen, se reutilizan.

## 0. Prerrequisitos — desbloquear `chat()`  ⚠️ VA PRIMERO

Hoy `resolveTemplate(tenantId, 'chat')` lanza `AppError(500)` en todos los tenants porque
`seed-prompt-templates.ts` solo siembra `summary` y `extract`. Sin esta sección, nada del resto
funciona.

- [x] Modificar `services/ai/prompt-template.model.ts`: añadir `tono?: string` a `IPromptTemplate`
      y al schema (`{ type: String }`, sin `required` → retrocompatible).
- [x] Modificar `seed/seed-prompt-templates.ts`: añadir a `GLOBAL_TEMPLATES` la plantilla global
      `chat` (`tenantId: null`, `version: '1.0.0'`, `tono`, `systemPrompt` anti-alucinación).
  - [x] El `systemPrompt` obliga a responder solo con el bloque CONTEXTO y a devolver la frase
        exacta de fallback cuando no alcance.
  - [x] Verificar que el seed sigue siendo idempotente (`$setOnInsert` no pisa ediciones del admin).
- [x] Arrancar el backend y comprobar en el log que el seed reporta las tres globales.
      > Hecho durante HU-IA-02, ya con Redis disponible: `app.ts` arranca sin errores y el seed
      > registra `"globales: chat, summary, extract"`.

## 1. Recuperación RAG (`searchKnowledge`)

- [x] `features/kb/kb.retrieval.service.ts` — `searchKnowledge(tenantId, query, k?, provider?)`
      ya existe (HU-KB-01). Ojo: el archivo es `kb.retrieval.service.ts`, con **punto**, no
      `kb-retrieval.service.ts`.
- [x] Embed de la consulta con `provider.embedTexts({ taskType: 'RETRIEVAL_QUERY' })` — hecho.
- [x] `$vectorSearch` tenant-safe: NO se escribe aquí. Lo emite `vectorSearchScoped` /
      `buildVectorSearchPipeline` en `features/kb/kb.repository.ts`, único lugar autorizado, con
      `filter.tenantId` del argumento + `$match` defensivo — hecho.
- [x] Proyección sin `embedding` y `score` vía `$meta: 'vectorSearchScore'` — hecho.
- [x] Modificar `config/env.ts`: añadir `KB_MIN_SCORE` (`z.coerce.number().min(0).max(1).default(0.75)`)
      con el comentario de escala normalizada de Atlas, igual que `FAQ_MATCH_THRESHOLD`.
- [x] Modificar `kb.retrieval.service.ts`: filtrar `(c.score ?? 0) >= env.KB_MIN_SCORE` **después**
      del `vectorSearchScoped` y antes del `map`.

## 2. Inyectar el RAG en `AIService.chat()`

- [x] Modificar `services/ai/ai-service.types.ts`:
  - [x] Añadir `RetrievedChunk { texto, documentId, score? }`, con la nota de que es estructuralmente
        compatible con `KbRetrievalResult` y con `IRetrievedChunk` (no hace falta conversión).
  - [x] Añadir `KnowledgeRetriever = (tenantId, query) => Promise<RetrievedChunk[]>`, con el mismo
        comentario de "no importamos el feature" que ya lleva `FaqMatcher`.
- [x] Modificar `services/ai/ai.service.ts`:
  - [x] Añadir `noopRetriever` y el 4º parámetro `retriever: KnowledgeRetriever = noopRetriever`
        al constructor. **NO** importar `searchKnowledge` en este archivo.
  - [x] Cablear `searchKnowledge` en `createAIService`, junto a `matchFaq` (único punto de contacto
        entre `services/ai` y `features/`).
  - [x] Llamar al retriever **después** del cortocircuito de FAQ y **antes** de `generateReply`,
        reutilizando la `ultimaPregunta` que ya se calcula en la línea 66.
  - [x] Envolver la llamada en try/catch: si falla, `logger.warn` y seguir con contexto vacío
        (mismo criterio que `matchFaq`, `kb-faq.service.ts:205-210`). Un fallo de Gemini al embeder
        no puede tumbar la conversación.
  - [x] Componer el bloque `--- CONTEXTO ---` con los chunks, o la marca de contexto vacío si no hay.
  - [x] `tono` ← `params.tono ?? template.tono ?? 'profesional, claro y cercano'`.
  - [x] `instrucciones` ← `(params.instrucciones ?? template.systemPrompt) + bloqueRag`.
  - [x] **Verificar que el mismo texto NO va en `tono` y en `instrucciones`**: `generateReply`
        compone `Tono: ${tono}. ${instrucciones}` y lo cobraría dos veces (bug ya corregido en
        `summarize()`, ver `ai.service.ts:140-141`).
  - [x] `writeResponseContext(...)` recibe `retrievedChunks` **solo** en la rama generada; las ramas
        de caché (línea 59) y de FAQ (línea 72) siguen pasando `[]` a propósito.
  - [x] Actualizar el comentario de `writeResponseContext` (líneas 182-186): ya no viaja vacío
        "hasta una HU de Fase 3" — esta es esa HU.
  - [x] Dejar la clave de caché **sin tocar**: `template.version:kbVersion` ya cubre la invalidación
        (HU-KB-03 bumpea `kbVersion` al reindexar, `kb.service.ts:37`).

## 3. Endpoints HTTP (`POST /api/ai/answer`, `GET|PUT /api/ai/assistant`)

- [x] Modificar `features/ai/ai.types.ts`: `AiAnswerRequest`, `AiAnswerResponse`,
      `AssistantConfigDTO`, `UpdateAssistantDTO`.
- [x] Modificar `features/ai/ai.validation.ts`: `aiAnswerSchema`, `getAssistantSchema`,
      `updateAssistantSchema`.
  - [x] Zod **3** (`import { z } from 'zod'`), reutilizando los helpers `objectId` y `empty` que ya
        existen en el archivo. **No** usar `zod/v4` ni `.optional()` sobre `params`/`query`.
- [x] Crear `features/ai/ai-assistant.service.ts`:
  - [x] `getAssistantConfig(tenantId)` — plantilla `chat` del tenant vía `findOneScoped`, con
        fallback a la global (`tenantId: null`, la misma excepción documentada que usa `resolveTemplate`).
  - [x] `updateAssistantConfig(tenantId, dto)` — upsert **tenant-scoped** con
        `findOneAndUpdateScoped`; nunca `Model.updateOne` ni tocar la plantilla global.
  - [x] Bumpear `version` en cada guardado, para invalidar la caché de IA con el prompt viejo.
  - [x] `answerQuestion(tenantId, mensaje)` — arma el `ChatTurn[]` de un turno y llama a
        `getAIService().chat()`; devuelve `{ respuesta, fromFaq, cacheHit, chunksUsados }`.
- [x] Crear `features/ai/ai-assistant.controller.ts` con `aiAnswerController`,
      `getAssistantController` y `updateAssistantController`.
  - [x] Estilo real del repo: `export const xController: RequestHandler = async (req, res) => …`,
        sin `try/catch`, `tenantId` de `req.user!.tenantId!.toString()`, `res.status(200).json(...)`.
- [x] Crear `features/ai/ai-assistant.routes.ts` con la cadena completa de middlewares
      (`authenticateJWT` → `requireTenant` → `authorize(['admin'])` → `validate` → `asyncHandler`).
- [x] Modificar `app.ts`: `app.use('/api/ai', aiAssistantRoutes)` **después** de
      `app.use('/api/ai/responses', aiRoutes)`, para que el prefijo más específico gane.

## 4. Cola y worker de auto-reply

- [x] Modificar `config/queues.ts`: `AI_REPLY_QUEUE_NAME`, `AI_REPLY_JOB_NAME` y `aiReplyQueue`
      (convención `*_QUEUE_NAME` + `*_JOB_NAME`, como `kb-index`).
- [x] ⚠️ Actualizar **todos** los tests que hagan `vi.mock('../../config/queues.js')` — al menos
      `features/ai/ai.routes.test.ts:6-14` — añadiendo las tres exportaciones nuevas. Sin esto,
      importar `app` revienta en los tests.
- [x] Crear `workers/ai-reply.processor.ts` exportando **`processAiReplyJob(data)` puro** (patrón de
      `kb-index.processor.ts`, no el de `inbound-message.processor.ts`: una función pura sí se testea
      sin Redis).
  - [x] Job data mínimo: `{ tenantId, clienteId }`. El texto entrante NO viaja en el job: ya está
        persistido y sale del historial.
  - [x] Re-chequear `cliente.iaHabilitada` vía `findByIdScoped`; si es `false`, `return` (el asesor
        pudo tomar el control entre el encolado y el proceso).
  - [x] Historial: últimos N mensajes con `findScoped(Message, …).sort({createdAt:-1, _id:-1}).limit(N)`,
        invertido, mapeo `sender === 'user' ? 'user' : 'model'` (igual que
        `generateConversationSummary`, `conversation.service.ts:255-258`), descartando textos vacíos.
  - [x] Llamar a `getAIService().chat()`.
  - [x] Enviar con `replyFromIa()` (sección 5), no con `sendMessage` directo.
  - [x] Capturar `AppError` (fuera de ventana de 24 h / cuota agotada) → `logger.warn` y `return`,
        sin propagar: reintentar solo volvería a pagar la generación para fallar igual.
- [x] Modificar `worker.ts`:
  - [x] Construir `new Worker<AiReplyJobData>(AI_REPLY_QUEUE_NAME, …)` que delegue en
        `processAiReplyJob`.
  - [x] Añadirlo al array del bucle de handlers `failed` (línea 59).
- [x] Modificar `workers/inbound-message.processor.ts`:
  - [x] Sustituir el `TODO(Fase 3)` de la línea 71 por el encolado.
  - [x] Condición: `cliente.iaHabilitada && msg.type === 'text' && msg.text?.body`.
  - [x] Opciones del job: `{ attempts: 1, removeOnComplete: true, removeOnFail: 100 }`.

## 5. Envío de la respuesta de Sofi (distinguible y en vivo)

- [x] Modificar `features/message/message.types.ts`: `sender?: Extract<Sender, 'agent' | 'bot'>`
      en `ISendMessageDto`.
- [x] Modificar `features/message/message.service.ts`: `sender: dto.sender ?? 'agent'` en el
      `createScoped` (hoy está hardcodeado a `'agent'`, línea 54). El default preserva todo lo actual.
- [x] Modificar `features/conversation/conversation.service.ts`:
  - [x] Extraer el cuerpo de `replyMessage` (líneas 202-234) a un helper privado parametrizado por
        `sender`: envío + `ultimoMensajeAt` + `publishRealtime('message:new')`.
  - [x] `replyMessage` delega en él con `'agent'` (comportamiento idéntico al actual).
  - [x] Añadir `replyFromIa(tenantId, clienteId, texto)` que delega con `'bot'`.
- [x] Verificar en el frontend (`inbox`) que un `Message` con `sender: 'bot'` se pinta como de Sofi
      y no como de un asesor; si el mapper no lo distingue, ajustarlo.

## 6. Frontend — configuración del asistente por empresa

- [x] **Antes de escribir cualquier componente**, invocar `emil-design-eng`, `impeccable:impeccable`
      y `frontend-design:frontend-design` y aplicar sus criterios (regla nº7 del `CLAUDE.md` raíz;
      no es opcional ni "solo para pantallas nuevas").
- [x] Usar los componentes de shadcn/ui ya vendorizados en `src/components/ui/` (`card`, `input`,
      `textarea`, `label`, `button`, `sonner`, `skeleton`); instalar con la CLI solo si falta alguno.
- [x] Crear `features/ai-assistant/types.ts` (`AssistantConfig`, `UpdateAssistantPayload`).
- [x] Crear `features/ai-assistant/api.ts` con `apiClient.get('/ai/assistant')` y
      `apiClient.put('/ai/assistant', dto)`. Las rutas **no** llevan el prefijo `/api`: lo pone el
      `baseURL` del `apiClient`.
- [x] Crear `features/ai-assistant/hooks/useAssistantConfig.ts`: `useQuery(['ai-assistant'])` +
      `useMutation` que invalide esa key y lance un toast de `sonner`.
- [x] Crear `components/AssistantConfigForm.tsx` y `pages/AssistantConfigPage.tsx`:
  - [x] Campo **Tono** (input de una línea) y **Instrucciones del asistente** (textarea, con
        contador contra el máximo de 8000).
  - [x] Aviso cuando `heredado === true` ("estás viendo la configuración por defecto").
  - [x] Estados de carga (`skeleton`), de guardado (botón deshabilitado) y guardado deshabilitado
        si no hay cambios.
  - [x] Prolijo en **light y dark** con los tokens semánticos del proyecto.
- [x] Crear `features/ai-assistant/index.ts` (barrel, para el `lazy()` del router).
- [x] Modificar `router.tsx`: ruta `/settings/assistant` con `lazy` + `Suspense fallback={<Loading />}`
      + `RequireRole roles={['admin']}`.
- [x] Modificar `components/layout/nav-config.ts`: entrada "Asistente IA" en el grupo Configuración,
      junto a "Base de Conocimiento", con `roles: ['admin']`.

## Tests (Vitest)

- [x] `features/kb/kb.repository.test.ts` (extender) — **aislamiento a nivel de pipeline**:
  - [x] `filter.tenantId` y `$match` con el tenant del argumento — ya cubierto.
  - [x] Nota en el archivo de por qué NO se ejecuta el `$vectorSearch`: `mongodb-memory-server`
        (7.0.24, ver `package.json`) **no lo soporta**. La antigua tarea "`searchKnowledge(tenantB)`
        sobre chunks de `tenantA` → vacío" como test de integración **no es ejecutable**.
- [x] `features/kb/kb.retrieval.service.test.ts` (crear) — con `vectorSearchScoped` mockeado:
  - [x] Chunks con `score` por debajo de `KB_MIN_SCORE` se descartan.
  - [x] Si `embedTexts` devuelve vacío, retorna `[]` sin llamar al repositorio.
- [x] `services/ai/ai.service.test.ts` (extender) — inyectando un `KnowledgeRetriever` falso, igual
      que ya se hace con `FaqMatcher`:
  - [x] Con chunks: el `instrucciones` que recibe el `generateReply` mockeado los contiene.
  - [x] Sin chunks: el `instrucciones` lleva la marca de contexto vacío.
  - [x] El texto del contexto **no** aparece también en `tono` (no duplicación, AC13).
  - [x] `AiResponseContext.retrievedChunks` queda poblado en la rama generada.
  - [x] Cache-hit: el retriever falso **no** se invoca y los chunks siguen `[]`.
  - [x] Match de FAQ: el retriever falso **no** se invoca y los chunks siguen `[]`.
  - [x] Si el retriever lanza, `chat()` responde igualmente con contexto vacío.
  - [x] Con `template.tono` definido, se usa; sin él, el default del código.
- [x] `features/ai/ai.routes.test.ts` (extender): mock de colas actualizado, y
  - [x] `POST /api/ai/answer` con token de admin → 200 con `{ respuesta, fromFaq, cacheHit, chunksUsados }`.
  - [x] `POST /api/ai/answer` sin token → 401; con rol no admin → 403.
  - [x] `GET /api/ai/assistant` sin plantilla propia → `heredado: true`.
  - [x] `PUT /api/ai/assistant` → 200 y `heredado: false` en la lectura siguiente.
- [x] `features/ai/ai-assistant.isolation.test.ts` (crear): el `PUT` de `tenantA` no altera la
      plantilla de `tenantB` ni la global.
- [x] `workers/ai-reply.processor.test.ts` (crear), mockeando `getAIService` y `replyFromIa`:
  - [x] `iaHabilitada: false` → no genera ni envía.
  - [x] `iaHabilitada: true` → envía con `sender: 'bot'`.
  - [x] Historial vacío → return sin llamar a Gemini.
  - [x] `AppError` de ventana/cuota → se logea y **no** propaga.
- [x] `features/message/message.service.test.ts` (extender): `sendMessage` sin `sender` sigue
      escribiendo `'agent'`; con `sender: 'bot'` escribe `'bot'`.

## Verificación final

> **Ojo con los filtros de pnpm:** los paquetes se llaman `@sofiapp/api` y `@sofiapp/web`, no
> `backend` / `frontend` como dice el `CLAUDE.md` raíz. Con los nombres del CLAUDE.md, pnpm responde
> `No projects matched the filters` y no ejecuta nada.

- [x] `pnpm --filter @sofiapp/api typecheck` sin errores. ✅
- [x] `pnpm --filter @sofiapp/api test` → **564 pasan**. Los 8 rojos son de etiquetas
      (`conversation.tags.test.ts` ×7 y `tests/isolation/tag.isolation.test.ts` ×1) y **son
      preexistentes**: se reprodujeron idénticos en `develop` limpio con el trabajo de esta rama
      guardado en stash. Causa raíz: esos tests llaman a `publishRealtime`, que intenta conectar a
      Redis (`ECONNREFUSED 127.0.0.1:6379`); sin Redis levantado agotan el timeout de 30 s. Ningún
      test tocado por HU-IA-01 falla.
      > **Resuelto durante HU-IA-02:** con Redis levantado (contenedor `sofiapp-redis`) la suite
      > pasa entera —603 tests, cero fallos—, lo que confirma que el diagnóstico era correcto y que
      > no había nada que arreglar en el código.
- [x] `pnpm --filter @sofiapp/web build && pnpm --filter @sofiapp/web lint` sin errores. ✅
- [x] Checklist de PR de `docs/multi-tenancy.md` §9 revisado (ver "Aislamiento" más abajo).
- [ ] Smoke contra Atlas real (índice vectorial READY + un `KbDocument` `indexado`):
      `pnpm --filter @sofiapp/api exec tsx --env-file .env src/scripts/kb-smoke-retrieval.ts "<pregunta real>"`.
      > **Pendiente de infraestructura**, no de código: requiere Atlas con el índice vectorial en
      > READY y una `GEMINI_API_KEY` viva. Es lo que calibra `KB_MIN_SCORE`: el default de 0.75 está
      > razonado sobre la escala normalizada de Atlas, pero **no medido contra datos reales**.
- [ ] End-to-end por WhatsApp contra un `Cliente` con `iaHabilitada: true`: llega la respuesta, el
      `Message` outbound tiene `sender: 'bot'`, y `/settings/knowledge/context` muestra el
      `AiResponseContext` con `retrievedChunks` no vacío.
      > **Pendiente de infraestructura**: necesita Redis (worker), Atlas y el canal de Meta conectado.
- [x] Revisar `git status` en busca de `*.png`/`*.jpg` de verificación visual colados antes de commitear.

## Aislamiento multi-tenant (checklist §9)

- [x] Toda query nueva pasa por `*Scoped`: `findByIdScoped`/`findScoped` en el worker,
      `findOneScoped`/`findOneAndUpdateScoped` en `ai-assistant.service.ts`. Ningún
      `Model.find/create` directo.
- [x] `tenantId` nace del token en los tres endpoints (`req.user!.tenantId!.toString()`); el worker
      lo recibe del job, que a su vez lo resolvió el webhook por `phone_number_id` (excepción ya
      documentada).
- [x] Sin modelos nuevos. El campo `tono` se añade a `PromptTemplate`, que ya lleva su `tenantId`.
- [x] Las tres rutas nuevas llevan `requireTenant` justo tras `authenticateJWT` y `authorize(['admin'])`.
- [x] Tests de aislamiento añadidos: `ai-assistant.isolation.test.ts` (lo que guarda A no alcanza a
      B ni a la global) y `ai-reply.processor.test.ts` (un cliente de otro tenant es invisible).
- [x] La lectura de la plantilla global (`tenantId: null`) queda documentada en el código como la
      excepción que ya usaba `AIService.resolveTemplate`: es la plantilla de fábrica del producto,
      no el dato de ninguna empresa.

## Cierre documental

Esta HU es la "Fase 3" que varios documentos anuncian. Al terminar hay que cerrar esas notas:

- [x] `services/ai/ai.service.ts:182-186` — el comentario de `writeResponseContext`.
- [x] `docs/data-model.md:462` — la nota de `retrievedChunks` vacío; y documentar
      `PromptTemplate.tono`.
- [x] `docs/specs/HU-KB-03-actualizar-entrenamiento/spec.md:51` — "enganchar `searchKnowledge` sigue
      siendo una pieza suelta".
- [x] `docs/specs/HU-KB-04-contexto-ia/spec.md:56` y `:120` — "conectar `searchKnowledge()` sigue
      siendo Fase 3".
- [x] `docs/api-contract.md` — documentar `POST /api/ai/answer` y `GET|PUT /api/ai/assistant`.

## Desviaciones respecto al plan (decididas al implementar)

1. **`AiResult.retrievedChunks`** — el plan hacía que `POST /answer` contase los fragmentos leyendo
   el último `AiResponseContext` del tenant. Es una carrera: esa escritura es fire-and-forget y una
   petición concurrente devolvería el contexto de otra respuesta. Se añadió en su lugar un campo
   opcional `retrievedChunks?` a `AiResult`, que `chat()` informa directamente.
2. **Un solo trío `ai-assistant.{service,controller,routes}.ts`** en vez de partirlo en
   `ai-answer.*` + `ai-assistant.*`: es un único router con un único rol (el chatbot y su
   configuración), y partirlo dejaba dos controllers para tres endpoints.
3. **Orden del historial con desempate por `_id`** (`sort({ createdAt: -1, _id: -1 })`). Dos
   mensajes del mismo milisegundo —habitual en ráfagas de WhatsApp— se ordenaban de forma
   arbitraria y el hilo llegaba descolocado al modelo.
4. **La bandeja distingue a Sofi.** El plan daba por hecho que bastaba con `sender: 'bot'`, pero
   `ConversationThread.tsx` solo miraba `direccion`: una respuesta de la IA se pintaba idéntica a la
   de un asesor. Se añadió una firma discreta (icono + "Sofi") en la fila de metadatos del mensaje.
   Sin esto el AC10 quedaba a medias.
5. **Skills de diseño: solo una de las tres está instalada.** `frontend-design:frontend-design` sí;
   `emil-design-eng` e `impeccable:impeccable` **no existen** en este entorno (ni en
   `.claude/skills/` ni en los plugins). Los componentes se construyeron con el plugin disponible +
   los patrones ya establecidos en `FaqTester.tsx` / `KnowledgeFaqsPage.tsx`, y con shadcn/ui
   vendorizado. Conviene instalar las otras dos o quitarlas de la regla §7 del `CLAUDE.md`.
6. **`docs/data-model.md` gana la sección `prompt_templates`**, que no existía pese a que el modelo
   sí. Ahora que el admin la edita desde el panel, tenía que estar en la fuente de verdad de datos.

## Definición de "hecho"

El chatbot IA responde preguntas frecuentes usando la KB vía RAG: los chunks relevantes se recuperan
por semejanza vectorial (filtrados por `KB_MIN_SCORE`), se inyectan en las instrucciones del system
prompt y Gemini genera respuestas basadas exclusivamente en ese contexto. Cuando no hay información
suficiente, lo indica y no inventa. El auto-reply funciona end-to-end: mensaje de WhatsApp → RAG →
Gemini → respuesta por WhatsApp, persistida con `sender: 'bot'` y visible en vivo en la bandeja. La
auditoría registra los chunks usados en cada respuesta generada. Y el admin de cada empresa configura
el tono y las instrucciones de su asistente desde `/settings/assistant`.
