# HT-WA-01-V2 — Tasks (checklist ejecutable)

> Claude Code: ejecuta en orden. Marca cada casilla al terminar. No cierres el feature hasta que
> TODO esté en verde. El orden importa: el test de integración se escribe **antes** del fix, para
> verlo fallar y confirmar que reproduce el defecto real.

## Implementación

### Reproducir primero

- [x] Crear `apps/backend/src/features/webhook/webhook.routes.test.ts` con el mock de
      `config/queues.js` y el import de `app` posterior (patrón de `lead.routes.test.ts`).
- [x] Caso "firma válida → 200 + job encolado". Ejecutarlo **contra el código actual** y confirmar
      que falla. Dejar constancia del error en el commit.
      _Confirmado: contra el código previo al fix, los tres tests POST no fallaban con un simple
      403 — colgaban hasta el timeout de 30s. `validateHmacSignature` lanza un `TypeError`
      síncrono que el `.catch()` de `webhook.routes.ts` solo loguea sin responder nada, así que la
      petición nunca recibe respuesta. Es la misma causa raíz documentada en el `spec.md`, con un
      síntoma aún peor de lo previsto (cuelgue, no solo 403)._

### Fix del cableado

- [x] `apps/backend/src/app.ts`: mover `app.use('/api/webhooks/whatsapp', webhookRoutes)` para que
      quede **entre `cors()` y `express.json()`**, con el comentario que explica por qué.
- [x] `apps/backend/src/app.ts`: eliminar el montaje duplicado de la línea 58 (bloque tenant-aware).
- [x] Re-ejecutar el test: ahora debe pasar.
      _Los 5 casos pasan en ~1.1s (antes: 3 colgados a 30s cada uno)._

### Endurecer el entorno

- [x] `apps/backend/src/config/env.ts`: `META_APP_SECRET`, `META_VERIFY_TOKEN` y
      `TENANT_TOKEN_ENC_KEY` requeridas cuando `NODE_ENV !== 'test'`.
- [x] `apps/backend/src/config/env.ts`: subir el default de `META_GRAPH_VERSION` a `v26.0`
      (confirmado vigente al 2026-08 vía changelog oficial de Meta for Developers).
- [ ] Actualizar `apps/backend/.env.example` (y el `.env.example` de la raíz) con las tres
      variables y un comentario de cómo generar `TENANT_TOKEN_ENC_KEY`.
      **PENDIENTE — acción manual del usuario.** El sandbox de esta sesión deniega explícitamente
      leer/escribir archivos `.env*` (protección de secretos), así que Claude Code no pudo tocar
      estos archivos. Añadir a `apps/backend/.env.example`:
      ```
      META_APP_SECRET=tu_app_secret_de_meta_for_developers
      META_VERIFY_TOKEN=un_token_que_tu_inventes
      META_GRAPH_VERSION=v26.0
      # 64 caracteres hex — generar con: openssl rand -hex 32
      TENANT_TOKEN_ENC_KEY=
      ```
      Y replicar `META_APP_SECRET`/`META_VERIFY_TOKEN`/`TENANT_TOKEN_ENC_KEY` en
      `apps/backend/.env` con valores reales antes de arrancar fuera de `NODE_ENV=test`.

### Aislamiento multi-tenant

- [x] `message.service.ts`: `saveMessage` deduplica con `findOneScoped(Message, tenantId, {...})`.
- [x] `message.service.ts`: `updateDeliveryStatus` recibe `tenantId` como primer argumento y usa
      `findOneAndUpdateScoped`.
- [x] `workers/inbound-message.processor.ts`: actualizar la llamada a `updateDeliveryStatus` para
      pasarle el `tenantId` que ya tiene en alcance.
- [x] `message.model.ts`: cambiar el índice `{ metaMessageId: 1 }` por
      `{ tenantId: 1, metaMessageId: 1 }` (sparse).

### Resiliencia de la cola

- [x] `webhook.service.ts`: `enqueueInboundJob` encola con `attempts: 5`, `backoff` exponencial y
      políticas de retención.

### Documentación

