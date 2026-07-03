# HT-WA-01 — Tasks (checklist ejecutable)

> Claude Code: ejecuta en orden. Marca cada casilla al terminar. No cierres el feature hasta que
> TODO esté en verde.

## Implementación

### 0. Infraestructura transversal

- [x] Crear `utils/crypto.util.ts`: `encrypt(plaintext)` / `decrypt(ciphertext)` AES-256-GCM;
      clave de `config/` (env `TENANT_TOKEN_ENC_KEY`). Formato de ciphertext: `base64(iv:authTag:data)`.
- [x] Crear `config/queues.ts`: exportar `INBOUND_QUEUE_NAME = 'inbound-messages'` y la instancia
      de `Queue` de BullMQ conectada a `REDIS_URL`.
- [x] Crear `integrations/meta/messaging-provider.interface.ts`: `IMessagingProvider` con
      `sendText` y `sendTemplate`.
- [x] Crear `integrations/meta/meta-whatsapp.client.ts`: implementa `IMessagingProvider`;
      llama a `https://graph.facebook.com/${META_GRAPH_VERSION}/${phoneNumberId}/messages`;
      backoff ante 429.
- [x] Crear `integrations/meta/meta-whatsapp.normalizer.ts`: `parseInboundEvents(value)` →
      `ICreateMessageDto[]`; `parseDeliveryStatuses(value)` → `Array<{ metaMessageId, status }>`.

### 1. Feature: channel

- [x] Crear `features/channel/channel.types.ts` con `IMetaIntegration`, `IMetaIntegrationDocument`,
      `IChannelConnectDto`, `IChannelStatusResponse`.
- [x] Crear `features/channel/channel.model.ts`: schema Mongoose `MetaIntegration` con `accessTokenEnc`
      (`select: false`), índices `{ phoneNumberId:1 } unique` (global) y `{ tenantId:1, canal:1 } unique`.
- [x] Crear `features/channel/channel.validation.ts`: `connectSchema` Zod.
- [x] Crear `features/channel/channel.service.ts`:
      - `connectChannel(tenantId, dto)` → cifra `accessToken` con `encrypt()`, upsert `MetaIntegration`.
      - `getChannelStatus(tenantId)` → devuelve `IChannelStatusResponse` (sin token).
- [x] Crear `features/channel/channel.controller.ts`: `connectController`, `statusController`
      (sin try/catch, sin lógica de negocio).
- [x] Crear `features/channel/channel.routes.ts`: `POST /connect` y `GET /status` con cadena
      `authenticateJWT → requireTenant → authorize(['admin']) → validate → asyncHandler`.

### 2. Feature: cliente (base para HT-WA-01; M02 extiende)

- [x] Crear `features/cliente/cliente.types.ts` con `ICliente`, `IClienteDocument`,
      `CanalOrigen`, `EstadoComercial`.
- [x] Crear `features/cliente/cliente.model.ts`: schema Mongoose con `ventana24hExpiraEn?: Date`,
      `estadoComercial: 'nuevo'` por defecto, índices (ver `plan.md`).
- [x] Crear `features/cliente/cliente.validation.ts`: placeholder vacío (M02 añade schemas).
- [x] Crear `features/cliente/cliente.service.ts`:
      - `upsertByMetaUser(tenantId, metaUserId, telefono, canal, nombre?)` →
        `findOneAndUpdateScoped` con `upsert:true`; actualiza `ultimoMensajeAt` y `ventana24hExpiraEn`.
- [x] Crear `features/cliente/cliente.controller.ts`: placeholder (M02 lo puebla).
- [x] Crear `features/cliente/cliente.routes.ts`: placeholder sin rutas activas.

### 3. Feature: message

- [x] Crear `features/message/message.types.ts` con `IMessage`, `ICreateMessageDto`,
      `ISendMessageDto`, `IMessageDocument`, enums `Direccion`, `Sender`, `TipoMensaje`, `MessageStatus`.
- [x] Crear `features/message/message.model.ts`: schema Mongoose con `status: 'sent'` por defecto,
      índices (ver `plan.md`).
- [x] Crear `features/message/message.validation.ts`: `sendSchema` Zod.
- [x] Crear `features/message/message.service.ts`:
      - `saveMessage(tenantId, dto)` → `createScoped`.
      - `sendMessage(tenantId, dto)` → verifica `cliente.ventana24hExpiraEn > now` (lanza
        `AppError(msg, 422)` si fuera), recupera `MetaIntegration` del cliente, descifra token,
        llama `MetaWhatsAppClient.sendText`, persiste `Message outbound`.
      - `updateDeliveryStatus(metaMessageId, status)` → `MessageModel.findOneAndUpdate({ metaMessageId }, { status })`.
- [x] Crear `features/message/message.controller.ts`: `sendController`.
- [x] Crear `features/message/message.routes.ts`: `POST /send` con cadena
      `authenticateJWT → requireTenant → authorize(['asesor','coordinador','admin']) → validate → asyncHandler`.

### 4. Feature: webhook

- [x] Crear `features/webhook/webhook.types.ts`: `IWhatsAppWebhookPayload`, `IWebhookEntry`,
      `IWebhookChange`, `IWebhookValue`, `IWhatsAppMessage`, `IWhatsAppStatus`.
- [x] Crear `features/webhook/webhook.validation.ts`: `verifyQuerySchema` Zod.
- [x] Crear `features/webhook/webhook.service.ts`:
      - `verifyChallenge(query)` → verifica `hub.verify_token === META_VERIFY_TOKEN`, devuelve
        `hub.challenge` o lanza `AppError(msg, 403)`.
      - `validateHmacSignature(rawBody, signature)` → HMAC-SHA256 con `META_APP_SECRET`, compara
        con timing-safe equal.
      - `resolveWebhookTenant(phoneNumberId)` → `MetaIntegration.findOne({ phoneNumberId })`
        (excepción pre-auth documentada).
      - `enqueueInboundJob(tenantId, payload)` → `inboundQueue.add(...)`.
