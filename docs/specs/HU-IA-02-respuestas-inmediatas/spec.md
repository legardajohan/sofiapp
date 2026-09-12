# HU-IA-02 — Respuestas inmediatas sin esperar a un humano (spec)

> **Spec-Driven Development.** Este es el QUÉ y el porqué. El CÓMO va en `plan.md`; la ejecución
> en `tasks.md`.

**Estado:** implementado

## Objetivo

Que un cliente que escribe por WhatsApp reciba **una** respuesta automática pertinente en segundos,
sin esperar a un asesor, y que nunca se quede esperando en silencio cuando la IA no puede responder.

## Punto de partida: qué cubrió ya HU-IA-01

Los dos criterios literales de esta historia **ya están implementados y probados** en la rama
`feat/HU-IA-01`. Verificado en el código, no asumido:

| Criterio de la historia | Dónde vive hoy |
|---|---|
| Un mensaje entrante puede ser respondido automáticamente dentro de la ventana | `inbound-message.processor.ts:75` encola en `ai-reply` cuando `iaHabilitada && type === 'text'`; `upsertByMetaUser` refresca `ventana24hExpiraEn` a +24 h en cada entrante, así que la ventana está **siempre abierta** en este flujo |
| La respuesta queda registrada como mensaje del bot en el hilo | `replyFromIa()` → `sendMessage(..., sender: 'bot')` + `publishRealtime('message:new')`; `ConversationThread.tsx` la firma como "Sofi" |

Esta HU **no rehace nada de eso**. Toma el mecanismo que HU-IA-01 construyó y cierra la distancia
que queda hasta su Definition of Done —"respuesta **pertinente**, en **segundos**"—, que hoy no se
cumple de forma fiable.

## Los huecos reales (verificados en el código)

1. **Una ráfaga produce N respuestas.** El bucle `for (const msg of value.messages ?? [])` encola un
   job **por mensaje**, y el `Worker` corre con la concurrencia 1 de BullMQ. Un cliente que escribe
   "Hola" / "una pregunta" / "¿cuánto cuesta?" —el patrón normal en WhatsApp— recibe tres respuestas
   seguidas de Sofi. Tres respuestas a una sola intención no son "pertinentes".
2. **Un fallo de generación deja al cliente colgado.** Los jobs van con `attempts: 1` y el único
   manejo de fallo es el `logger.error` de `worker.ts:57`. Si Gemini agota el timeout o devuelve
   429, el cliente espera indefinidamente y **ningún asesor se entera** de que tiene que intervenir.
   Es el peor modo de fallo posible para una historia cuyo objetivo es que el cliente no espere.
3. **Audio, imagen y documento reciben silencio.** La guarda `msg.type === 'text'` descarta el
   mensaje sin dejar ni un acuse. El cliente manda una nota de voz preguntando algo y no pasa nada.
4. **"En segundos" no está medido ni acotado.** `LLM_TIMEOUT_MS` es 45 s y `env.ts:36-39` documenta
   mediciones reales del modelo de 6,9 / 22,8 / 25,9 s. `AiUsageLog.durationMs` mide solo la llamada
   al LLM: nadie mide el ciclo completo webhook → mensaje enviado, que es lo que el cliente percibe.
5. **La decisión de responder no tiene ni un test.** `grep aiReplyQueue --include=*.test.ts` solo
   encuentra mocks para poder importar `app`. La condición que decide si Sofi contesta —el corazón
   de esta historia— está sin cubrir, porque `inbound-message.processor.ts` exporta un `Worker` ya
   construido y no es testeable sin Redis.
6. **Un mensaje social escala a un humano sin motivo.** La plantilla global `chat` obliga a
   responder *"No tengo información suficiente para responder esa pregunta. Por favor, contacta a un
   asesor."* cuando el CONTEXTO no alcanza. Ante un "gracias" o un "ok" no hay nada que buscar en la
   KB, así que Sofi derivaría a un asesor justo cuando no hace falta ninguno.
   > No verificable sin Gemini real; el riesgo es de redacción del prompt y se corrige ahí.

## Alcance

Incluye:

- **Agrupación de ráfagas.** Una ráfaga de mensajes produce **una** respuesta, no una por mensaje.
  Ventana corta y configurable (`AI_REPLY_WINDOW_MS`, default 8 s) mediante `jobId` determinista por
  ventana + `delay` de BullMQ.