- [x] `README.md`: sección "Conectar WhatsApp en desarrollo" (túnel, Callback URL, verify token,
      suscripción al campo `messages`, los tres procesos, variables de entorno).
- [x] `package.json` de la raíz: script `tunnel`.
- [x] `docs/integrations/meta-whatsapp.md`: corregir la ruta a `/api/webhooks/whatsapp` y el código
      de firma inválida a 403. Añadido además el porqué del orden de montaje en `app.ts`.
- [x] `docs/data-model.md`: añadir `ventana24hExpiraEn` al esquema `clientes` y `status` al esquema
      `messages`, ambos ya implementados por HT-WA-01 y hoy sin documentar. Se documentó también
      el cambio de índice de `metaMessageId` a scoped por tenant.

## Tests (Vitest)

### Aislamiento multi-tenant (obligatorio)

- [x] `tests/isolation/message.isolation.test.ts` (se amplió el archivo existente en vez de crear
      uno nuevo — mismo feature, misma responsabilidad):
      - [x] `saveMessage(tenantB, {metaMessageId: X})` crea documento propio aunque tenantA ya tenga
            uno con el mismo `metaMessageId`.
      - [x] `updateDeliveryStatus(tenantB, X, 'read')` no altera el mensaje de tenantA.

### Contrato HTTP

- [x] `webhook.routes.test.ts`:
      - [x] POST con firma válida → 200 y `inboundQueue.add` llamado una vez con `{tenantId, payload}`.
      - [x] POST con firma inválida → 403 y `inboundQueue.add` **no** llamado.
      - [x] POST con `phone_number_id` sin `MetaIntegration` → 200 (SLA de Meta) y sin encolar.
      - [x] GET con `hub.verify_token` válido → 200 y devuelve el `hub.challenge`.
      - [x] GET con `hub.verify_token` inválido → 403.

## Verificación final

- [x] `pnpm --filter backend typecheck` sin errores.
- [x] `pnpm --filter backend test` con todos los tests en verde (55 archivos, 416 tests).
- [x] Checklist de PR de `docs/multi-tenancy.md` §9 revisado (ver nota abajo).
- [ ] **Prueba de integración manual con Meta** (la que quedó sin marcar en HT-WA-01):
      1. Redis, `pnpm dev:web` y `pnpm dev:worker` arriba.
      2. Túnel abierto; Callback URL `<túnel>/api/webhooks/whatsapp` verificada en Meta (el GET de
         challenge devuelve 200).
      3. Campo `messages` suscrito en la WABA.
      4. Credenciales pegadas en `/settings/channels/whatsapp`.
      5. Mensaje desde un celular real → aparece en la bandeja bajo el tenant correcto.
      6. Respuesta desde la bandeja dentro de la ventana → llega al celular.
      7. `Cliente.ventana24hExpiraEn` quedó fijado a `now + 24h` tras el inbound.
      **PENDIENTE — requiere credenciales reales de Meta for Developers y un celular; no ejecutable
      por Claude Code en este entorno.** El código y los tests automatizados que la hacen posible
      ya están completos y en verde.
- [ ] Marcar la casilla `- [ ] Prueba de integración manual` de
      `docs/specs/HT-WA-01-whatsapp-base/tasks.md:145` y anotar la fecha de la verificación.
      _Depende del punto anterior._
- [x] Ninguna captura de pantalla de verificación quedó en el árbol de trabajo (`git status`).

## Definición de "hecho"

El canal de WhatsApp está vivo: Meta entrega los webhooks, el worker los procesa bajo el tenant
correcto y la bandeja conversa en ambos sentidos con un celular real. `HT-WA-02` (plantillas HSM) y
`HU-FLOW-01` (motor de flujos) pueden construirse encima con la certeza de que el transporte
funciona.

**Estado de esta implementación:** todo el código, la corrección del defecto y los tests
automatizados están completos y verificados (typecheck + 416 tests en verde). Lo único que falta
para cerrar la Definition of Done es la prueba manual con credenciales reales de Meta y un celular,
que requiere acción del usuario (ver checklist arriba).
