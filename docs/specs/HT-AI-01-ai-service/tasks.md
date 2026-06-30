# HT-AI-01 — Tasks (checklist ejecutable)

> Claude Code: ejecuta en orden. Marca cada casilla al terminar.
> Activar skill `multi-tenancy-guard` antes de crear cualquier modelo Mongoose.

## Implementación

### 1. Tipos e interfaz del proveedor LLM

- [ ] Crear `apps/backend/src/integrations/llm/llm-provider.types.ts`
  - `ChatTurn`, `NivelInteres`, `Objecion`, `SlotSpec`, `SlotResult` — transcribir de
    `docs/integrations/llm-provider.md`
  - `ILlmProvider` con `extractSlots()`, `classifyLead()`, `generateReply()`

### 2. GeminiProvider

- [ ] Instalar dependencia: `pnpm --filter backend add @google/generative-ai`
- [ ] Crear `apps/backend/src/integrations/llm/gemini.provider.ts`
  - `class GeminiProvider implements ILlmProvider`
  - Leer `env.GEMINI_API_KEY`, `env.GEMINI_MODEL`, `env.LLM_TIMEOUT_MS` (ya validados por Zod)
  - `generateReply()` → texto libre
  - `extractSlots()` → `response_mime_type: "application/json"` + JSON schema derivado de `SlotSpec[]`
  - `classifyLead()` → `response_mime_type: "application/json"` + schema fijo
    `{ nivelInteres: enum, objecion: enum | null }`
  - Función privada `callWithRetry()`: 3 intentos, backoff 500 → 1 000 → 2 000 ms,
    sólo en status 429 y 5xx; cada intento usa `AbortSignal.timeout(env.LLM_TIMEOUT_MS)`

### 3. Variables de entorno LLM

- [ ] Modificar `apps/backend/src/config/env.ts`
  - Añadir al schema Zod existente:
    `LLM_PROVIDER`, `GEMINI_API_KEY`, `GEMINI_MODEL`, `LLM_TIMEOUT_MS`,
    `AI_CACHE_TTL_CHAT_S`, `AI_CACHE_TTL_CLASSIFY_S`
  - Añadir las mismas variables a `.env.example` con valores por defecto

### 4. Tipos de AIService

- [ ] Crear `apps/backend/src/services/ai/ai-service.types.ts`
  - `AiResult<T>`, `AiChatParams`, `AiExtractParams`, `AiClassifyParams`, `ClassifyResult`

### 5. Modelo PromptTemplate

- [ ] Crear `apps/backend/src/services/ai/prompt-template.model.ts`
  - `tenantId: ObjectId | null` (null = global), `method`, `version`, `systemPrompt`, `isActive`
  - Índice compuesto: `{ tenantId: 1, method: 1, isActive: 1 }`
  - Exportar `IPromptTemplate`, `IPromptTemplateDocument`, `PromptTemplateModel`

### 6. Modelo AiUsageLog

- [ ] Crear `apps/backend/src/services/ai/ai-usage-log.model.ts`
  - `tenantId` requerido + indexado
  - `method`, `model`, `promptTokens`, `completionTokens`, `totalTokens`, `cacheHit`, `durationMs`
  - TTL index en `createdAt`: `expireAfterSeconds: 7776000` (90 días)
  - Exportar `IAiUsageLog`, `IAiUsageLogDocument`, `AiUsageLogModel`

### 7. Cache utility

- [ ] Crear `apps/backend/src/services/ai/ai-cache.util.ts`
  - `buildCacheKey(tenantId, method, input, version)`:
    SHA256(JSON.stringify(input).trim().toLowerCase().replace(/\s+/g,' ') + version)
    → `'ai:<tenantId>:<method>:<hash>'`
  - `getCached<T>(redis, key)`: `redis.get(key)` → `JSON.parse`; `null` si no existe
  - `setCached<T>(redis, key, value, ttlSeconds)`: `redis.set(key, JSON.stringify(value), 'EX', ttlSeconds)`

### 8. AIService

