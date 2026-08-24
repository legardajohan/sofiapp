# HU-IA-01 — Chatbot IA con RAG sobre KB (spec)

> **Spec-Driven Development.** Este es el QUÉ y el porqué. El CÓMO va en `plan.md`; la ejecución
> en `tasks.md`.

**Estado:** implementado

## Objetivo

Conectar la base de conocimiento indexada (KB) con Gemini Flash para responder preguntas frecuentes
por WhatsApp. El asistente recupera chunks relevantes de la KB por semejanza vectorial (RAG) y
responde **exclusivamente** con esa información, sin inventar datos. La empresa configura el tono y
el system prompt de su asistente desde el panel.

## Estado del terreno (verificado contra el codebase)

Antes de tocar nada, esto **ya existe y se reutiliza tal cual** — no se recrea:

- `features/kb/kb.retrieval.service.ts` → `searchKnowledge(tenantId, query, k?, provider?)`, creado
  en HU-KB-01. Embede la consulta y delega en `vectorSearchScoped`.
- `features/kb/kb.repository.ts` → `vectorSearchScoped` / `buildVectorSearchPipeline`: **único lugar
  autorizado** a emitir un `$vectorSearch` sobre `KbChunk`. Inyecta `filter.tenantId` desde el
  argumento y lo refuerza con un `$match` defensivo.
- `services/ai/ai.service.ts` → `AIService.chat()` con caché exacta en Redis (clave versionada por
  `template.version:kbVersion`) y cortocircuito por FAQ vía el puerto inyectado `FaqMatcher`.
- `services/ai/ai-response-context.model.ts` → `AiResponseContext` con `retrievedChunks[]`, ya listo
  para recibirlos (hoy siempre llega `[]`).
- `features/kb/kb.service.ts:37` → bump de `Tenant.kbVersion` al reindexar (HU-KB-03), que es lo que
  invalida la caché de IA cuando cambia el conocimiento.
- `Cliente.iaHabilitada` (default `true`), `Message.sender: 'user' | 'bot' | 'agent'` y el gateway de
  realtime (`publishRealtime`), de HU-OMNI-01.
- `src/scripts/kb-smoke-retrieval.ts` → smoke de recuperación contra Atlas real.

Y esto **falta o está roto hoy**, y por eso entra en el alcance:

- **No hay plantilla global `chat`.** `seed-prompt-templates.ts` solo siembra `summary` y `extract`,
  así que `resolveTemplate(tenantId, 'chat')` lanza `AppError(500)` y `chat()` es inutilizable en
  cualquier tenant. Es el blocker número uno del feature.
- `PromptTemplate` no tiene campo `tono`, que es la mitad de lo que la historia pide configurar.
- `sendMessage` escribe `sender: 'agent'` fijo y no admite otro: Sofi quedaría indistinguible de un
  asesor humano en la bandeja y en el transcript que alimenta el resumen por IA.
- `sendMessage` no publica realtime. Quien emite `message:new` y refresca `ultimoMensajeAt` es
  `replyMessage`, en `conversation.service.ts`.
- `searchKnowledge` no filtra por score: devuelve el top-k aunque sea irrelevante.

## Alcance

Incluye:

**RAG y generación**
- Filtro por score mínimo en `searchKnowledge`, parametrizado por env (`KB_MIN_SCORE`), no hardcodeado.
- Puerto `KnowledgeRetriever` inyectado en `AIService` (espejo exacto de `FaqMatcher`), cableado a
  `searchKnowledge` **solo** en `createAIService`: `services/ai` no puede depender de un feature.
- Composición del system prompt RAG-aware, con instrucciones anti-alucinación y bloque de contexto.
- `AiResponseContext.retrievedChunks` deja de viajar vacío en las respuestas generadas.

**Configuración del asistente por empresa**
- Plantilla global `chat` sembrada (desbloquea `chat()`).
- Campo `tono` opcional en `PromptTemplate`.
- `GET | PUT /api/ai/assistant`: leer y guardar tono + system prompt del tenant.
- Pantalla `/settings/assistant` en el panel, solo para `admin`.

**Orquestación por WhatsApp**
- Endpoint interno `POST /api/ai/answer`, en router propio montado como `app.use('/api/ai', …)`.
- Cola `ai-reply` + `workers/ai-reply.processor.ts`: pregunta → RAG → Gemini → envío por WhatsApp.
- Auto-reply en `inbound-message.processor.ts` cuando `cliente.iaHabilitada === true` (hoy hay un
  `TODO(Fase 3)` justo en ese punto, línea 71).
- `sender` opcional en `sendMessage`, para persistir la respuesta de Sofi como `'bot'`.
- `replyFromIa()` en `conversation.service.ts`, para que la respuesta automática publique
  `message:new` y reordene la bandeja igual que la de un asesor.

Fuera de alcance (otros features):
- Canal de feedback humano (el asesor toma el control) → `HU-OMNI-*`.
- Rate limiting por conversación → futuro.
- Editor de plantillas para `extract` / `classify` / `summary`: aquí solo se configura `chat`.

