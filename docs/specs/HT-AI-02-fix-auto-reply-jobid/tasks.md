# HT-AI-02 — Tasks

> Checklist de ejecución. El QUÉ está en `spec.md`, el CÓMO en `plan.md`.
> Se ejecuta con `/sdd-implement HT-AI-02-fix-auto-reply-jobid` **sobre la rama actual
> `feat/HU-IA-01`** — no se crea rama nueva (norma del repo).

## 0. Antes de empezar

- [x] Confirmar que estás en `feat/HU-IA-01` (`git branch --show-current`).
- [x] `typecheck` y `test` en verde antes de tocar nada; anotar aquí el número de partida.
- [x] Releer `multi-tenancy-guard` y `typescript-strict-mode`.
- [x] Los paquetes son **`@sofiapp/api`** y **`@sofiapp/web`** (`--filter backend` no matchea nada).

## 1. Escribir primero el test que falla

- [x] En `inbound-message.processor.test.ts`, añadir al `describe('ventanaJobId …')` el caso
      `el id no contiene ':'` y **verlo fallar** contra el código actual.
- [x] Anotar el fallo observado. Es lo que distingue haber arreglado esto de haber arreglado otra
      cosa.

## 2. Implementación

### 2.1 El `jobId` (el fix principal)

- [x] `ventanaJobId`: cambiar el separador de `:` a `-`. Formato resultante
      `ai-reply-<tenantId>-<clienteId>-<ventana>`.
- [x] **Quitar todos** los dos puntos, no dejar tres tramos: la tolerancia de BullMQ a `:` con
      exactamente 3 tramos es una rama de compatibilidad que su propio `TODO` marca para eliminar.
- [x] Conservar el prefijo `ai-reply`: garantiza que el id nunca sea un entero puro, la otra regla
      de `validateOptions` (`job.js:1043`).
- [x] No tocar el cálculo de la ventana ni el orden de los tramos: el `tenantId` sigue por delante.
- [x] Ampliar el comentario de la función con el porqué del separador (texto en `plan.md`), para
      que nadie devuelva los dos puntos «por legibilidad».

### 2.2 Que un fallo de la IA no tumbe la ingesta

- [x] En `processInboundJob`, envolver la llamada a `atenderConSofi` (línea 132) en `try/catch`.
- [x] `logger.error` con `tenantId`, `clienteId` y el error. Nivel `error`, no `warn`: sin la cola
      de fallidos, este log es el único rastro.
- [x] Comentar por qué se aísla y qué se pierde a cambio (el rastro de la cola de fallidos).
- [x] Verificar que `acusarNoTexto` conserva su `catch` de `AppError` en `warn`: son dos niveles
      distintos a propósito.

### 2.3 Lo que NO se toca

- [x] Confirmar sin cambios: `ai-reply.processor.ts`, `config/queues.ts`, `worker.ts`,
      `config/env.ts` y el cuerpo de `atenderConSofi` (bifurcación, `delay`, `attempts: 1`,
      `removeOnComplete`, `removeOnFail`).

## 3. Tests

### 3.1 `ventanaJobId` — el contrato del identificador

- [x] **(1)** El id **no contiene `:`**, para varias combinaciones de entrada. **Ahora pasa.**
- [x] **(2)** El id no es un entero puro (`` `${parseInt(id, 10)}` !== id ``).
- [x] **(3)** Se mantiene con valores límite: ventana `0`, y `tenantId`/`clienteId` como ObjectId
      reales de 24 hex.
- [x] **(4) El test que no se puede burlar** — resuelto por la **vía de respaldo** del plan, no por
      la principal. Se intentó invocar `Job.validateOptions` de verdad y no es viable sin Redis: el
      constructor de `Job` llama a `createScripts(queue)`, que necesita las claves internas de una
      `Queue` real, y `Queue.add` exige conexión. Atarse a esa maquinaria daría un test frágil
      frente a un upgrade menor de BullMQ, por motivos ajenos a este contrato.
      Se replica la regla **verbatim** desde `bullmq@5.79.2` `job.js:1041-1051`, con la cita en el
      test, **más** un caso que verifica que el detector replicado sí caza el formato viejo — sin
      eso, podría estar devolviendo `null` siempre y nadie lo notaría.

### 3.2 `processInboundJob` — el fallo aislado

- [x] **(5)** Con `mockAdd.mockRejectedValue(...)`, `processInboundJob` **resuelve** en vez de
      lanzar.
- [x] **(6)** En ese caso el mensaje sigue guardado en Mongo y `notifyInboundMessage` fue llamado.
- [x] **(7)** En ese caso se registra un `logger.error` con `tenantId` y `clienteId`.

### 3.3 Sin cambios, deben seguir verdes

- [x] Los diez casos de `describe('processInboundJob — decide si Sofi responde (HU-IA-02)')`,
      incluidos la ráfaga que comparte un único `jobId` y el del `delay`/`attempts`.
- [x] Los cuatro casos de `describe('ventanaJobId — aislamiento y agrupación')` **sin cambiar su
      intención**: son la red que demuestra que el separador nuevo no alteró la semántica.
- [x] Los dos casos de `describe('processInboundJob — tras un handoff, Sofi se calla (HU-IA-03)')`.
- [x] `tests/isolation/**` completo.

## 4. Verificación final

- [x] `pnpm --filter @sofiapp/api typecheck` en verde (cero `any`, tipos de retorno explícitos).
- [x] `pnpm --filter @sofiapp/api test` en verde, con los tests nuevos sumados.
- [x] Checklist de PR de `docs/multi-tenancy.md` §9 revisado — el `tenantId` sigue por delante en el
      identificador y `processInboundJob` sigue leyendo con `findScoped`.
- [x] Sin `*.png`/`*.jpg` colados en `git status` antes del commit.

## 5. Operación y verificación end-to-end (requiere el entorno del usuario)

Lo único que cierra el reporte de verdad: la suite no puede demostrar que BullMQ acepta el id en un
Redis real. **Nada de esto se puede completar desde la sesión de desarrollo.**

- [ ] Desplegar y **reiniciar el worker** (`worker.ts` registra el `inboundWorker`).
- [ ] Descartar los 5 jobs varados de `inbound-messages`
      (`await inboundQueue.clean(0, 1000, 'failed')`, o desde Bull Board). Los mensajes **no** se
      pierden: están en Mongo y en la bandeja.
- [ ] Confirmar `inbound-messages` → `failed: 0`.
- [ ] Escribir por WhatsApp y verificar que aparece un job en `ai-reply` en `delayed` y que pasa a
      `completed`, y que llega la respuesta de Sofi.
- [ ] Mandar tres mensajes seguidos: **un solo** job y **una sola** respuesta.
- [ ] Mandar un audio y verificar que llega el acuse de no-texto.

## Definición de «hecho»

1. Los 9 criterios de aceptación de `spec.md` se cumplen y están cubiertos por un test.
2. El test del `jobId` **falla contra el código anterior** y pasa con el arreglo.
3. La agrupación de `HU-IA-02` es idéntica: una ráfaga sigue produciendo una sola respuesta, y dos
   tenants con el mismo `clienteId` siguen sin compartir ventana.
4. Un fallo al encolar deja la ingesta en `completed` y un `error` en el log.
5. No queda ningún `jobId` con `:` en el backend.
6. `spec.md` actualizado a `**Estado:** implementado`.
