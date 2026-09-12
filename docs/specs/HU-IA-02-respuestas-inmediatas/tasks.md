# HU-IA-02 — Tasks (checklist ejecutable)

> Claude Code: ejecuta en orden. Marca cada casilla al terminar. No cierres el feature hasta que
> TODO esté en verde.
>
> Se trabaja **sobre `feat/HU-IA-01`**, sin rama nueva.

## 1. Refactor previo: hacer testeable la decisión de auto-responder

Va primero porque todo lo demás se cuelga de aquí, y porque hoy esa decisión no tiene ni un test.

- [x] Modificar `workers/inbound-message.processor.ts`: extraer el cuerpo del `Worker` a
      `export async function processInboundJob(data: InboundJobData): Promise<void>`, patrón de
      `kb-index.processor.ts` y `ai-reply.processor.ts`.
  - [x] Exportar también `InboundJobData` (hoy es una interfaz privada del módulo).
  - [x] Dejar de exportar el `Worker` construido.
- [x] Modificar `worker.ts`:
  - [x] Construir `new Worker<InboundJobData>(INBOUND_QUEUE_NAME, …)` que delegue en `processInboundJob`.
  - [x] Añadirlo al array del bucle de handlers `failed`.
  - [x] **Quitar** los `inboundMessageProcessor.on('completed'|'failed')` sueltos (`worker.ts:67`
        y `worker.ts:71`): los sustituye el handler común del bucle, y si no quedarían duplicados.
- [x] Verificar que el comportamiento no cambia: misma cola, mismo orden de operaciones.

## 2. Agrupación de ráfagas

- [x] Modificar `config/env.ts`: añadir `AI_REPLY_WINDOW_MS`
      (`z.coerce.number().positive().default(8000)`) con el comentario de que es latencia percibida.
- [x] Modificar `workers/inbound-message.processor.ts`:
  - [x] Añadir `ventanaJobId(tenantId, clienteId, ahora)` → `ai-reply:${tenantId}:${clienteId}:${ventana}`.
        El `tenantId` va por delante: dos clientes de empresas distintas no comparten ventana.
  - [x] Encolar con `jobId: ventanaJobId(...)` y `delay: env.AI_REPLY_WINDOW_MS`.
  - [x] Añadir `recibidoEn: Date.now()` al job data.
  - [x] Mantener `attempts: 1`, `removeOnComplete: true`, `removeOnFail: 100`.
- [x] Modificar `workers/ai-reply.processor.ts`: añadir `recibidoEn: number` a `AiReplyJobData`.

## 3. Guardas del worker de auto-reply

- [x] Modificar `workers/ai-reply.processor.ts`:
  - [x] Tras construir el historial y **antes** de generar: si el último turno no es del cliente
        (`role !== 'user'`), `return` sin enviar. Cubre la ráfaga que cruza dos ventanas sin añadir
        ninguna consulta: el historial ya estaba leído.
  - [x] Envolver la llamada a `chat()` en try/catch propio (distinto del de envío).
  - [x] En el catch: `logger.error`, `avisarDeFalloYEscalar(...)` y `return` — **sin relanzar**, para
        que BullMQ no lo dé por fallido cuando el fallo ya quedó atendido.
  - [x] `avisarDeFalloYEscalar`: intenta enviar `MENSAJE_FALLO` con `replyFromIa`, captura el
        `AppError` de ventana/cuota, y llama a `marcarParaAsesor` en todo caso.
  - [x] **No** apagar `iaHabilitada`: un 429 pasajero no debe desactivar el asistente para siempre.
- [x] Crear `workers/ai-reply.messages.ts` con `MENSAJE_FALLO` y `MENSAJE_SOLO_TEXTO`, comentando
      que son copy de cara al cliente y no detalle de implementación.

## 4. Escalado a un asesor

- [x] Modificar `features/conversation/conversation.service.ts`: añadir
      `marcarParaAsesor(tenantId, clienteId): Promise<void>`.
  - [x] `$inc: { noLeidos: 1 }` vía `findOneAndUpdateScoped` — **nunca** `Model.updateOne`.
  - [x] Publicar `conversation:updated` reutilizando `resolveAsignado` / `resolveTags` /
        `toConversationResponse`, igual que `markRead` y `setIaHabilitada`.
  - [x] Si el cliente no existe, salir en silencio (mismo criterio que `notifyInboundMessage`).

