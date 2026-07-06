# HT-AI-01 — Plan técnico (CÓMO)

## Arquitectura

```
ILlmProvider (interface)
    ↑ implementa
GeminiProvider  (cliente HTTP + reintentos + timeout)
    ↑ inyectado en
AIService       (cache Redis + plantillas Mongo + token tracking)
    ↑ usado por
Workers BullMQ (M04-01, futuros RAG jobs)
```

`ILlmProvider` no cambia respecto a `docs/integrations/llm-provider.md`.
`GeminiProvider` la implementa. `AIService` la envuelve añadiendo caché, templates y logging.

Mapeo de métodos:
- `AIService.chat()`         → `provider.generateReply()`
- `AIService.extract(schema)` → `provider.extractSlots()` con salida JSON schema
- `AIService.classify()`     → `provider.classifyLead()`

## Archivos a crear

```
apps/backend/src/
├── integrations/llm/
│   ├── llm-provider.types.ts         [CREAR]
│   └── gemini.provider.ts            [CREAR]
│
├── services/ai/
│   ├── ai-service.types.ts           [CREAR]
│   ├── prompt-template.model.ts      [CREAR]
│   ├── ai-usage-log.model.ts         [CREAR]
│   ├── ai-cache.util.ts              [CREAR]
│   └── ai.service.ts                 [CREAR]
│
└── config/
    └── env.ts                        [MODIFICAR]

apps/backend/scripts/
├── seed-prompt-templates.ts          [CREAR]
└── test-ai-service.ts                [CREAR]
```

**Por qué `services/ai/` y no `features/`:** AIService no tiene controller ni routes.
El directorio `services/` es para "soporte no atado a un feature" (ver `docs/architecture.md`).

## Contratos

### `integrations/llm/llm-provider.types.ts`

Transcribir exactamente la interfaz de `docs/integrations/llm-provider.md`:

```ts
export interface ChatTurn {
  role: 'user' | 'model';
  content: string;
}

export type NivelInteres = 'frio' | 'tibio' | 'caliente';
export type Objecion    = 'precio' | 'tiempo' | 'confianza' | 'otra';

export interface SlotSpec {
  campo:       string;
  descripcion: string;
  tipo:        'texto' | 'numero' | 'fecha' | 'booleano';
  requerido:   boolean;
}

export interface SlotResult {
  slots:       Record<string, unknown>;
  incompletos: string[];
}

export interface ILlmProvider {
  extractSlots(input: {
    historial:       ChatTurn[];
    camposObjetivo:  SlotSpec[];
  }): Promise<SlotResult>;

  classifyLead(input: {
    historial: ChatTurn[];
  }): Promise<{ nivelInteres: NivelInteres; objecion: Objecion | null }>;

  generateReply(input: {
    historial:     ChatTurn[];
    tono:          string;
    instrucciones: string;
  }): Promise<string>;
}
```

### `integrations/llm/gemini.provider.ts`

```ts
import { GoogleGenerativeAI } from '@google/generative-ai';
import { env } from '../../config/env';

export class GeminiProvider implements ILlmProvider {
  private genAI: GoogleGenerativeAI;
  // Lee GEMINI_API_KEY, GEMINI_MODEL, LLM_TIMEOUT_MS de env (validados en startup)

  // extractSlots(): JSON schema derivado de SlotSpec[], response_mime_type "application/json"
  // classifyLead(): JSON schema fijo { nivelInteres: enum, objecion: enum | null }
  // generateReply(): texto libre, sin response_mime_type forzado

  // Reintentos privados:
  //   3 intentos, backoff 500 → 1 000 → 2 000 ms, sólo en status 429 y 5xx
  //   AbortSignal.timeout(env.LLM_TIMEOUT_MS) en cada intento
}
```

### `services/ai/ai-service.types.ts`

```ts
import type { Types }    from 'mongoose';
import type { ZodSchema } from 'zod';
import type { ChatTurn, SlotSpec, NivelInteres, Objecion } from '../../integrations/llm/llm-provider.types';

export interface AiResult<T> {
  data:             T;
  cacheHit:         boolean;
  promptTokens:     number;
  completionTokens: number;
  totalTokens:      number;
  durationMs:       number;
}

export interface AiChatParams {
  tenantId:     Types.ObjectId;
  historial:    ChatTurn[];
  tono?:        string;
  instrucciones?: string;
}

export interface AiExtractParams {
  tenantId:        Types.ObjectId;
  historial:       ChatTurn[];
  schema:          ZodSchema;
  camposObjetivo:  SlotSpec[];
}

export interface AiClassifyParams {
  tenantId:  Types.ObjectId;
  historial: ChatTurn[];
}

export type ClassifyResult = { nivelInteres: NivelInteres; objecion: Objecion | null };
```

### `services/ai/prompt-template.model.ts`

```ts
// Esquema Mongoose:
// tenantId:     { type: Schema.Types.ObjectId, ref: 'Tenant', default: null, index: true }
//               null = plantilla global (fallback si no hay una específica del tenant)
// method:       { type: String, enum: ['chat','extract','classify'], required: true }
// version:      { type: String, required: true }   // semver, ej. '1.0.0'
// systemPrompt: { type: String, required: true }
// isActive:     { type: Boolean, default: true }
// createdAt:    automático (timestamps: true)
//
// Índice compuesto: { tenantId: 1, method: 1, isActive: 1 }
```