- **Guarda de cortesía en el worker:** si el último mensaje del hilo ya es del bot y el cliente no ha
  vuelto a escribir, no se responde otra vez.
- **Fallo visible.** Si la generación falla, el cliente recibe un mensaje de cortesía y la
  conversación sube a la bandeja como no leída, con evento en vivo, para que un asesor la recoja.
- **Acuse para mensajes no textuales**, una sola vez por hilo, en vez de silencio.
- **Latencia end-to-end instrumentada**: se mide y se registra el ciclo recepción → envío.
- **Refactor de `inbound-message.processor.ts`** al patrón de función pura (`processInboundJob`),
  como ya hacen `kb-index` y `ai-reply`, para poder testear la decisión de auto-responder.
- **Ajuste de la plantilla global `chat`** para que un mensaje social se responda con naturalidad en
  vez de escalar a un asesor, con la migración necesaria (el seed usa `$setOnInsert` y no pisa lo ya
  sembrado).

Fuera de alcance:
- Transcripción de audio a texto para poder responderlo → HU futura de multimedia.
- Indicador de "escribiendo…" en la bandeja mientras Sofi genera → cosmético.
- Reintentos de generación con backoff: se mantiene `attempts: 1` a propósito, porque cada intento
  vuelve a pagar embedding y generación.
- Rate limiting por conversación (tope de respuestas automáticas por hora) → futuro.

## Criterios de aceptación

1. **Una ráfaga, una respuesta.** Tres mensajes del mismo cliente dentro de la ventana producen
   exactamente **un** job y **una** respuesta de Sofi, que tiene en cuenta los tres.
2. **La ráfaga no se pierde:** esa respuesta única se genera con el hilo completo, incluido el
   último mensaje de la ráfaga.
3. **Sin doble respuesta:** si el último mensaje del hilo ya es del bot y no hay entrante posterior
   del cliente, el job termina sin enviar nada.
4. **Mensaje posterior sí se atiende:** un entrante que llega mientras Sofi genera la respuesta
   anterior no se pierde: cae en la ventana siguiente y obtiene su propia respuesta.
5. **Fallo de generación visible:** si `chat()` lanza, el cliente recibe el mensaje de cortesía, la
   conversación queda con `noLeidos` incrementado y se publica el evento de tiempo real. El job
   **no** se marca como fallido por esta vía.
6. **`iaHabilitada` sigue mandando:** con el toggle apagado no se encola ni se responde nada, ni
   siquiera el acuse ni el mensaje de cortesía.
7. **Acuse para no-texto:** un audio o una imagen con `iaHabilitada` produce un acuse de recibo, y
   **solo uno** por hilo aunque lleguen varios seguidos.
8. **Latencia medida:** cada respuesta automática deja registrada la latencia end-to-end
   (recepción del entrante → envío de la respuesta), separando la espera de la ventana del tiempo
   de generación, para poder validar el "en segundos" del DoD con datos.
9. **La decisión de auto-responder está testeada:** `processInboundJob` es una función pura y hay
   tests que cubren encola / no encola por `iaHabilitada`, por tipo de mensaje y por texto vacío.
10. **Mensaje social sin escalar:** ante un "gracias" u "ok", la plantilla no obliga a derivar a un
    asesor. Los tenants que ya tengan plantilla propia no se tocan.
11. **Aislamiento multi-tenant:** toda lectura y escritura nueva pasa por el repositorio scoped; el
    `jobId` de agrupación incluye el `tenantId`, de modo que dos clientes homónimos de tenants
    distintos nunca comparten ventana. Test de aislamiento añadido.
12. **`tsc --noEmit` en verde** y la suite de backend sin regresiones nuevas.

## Definition of Done

Un cliente escribe dos o tres mensajes seguidos por WhatsApp y recibe **una** respuesta pertinente
en segundos, registrada en el hilo como mensaje de Sofi. Si la IA no puede responder, el cliente
recibe igualmente una señal y la conversación aparece en la bandeja para que un asesor la atienda.

## Dependencias

- `HT-WA-01` — `sendMessage`, ventana de 24 h y cuota de mensajes → **cerrado**.
- `HU-IA-01` — cola `ai-reply`, `processAiReplyJob`, `replyFromIa`, `sender: 'bot'` y la firma de
  Sofi en la bandeja → **implementado** en `feat/HU-IA-01`, rama sobre la que se construye esta HU.
- `HU-OMNI-01` — `Cliente.iaHabilitada`, `noLeidos` y el gateway de tiempo real → **cerrada**.
