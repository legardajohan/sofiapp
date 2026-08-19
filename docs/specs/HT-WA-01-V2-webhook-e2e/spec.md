# HT-WA-01-V2 — Webhook de Meta operativo end-to-end (spec)

> **Spec-Driven Development.** Este es el QUÉ y el porqué. El CÓMO va en `plan.md`; la ejecución
> en `tasks.md`. Revisión de `HT-WA-01` (liberado) que cierra la única casilla que quedó sin
> marcar: la prueba de integración real contra Meta.

**Estado:** implementado

> Código, fix y tests automatizados completos y en verde (`tsc --noEmit` + 416 tests). Pendiente
> únicamente la prueba manual con credenciales reales de Meta y un celular (criterio 11) — requiere
> acción del usuario, ver `tasks.md`.

## Objetivo

Dejar el canal de WhatsApp **funcionando de verdad**: que un mensaje enviado desde un celular a la
línea del tenant llegue a la bandeja, y que la respuesta desde la bandeja llegue al celular. Hoy
no ocurre: `POST /api/webhooks/whatsapp` falla en el 100% de las peticiones reales de Meta por un
error de orden de middlewares.

## Contexto del defecto (importante)

`HT-WA-01` implementó el webhook correctamente **como unidad**, pero el cableado en `app.ts` lo
anula:

1. `apps/backend/src/app.ts:37` aplica `express.json()` de forma **global**.
2. El router del webhook se monta después, en `app.ts:58`.
3. Cuando corre `express.raw({ type: 'application/json' })` de `webhook.routes.ts:9`, el stream ya
   fue consumido: `read()` de body-parser 2.x sale temprano por `onFinished.isFinished(req)` y
   `req.body` queda siendo el **objeto ya parseado**, no un `Buffer`.
4. `webhook.controller.ts:22` hace `req.body as Buffer` y se lo pasa a `validateHmacSignature`.
   `createHmac(...).update(<objeto>)` lanza `TypeError` **fuera** del `try` de
   `webhook.service.ts:23`, así que la petición ni responde 200 ni encola nada.

Verificado empíricamente con un Express 5 real usando el mismo orden de middlewares:
`isBuffer: false | ctor: Object`.

Los tests unitarios de `tests/unit/webhook.service.test.ts` no lo detectan porque construyen el
`Buffer` a mano y nunca atraviesan Express. Por eso esta spec exige un test **de integración**.

## Alcance

Incluye:
- Corrección del orden de body parsers para que el webhook reciba el cuerpo crudo.
- Test de integración con Supertest sobre el `app` completo (regresión permanente).
- `META_APP_SECRET`, `META_VERIFY_TOKEN` y `TENANT_TOKEN_ENC_KEY` pasan de opcionales a requeridas
  fuera de `test`.
- `META_GRAPH_VERSION` actualizada desde `v19.0` (deprecada).
- Corrección de las dos fugas de aislamiento multi-tenant de `message.service.ts`.
- Política de reintentos del job inbound.
- Documentación del túnel HTTPS para desarrollo y del procedimiento de alta en Meta.
- Sincronización de `docs/data-model.md` y `docs/integrations/meta-whatsapp.md` con lo implementado.

Fuera de alcance (otros features):
- Plantillas HSM y envío fuera de ventana → `HT-WA-02`.
- Embedded Signup OAuth → feature SAAS posterior.
- Descarga de media inbound (`attachmentUrl`) → feature posterior de la bandeja.
- `appSecret` / `verifyToken` por tenant (hoy globales, modelo de app única de Meta).
- Auto-respuesta de IA sobre el canal → `HU-FLOW-01`.

## Criterios de aceptación

1. Un `POST /api/webhooks/whatsapp` con `Content-Type: application/json` y firma
   `X-Hub-Signature-256` válida responde **200** y encola un job en `inbound-messages`. El
   controller recibe el cuerpo como `Buffer`.
2. El mismo POST con firma inválida responde **403** y **no** encola nada.
3. `GET /api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=<válido>&hub.challenge=X`
   devuelve `X` con status 200; con token inválido devuelve 403.
4. Existe `apps/backend/src/features/webhook/webhook.routes.test.ts` que ejerce los tres casos
   anteriores **a través del `app` de Express completo** (Supertest, como
   `lead.routes.test.ts`), firmando el payload con el mismo secreto que lee `env.META_APP_SECRET`.
   Este test falla contra el código actual y pasa tras el fix.
5. El arranque **aborta** si falta `META_APP_SECRET`, `META_VERIFY_TOKEN` o
   `TENANT_TOKEN_ENC_KEY` cuando `NODE_ENV !== 'test'`, con el mensaje de error de `config/env.ts`.
6. `META_GRAPH_VERSION` tiene como default una versión de la Graph API vigente, no `v19.0`.
7. **Aislamiento multi-tenant:** `saveMessage` y `updateDeliveryStatus` de
   `apps/backend/src/features/message/message.service.ts` operan a través del repositorio
   tenant-safe. Un `Message` del tenant A con un `metaMessageId` dado no es leído ni modificado por
   una operación del tenant B que use ese mismo `metaMessageId`; existe un test que lo demuestra.
8. El job inbound se encola con `attempts` y `backoff` exponencial, de modo que un fallo transitorio
   de Mongo se reintenta en lugar de perder el mensaje.
9. `README.md` documenta el procedimiento completo de conexión con Meta en desarrollo: túnel HTTPS,
   Callback URL exacta (`<túnel>/api/webhooks/whatsapp`), Verify Token, suscripción al campo
   `messages` de la WABA, y los tres procesos que deben estar arriba (Redis, web, **worker**).
10. `docs/integrations/meta-whatsapp.md` deja de documentar `/api/webhooks/meta` y refleja la ruta
    y los códigos de estado reales. `docs/data-model.md` incluye `Cliente.ventana24hExpiraEn` y
    `Message.status`.
11. **Prueba manual E2E superada** (la casilla de `HT-WA-01/tasks.md:145`): desde un celular se
    escribe a la línea del tenant, el mensaje aparece en la bandeja bajo el tenant correcto, y una
    respuesta enviada desde la bandeja llega al celular.
12. `pnpm --filter backend typecheck` en verde y `pnpm --filter backend test` en verde.

## Dependencias

- `HT-WA-01` (liberado) — es la base que esta spec corrige.
- `HU-OMNI-01` (implementado) — la bandeja donde se verifica el resultado.
- Credenciales reales de Meta for Developers (App Secret + WABA de prueba con su
  `phone_number_id` y access token). Las aporta el usuario.