### `services/ai/ai-usage-log.model.ts`

```ts
// tenantId:         required, { index: true }
// method:           'chat' | 'extract' | 'classify'
// model:            string  (ej. 'gemini-1.5-flash')
// promptTokens:     number
// completionTokens: number
// totalTokens:      number
// cacheHit:         boolean
// durationMs:       number
// createdAt:        Date   (timestamps: true)
//
// Índice: { tenantId: 1, createdAt: -1 }
// TTL index: { createdAt: 1 }, expireAfterSeconds: 7776000 (90 días)
```

### `services/ai/ai-cache.util.ts`

```ts
import { createHash }  from 'crypto';
import type { Redis }  from 'ioredis';

// Normalización: JSON.stringify(input) + .trim().toLowerCase() + colapsar espacios
// Hash: SHA256(normalizedInput + templateVersion)

export function buildCacheKey(
  tenantId: string,
  method:   string,
  input:    string,
  version:  string,
): string  // → 'ai:<tenantId>:<method>:<sha256hex>'

export async function getCached<T>(redis: Redis, key: string): Promise<T | null>
// redis.get(key) → JSON.parse; null si no existe o parse falla

export async function setCached<T>(
  redis:      Redis,
  key:        string,
  value:      T,
  ttlSeconds: number,
): Promise<void>
// redis.set(key, JSON.stringify(value), 'EX', ttlSeconds)
```

### `services/ai/ai.service.ts`

```ts
export class AIService {
  constructor(
    private provider: ILlmProvider,
    private redis:    Redis,
  ) {}

  async chat(params: AiChatParams): Promise<AiResult<string>> {
    // 1. resolveTemplate(tenantId, 'chat')
    // 2. buildCacheKey → getCached → si hit: logUsage(cacheHit=true, tokens=0) → return
    // 3. provider.generateReply({ historial, tono, instrucciones })
    // 4. setCached(key, result, env.AI_CACHE_TTL_CHAT_S)
    // 5. logUsage(cacheHit=false, tokens de usageMetadata de Gemini)
    // 6. return AiResult<string>
  }

  async extract<T>(params: AiExtractParams): Promise<AiResult<T>> {
    // 1. resolveTemplate(tenantId, 'extract')
    // 2. provider.extractSlots({ historial, camposObjetivo })
    // 3. params.schema.parse(slots)   → lanza ZodError si inválido
    // 4. logUsage(cacheHit=false)
    // 5. return AiResult<T>
    // SIN caché
  }

  async classify(params: AiClassifyParams): Promise<AiResult<ClassifyResult>> {
    // Igual que chat() pero classifyLead() y TTL: env.AI_CACHE_TTL_CLASSIFY_S
  }

  private async resolveTemplate(
    tenantId: Types.ObjectId,
    method:   string,
  ): Promise<IPromptTemplate> {
    // findScoped({ tenantId, method, isActive: true })
    // si null → PromptTemplateModel.findOne({ tenantId: null, method, isActive: true })
    // si null → throw new AppError('No prompt template found for method: ' + method, 500)
  }

  private logUsage(log: Omit<IAiUsageLog, 'createdAt'>): void {
    // void createScoped(AiUsageLogModel, log)   ← fire-and-forget, no bloquea respuesta
  }
}

// Factory (singleton en app.ts / worker.ts):
export function createAIService(redis: Redis): AIService {
  return new AIService(new GeminiProvider(), redis);
}
```

### `config/env.ts` — añadir al schema Zod existente

```ts
LLM_PROVIDER:            z.enum(['gemini']).default('gemini'),
GEMINI_API_KEY:          z.string().min(1),
GEMINI_MODEL:            z.string().default('gemini-1.5-flash'),
LLM_TIMEOUT_MS:          z.coerce.number().positive().default(15000),
AI_CACHE_TTL_CHAT_S:     z.coerce.number().positive().default(3600),
AI_CACHE_TTL_CLASSIFY_S: z.coerce.number().positive().default(7200),
```

## Notas

- **Redis compartido:** reusar el cliente `ioredis` ya instanciado para BullMQ; no crear
  una segunda conexión.
- **Fire-and-forget en logUsage:** `void createScoped(...)` — no añade latencia a la respuesta.
- **Excepción de multi-tenancy documentada:** la resolución de plantilla global
  (`tenantId: null`) usa `PromptTemplateModel.findOne(...)` directamente, igual que el
  login resuelve tenant sin `requireTenant`. Debe quedar documentado en el código.
- **Paquete npm necesario:** `@google/generative-ai` (SDK oficial de Google).

## Verificación

```bash
pnpm --filter backend typecheck          # cero errores, cero any
pnpm --filter backend test               # incluye tests de aislamiento

# DoD manual (requiere .env con GEMINI_API_KEY + Redis corriendo):
pnpm --filter backend tsx scripts/seed-prompt-templates.ts
pnpm --filter backend tsx scripts/test-ai-service.ts
# Primera llamada:  { cacheHit: false, totalTokens: N, data: "..." }
# Segunda llamada:  { cacheHit: true,  totalTokens: 0, data: "..." }
```
