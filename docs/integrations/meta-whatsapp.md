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

## 5. Campañas (implementado en HU-MARK-01)

- Las difusiones masivas reutilizan las mismas plantillas HSM aprobadas, y **consumen
  `sendOutbound`**: ni la regla de la ventana de 24 h ni la validación de la plantilla se
  reimplementan en el worker.
- **Dos límites distintos, ambos respetados.** La cuota del plan (`campanasMes`, `mensajesMes`) la
  impone SofiApp y responde `429`. El límite de Meta lo impone el tier del número y no devuelve un
  error: rechaza mensajes, baja la calidad y, en el extremo, suspende la WABA.
- **Pacing por tier y calidad.** `MetaIntegration` persiste `messagingTier`, `qualityRating` y
  `healthStatus`, refrescados con la sonda de §8 (que hasta HU-MARK-01 solo se usaba a mano para
  diagnosticar). El presupuesto del día se **deriva**, no se configura:

  ```
  limiteDiario = floor(destinatariosDelTier × CAMPAIGN_SAFETY_MARGIN × factorCalidad)
  disponible   = max(limiteDiario − destinatariosÚnicosDePlantillaEnLas24hRodantes, 0)
  intervaloMs  = max(CAMPAIGN_MIN_INTERVAL_MS, 86_400_000 / limiteDiario)
  ```

  `factorCalidad`: `GREEN` 1, `YELLOW` y `UNKNOWN` 0.5, `RED` **bloquea el lanzamiento** (`409`).
  El descuento de las 24 h cuenta **destinatarios únicos**, no mensajes —el tier de Meta mide
  conversaciones iniciadas por la empresa—, e incluye los recordatorios de HU-FLOW-02 y los envíos
  manuales de plantilla: salen del mismo número y gastan el mismo cupo.
- **Cola `campaign-broadcast`** con `concurrency: 1` (el pacing es secuencial por definición: dos
  lotes en paralelo se saltarían el intervalo) y un `limiter` de `CAMPAIGN_MAX_PER_SECOND` como red
  de seguridad frente al límite de ~80 msg/s de la Graph API. El backoff ante `429` ya lo hace
  `meta-whatsapp.client.ts`. Agotar el cupo del día **no es un error**: el job se reencola y la
  campaña sigue `en_curso` hasta que la ventana rodante libera capacidad.
- Registro de estado por destinatario (`campaign_recipients`), alimentado también por los `statuses`
  del webhook: `delivered` → `entregado`, `failed` → `fallido`, siempre resuelto **por tenant**.
- **Riesgo operativo:** una infracción de políticas puede suspender la WABA del tenant. Probar
  con números sandbox antes de producción. Por eso `Cliente.marketingOptOut` se excluye siempre del
  segmento: un reporte de spam degrada la calidad, que es justo lo que el pacing intenta proteger.

## 6. Media: descarga de entrantes y subida de salientes (HU-OMNI-06)

Meta **no manda el archivo** en el webhook: manda un **Media ID** que hay que canjear.

```
ENTRANTE
  1. El webhook trae `msg.image.id` (o video/audio/document/sticker) + mime_type, sha256,
     caption y, en documentos, filename.
  2. `processInboundJob` guarda el Message con `media.estado: 'pendiente'` y encola `media-ingest`.
     El mensaje aparece en la bandeja AL INSTANTE, con un esqueleto en lugar del archivo.
  3. El worker: GET /{mediaId} → devuelve una `url` que CADUCA EN ~5 MIN
                GET esa url con el MISMO Bearer → bytes
                → IMediaStorage.guardar() → media.estado: 'disponible' → `message:updated`.

SALIENTE
  1. POST /api/conversations/:id/messages/media (multipart).
  2. Se guarda en NUESTRO almacenamiento primero, y solo después
     POST /{phoneNumberId}/media → { id } (el media id vale 30 días).
  3. `sendOutbound({ modo: 'media' })` decide la ventana de 24 h y envía.
```

