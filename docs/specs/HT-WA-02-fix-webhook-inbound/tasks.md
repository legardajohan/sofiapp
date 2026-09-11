# HT-WA-02 — Tasks

> Checklist de ejecución. El QUÉ está en `spec.md`, el CÓMO en `plan.md`.
> Se ejecuta con `/sdd-implement HT-WA-02-fix-webhook-inbound` **sobre la rama actual
> `feat/HU-IA-01`** — no se crea rama nueva (norma del repo).

## 0. Antes de empezar

- [x] Confirmar que estás en `feat/HU-IA-01` (`git branch --show-current`).
- [x] Punto de partida verde, verificado en la planeación: `typecheck` ✅ y `test` ✅
      (**87 archivos / 904 tests**) — sí, la suite entera pasa con el webhook roto.
- [x] Releer `multi-tenancy-guard` y `typescript-strict-mode`. El webhook es la **excepción
      documentada** del aislamiento: resuelve tenant por `phone_number_id`, no por token.
- [x] Los paquetes son **`@sofiapp/api`** y **`@sofiapp/web`** (`--filter backend` no matchea nada).

## 1. Escribir primero el test que falla

Empezar por aquí y **verlo fallar** contra el código actual: es la única prueba de que el
diagnóstico es correcto y no una teoría.

- [x] Crear `apps/backend/src/features/webhook/webhook.routes.test.ts` con el caso 1
      (`Content-Type: application/json` + firma correcta → `200` + job encolado).
- [x] `vi.mock('../../config/queues.js', …)` con `inboundQueue: { add: vi.fn() }` **antes** de
      importar `app` (patrón de `kb-faq.routes.test.ts:7-16`).
- [x] Serializar el payload **una vez** a `string`, firmar ese `string`, y enviarlo con
      `.set('Content-Type', 'application/json')` + `.send(elMismoString)`. No dejar que supertest
      serialice el objeto: los bytes firmados y los enviados tienen que ser los mismos.
- [x] **Confirmar que falla** (petición colgada / timeout) y anotar el error observado.

## 2. Implementación

### 2.1 El fix principal

- [x] `app.ts`: mover `app.use('/api/webhooks/whatsapp', webhookRoutes)` a inmediatamente después
      de `cors` y **antes** de `express.json()`. Eliminar el montaje de la línea 64.
- [x] Comentario que explique el porqué (texto en `plan.md`): Meta firma los bytes exactos, un
      parser global por delante los destruye, y ninguna ruta debe colarse por encima de esa línea.
- [x] Verificar que `cors` sigue siendo lo primero y que nada más se movió.

### 2.2 Que ningún camino termine sin respuesta

- [x] `webhook.service.ts`: meter el `createHmac(...).update(...)` **dentro** del `try`. Comentar
      por qué no se deja propagar. Firma y contrato de `validateHmacSignature` sin cambios.
- [x] `webhook.controller.ts`: guarda `if (!Buffer.isBuffer(req.body))` → `logger.error` + `403` con
      el **mismo cuerpo** que una firma inválida (hacia fuera no se distingue; hacia dentro el log
      lo dice todo). Eliminar el `as Buffer`.
- [x] `webhook.controller.ts`: confirmar que `res.sendStatus(200)` sigue **antes** de
      `resolveWebhookTenant` y de `enqueueInboundJob`, y que el bucle `entry → changes` no cambia.
- [x] `webhook.routes.ts`: el `.catch` pasa a `logger.error` y responde `500` **solo si**
      `!res.headersSent`. Comentar por qué no se usa `asyncHandler` (el controller ya respondió
      `200` y sigue trabajando; el `errorHandler` central respondería dos veces).

### 2.3 La segunda causa, visible

- [x] Aviso al arrancar el proceso web si `env.META_APP_SECRET` no está definida: `logger.warn`
      diciendo que el webhook rechazará (`403`) todo entrante y que el inbound no funcionará.
- [x] Va en el arranque de `app.ts`, **no** en `config/env.ts` (el módulo de env valida forma, no
      opina sobre consecuencias) y **no** en el worker (no atiende el webhook).
- [x] La variable **sigue siendo `optional()`**: hacerla obligatoria rompería los despliegues que no
      usan WhatsApp.

## 3. Tests

### 3.1 `webhook.routes.test.ts` (NUEVO)

- [x] **(1)** Firma correcta → `200` y `inboundQueue.add` con `{ tenantId, payload }`, con el tenant
      resuelto por `phone_number_id`. **Ahora pasa.**
- [x] **(2)** Firma incorrecta → `403` y `inboundQueue.add` **no** llamado.
- [x] **(3)** Sin cabecera `X-Hub-Signature-256` → `403`, sin colgarse.
- [x] **(4)** `phone_number_id` sin `MetaIntegration` → `200` (Meta no debe reintentar) y nada
      encolado.
- [x] **(5) Aislamiento multi-tenant:** con integraciones de dos tenants sembradas, el job lleva el
      `tenantId` del `phone_number_id` recibido y **nunca** el del otro.
- [x] **(6)** `GET` con `hub.verify_token` correcto → `200` con el `hub.challenge` en el cuerpo.
- [x] **(7)** `GET` con token incorrecto → `403`.

### 3.2 Sin cambios, deben seguir verdes

- [x] `tests/unit/webhook.service.test.ts` completo.
- [x] `tests/isolation/**` completo.

## 4. Verificación final

- [x] `pnpm --filter @sofiapp/api typecheck` en verde (cero `any`, y el `as Buffer` ya no existe).
- [x] `pnpm --filter @sofiapp/api test` en verde — no menos de 904 tests, más los nuevos.
- [x] Arrancar `app.ts`: cero errores en consola (se tocó el orden de middlewares).
- [x] Checklist de PR de `docs/multi-tenancy.md` §9 revisado — con la excepción del webhook
      explícitamente confirmada, no eliminada.
- [x] Sin `*.png`/`*.jpg` colados en `git status` antes del commit.

## 5. Verificación end-to-end (requiere el entorno del usuario)

Lo único que de verdad cierra el reporte, y **nada de esto se puede completar desde la sesión de
desarrollo**: requiere el droplet, credenciales de Meta y un teléfono. Quedan pendientes a propósito.

- [ ] Confirmar que `META_APP_SECRET` está en el `.env` del droplet y **coincide** con el App Secret
      de la app de Meta. Desde HT-WA-02, si falta, el proceso web lo dice al arrancar.
- [ ] Reiniciar el proceso web **y** el worker (`worker.ts:15` registra el `inboundWorker`). Con el
      webhook arreglado pero el worker caído, los jobs se acumulan en Redis y el síntoma no cambia.
- [ ] Responder por WhatsApp desde el teléfono y seguir la traza completa: `200` en el log del
      webhook → job en `inbound-messages` → mensaje visible en la bandeja → respuesta de la IA.

## Definición de «hecho»

1. Los 10 criterios de aceptación de `spec.md` se cumplen y están cubiertos por un test.
2. El test de regresión **falla contra el código anterior** y pasa con el arreglo: es lo que
   demuestra que se corrigió esto y no otra cosa.
3. Ningún camino del webhook termina sin responder a Meta.
4. El webhook sigue siendo la excepción documentada del aislamiento, con su contrato fijado por el
   test 5.
5. Un despliegue sin `META_APP_SECRET` lo dice al arrancar en vez de rechazar en silencio.
6. `spec.md` actualizado a `**Estado:** implementado`.
