# Integración Meta — WhatsApp / Instagram / Messenger (BSP)

SofiApp opera como **proveedor de tecnología (BSP)**: cada tenant conecta su propia cuenta de
WhatsApp Business API (WABA) mediante **Embedded Signup**. El estado de Tech Provider/BSP de Meta
lo provee el cliente.

## 1. Webhook multi-tenant — resolución de tenant ANTES de autenticar

El webhook es **público** (no hay JWT: lo dispara Meta, no un usuario con sesión). El único
identificador del payload que ata el evento a una empresa es el **`phone_number_id`**. Como cada
tenant conecta su propio número, ese id es único por tenant.

### Flujo

```
POST /api/webhooks/whatsapp
  1. Validar firma HMAC (X-Hub-Signature-256) con el APP_SECRET.   → si falla, 403
  2. Responder HTTP 200 INMEDIATAMENTE (SLA de Meta).
  3. Extraer phone_number_id del payload.
  4. tenant = MetaIntegration.findOne({ phoneNumberId })           → lookup GLOBAL (excepción documentada)
       └─ si no existe → descartar (log) y terminar.
  5. Encolar job en BullMQ con { tenantId, payload }.              → NO procesar inline
  6. El WORKER procesa: upsert Cliente (dedupe por metaUserId+tenant),
     guarda Message (dedupe por metaMessageId), dispara IA/flujo.
```

> Esta lectura por `phone_number_id` es, junto con el `login`, **la única lectura permitida
> fuera del repositorio tenant-safe**. A partir del paso 5 el `tenantId` ya es conocido y todo
> vuelve a pasar por funciones `*Scoped`.

### Verificación inicial (GET)

`GET /api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=...&hub.challenge=...` →
comparar `verify_token` con `META_VERIFY_TOKEN` y devolver el `hub.challenge`. Token incorrecto o
ausente → 403 (no 401: es el código que ya usa `verifyChallenge`).

### Montaje y orden de middlewares (importante)

El router de este webhook (`features/webhook/webhook.routes.ts`) usa `express.raw({ type:
'application/json' })` porque la firma HMAC se calcula sobre los **bytes exactos** del cuerpo. Por
eso se monta en `app.ts` **antes** de `express.json()`: si el parser JSON global corriera primero,
`req.body` llegaría como objeto y la firma nunca calzaría con la que envía Meta — ver
`HT-WA-01-V2/spec.md` para el detalle del defecto que esto corrigió.

## 2. Embedded Signup (onboarding por empresa)

- El Admin del tenant inicia el flujo de Embedded Signup desde el panel.
- Al completarse, Meta devuelve la WABA + `phone_number_id` + token.
- Se persiste un `MetaIntegration` con el **token cifrado at-rest** (AES-256-GCM,
  `accessTokenEnc`, `select:false`) y el `phoneNumberId` (índice único global).

## 3. Envío outbound — `MetaService`

- Funciones puras `sendText()` y `sendTemplate()` sobre Meta Graph API (v19+), resolviendo las
  credenciales del **tenant activo**.
- Reintentos con backoff exponencial; logging por canal.
- **Ventana de 24h:** fuera de la ventana de servicio solo se puede enviar **plantillas HSM**
  aprobadas. Dentro de la ventana, texto libre.

## 4. Plantillas HSM (HT-WA-02)

El catálogo local (`whatsapp_templates`, ver `data-model.md`) es un **espejo** del estado real en
Meta, nunca una fuente de verdad paralela: su cuerpo lo dicta Meta y cambiarlo exige re-aprobación.

```
GET  /api/templates        → catálogo local paginado, filtrable por status/category.
POST /api/templates/sync   → GET /{wabaId}/message_templates (metaTemplateClient.list, pagina por
                              paging.next hasta agotarla); upsert por {tenantId, name, language}:
                              crea las nuevas, actualiza status/components de las existentes, marca
                              obsoleta:true las que Meta ya no devuelve (nunca se borran).
POST /api/templates        → POST /{wabaId}/message_templates (crea en Meta); solo si Meta acepta
                              se persiste localmente en PENDING. Si Meta rechaza, no queda
                              documento local huérfano.
```

**`sendOutbound(tenantId, clienteId, contenido)`** (`message.service.ts`) es el **único** punto del
sistema que decide entre texto libre y plantilla HSM según `Cliente.ventana24hExpiraEn`:

- Ventana abierta → texto libre (`sendMessage`, la bandeja).
- Ventana cerrada → exige una plantilla `APPROVED`; sin ella, `AppError` 422 (mismo mensaje que
  usaba `sendMessage` antes de esta spec — no rompe el `WindowClosedBanner` del frontend).
- Enviar una plantilla es válido dentro **y** fuera de la ventana (Meta lo acepta siempre).

`HU-FLOW-02` (recordatorios antes de las 24 h) y la futura épica de Remarketing consumen
`sendOutbound`; ninguna reimplementa la regla de la ventana.

`buildTemplatePayload` (`whatsapp-template.service.ts`) valida, **antes** de llamar a la Graph API:
plantilla `APPROVED` (si no, 422) y número de parámetros exacto (`parametrosBody`, derivado al
persistir contando `{{n}}` consecutivos desde 1 en el `BODY`; si no calzan, 400 con
`{ esperados, recibidos }`).

## 5. Campañas (fuera de alcance de HT-WA-02)

- Las difusiones masivas reutilizarán las mismas plantillas HSM aprobadas.
- **Rate limiting:** worker BullMQ con concurrencia controlada para respetar el límite de Meta
  (~80 msg/s). Backoff ante error 429. Registro de estado por destinatario (`campaign_recipients`).
- **Riesgo operativo:** una infracción de políticas puede suspender la WABA del tenant. Probar
  con números sandbox antes de producción.

## 6. Normalización de canales

Payloads de Instagram Direct y Facebook Messenger se normalizan a un **modelo canónico interno**
de `Message` (ver `data-model.md`). Tests unitarios de parsing por canal.

## 7. Variables de entorno relevantes

```
META_APP_ID=
META_APP_SECRET=            # validación HMAC del webhook — OBLIGATORIA fuera de NODE_ENV=test
META_VERIFY_TOKEN=          # verificación GET del webhook — OBLIGATORIA fuera de NODE_ENV=test
META_GRAPH_VERSION=v26.0    # confirmar la vigente en developers.facebook.com/docs/graph-api/changelog
TENANT_TOKEN_ENC_KEY=       # clave AES-256-GCM (64 hex) — OBLIGATORIA fuera de NODE_ENV=test
```

> **Nota:** Meta deprecia versiones antiguas de Graph API cada pocos meses; confirma la vigente
> antes de fijar `META_GRAPH_VERSION`. Las otras tres variables **no** tienen fallback: el proceso
> aborta al arrancar si faltan fuera de `test` (`HT-WA-01-V2`, tras un incidente donde arrancaba
> sin ellas y todo webhook fallaba en silencio).