La URL de descarga **no se persiste jamás**: se resuelve en el momento de ejecutar el job. Por eso
un reintento a la hora sigue funcionando —Meta guarda la media unos 30 días— y por eso la caducidad
de 5 minutos no es argumento para descargar en línea con la ingesta.

**Clasificación de errores de descarga**, que es lo que evita que el hilo se quede girando:

| Situación | HTTP | Trato |
|---|---|---|
| Media ID caducado / no existe | 404, 410 | **Definitivo**: `media.estado: 'fallida'` en el primer intento, sin gastar reintentos |
| Excede el tamaño permitido | 413 | **Definitivo** |
| Rate limit o error de Meta | 429, 5xx | **Recuperable**: se relanza y BullMQ reintenta (5 intentos, backoff exponencial) |
| Agotados los reintentos | — | El listener `failed` de `worker.ts` marca `fallida` y publica el cambio |

### Límites y tipos admitidos

Verificado contra `developers.facebook.com/docs/whatsapp/cloud-api/reference/media` el **2026-09-16**.
Meta los ajusta sin avisar, así que la fecha importa tanto como los números.

| Tipo | Mimes | Límite de Meta | Tope efectivo |
|---|---|---|---|
| Imagen | `image/jpeg`, `image/png` | 5 MB | `MEDIA_MAX_BYTES_IMAGEN` |
| Video | `video/mp4`, `video/3gpp` | 16 MB | `MEDIA_MAX_BYTES_VIDEO` |
| Audio | `audio/aac`, `mp4`, `mpeg`, `amr`, `ogg` | 16 MB | `MEDIA_MAX_BYTES_AUDIO` |
| Documento | pdf, doc(x), xls(x), ppt(x), txt, csv | 100 MB | `MEDIA_MAX_BYTES_DOCUMENTO` (16 MB por defecto) |
| Sticker | `image/webp` | 100 KB estático / 500 KB animado | — |

Restricciones que producen rechazos opacos si se ignoran:

- `video/mp4` debe ser **H.264 + AAC con una sola pista de audio**. Un mp4 con AC-3 se rechaza.
- `audio/ogg` solo **Opus, mono**.
- El `caption` **solo lo aceptan `image`, `video` y `document`**; en audio o sticker, Meta responde 400.
- `filename` solo aplica a `document`: es lo que ve el destinatario al descargar.
- Caption máximo 1024 caracteres.

> **El tope de documentos es 16 MB y no los 100 MB de Meta a propósito.** El multipart entra en
> memoria (`multer.memoryStorage()`), y 100 MB × N subidas simultáneas es un OOM esperando. Subirlo
> exige pasar a `diskStorage`, no solo cambiar el número.

**`image/svg+xml` y `text/html` están fuera de la lista blanca**: servirlos `inline` desde nuestro
propio origen sería XSS almacenado con la cookie de sesión al alcance.

### Notas de voz (HU-OMNI-07)

Verificado contra `developers.facebook.com/docs/whatsapp/cloud-api/messages/audio-messages` el
**2026-09-26**.

- **Entrante:** el webhook marca con `audio.voice: true` el audio grabado en WhatsApp (nota de voz)
  frente a un archivo de audio reenviado. Se guarda como `media.esNotaDeVoz`. Meta **no** informa la
  duración: `media-ingest` la mide con ffprobe al descargar (ADR-0009).
- **Saliente:** `POST /api/conversations/:id/messages/audio`. El navegador graba en webm/opus
  (Chrome, Edge), mp4/aac (Safari) u ogg/opus (Firefox); el servidor transcodifica siempre a
  **`audio/ogg` Opus mono** y lo envía como:

  ```json
  { "type": "audio", "audio": { "id": "<media id>", "voice": true } }
  ```

  Sin `voice: true`, o con otro formato, Meta la entrega como **archivo de audio** y no como nota de
  voz, y su transcripción falla. `caption` y `filename` se filtran en el propio cliente
  (`meta-whatsapp.client.ts`) para el tipo `audio`, porque Meta responde 400.
- El límite por tenant (`Tenant.notasDeVoz`) se aplica antes de transcodificar (tamaño) y después
  (duración medida). La ventana de 24 h la decide `sendOutbound`, como para el resto de la media.