## 5. Acuse para mensajes no textuales (AC7)

- [x] Modificar `workers/inbound-message.processor.ts`:
  - [x] Sustituir la guarda que descarta en silencio por: si `iaHabilitada` y el mensaje **no** es
        texto con cuerpo → `acusarNoTexto(tenantId, clienteId)`.
  - [x] `acusarNoTexto` mira el último mensaje **con texto** del hilo (no el último a secas) y no
        repite el acuse si ya es `MENSAJE_SOLO_TEXTO`. Ver la desviación 1 al final.
  - [x] Capturar `AppError` (fuera de ventana / cuota) con `logger.warn`, sin tumbar la ingesta.
  - [x] Con `iaHabilitada: false` no se manda acuse (AC6).

## 6. Latencia end-to-end

- [x] Modificar `workers/ai-reply.processor.ts`: al enviar con éxito, `logger.info('Auto-reply
      enviado', { tenantId, clienteId, esperaVentanaMs, generacionMs, totalMs })`.
- [x] Las tres cifras por separado: sin eso no se distingue si el "en segundos" se rompe por la
      ventana de agrupación (nuestra) o por la generación (del modelo).
- [x] No persistir en Mongo: `AiUsageLog.durationMs` ya cubre el coste del LLM.

## 7. Plantilla `chat`: no escalar ante un mensaje social (AC10)

- [x] Modificar `seed/seed-prompt-templates.ts`: añadir la excepción para saludos, agradecimientos y
      confirmaciones a la regla de fallback, y subir `version` a `1.1.0`.
- [x] Crear `scripts/migrate-chat-template.ts`:
  - [x] Actualiza **solo** la global (`tenantId: null`) y solo si sigue en `1.0.0`.
  - [x] **Nunca** toca la plantilla de un tenant: si una empresa ya escribió la suya, es su decisión.
  - [x] Log del resultado (actualizada / ya estaba al día / no existe).
- [x] Registrar `migrate:chat-template` en `apps/backend/package.json`, junto a `migrate:tags`.

## Tests (Vitest)

- [x] `workers/inbound-message.processor.test.ts` (crear) — la decisión de auto-responder, hoy sin
      cobertura alguna (AC9):
  - [x] `iaHabilitada: true` + texto → encola **un** job.
  - [x] `iaHabilitada: false` → no encola nada y **no** manda acuse.
  - [x] Tipo `image`/`audio` → no encola auto-reply y sí manda el acuse (AC7).
  - [x] Dos mensajes no textuales seguidos → el acuse se manda **una sola vez** (AC7).
  - [x] `iaHabilitada: false` + audio → tampoco se manda acuse (AC6).
  - [x] Texto vacío → no encola.
  - [x] Tres mensajes del mismo cliente en la misma ventana → **un solo `jobId`** (AC1).
  - [x] Dos clientes distintos → `jobId` distintos.
  - [x] **Aislamiento:** mismo `clienteId` en dos tenants → `jobId` distintos (AC11).
  - [x] El job se encola con `delay === env.AI_REPLY_WINDOW_MS` y con `recibidoEn`.
- [x] `workers/ai-reply.processor.test.ts` (extender):
  - [x] Último mensaje del hilo del bot y sin entrante posterior → no genera ni envía (AC3).
  - [x] Último mensaje del cliente tras una respuesta del bot → sí responde (AC4).
  - [x] `chat()` lanza → se envía `MENSAJE_FALLO`, se llama a `marcarParaAsesor` y el job **resuelve**
        (no rechaza) (AC5).
  - [x] `chat()` lanza y el envío del mensaje de cortesía **también** falla → se escala igualmente y
        el job sigue resolviendo.
  - [x] La respuesta se genera con el hilo completo de la ráfaga (AC2).
  - [x] Se registra la latencia con las tres cifras (AC8).
- [x] `features/conversation/conversation.service` (extender o test propio):
  - [x] `marcarParaAsesor` incrementa `noLeidos` y publica `conversation:updated`.
  - [x] **Aislamiento:** no alcanza a un cliente de otro tenant.
