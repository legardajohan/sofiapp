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
POST /api/webhooks/meta
  1. Validar firma HMAC (X-Hub-Signature-256) con el APP_SECRET.   → si falla, 401
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

`GET /api/webhooks/meta?hub.mode=subscribe&hub.verify_token=...&hub.challenge=...` →
comparar `verify_token` con `META_VERIFY_TOKEN` y devolver el `hub.challenge`.

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

## 4. Plantillas HSM y campañas

- Las difusiones masivas usan plantillas HSM aprobadas por Meta.
- **Rate limiting:** worker BullMQ con concurrencia controlada para respetar el límite de Meta
  (~80 msg/s). Backoff ante error 429. Registro de estado por destinatario (`campaign_recipients`).
- **Riesgo operativo:** una infracción de políticas puede suspender la WABA del tenant. Probar
  con números sandbox antes de producción.

## 5. Normalización de canales

Payloads de Instagram Direct y Facebook Messenger se normalizan a un **modelo canónico interno**
de `Message` (ver `data-model.md`). Tests unitarios de parsing por canal.

## 6. Variables de entorno relevantes

```
META_APP_ID=
META_APP_SECRET=            # validación HMAC del webhook
META_VERIFY_TOKEN=          # verificación GET del webhook
META_GRAPH_VERSION=v19.0    # valor de ejemplo: verifica la versión vigente al hacer scaffold
TENANT_TOKEN_ENC_KEY=       # clave AES-256-GCM para cifrar accessToken por tenant
```

> **Nota:** `v19.0` es un valor de referencia. Meta deprecia versiones antiguas de Graph API; al
> implementar M01 confirma la versión vigente soportada y fíjala en `META_GRAPH_VERSION`.

## 7. Diagnóstico de envíos rechazados con `403 (#131005) Access denied`

Cuando `sendMessage` falla con `403 (#131005)` y el token **sí** está vigente, la causa suele ser
que la cuenta sandbox de Meta está **`BLOCKED` para conversaciones business-initiated**, no un bug
de SofiApp.

### Síntoma típico

Un mismo tenant envía bien a algunos números y falla con `403` a otros. La diferencia: los que
funcionan tienen **ventana de 24h abierta** (el contacto escribió primero); los que fallan son
envíos *fuera de ventana* (business-initiated) contra una WABA bloqueada.

### Verificar el estado real (nunca adivinar)

```bash
GET https://graph.facebook.com/v19.0/{phone_number_id}?fields=health_status,quality_rating,messaging_limit_tier
Authorization: Bearer {access_token}
```

Respuesta relevante: `health_status.can_send_message` puede ser `AVAILABLE`, `LIMITED` o `BLOCKED`,
con un array `entities[].errors[]` que da el `error_code` y `possible_solution` exactos. Ver
[buildwithchirp.com/whatsapp/error-codes](https://docs.buildwithchirp.com/whatsapp/error-codes).

### Errores ya observados en el sandbox (09/2026)

| error_code | Entity | Significado | Solución |
|---|---|---|---|
| `141006` | WABA | Error en el método de pago; bloquea conversaciones business-initiated | Agregar método de pago válido (Business Settings → Payment) |
| `141010` | BUSINESS | El negocio no ha pasado *business verification* | Iniciar/resolver verificación en Business Settings |
| `131000` | BUSINESS | Perfil incompleto: faltan `Legal Name`, `Country`, `Website` | Completar perfil en Meta Business Suite → Settings → Business Info |
| `131030` | — | Destinatario no está en la lista permitida del sandbox (PTN) | Agregar el número como *test recipient* en el dashboard |
| `131005` | — | Permiso denegado: típica cuando la WABA está `BLOCKED` para business-initiated | Resolver los errores de `health_status` anteriores |

### Particularidades del número de prueba (Test Number `+1 555-...`)

- Solo puede enviar a **hasta 5 destinatarios de prueba verificados**; el resto da `131030`.
- Un destinatario que **sí** está en la lista pero recibe `403 131005` (no `400 131030`) apunta a la
  WABA bloqueada (pagos/verificación), no al destinatario.
- `messaging_limit_tier` `TIER_250` (sin verificación) → tope de 250 destinatarios únicos/24h.
- El token del dashboard es **de vida corta (< 24h)**: para producción usar un **System User** con
  permiso `whatsapp_business_messaging` y *expiration = Never*.

### Workaround rápido para pruebas en el sandbox

Hacer que el número destino **escriba primero**: abre la ventana de 24h y el `send` dentro de
ventana pasa aunque la WABA esté `BLOCKED`. Así funcionan los envíos a números con conversación
abierta mientras el resto sigue fallando.
