# HU-IA-02 — Plan técnico (CÓMO)

> Se construye **sobre `feat/HU-IA-01`**, sin rama nueva. Todo lo que HU-IA-01 dejó en pie se
> reutiliza; aquí no se reescribe el mecanismo, se le añaden las guardas que le faltan.

## Archivos a crear

```
apps/backend/src/
└── workers/
    ├── inbound-message.processor.test.ts   # [CREAR] la decisión de auto-responder, ya testeable
    └── ai-reply.messages.ts                # [CREAR] textos de cortesía y acuse, en un solo sitio
```

## Archivos a modificar

```
apps/backend/src/
├── config/
│   └── env.ts                        # [MODIFICAR] AI_REPLY_WINDOW_MS
├── workers/
│   ├── inbound-message.processor.ts  # [MODIFICAR] processInboundJob puro + jobId de ventana + acuse
│   ├── inbound-message.processor…    #   (el `Worker` construido se mueve a worker.ts)
│   ├── ai-reply.processor.ts         # [MODIFICAR] guarda anti-doble-respuesta, fallo visible, latencia
│   └── ai-reply.processor.test.ts    # [MODIFICAR] casos nuevos
├── features/conversation/
│   └── conversation.service.ts       # [MODIFICAR] marcarParaAsesor()
├── seed/
│   └── seed-prompt-templates.ts      # [MODIFICAR] regla social en la plantilla `chat` + bump
├── scripts/
│   └── migrate-chat-template.ts      # [CREAR] repone la global `chat` que `$setOnInsert` no pisa
└── worker.ts                         # [MODIFICAR] construye el Worker de inbound

docs/
└── data-model.md                     # [MODIFICAR] nota de la ventana de agrupación
```

---

## 1. Agrupación de ráfagas

### `config/env.ts`

```ts
  // Ventana de agrupación del auto-reply (HU-IA-02). Los mensajes de un mismo cliente que caen en
  // la misma ventana producen UNA sola respuesta. Es también latencia añadida y percibida por el
  // cliente, así que sube con cuidado: 8 s cubre el tecleo normal de una ráfaga de WhatsApp sin
  // que la respuesta deje de sentirse inmediata.
  AI_REPLY_WINDOW_MS: z.coerce.number().positive().default(8000),
```

### `inbound-message.processor.ts` — `jobId` de ventana

La agrupación se apoya en una propiedad de BullMQ: **`add()` con un `jobId` que ya existe en la cola
es un no-op**. No hace falta borrar ni reprogramar nada.

```ts
/**
 * Identidad de la ventana de agrupación: todos los mensajes de un mismo cliente que caen en el
 * mismo tramo de `AI_REPLY_WINDOW_MS` comparten `jobId`, así que solo el primero crea el job y los
 * demás son no-ops. El job se programa con `delay` para que, cuando corra, la ráfaga ya haya
 * terminado y el historial la contenga entera.
 *
 * Lleva `tenantId` por delante: dos clientes de empresas distintas nunca deben compartir ventana.
 */
function ventanaJobId(tenantId: string, clienteId: string, ahora: number): string {
  const ventana = Math.floor(ahora / env.AI_REPLY_WINDOW_MS);
  return `ai-reply:${tenantId}:${clienteId}:${ventana}`;
}
```

```ts
await aiReplyQueue.add(
  AI_REPLY_JOB_NAME,
  { tenantId, clienteId: clienteId.toString(), recibidoEn: Date.now() },
  {
    jobId: ventanaJobId(tenantId, clienteId.toString(), Date.now()),
    delay: env.AI_REPLY_WINDOW_MS,
    attempts: 1,
    removeOnComplete: true,
    removeOnFail: 100,
  },
);
```

