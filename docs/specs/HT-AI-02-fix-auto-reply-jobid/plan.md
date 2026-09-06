# HT-AI-02 — Plan técnico (CÓMO)

> El QUÉ está en `spec.md`; la ejecución en `tasks.md`. No redefine reglas: el aislamiento se rige
> por `docs/multi-tenancy.md` y el patrón de feature por `apps/backend/CLAUDE.md`.
>
> **Rama:** `feat/HU-IA-01` (la actual). No se crea rama nueva.

## Estado base

Los paquetes son **`@sofiapp/api`** y **`@sofiapp/web`** (`--filter backend` no matchea nada).
`typecheck` y `test` se verifican en verde antes de empezar; el número exacto queda anotado en
`tasks.md` al arrancar la implementación.

La suite pasa entera **con el auto-reply completamente muerto en producción**. Esa es la medida del
hueco: se prueba la semántica del identificador contra un mock, y el mock acepta lo que BullMQ
rechaza.

## Decisiones de diseño

| Decisión | Elección | Por qué |
|---|---|---|
| Separador del `jobId` | **`-`** | `tenantId` y `clienteId` son hex de 24 caracteres y la ventana es un entero: ninguno contiene `-`, así que los tramos siguen siendo inequívocos y no hay riesgo de colisión |
| Quitar **todos** los `:` | Sí, no ajustar a 3 tramos | La validación de BullMQ tolera `:` cuando hay exactamente 3 tramos, pero es una rama de compatibilidad con repeatable jobs viejos que su propio `TODO` marca para eliminar en la próxima ruptura. Apoyarse en ella es heredar una bomba de relojería |
| Conservar el prefijo `ai-reply` | Sí | Es redundante con el nombre de la cola, pero garantiza que el id **nunca** sea un entero puro, que es la otra regla de `validateOptions` (`job.js:1043`) |
| Fallo del auto-reply | **Aislado**, con log en `error` | El mensaje ya está guardado y notificado cuando se llega ahí: tumbar el job de ingesta no deshace nada y ensucia la cola de fallidos mezclando «no se ingestó» con «se ingestó pero la IA no arrancó». Hay precedente en el mismo archivo: `acusarNoTexto` ya lo hace (líneas 74-84) |
| Los 5 jobs varados | **Descartar** | Los mensajes están en Mongo y en la bandeja; no se pierde información. Reprocesarlos haría que Sofi conteste hoy a mensajes de hace días |

## Archivos a tocar

```
apps/backend/src/workers/
├── inbound-message.processor.ts        # TOCAR — separador del jobId + aislar el fallo
└── inbound-message.processor.test.ts   # TOCAR — contrato del jobId + fallo aislado
```

**Dos archivos.** No se toca `ai-reply.processor.ts`, ni `config/queues.ts`, ni `worker.ts`, ni
`env.ts`: el consumidor, la cola y la ventana están bien.

## Contratos

### `ventanaJobId` — el formato

De `` `ai-reply:${tenantId}:${clienteId}:${ventana}` `` a un identificador con `-`:

```
ai-reply-<tenantId>-<clienteId>-<ventana>
ai-reply-6a696700a3aca08708da6dfe-68f1a2b3c4d5e6f7a8b9c0d1-212500000
```

El cálculo de la ventana (`Math.floor(ahora / env.AI_REPLY_WINDOW_MS)`) **no cambia**, y el orden de
los tramos tampoco: el `tenantId` sigue por delante, que es lo que impide que dos clientes con el
mismo `_id` en empresas distintas compartan ventana.

El comentario de la función se amplía con el porqué del separador, para que nadie «mejore» la
legibilidad devolviendo los dos puntos:

> Sin `:` en el identificador: BullMQ los rechaza en un `jobId` personalizado
> (`Custom Id cannot contain :`). Tolera el caso de exactamente tres tramos por compatibilidad con
> repeatable jobs antiguos, pero su propio código marca esa rama para eliminarla, así que aquí no
> hay ninguno. Ese fue HT-AI-02, y dejó el auto-reply muerto sin que ningún test lo notara.

### `atenderConSofi` — el fallo deja de ser fatal

La llamada desde `processInboundJob` (línea 132) se envuelve para que un fallo no arrastre la
ingesta:

```ts
if (cliente.iaHabilitada) {
  try {
    await atenderConSofi(tenantId, clienteId.toString(), msg.type, msg.text?.body);
  } catch (err: unknown) {
    // El mensaje ya está guardado y en la bandeja: que Sofi no arranque no deshace eso, y marcar
    // el job entero como fallido mezcla "no se ingestó" con "se ingestó y la IA no arrancó".
    // Nivel `error` a propósito: sin la cola de fallidos, este log es el único rastro.
    logger.error('Sofi no pudo atender el mensaje entrante', {
      tenantId, clienteId: clienteId.toString(), error: String(err),
    });
  }
}
```

Es el mismo criterio que `acusarNoTexto` ya aplica a los `AppError` de `replyFromIa` (líneas 76-84),
extendido a todo el camino de la IA. La diferencia de nivel es deliberada: allí es `warn` porque
salirse de la ventana de 24 h es un desenlace normal; aquí es `error` porque cualquier fallo al
encolar es un defecto.