## Criterios de aceptación

1. **RAG funcional:** dado un documento cargado en la KB, una pregunta frecuente sobre ese documento
   obtiene una respuesta correcta basada en los chunks recuperados.
2. **Sin alucinaciones:** si la KB no tiene información suficiente para responder, el asistente dice
   "No tengo información suficiente para responder esa pregunta." y no inventa.
3. **Aislamiento multi-tenant:** los chunks recuperados son exclusivamente del tenant autenticado.
   `searchKnowledge` no emite `$vectorSearch` por su cuenta: pasa por `vectorSearchScoped`, cuyo
   pipeline inyecta `filter.tenantId` desde el argumento y añade un `$match` defensivo.
4. **Auditoría:** cada respuesta **generada** guarda en `AiResponseContext` los `retrievedChunks`
   usados (ya no vacío) y el `kbVersion` vigente. Las respuestas servidas de caché o de FAQ siguen
   guardando `[]`, que es lo correcto: no hubo recuperación (ver AC7 y AC8).
5. **Auto-reply funcional:** un mensaje inbound de WhatsApp con `cliente.iaHabilitada === true` genera
   una respuesta automática enviada por el mismo canal, persistida como `Message` outbound.
6. **Auto-reply deshabilitado:** si `cliente.iaHabilitada === false`, no se encola auto-reply.
7. **Caché existente se mantiene:** respuestas cacheadas siguen sirviéndose sin RAG (ya implementado).
8. **FAQ cortocircuito preservado:** si hay match de FAQ, se retorna la respuesta literal sin invocar
   Gemini ni RAG (ya implementado).
9. **Plantilla `chat` disponible:** existe la plantilla global `chat` sembrada; un tenant sin
   plantilla propia obtiene respuesta en vez de un `AppError(500)`.
10. **Sofi se distingue del asesor:** la respuesta automática se persiste con `sender: 'bot'` y la
    bandeja la muestra como de la IA, no como de un humano.
11. **Realtime:** la respuesta de Sofi emite `message:new` y reordena la conversación en la bandeja
    en vivo, igual que la respuesta de un asesor.
12. **Configuración por empresa:** un `admin` edita tono y system prompt desde `/settings/assistant`;
    se persisten como `PromptTemplate` tenant-scoped y la siguiente respuesta generada los usa (la
    caché queda inalcanzable al cambiar `template.version`).
13. **Sin duplicación de prompt:** el mismo texto no se pasa a la vez como `tono` y como
    `instrucciones` — `generateReply` compone `Tono: ${tono}. ${instrucciones}` y cobraría sus tokens
    dos veces (bug ya sufrido y corregido en `summarize()`, ver `ai.service.ts:140-141`).
14. **Test de aislamiento:** el pipeline construido por `buildVectorSearchPipeline` lleva el
    `tenantId` del argumento tanto en `filter` como en el `$match`. Se verifica **sobre el pipeline**,
    no ejecutándolo: `mongodb-memory-server` no soporta `$vectorSearch`.
15. **Backend en verde:** `pnpm --filter backend typecheck` y `pnpm --filter backend test` sin errores.
16. **Frontend en verde:** `pnpm --filter frontend build && pnpm --filter frontend lint` sin errores,
    y la pantalla queda prolija en light y dark con los tokens semánticos del proyecto.

## Definition of Done

Una pregunta frecuente real, hecha por WhatsApp contra un tenant con su KB indexada, obtiene una
respuesta correcta basada en la KB, sin inventar datos, enviada automáticamente por el mismo canal y
visible en vivo en la bandeja. El admin puede ajustar el tono y el system prompt de su asistente
desde el panel.

## Dependencias

- `HU-KB-01` — indexación de KB (chunking + embeddings + índice vectorial) y `searchKnowledge` → **cerrada**.
- `HU-KB-02` — FAQ matching (cortocircuito por preguntas frecuentes, puerto `FaqMatcher`) → **cerrada**.
- `HU-KB-03` — `Tenant.kbVersion` y su bump al reindexar (invalidación de caché) → **cerrada**.
- `HU-KB-04` — `AiResponseContext` + auditoría de respuestas de IA → **cerrada**.
- `HT-AI-01` — AIService + GeminiProvider + PromptTemplate + AiUsageLog → **cerrado**.
- `HU-OMNI-01` — bandeja WhatsApp, `Cliente.iaHabilitada`, modelo `Message` y realtime → **cerrada**.
- `HT-WA-01` — `sendMessage`, ventana de 24 h y cuota de mensajes → **cerrado**.

> Corrección respecto a la versión anterior de este spec: el toggle `iaHabilitada` viene de
> **HU-OMNI-01**, no de HU-OMNI-02 (que es asignación de conversaciones). Y el frontend de
> configuración del asistente **ya no se difiere a un `HU-IA-02`** inexistente: entra aquí.