- [ ] Crear `apps/backend/src/services/ai/ai.service.ts`
  - `class AIService` con `constructor(provider: ILlmProvider, redis: Redis)`
  - `chat(params)`:
    1. `resolveTemplate(tenantId, 'chat')`
    2. `getCached` → si hit: `logUsage(cacheHit=true, tokens=0)` → return
    3. `provider.generateReply()`
    4. `setCached(key, data, env.AI_CACHE_TTL_CHAT_S)`
    5. `logUsage(cacheHit=false, tokens de usageMetadata)`
  - `extract<T>(params)`:
    1. `resolveTemplate(tenantId, 'extract')`
    2. `provider.extractSlots()`
    3. `params.schema.parse(result)` — lanza `ZodError` si inválido
    4. `logUsage(cacheHit=false)` — **sin caché**
  - `classify(params)`: igual que `chat()` con `classifyLead()` y `AI_CACHE_TTL_CLASSIFY_S`
  - `private resolveTemplate()`:
    - `findScoped(PromptTemplateModel, tenantId, { method, isActive: true })`
    - fallback: `PromptTemplateModel.findOne({ tenantId: null, method, isActive: true })`
    - `throw new AppError('No prompt template for method: '+method, 500)` si ninguna
  - `private logUsage()`: `void createScoped(AiUsageLogModel, log)` — fire-and-forget
  - Exportar `createAIService(redis: Redis): AIService`

### 9. Seed de plantillas globales

- [ ] Crear `apps/backend/scripts/seed-prompt-templates.ts`
  - Conectar a Mongo, insertar 3 documentos `PromptTemplate` con `tenantId: null`,
    `isActive: true`, `version: '1.0.0'` para `method`: `chat`, `extract`, `classify`
  - System prompts base en español, contexto CRM SofiApp

### 10. Script de prueba DoD

- [ ] Crear `apps/backend/scripts/test-ai-service.ts`
  - Conectar Mongo + Redis, instanciar `createAIService(redis)`
  - Seed de una plantilla global si no existe
  - Llamar `chat()` dos veces con el mismo historial de prueba
  - Imprimir ambos `AiResult`: debe mostrar `cacheHit: false` → `cacheHit: true, totalTokens: 0`
  - Salir limpiamente (disconnect Mongo + Redis)

## Tests (Vitest)

- [ ] `src/integrations/llm/gemini.provider.test.ts`:
  - [ ] Mock `@google/generative-ai` → respuesta OK → retorna string esperado
  - [ ] Mock → status 429 → reintenta 3 veces → lanza error con mensaje claro
  - [ ] Mock → timeout → lanza `AbortError`

- [ ] `src/services/ai/ai-cache.util.test.ts`:
  - [ ] `buildCacheKey` con mismo input + version → mismo hash
  - [ ] `buildCacheKey` con distinto `tenantId` → distinta key
  - [ ] `buildCacheKey` input con espacios extra → normalizado igual que sin espacios
  - [ ] `getCached` sin valor en Redis → `null`
  - [ ] `getCached` con valor → objeto deserializado

- [ ] `src/services/ai/ai.service.test.ts`:
  - [ ] `chat()` primer llamado → `provider.generateReply` invocado, `cacheHit: false`
  - [ ] `chat()` segundo llamado mismo input → `provider.generateReply` NO invocado, `cacheHit: true`
  - [ ] `chat()` tenantId diferente → caché independiente (aislamiento de caché)
  - [ ] `classify()` segundo llamado → cache hit
  - [ ] `extract()` cada llamado → `provider.extractSlots` invocado siempre (sin caché)
  - [ ] `extract()` respuesta inválida vs. Zod schema → lanza `ZodError`
  - [ ] `logUsage()` escribe `AiUsageLog` con `tenantId` correcto

- [ ] **Test de aislamiento multi-tenant:**
  - [ ] `AiUsageLog` creado con `tenantA` no visible al hacer `findScoped` con `tenantB`
  - [ ] `PromptTemplate` tenant-específica de `tenantA` no visible para `tenantB`

## Verificación final

- [ ] `pnpm --filter backend typecheck` ✓ — cero errores, cero `any`
- [ ] `pnpm --filter backend test` ✓ — todos los tests pasan
- [ ] Checklist PR de `docs/multi-tenancy.md` §9:
  - [ ] Toda query MongoDB en `ai.service.ts` usa `*Scoped` o excepción documentada
  - [ ] `tenantId` llega del token (`req.user!.tenantId`) en los callers, nunca del body
  - [ ] `PromptTemplate` y `AiUsageLog` tienen `tenantId` requerido e indexado
  - [ ] Cache keys incluyen `tenantId`
  - [ ] Test de aislamiento multi-tenant incluido y pasando

## Definición de "hecho"

`scripts/test-ai-service.ts` ejecutado con éxito:

```
Primera llamada:  { cacheHit: false, totalTokens: N (>0), data: "<respuesta Gemini>" }
Segunda llamada:  { cacheHit: true,  totalTokens: 0,      data: "<misma respuesta>"  }
```

`pnpm --filter backend typecheck` y `pnpm --filter backend test` pasan sin errores.
