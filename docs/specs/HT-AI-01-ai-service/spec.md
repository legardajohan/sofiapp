# HT-AI-01 — Capa de servicio de Gemini Flash 1.5 (AIService) — spec

> **Spec-Driven Development.**
> Este es el QUÉ y el porqué. El CÓMO va en `plan.md`; la ejecución en `tasks.md`.

## Objetivo

Crear una capa de servicio única (`AIService`) que encapsule las llamadas a Gemini 1.5 Flash,
gestione plantillas de prompt versionadas por tenant, soporte salida estructurada (JSON schema),
aplique caché Redis por hash de entrada y contabilice tokens consumidos. Esta capa es la base
reutilizable de M04 (Motor IA), el chatbot conversacional y la futura Épica RAG.

## Alcance

### Incluye

- `GeminiProvider` que implementa la interfaz `ILlmProvider` (ver `docs/integrations/llm-provider.md`)
  con reintentos exponenciales (≤ 3) y timeout configurable.
- `AIService` con tres métodos: `chat()`, `extract(schema)`, `classify()`.
- Plantillas de prompt versionadas almacenadas en MongoDB, configurables por tenant en runtime.
- Caché Redis por hash de entrada normalizada + versión de plantilla activa; los hits no consumen tokens.
- Registro de uso (`AiUsageLog`) por llamada: tokens (prompt + completion + total), cache hit,
  duración y modelo usado.

### Fuera de alcance

- Endpoints HTTP propios — es un servicio interno; sin controller ni routes.
- Búsqueda semántica vectorial / embeddings (M05 — diferido).
- UI de administración de prompts (feature SAAS futura).
- Integración con BullMQ — el wiring de jobs va en M04-01.
- Evaluación automática de calidad de respuestas.

## Criterios de aceptación

1. **GeminiProvider arranca validado:** lee `GEMINI_API_KEY`, `GEMINI_MODEL` y `LLM_TIMEOUT_MS`
   del schema Zod de `config/env.ts`; el proceso falla en startup si alguna falta.
2. **Reintentos y timeout:** errores 429 y 5xx se reintentan hasta 3 veces con backoff exponencial
   (500 ms → 1 000 ms → 2 000 ms); las llamadas se abortan pasado `LLM_TIMEOUT_MS`.
3. **`AIService.chat()`:** dado historial de turnos y `tenantId`, devuelve texto plano usando la
   plantilla `chat` del tenant (o la global si no existe una específica).
4. **`AIService.extract(schema)`:** dado input y un Zod schema, devuelve un objeto JSON validado
   contra el schema usando `response_mime_type: "application/json"` de Gemini.
5. **`AIService.classify()`:** dado historial, devuelve
   `{ nivelInteres: NivelInteres; objecion: Objecion | null }` según la interfaz definida en
   `docs/integrations/llm-provider.md`.
6. **Plantillas versionadas:** existe un modelo `PromptTemplate` en MongoDB con `tenantId`
   nullable, `method`, `version`, `systemPrompt` e `isActive`. Resolución en runtime:
   tenant-específica > global (`tenantId = null`).
7. **Caché Redis activa:** `chat()` y `classify()` con la misma entrada normalizada y versión de
   plantilla retornan la respuesta cacheada sin invocar la API de Gemini.
   Formato de la cache key: `ai:<tenantId>:<method>:<SHA256(input+templateVersion)>`.
8. **`extract()` no cacheada:** cada invocación llama siempre a Gemini (el schema varía por llamada).
9. **Contabilización de tokens:** cada invocación (con o sin cache hit) escribe un documento
   `AiUsageLog` con `tenantId`, `method`, `promptTokens`, `completionTokens`, `totalTokens`,
   `cacheHit`, `durationMs` y `model`.
10. **Aislamiento multi-tenant:** toda query a MongoDB pasa por funciones `*Scoped` del
    `base.repository`; la cache key incluye `tenantId`; `PromptTemplate` y `AiUsageLog` llevan
    `tenantId` requerido e indexado. Test de aislamiento: tenant B no accede a datos de tenant A.
11. **TypeScript strict:** `pnpm --filter backend typecheck` pasa sin errores; cero `any`.

## Dependencias

- `INF-02` completo: `base.repository.ts` con funciones `*Scoped` operativas.
- `INF-01` completo: scaffolding del monorepo, TypeScript config, `config/env.ts` con Zod.
- Redis operativo (ya requerido para BullMQ en la arquitectura base).
- `GEMINI_API_KEY` válida en `.env`.