- [x] `scripts/migrate-chat-template.test.ts` (crear):
  - [x] Actualiza la global en `1.0.0`; es idempotente si ya está en `1.1.0`.
  - [x] No toca la plantilla de un tenant aunque esté en `1.0.0`.

## Verificación final

> Filtros reales de pnpm: `@sofiapp/api` y `@sofiapp/web`. Los nombres `backend`/`frontend` del
> `CLAUDE.md` raíz no matchean ningún paquete.

- [x] `pnpm --filter @sofiapp/api typecheck` sin errores.
- [x] `pnpm --filter @sofiapp/api test` → **603 pasan, 71 archivos, cero fallos**.
      > Los 8 rojos que arrastraba HU-IA-01 **desaparecieron**: eran de entorno, no de código.
      > Con Redis levantado (`sofiapp-redis`, docker), `publishRealtime` conecta y los tests de
      > etiquetas dejan de agotar su timeout. Diagnóstico confirmado.
- [x] Checklist de PR de `docs/multi-tenancy.md` §9 revisado.
- [x] `migrate:chat-template` ejecutado: `--dry-run` anunció el cambio sin escribir, la corrida
      real reportó "actualizada a 1.1.0" y una segunda corrida "ya está en 1.1.0" (idempotente).
- [ ] Manual, con Redis y un tenant real: tres mensajes seguidos → **una** respuesta.
      > **Pendiente**: los cuatro checks manuales de abajo necesitan el canal de Meta conectado y
      > tráfico real de WhatsApp. `app.ts` y `worker.ts` sí arrancan sin errores y las colas
      > quedan registradas; lo que falta es un mensaje real que atraviese el flujo.
- [ ] Manual: con `GEMINI_API_KEY` inválida → llega el mensaje de cortesía y la conversación queda
      no leída en la bandeja.
- [ ] Manual: nota de voz → llega el acuse; una segunda nota de voz **no** lo repite.
- [ ] Revisar el log del worker: `esperaVentanaMs`, `generacionMs` y `totalMs` coherentes; validar el
      SLO (p95 `totalMs` < 30 s).
- [x] `git status` sin `*.png`/`*.jpg` de verificación colados.

## Desviaciones respecto al plan (decididas al implementar)

1. **El acuse mira el último mensaje CON TEXTO, no el último mensaje.** El plan decía "último
   mensaje del hilo", y el primer test lo tumbó: cuando llega la segunda nota de voz, ese entrante
   ya está guardado y es siempre el último, así que la comprobación nunca detectaba el acuse previo
   y se repetía. Mirando el último mensaje con texto sale además gratis el caso bueno: si el cliente
   escribió algo entre los dos audios, su texto es lo último dicho con palabras y el acuse vuelve a
   tener sentido. Hay un test para cada uno de los dos casos.
2. **`CHAT_SYSTEM_PROMPT` y `CHAT_TEMPLATE_VERSION` se exportan desde el seed.** El plan dejaba el
   prompt embebido en el array de plantillas, lo que habría obligado a duplicarlo literalmente en el
   script de migración — dos copias del mismo texto que se separan a la primera edición.
3. **La migración expone `migrarPlantillaChatGlobal(dryRun)` además del `main()`.** Sin eso el
   script solo era testeable arrancándolo como proceso. El `main()` corre únicamente cuando el
   fichero se invoca como script, así que importarlo desde un test no dispara nada.
4. **Se añadió un test de que el asesor humano también frena a Sofi.** La guarda comprueba
   `role !== 'user'`, y en el mapeo de roles tanto `bot` como `agent` son `model`: si un asesor
   contesta a mano mientras el job espera en la ventana, Sofi ya no se suma. Era un efecto del
   diseño que no estaba escrito y merecía quedar fijado.

## Definición de "hecho"

Un cliente escribe dos o tres mensajes seguidos y recibe **una** respuesta pertinente en segundos,
registrada en el hilo como mensaje de Sofi. Un mensaje que no es texto obtiene un acuse en vez de
silencio. Si la generación falla, el cliente recibe una señal y la conversación sube a la bandeja
para que la atienda una persona. La decisión de auto-responder está cubierta por tests, la latencia
end-to-end queda medida, y ningún `jobId` de agrupación cruza la frontera entre dos tenants.