**Coste asumido, explícito:** los 5 jobs en `failed` fueron el rastro que permitió diagnosticar
esto. Al aislarlo, ese rastro pasa a depender del log. Por eso el nivel es `error` y el mensaje
nombra el tenant y el cliente.

### Lo que NO cambia

`atenderConSofi` conserva su cuerpo: la bifurcación texto/no-texto, `acusarNoTexto`, el `delay`, el
`attempts: 1`, `removeOnComplete` y `removeOnFail`. `processAiReplyJob` no se toca.

## Tests

### `ventanaJobId` — el contrato con BullMQ

El bloque `describe('ventanaJobId — aislamiento y agrupación')` (líneas 269-296) **se conserva tal
cual**: sus cuatro casos describen la semántica de la ventana y siguen siendo correctos. Se le
añaden los que faltaban, que son los del formato:

| # | Caso | Espera |
|---|---|---|
| 1 | **Regresión:** el id no contiene `:` | `expect(id).not.toContain(':')`. Falla contra el código actual |
| 2 | El id no es un entero puro | La otra regla de `validateOptions` (`job.js:1043`) |
| 3 | Se mantiene con valores límite | Ventana `0`, y `tenantId`/`clienteId` como ObjectId reales de 24 hex |

**El test que no se puede burlar.** Los tres anteriores comprueban el formato «a mano», replicando
la regla de BullMQ — y una regla replicada puede quedar desincronizada de la real. Así que además
se valida el id **contra la implementación de BullMQ**, importando `Job` y llamando a su
`validateOptions` con las opciones que usa `atenderConSofi`. Si BullMQ endurece la regla —su propio
`TODO` dice que lo hará—, este test se entera; una aserción sobre `':'` escrita a mano, no.

> Si `validateOptions` resultara no ser invocable de forma aislada (es un método de instancia que
> necesita un `Job` construido), la alternativa es un test que construya el `Job` con
> `new Job(queueStub, name, data, opts)` y llame al método. Se decide al implementar, contra la
> firma real; lo que no es negociable es que **la regla la ponga BullMQ y no nosotros**. Si ninguna
> de las dos vías es viable sin Redis, se deja documentado en el test por qué se replica la regla a
> mano y se enlaza a `job.js:1041-1051`.

### `processInboundJob` — el fallo aislado

| # | Caso | Espera |
|---|---|---|
| 4 | `aiReplyQueue.add` rechaza | `processInboundJob` **resuelve**, no lanza |
| 5 | En ese caso, el mensaje sigue guardado y notificado | `notifyInboundMessage` llamado; el `Message` existe en Mongo |
| 6 | En ese caso se registra en `error` | Un `logger.error` con `tenantId` y `clienteId` |

El caso 4 se monta haciendo `mockAdd.mockRejectedValue(...)`, que es justo lo que el mock actual
nunca hace: hoy siempre resuelve (`mockAdd.mockReset().mockResolvedValue(undefined)`, línea 110).

### Sin cambios, deben seguir verdes

Los diez casos de `describe('processInboundJob — decide si Sofi responde (HU-IA-02)')` y los dos de
`(HU-IA-03)`, incluidos el de la ráfaga que comparte un único `jobId` (línea 249) y el del
aislamiento por tenant (línea 291). Son la red que garantiza que cambiar el separador no cambió la
semántica.

## Notas

- **Un solo sitio afectado.** `jobId` personalizado se usa exclusivamente en
  `inbound-message.processor.ts:168`. Se verificó por búsqueda en todo `apps/backend/src`: ni
  `kb-index`, ni `outbound-send`, ni las campañas lo pasan. No hay más bombas de este tipo.
- **La cola `ai-reply` está vacía**, así que cambiar el formato del id no rompe nada en vuelo: no
  hay jobs previos con el formato viejo con los que pudiera colisionar o desalinearse.
- **El worker de inbound no reintenta.** El productor (`webhook.service.ts`) encola sin opciones, y
  el default de BullMQ es `attempts: 1`. Por eso los 5 jobs llevan ahí varados: nunca se
  reintentarán solos.
- **`saveMessage` deduplica por `metaMessageId`** (`message.service.ts:16-19`), así que un
  reproceso no duplicaría mensajes. Es lo que hace *posible* reprocesar los 5 — y aun así se
  descartan, por lo que le llegaría al prospecto.

## Operación: los jobs varados

Los mensajes ya están en Mongo y en la bandeja; lo único que no ocurrió es la respuesta automática.
Tras desplegar el arreglo:

```bash
# Descartar los fallidos de inbound-messages (los mensajes NO se pierden: están en Mongo).
# Con redis-cli o desde un script con la Queue ya construida:
#   await inboundQueue.clean(0, 1000, 'failed');
# o desde Bull Board, si está montado.
```

Comprobación de que quedó bien, con el worker reiniciado:

1. `inbound-messages` → `failed: 0`.
2. Escribir por WhatsApp y verificar que aparece un job en `ai-reply` en estado `delayed`
   (esperando su `AI_REPLY_WINDOW_MS`), y que pasa a `completed`.
3. Mandar tres mensajes seguidos y comprobar que se crea **un solo** job y llega **una sola**
   respuesta.

## Verificación

```bash
pnpm --filter @sofiapp/api typecheck
pnpm --filter @sofiapp/api test
```

Más la comprobación end-to-end de arriba, que es la única que cierra el reporte: la suite no puede
demostrar que BullMQ acepta el id en un Redis real.
