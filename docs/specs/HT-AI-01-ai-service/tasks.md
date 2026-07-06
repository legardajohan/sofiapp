# HT-AI-01 — Tasks (checklist ejecutable)

> Claude Code: ejecuta en orden. Marca cada casilla al terminar.
> Activar skill `multi-tenancy-guard` antes de crear cualquier modelo Mongoose.

## Implementación

### 1. Tipos e interfaz del proveedor LLM

- [x] Crear `apps/backend/src/integrations/llm/llm-provider.types.ts`
  - `ChatTurn`, `NivelInteres`, `Objecion`, `SlotSpec`, `SlotResult` — transcribir de
    `docs/integrations/llm-provider.md`
  - `ILlmProvider` con `extractSlots()`, `classifyLead()`, `generateReply()`

### 2. GeminiProvider

- [x] Instalar dependencia: `pnpm --filter backend add @google/generative-ai`
- [x] Crear `apps/backend/src/integrations/llm/gemini.provider.ts`
  - `class GeminiProvider implements ILlmProvider`
  - Leer `env.GEMINI_API_KEY`, `env.GEMINI_MODEL`, `env.LLM_TIMEOUT_MS` (ya validados por Zod)
  - `generateReply()` → texto libre
  - `extractSlots()` → `response_mime_type: "application/json"` + JSON schema derivado de `SlotSpec[]`
  - `classifyLead()` → `response_mime_type: "application/json"` + schema fijo
    `{ nivelInteres: enum, objecion: enum | null }`
  - Función privada `callWithRetry()`: 3 intentos, backoff 500 → 1 000 → 2 000 ms,
    sólo en status 429 y 5xx; cada intento usa `AbortSignal.timeout(env.LLM_TIMEOUT_MS)`

### 3. Variables de entorno LLM

- [x] Modificar `apps/backend/src/config/env.ts`
  - Añadir al schema Zod existente:
    `LLM_PROVIDER`, `GEMINI_API_KEY`, `GEMINI_MODEL`, `LLM_TIMEOUT_MS`,
    `AI_CACHE_TTL_CHAT_S`, `AI_CACHE_TTL_CLASSIFY_S`
  - [x] Crear `.env.example` con todas las variables y valores por defecto

### 4. Tipos de AIService

- [x] Crear `apps/backend/src/services/ai/ai-service.types.ts`
  - `AiResult<T>`, `AiChatParams`, `AiExtractParams`, `AiClassifyParams`, `ClassifyResult`

### 5. Modelo PromptTemplate

- [x] Crear `apps/backend/src/services/ai/prompt-template.model.ts`
  - `tenantId: ObjectId | null` (null = global), `method`, `version`, `systemPrompt`, `isActive`
  - Índice compuesto: `{ tenantId: 1, method: 1, isActive: 1 }`
  - Exportar `IPromptTemplate`, `IPromptTemplateDocument`, `PromptTemplateModel`

### 6. Modelo AiUsageLog

- [x] Crear `apps/backend/src/services/ai/ai-usage-log.model.ts`
  - `tenantId` requerido + indexado
  - `method`, `llmModel`, `promptTokens`, `completionTokens`, `totalTokens`, `cacheHit`, `durationMs`
  - TTL index en `createdAt`: `expireAfterSeconds: 7776000` (90 días)
  - Nota: campo renombrado `model` → `llmModel` para evitar conflicto con `Document.model` de Mongoose
  - Exportar `IAiUsageLog`, `IAiUsageLogDocument`, `AiUsageLogModel`

### 7. Cache utility

- [x] Crear `apps/backend/src/services/ai/ai-cache.util.ts`
  - `buildCacheKey(tenantId, method, input, version)`:
    SHA256(JSON.stringify(input).trim().toLowerCase().replace(/\s+/g,' ') + version)
    → `'ai:<tenantId>:<method>:<hash>'`
  - `getCached<T>(redis, key)`: `redis.get(key)` → `JSON.parse`; `null` si no existe
  - `setCached<T>(redis, key, value, ttlSeconds)`: `redis.set(key, JSON.stringify(value), 'EX', ttlSeconds)`

### 8. AIService