**Por qué ventanas fijas (*tumbling*) y no una ventana deslizante.** Una deslizante ("reprograma en
cada mensaje") exige `getJob` + `remove` + `add` en cada entrante: tres viajes a Redis por mensaje y
una carrera con el worker si el job ya pasó a `active`. La fija se consigue con el `jobId` y nada
más. A cambio, una ráfaga que cruce el límite de dos ventanas produce dos jobs — y para ese caso
está la guarda del punto 2, que hace que el segundo no envíe nada.

**Y resuelve el mensaje que llega mientras Sofi genera** (AC4): ese entrante cae en una ventana
posterior, así que crea su propio job en vez de perderse contra un `jobId` ocupado.

## 2. Guardas del worker

### `ai-reply.processor.ts` — no responder dos veces

Antes de generar, y después de re-chequear `iaHabilitada`:

```ts
/**
 * Si lo último del hilo ya es una respuesta del bot, la ráfaga anterior ya quedó atendida y este
 * job es el sobrante de una ventana que se solapó. Se sale sin gastar ni un embedding.
 * Solo cuenta lo que ya está persistido: si el cliente volvió a escribir, su mensaje es el último
 * y el job sigue adelante.
 */
const ultimo = historial[historial.length - 1];
if (!ultimo || ultimo.role !== 'user') return;
```

Es una comprobación sobre el historial **que ya se estaba leyendo**: no añade consulta.

### `ai-reply.processor.ts` — que un fallo no deje al cliente en silencio

```ts
try {
  respuesta = (await getAIService().chat({ tenantId: oid, historial })).data;
} catch (err: unknown) {
  // El cliente no puede quedarse esperando por un fallo nuestro. Se le avisa y la conversación
  // sube a la bandeja para que la recoja una persona. No se relanza: `attempts: 1` haría que
  // BullMQ lo diera por fallido y el cliente seguiría sin saber nada.
  logger.error('Auto-reply: falló la generación', { tenantId, clienteId, error: String(err) });
  await avisarDeFalloYEscalar(tenantId, clienteId);
  return;
}
```

`avisarDeFalloYEscalar` intenta enviar `MENSAJE_FALLO` y llama a `marcarParaAsesor`; si el envío
falla a su vez (fuera de ventana, cuota), se logea y se escala igualmente. **No se apaga
`iaHabilitada`**: un 429 pasajero no debe desactivar el asistente para siempre.

### `features/conversation/conversation.service.ts` — `marcarParaAsesor`

```ts
/**
 * Sube la conversación a la bandeja como pendiente de una persona (HU-IA-02): incrementa
 * `noLeidos` y publica `conversation:updated`. Se usa cuando la IA no pudo responder, para que el
 * fallo sea visible en vez de quedarse en un log que nadie lee.
 */
export async function marcarParaAsesor(tenantId: string, clienteId: string): Promise<void>;
```

Reutiliza el mismo `findOneAndUpdateScoped` + `publishRealtime` que ya usan `markRead` y
`setIaHabilitada`; nada de acceso directo a Mongoose.

### `workers/ai-reply.messages.ts`

Los tres textos que Sofi puede enviar sin pasar por el modelo, juntos y comentados:

```ts
export const MENSAJE_FALLO =
  'Estoy teniendo problemas para responderte en este momento. Ya avisé a un asesor para que ' +
  'continúe contigo.';

export const MENSAJE_SOLO_TEXTO =
  'Por ahora solo puedo leer mensajes de texto. Si me escribes tu consulta, te respondo enseguida.';
```

> Van aquí y no incrustados en el worker porque son **copy de cara al cliente**: se revisan y se
> traducen como tal, no como detalle de implementación.

## 3. Acuse para mensajes no textuales

En `processInboundJob`, sustituyendo la guarda actual que descarta en silencio:

```ts
if (!cliente.iaHabilitada) continue;

if (msg.type === 'text' && msg.text?.body) {
  // …encolar el auto-reply (punto 1)
} else {
  // Un audio o una imagen no se pueden responder por RAG todavía, pero el silencio es peor que
  // un acuse: el cliente no sabe si le llegó. Se manda UNA vez por hilo.
  await acusarNoTexto(tenantId, clienteId.toString());
}
```

`acusarNoTexto` mira el último mensaje del hilo: si ya es `MENSAJE_SOLO_TEXTO`, no repite. Va en el
propio worker de inbound (es inmediato y no necesita al modelo), envuelto en try/catch de `AppError`
igual que el auto-reply.

## 4. Latencia end-to-end

El job lleva `recibidoEn` (epoch ms del entrante que abrió la ventana). Al terminar:

```ts
logger.info('Auto-reply enviado', {
  tenantId,
  clienteId,
  // Las tres cifras por separado: sin esto no se puede saber si el "en segundos" del DoD se rompe
  // por la ventana de agrupación (nuestra, ajustable) o por la generación (del modelo).
  esperaVentanaMs: inicioProceso - recibidoEn,
  generacionMs: finGeneracion - inicioProceso,
  totalMs: Date.now() - recibidoEn,
});
```

No se persiste en Mongo: `AiUsageLog.durationMs` ya cubre el coste del LLM, y duplicar la métrica en
una colección obligaría a mantener dos fuentes. El log estructurado basta para validar el SLO.

**SLO declarado:** `totalMs` p95 < 30 s con `AI_REPLY_WINDOW_MS` = 8 s. Se valida con el smoke
manual, no con un test automático: depende de la latencia real de Gemini.

## 5. Refactor de `inbound-message.processor.ts`

Hoy exporta un `Worker` ya construido, y por eso la decisión de auto-responder no se puede testear
sin Redis. Se pasa al patrón de `kb-index` y `ai-reply`:

```ts
export interface InboundJobData { tenantId: string; payload: IWhatsAppWebhookPayload }

export async function processInboundJob(data: InboundJobData): Promise<void> { … }
```

y en `worker.ts` se construye el `Worker` que delega en ella, añadiéndolo al bucle de handlers
`failed`. **Ojo:** `worker.ts` hoy engancha `inboundMessageProcessor.on('completed'|'failed')` por
separado (líneas 70-76); esos dos handlers se sustituyen por el del bucle común.

> Es refactor puro: mismo comportamiento, misma cola, mismo orden de operaciones. Lo que cambia es
> que la decisión pasa a ser una función invocable desde un test.

## 6. Plantilla `chat`: no escalar ante un mensaje social

En `seed-prompt-templates.ts`, dentro del `systemPrompt` de `chat`, la regla de fallback pasa a
tener una excepción explícita:

```
Si el CONTEXTO está vacío o no alcanza para responder lo que preguntan, responde exactamente:
"No tengo información suficiente para responder esa pregunta. Por favor, contacta a un asesor."
y no añadas nada más.

Excepción: si el mensaje no es una pregunta —un saludo, un agradecimiento, una confirmación como
"ok" o "listo"— responde con naturalidad y brevedad, sin usar esa frase y sin derivar a un asesor.
Derivar a alguien que no hace falta es un error tan grave como inventarse un dato.
```

Y sube `version` a `1.1.0`.

**El seed no basta.** `seedPromptTemplates` usa `$setOnInsert`, precisamente para no pisar lo que un
admin haya editado, así que **la global ya sembrada no se actualizaría sola**. Hace falta un script
explícito:

```
scripts/migrate-chat-template.ts   # actualiza SOLO la global (tenantId: null) a la v1.1.0
```

Actualiza la global si su `version` sigue siendo `1.0.0`, y **nunca toca una plantilla de tenant**:
si una empresa ya escribió la suya, esa decisión es suya. Se registra en `package.json` como
`migrate:chat-template`, junto a `migrate:tags`.

## Notas

- `AI_REPLY_WINDOW_MS` es latencia deliberada. Es el precio de no mandar tres respuestas a una
  ráfaga, y por eso es configurable: un tenant que prefiera velocidad sobre agrupación puede bajarlo.
- La agrupación **no** cambia el contrato del job más allá de añadir `recibidoEn`; `processAiReplyJob`
  sigue leyendo el hilo desde Mongo, así que ve la ráfaga completa sin que nadie se la pase.
- El acuse de no-texto y el mensaje de fallo **consumen cuota de mensajes** (`incrementUsage`), igual
  que cualquier saliente. Es correcto: son mensajes reales que se envían.
- No se toca `attempts: 1`. El manejo de fallo de esta HU ocurre *dentro* del job, que termina bien;
  BullMQ no tiene por qué reintentar nada.

## Verificación

```bash
pnpm --filter @sofiapp/api typecheck
pnpm --filter @sofiapp/api test
```

> Los filtros son `@sofiapp/api` y `@sofiapp/web`; los nombres `backend`/`frontend` del `CLAUDE.md`
> raíz no matchean ningún paquete y pnpm no ejecuta nada.

Manual, contra un tenant real con la KB indexada y Redis levantado:

1. Enviar tres mensajes seguidos desde WhatsApp → llega **una** respuesta.
2. Revisar el log del worker: `esperaVentanaMs`, `generacionMs` y `totalMs` presentes y coherentes.
3. Con una `GEMINI_API_KEY` inválida, enviar un mensaje → llega el mensaje de cortesía y la
   conversación aparece como no leída en la bandeja.
4. Enviar una nota de voz → llega el acuse, y una segunda nota de voz **no** lo repite.
