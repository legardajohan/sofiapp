# Integración LLM — Gemini 1.5 Flash

El proveedor de IA es **Gemini 1.5 Flash**, detrás de una interfaz `ILlmProvider` para poder
sustituirlo sin refactorizar el dominio. (La interfaz hace trivial migrar a un modelo más nuevo
en el futuro.)

## 1. Interfaz `ILlmProvider`

```ts
export interface ILlmProvider {
  // Extracción estructurada (slot filling) con salida JSON forzada
  extractSlots(input: { historial: ChatTurn[]; camposObjetivo: SlotSpec[] }): Promise<SlotResult>;
  // Clasificación de nivel de interés y objeción
  classifyLead(input: { historial: ChatTurn[] }): Promise<{ nivelInteres: NivelInteres; objecion: Objecion | null }>;
  // (Fase 3) respuesta conversacional para nodos IA del flujo
  generateReply(input: { historial: ChatTurn[]; tono: string; instrucciones: string }): Promise<string>;
}
```

- Implementación `GeminiProvider` que llama a la API de Gemini 1.5 Flash con **JSON mode /
  function calling** para respuestas estructuradas.
- Gestión de API keys por entorno, timeouts y manejo de errores HTTP.
- Todo el procesamiento LLM ocurre en el **worker BullMQ** (`llm-process`), fuera del hilo HTTP,
  para mantener el SLA de 200 OK a Meta.

## 2. Slot filling (datos de alto valor)

- **Lo implementado (HU-IA-06):** `DATOS_CONTACTO_SLOTS` en `cliente.service.ts` pide cuatro campos
  —`nombreCompleto`, `correo`, `telefono`, `interes`— y `AIService.extract()` inyecta el
  `systemPrompt` de la plantilla `extract` del tenant como `systemInstruction`. `interes` es texto
  libre (qué producto pide), **no** una referencia al catálogo.
- **Aspiracional:** `rolContacto` e `interesItemId` mapeado al catálogo del tenant. El modelo
  `CatalogItem` no existe en el backend, así que no hay contra qué mapear.
- Persistencia en `Cliente.datosExtraidos` con **merge** que no borra lo que una pasada anterior
  encontró ni lo que ya se confirmó. **`mergeClienteSlots()` nunca existió**: lo que pasa esos datos
  a la ficha es `confirmarDatosExtraidos()`, y es **explícito** —lo dispara una persona desde la
  tarjeta de la ficha—, no automático. Escribe solo donde el destino está vacío.

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