### Previsualización de enlaces

La Cloud API **no envía metadata Open Graph** en los webhooks entrantes: un mensaje con un link
llega como `text` a secas. Por eso la tarjeta del hilo muestra solo **dominio y URL**, derivados del
texto. La tarjeta rica sí la ve el cliente en su teléfono: los textos salientes se envían con
`preview_url: true` y la renderiza WhatsApp.

Sacar el título y la imagen exigiría descargar URLs arbitrarias escritas por terceros desde nuestro
servidor —superficie de SSRF— por una tarjeta más bonita. Descartado.

## 7. Normalización de canales

Payloads de Instagram Direct y Facebook Messenger se normalizan a un **modelo canónico interno**
de `Message` (ver `data-model.md`). Tests unitarios de parsing por canal.

## 8. Variables de entorno relevantes

```
META_APP_ID=
META_APP_SECRET=            # validación HMAC del webhook — OBLIGATORIA fuera de NODE_ENV=test
META_VERIFY_TOKEN=          # verificación GET del webhook — OBLIGATORIA fuera de NODE_ENV=test
META_GRAPH_VERSION=v26.0    # confirmar la vigente en developers.facebook.com/docs/graph-api/changelog
TENANT_TOKEN_ENC_KEY=       # clave AES-256-GCM (64 hex) — OBLIGATORIA fuera de NODE_ENV=test

# Media de la conversación (HU-OMNI-06, ADR-0008)
MEDIA_DRIVER=local          # local | spaces
MEDIA_LOCAL_DIR=./var/media # solo driver local; va en .gitignore
MEDIA_URL_SECRET=           # HMAC de las URLs firmadas (64 hex) — OBLIGATORIA fuera de test
MEDIA_URL_TTL_S=3600        # vida del token que se pinta en el hilo
MEDIA_SIGNED_URL_TTL_S=300  # vida de la URL prefirmada de Spaces
MEDIA_INGEST_ENABLED=on     # on | off — kill-switch de la descarga de entrantes
MEDIA_MAX_BYTES_IMAGEN=5242880
MEDIA_MAX_BYTES_VIDEO=16777216
MEDIA_MAX_BYTES_AUDIO=16777216
MEDIA_MAX_BYTES_DOCUMENTO=16777216
SPACES_ENDPOINT= / SPACES_REGION= / SPACES_BUCKET= / SPACES_KEY= / SPACES_SECRET=
```

> Las cinco `SPACES_*` son **obligatorias solo si `MEDIA_DRIVER=spaces`** (`superRefine` en
> `env.ts`): con el driver `local` por defecto, el entorno de desarrollo arranca sin credenciales.
> `MEDIA_INGEST_ENABLED` es un enum y no un booleano porque `z.coerce.boolean()` convierte la cadena
> `"false"` en `true`, que es el fallo que un interruptor de emergencia no se puede permitir.

> **Nota:** Meta deprecia versiones antiguas de Graph API cada pocos meses; confirma la vigente
> antes de fijar `META_GRAPH_VERSION`. Las otras tres variables **no** tienen fallback: el proceso
> aborta al arrancar si faltan fuera de `test` (`HT-WA-01-V2`, tras un incidente donde arrancaba
> sin ellas y todo webhook fallaba en silencio).

## 9. Diagnóstico de envíos rechazados con `403 (#131005) Access denied`

Cuando `sendMessage` falla con `403 (#131005)` y el token **sí** está vigente, la causa suele ser
que la cuenta sandbox de Meta está **`BLOCKED` para conversaciones business-initiated**, no un bug
de SofiApp.

### Síntoma típico

Un mismo tenant envía bien a algunos números y falla con `403` a otros. La diferencia: los que
funcionan tienen **ventana de 24h abierta** (el contacto escribió primero); los que fallan son
envíos *fuera de ventana* (business-initiated) contra una WABA bloqueada.

### Verificar el estado real (nunca adivinar)

```bash
GET https://graph.facebook.com/v26.0/{phone_number_id}?fields=health_status,quality_rating,messaging_limit_tier
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