- [x] Crear `features/webhook/webhook.controller.ts`:
      - `verifyController` (GET): llama `verifyChallenge`, devuelve challenge con HTTP 200.
      - `receiveController` (POST): valida HMAC (403 si falla), responde `res.sendStatus(200)`
        INMEDIATAMENTE, luego extrae `phone_number_id`, resuelve tenant, encola job. Sin `asyncHandler`.
- [x] Crear `features/webhook/webhook.routes.ts`: rutas PÚBLICAS sin `authenticateJWT`.
      Ruta POST usa `express.raw({ type: 'application/json' })` para preservar el body crudo.

### 5. Worker

- [x] Crear `workers/inbound-message.processor.ts`:
      - Consume jobs de `inbound-messages`.
      - Para cada `IWhatsAppMessage` en el payload:
        1. `resolveWebhookTenant(phoneNumberId)` → `{ tenantId, integration }`.
        2. `upsertByMetaUser(tenantId, ...)` → `clienteId`.
        3. `saveMessage(tenantId, { clienteId, ... })` → `Message inbound` (verifica `metaMessageId` para idempotencia).
      - Para cada `IWhatsAppStatus`:
        1. `updateDeliveryStatus(metaMessageId, status)`.
- [x] Registrar `inboundMessageProcessor` en `worker.ts` (crear el archivo si no existe).

### 6. Montaje en app.ts

- [x] `app.use('/api/channels/whatsapp', channelRoutes)`.
- [x] `app.use('/api/messages', messageRoutes)`.
- [x] `app.use('/api/webhooks/whatsapp', webhookRoutes)`.
- [x] `app.use('/api/clientes', clienteRoutes)` (placeholder; M02 añade handlers reales).

### 7. Frontend — Pantalla de configuración de canal

- [x] Usar `mcp__stitch__list_projects` para localizar el proyecto "SofiApp - Stich" y obtener su ID.
- [x] Usar `mcp__stitch__generate_screen_from_text` para generar la pantalla de configuración de
      canal: formulario (wabaId, phoneNumberId, accessToken), badge de estado (activo/inactivo),
      botón "Conectar" con loading state, mensaje de éxito/error.
- [x] Crear `apps/frontend/src/features/channels/ChannelConfigPage.tsx` con el JSX generado,
      siguiendo convenciones de `apps/frontend/CLAUDE.md`.
- [x] Crear `apps/frontend/src/features/channels/api.ts`:
      - `connectWhatsApp(dto: IChannelConnectDto): Promise<IChannelStatusResponse>` →
        `POST /api/channels/whatsapp/connect`.
      - `getWhatsAppStatus(): Promise<IChannelStatusResponse>` →
        `GET /api/channels/whatsapp/status`.
- [x] Integrar con TanStack Query: `useMutation` para connect, `useQuery` para status.
- [x] Exportar en `apps/frontend/src/features/channels/index.ts`.
- [x] Añadir ruta lazy en el router del frontend (solo accesible para rol admin).

## Tests (Vitest)

- [x] `tests/isolation/message.isolation.test.ts`:
      - `createScoped(MessageModel, tenantA, ...)` no retorna en `findScoped(MessageModel, tenantB)`.
      - `createScoped(ClienteModel, tenantA, ...)` no retorna en `findScoped(ClienteModel, tenantB)`.
- [x] `tests/unit/crypto.util.test.ts`:
      - `decrypt(encrypt(plaintext)) === plaintext`.
      - `encrypt(plaintext) !== plaintext`.
      - Mismo plaintext → ciphertexts distintos (IV aleatorio por cada llamada).
- [x] `tests/unit/webhook.service.test.ts`:
      - `validateHmacSignature` con firma incorrecta → `false`.
      - `validateHmacSignature` con firma correcta → `true`.
      - `verifyChallenge` con token incorrecto → lanza `AppError` con status 403.
      - `verifyChallenge` con token correcto → devuelve challenge.
- [x] `tests/unit/message.service.test.ts`:
      - `sendMessage` con `ventana24hExpiraEn` en el pasado → lanza `AppError` con status 422.
      - `sendMessage` con `ventana24hExpiraEn` en el futuro → llama al provider y persiste Message.

## Verificación final

- [x] `pnpm --filter backend typecheck` sin errores.
- [x] `pnpm --filter backend test` con todos los tests en verde.
- [ ] Prueba de integración manual (ngrok o tunnel similar):
      1. `GET /api/webhooks/whatsapp?hub.mode=subscribe&...` → responde challenge.
      2. `POST /api/webhooks/whatsapp` con payload de Meta y firma válida → 200 inmediato.
      3. Worker procesa: `Cliente` y `Message` persisten bajo el tenant correcto.
      4. `POST /api/messages/send` dentro de ventana → 200; fuera de ventana → 422.
- [x] Checklist de PR de `docs/multi-tenancy.md §9` revisado.
- [x] `accessTokenEnc` no aparece en ninguna response (verificar en Postman/Bruno).

## Definición de "hecho"

La capa base de mensajería está operativa: el webhook de Meta se verifica, los mensajes inbound
se persisten en el tenant correcto (resuelto por `phoneNumberId`), los mensajes outbound respetan
la ventana de 24h, y las credenciales nunca se exponen en responses. Es el fundamento sobre el
que M04 (IA), M06 (flujos) y M07 (campañas) se construyen.