- [x] Crear `apps/backend/src/services/ai/ai.service.ts`
  - `class AIService` con `constructor(provider: ILlmProvider, redis: Redis)`
  - `chat()`, `extract<T>()`, `classify()` con caché Redis (extract sin caché)
  - `private resolveTemplate()`: tenant-específica > global (excepción documentada)
  - `private logUsage()`: fire-and-forget con `void createScoped(...)`
  - Exportar `createAIService(redis: Redis): AIService`

### 9. Seed de plantillas globales

- [x] Crear `apps/backend/scripts/seed-prompt-templates.ts`
  - Conectar a Mongo, insertar 3 documentos `PromptTemplate` con `tenantId: null`,
    `isActive: true`, `version: '1.0.0'` para `method`: `chat`, `extract`, `classify`
  - System prompts base en español, contexto CRM SofiApp

### 10. Script de prueba DoD

- [x] Crear `apps/backend/scripts/test-ai-service.ts`
  - Conectar Mongo + Redis, instanciar `createAIService(redis)`
  - Seed de una plantilla global si no existe
  - Llamar `chat()` dos veces con el mismo historial de prueba
  - Imprimir ambos `AiResult`: debe mostrar `cacheHit: false` → `cacheHit: true, totalTokens: 0`
  - Salir limpiamente (disconnect Mongo + Redis)

## Tests (Vitest)

- [x] `src/integrations/llm/gemini.provider.test.ts`:
  - [x] Mock `@google/generative-ai` → respuesta OK → retorna string esperado
  - [x] Mock → status 429 → reintenta 3 veces → lanza error con mensaje claro
  - [x] Mock → error de red no retryable → lanza inmediatamente sin reintentos
  - [x] `classifyLead` → devuelve nivelInteres y objecion
  - [x] `classifyLead` → objecion null cuando no se devuelve
  - [x] `extractSlots` → detecta campos incompletos

- [x] `src/services/ai/ai-cache.util.test.ts`:
  - [x] `buildCacheKey` con mismo input + version → mismo hash
  - [x] `buildCacheKey` con distinto `tenantId` → distinta key
  - [x] `buildCacheKey` formato correcto
  - [x] `getCached` sin valor en Redis → `null`
  - [x] `getCached` con valor → objeto deserializado
  - [x] `getCached` JSON inválido → null
  - [x] `setCached` → llama redis.set con EX

- [x] `src/services/ai/ai.service.test.ts`:
  - [x] `chat()` primer llamado → `provider.generateReply` invocado, `cacheHit: false`
  - [x] `chat()` segundo llamado mismo input → `provider.generateReply` NO invocado, `cacheHit: true`
  - [x] `chat()` tenantId diferente → caché independiente (aislamiento de caché)
  - [x] `classify()` segundo llamado → cache hit
  - [x] `extract()` cada llamado → `provider.extractSlots` invocado siempre (sin caché)
  - [x] `extract()` respuesta inválida vs. Zod schema → lanza `ZodError`

- [x] **Test de aislamiento multi-tenant:**
  - [x] `AiUsageLog` creado con `tenantA` no visible al hacer `findScoped` con `tenantB`
  - [x] `PromptTemplate` tenant-específica de `tenantA` no visible para `tenantB`

## Verificación final

- [x] `pnpm --filter backend typecheck` ✓ — cero errores, cero `any` ✅
- [x] `pnpm --filter backend test` ✓ — 32/32 tests pasan ✅
- [x] Checklist PR de `docs/multi-tenancy.md` §9:
  - [x] Toda query MongoDB en `ai.service.ts` usa `*Scoped` o excepción documentada
        (la plantilla global con `tenantId: null` usa `findOne` directo — excepción documentada en código)
  - [x] `tenantId` llega del token (`req.user!.tenantId`) en los callers, nunca del body
  - [x] `PromptTemplate` y `AiUsageLog` tienen `tenantId` requerido e indexado
  - [x] Cache keys incluyen `tenantId`
  - [x] Test de aislamiento multi-tenant incluido y pasando ✅

## Definición de "hecho"

`scripts/test-ai-service.ts` ejecutado con éxito (requiere `.env` con `GEMINI_API_KEY` y Redis corriendo).

`pnpm --filter backend typecheck` y `pnpm --filter backend test` pasan sin errores. ✅
