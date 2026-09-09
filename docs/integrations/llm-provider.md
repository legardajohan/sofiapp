# Integración LLM — Gemini 1.5 Flash

El proveedor de IA es **Gemini 1.5 Flash**, detrás de una interfaz `ILlmProvider` para poder
sustituirlo sin refactorizar el dominio. (La interfaz hace trivial migrar a un modelo más nuevo
en el futuro.)

## 1. Interfaz `ILlmProvider`

```ts
export interface LlmCallResult<T> {
  result: T;
  usage: { promptTokens: number; completionTokens: number; totalTokens: number };
}

export interface ILlmProvider {
  // Extracción estructurada (slot filling) con salida JSON forzada
  extractSlots(input: { historial: ChatTurn[]; camposObjetivo: SlotSpec[] }): Promise<LlmCallResult<SlotResult>>;
  // Clasificación de nivel de interés y objeción
  classifyLead(input: { historial: ChatTurn[] }): Promise<LlmCallResult<{ nivelInteres: NivelInteres; objecion: Objecion | null }>>;
  // Respuesta conversacional: la usan `AIService.chat()` (nodo `kb`) y `AIService.summarize()`
  generateReply(input: { historial: ChatTurn[]; tono: string; instrucciones: string }): Promise<LlmCallResult<string>>;
  // Embeddings para RAG (HU-KB-01): un vector por texto de entrada
  embedTexts(input: { texts: string[]; taskType: 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY' }): Promise<LlmCallResult<number[][]>>;
}
```

Fuente de verdad: `apps/backend/src/integrations/llm/llm-provider.types.ts`. El dominio nunca llama
al `provider` directo — pasa siempre por `AIService` (`apps/backend/src/services/ai/ai.service.ts`),
que añade caché Redis, cortocircuito por FAQ (`chat()`), plantillas por tenant y registro de uso.

## 1.1. Nodo `ia` del constructor de flujos (HU-FLOW-03)

El nodo `ia` del constructor visual (`docs/data-model.md` → `flows`) es el único consumidor de
`AIService.extract()` que lleva conversación multi-turno en vez de resolver una pregunta puntual:

- El motor de flujos (`flow.engine.ts`) sigue puro — nunca llama a la IA. Cuando el nodo `ia` no
  puede decidir aún, devuelve `requiere: { tipo: 'ia', objetivo, salidas, usarKb }` y cede el
  control; el runtime (`flow.runtime.service.ts`) resuelve con **una sola** llamada a
  `ai.extract()` que pide a la vez `respuesta` (qué decirle al cliente) y `salida` (si ya se
  cumplió alguna de las salidas declaradas).
- El contexto no es el último mensaje sino el **historial real** de la conversación
  (`construirHistorial()`, últimos `TURNOS_HISTORIAL = 20` mensajes de `Message`), a diferencia de
  `intencion`/`kb`/`captura`, que solo ven el mensaje que disparó la invocación.
- Con `usarKb: true` antepone al historial los fragmentos de `searchKnowledge()`
  (`features/kb/kb.retrieval.service.ts`, RAG tenant-scoped) — es el primer consumidor real de esa
  función, hasta ahora reservada para `HU-IA-01/02` (no implementadas).
- `maxTurnos` (1-10, Zod) es el corte duro: agotado, el nodo sale por `ramaPorDefecto` sin volver
  a llamar a la IA. Ver `docs/specs/HU-FLOW-03-nodo-ia/` para el contrato completo.

- Implementación `GeminiProvider` que llama a la API de Gemini 1.5 Flash con **JSON mode /
  function calling** para respuestas estructuradas.
- Gestión de API keys por entorno, timeouts y manejo de errores HTTP.
- Todo el procesamiento LLM ocurre en el **worker BullMQ** (`llm-process`), fuera del hilo HTTP,
  para mantener el SLA de 200 OK a Meta.

## 2. Slot filling (datos de alto valor)

- **Core (todos los tenants):** `nombre`, `rolContacto` (`decisor|usuario|desconocido`),
  `interesItemId` (mapeado al catálogo del tenant).
- **Personalizados:** según `tenant.camposCaptura` (ej. Pre-ICFES: colegio, grado, acudiente) →
  se guardan en `cliente.customFields`.
- Persistencia con **merge parcial** que NO sobrescribe campos ya completados:
  `mergeClienteSlots()` con `findOneAndUpdateScoped` + `$set` parcial, tipado `Partial<ICliente>`.

## 3. Lead scoring y objeción

- `nivelInteres`: `frio | tibio | caliente`, inferido del lenguaje y la urgencia.
- `objecionPrincipal`: `precio | tiempo | confianza | otra`.
- Alimentan la segmentación de campañas (gastar presupuesto Meta solo en tibios/calientes).

## 4. Worker `llm-process`

- Consume jobs fuera del hilo principal. Concurrencia, reintentos y **dead-letter queue**.
- Idempotente: reprocesar un mensaje no duplica datos (merge parcial).

## 5. Variables de entorno

```
LLM_PROVIDER=gemini
GEMINI_API_KEY=
GEMINI_MODEL=gemini-1.5-flash   # valor de ejemplo: confirma el modelo vigente al implementar M04
LLM_TIMEOUT_MS=15000
```

> **Nota:** `gemini-1.5-flash` está fijado como referencia. Al implementar M04 confirma el modelo
> Gemini vigente y económico para el caso de uso; gracias a `ILlmProvider` el cambio es solo de
> implementación/configuración, sin tocar los servicios de dominio.

> Nota del arquitecto: el modelo está fijado por requerimiento (Gemini 1.5 Flash). La interfaz
> `ILlmProvider` permite cambiar a un modelo más reciente o a otro proveedor (OpenAI, etc.)
> cambiando solo la implementación, sin tocar servicios de dominio.
