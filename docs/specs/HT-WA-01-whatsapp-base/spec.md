# HT-WA-01 — Conexión base a WhatsApp Cloud API (spec)

> **Spec-Driven Development.** Este es el QUÉ y el porqué. El CÓMO va en `plan.md`; la ejecución
> en `tasks.md`. Es la capa fundacional de mensajería: sin ella no hay omnicanal ni IA conversacional.

## Objetivo

Implementar la capa de mensajería base de WhatsApp: verificación y recepción del webhook de Meta
con validación de firma HMAC, normalización de eventos entrantes (texto, media, estados de entrega)
al modelo interno de `Message`, envío de mensajes de texto dentro de la ventana de 24h, gestión y
persistencia de esa ventana por cliente, cifrado de credenciales de WhatsApp por tenant y pantalla
de configuración de canal.

## Alcance

Incluye:
- Modelo `MetaIntegration` (credenciales WhatsApp cifradas por tenant, ver `docs/data-model.md`).
- Modelo `Cliente` (prospecto; creado/actualizado al recibir mensaje inbound; M02 extiende).
- Modelo `Message` (historial; campo `status` para estados de entrega).
- Webhook GET (verificación de challenge de Meta) y POST (recepción con validación HMAC-SHA256).
- Normalizador de eventos inbound (texto, imagen, audio, documento, estados de entrega) → `IMessage`.
- Interface `IMessagingProvider` + implementación `MetaWhatsAppClient` (Graph API).
- Cálculo y persistencia de `ventana24hExpiraEn` en `Cliente`; bloqueo de `sendMessage` fuera de ventana.
- Cifrado AES-256-GCM de `accessToken` (`accessTokenEnc`, `select:false`) en `MetaIntegration`.
- Endpoints: `GET/POST /api/webhooks/whatsapp`, `POST /api/channels/whatsapp/connect`,
  `GET /api/channels/whatsapp/status`, `POST /api/messages/send`.
- BullMQ queue `inbound-messages` + processor (upsert cliente, save message, update ventana).
- Pantalla de configuración de canal (React, generada con Stitch MCP "SofiApp - Stich").

Fuera de alcance (otros features):
- Plantillas HSM y envío de templates → `HT-WA-02`.
- Embedded Signup OAuth (flujo guiado por Meta) → feature SAAS posterior.
- Slot filling / scoring IA → `M04-IA`.
- Instagram Direct y Facebook Messenger → features posteriores.
- Constructor de flujos → `M06` (Fase 3).
- Campañas masivas → `M07`.

## Criterios de aceptación

1. `GET /api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=<VERIFY_TOKEN>&hub.challenge=<C>`
   devuelve `<C>` con HTTP 200 cuando `hub.verify_token === META_VERIFY_TOKEN`.
2. `GET /api/webhooks/whatsapp` con `hub.verify_token` incorrecto devuelve HTTP 403.
3. `POST /api/webhooks/whatsapp` con firma `X-Hub-Signature-256` inválida devuelve HTTP 403.
4. `POST /api/webhooks/whatsapp` con firma válida devuelve HTTP 200 inmediato y encola un job en
   BullMQ (`inbound-messages` queue) con `{ tenantId, payload }`.
5. El worker procesa el job: upsert de `Cliente` (por `metaUserId + tenantId`, idempotente),
   creación de `Message` con `direccion: 'inbound'`, y actualización de
   `ventana24hExpiraEn = now + 24h` en `Cliente`.
6. Los eventos de estado de entrega (`delivered`, `read`, `failed`) actualizan `Message.status`
   por `metaMessageId`; no crean nuevos `Message`.
7. `Cliente` y `Message` se crean bajo el `tenantId` correcto, resuelto por
   `MetaIntegration.findOne({ phoneNumberId })` (excepción pre-auth documentada en
   `docs/multi-tenancy.md §5`).
8. `POST /api/channels/whatsapp/connect` (rol admin) persiste `MetaIntegration` con `accessToken`
   cifrado; la response nunca expone `accessTokenEnc`.
9. `GET /api/channels/whatsapp/status` (rol admin) devuelve `{ activo, phoneNumberId, wabaId }`
   sin exponer token.
10. `POST /api/messages/send` (rol asesor+) dentro de la ventana de 24h llama a la Graph API y
    persiste `Message` con `direccion: 'outbound'`.
11. `POST /api/messages/send` fuera de la ventana de 24h devuelve HTTP 422 con mensaje descriptivo
    sin llamar a la Graph API.
12. **Aislamiento multi-tenant:** `Message` creado bajo `tenantA` no es accesible desde `tenantB`
    con `findScoped`; `Cliente` de `tenantA` no retorna en queries de `tenantB`.
13. `tsc --noEmit` en verde.

## Dependencias

- `INF-01` (andamiaje monorepo — completado).
- `INF-02` (repositorio scoped + middleware `requireTenant` — debe implementarse antes).
- ENV vars requeridas: `META_APP_SECRET`, `META_VERIFY_TOKEN`, `META_GRAPH_VERSION`,
  `TENANT_TOKEN_ENC_KEY` (32 bytes hex, AES-256-GCM), `REDIS_URL`.
