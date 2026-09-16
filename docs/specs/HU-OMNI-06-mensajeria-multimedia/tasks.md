# HU-OMNI-06 — Tasks (checklist ejecutable)

> Claude Code: ejecuta en orden. Marca cada casilla al terminar. No cierres el feature hasta que
> TODO esté en verde. Rama: `feat/HU-OMNI-06`, creada **desde `develop`**.

## 0. Preparación

- [x] Confirmar que no queda trabajo sin confirmar de otro feature en el árbol (`git status`); la
      rama sale de `develop`, no de la rama actual.
- [x] `git switch develop && git pull && git switch -c feat/HU-OMNI-06`.
- [x] Instalar dependencias backend: `multer@^2`, `@types/multer`, `@aws-sdk/client-s3`,
      `@aws-sdk/s3-request-presigner` (`pnpm --filter @sofiapp/api add …`).
- [x] Añadir `var/media/` (o el valor de `MEDIA_LOCAL_DIR`) a `.gitignore`.
- [x] Documentar las env nuevas en `.env.example`.

## 1. Migración del enum `tipo` a español

> Es la parte que puede romper lo que ya funciona. **Verde antes de seguir al paso 2.**

- [x] `message.types.ts`: nuevo `TipoMensaje` en español + `TIPOS_CON_TEXTO`, `esTipoConTexto()`,
      `TIPO_POR_TIPO_META`, `TIPO_MENSAJE_LEGACY` y `normalizarTipoMensaje()`.
- [x] `message.model.ts`: enum **expandido** (valores nuevos + los 6 legacy) — fase *expand*.
- [x] `scripts/migrate-message-tipo.ts`: idempotente, un `updateMany` por par **sobre
      `Message.collection`** (no sobre el modelo: el schema ya no castea `text`), con `--dry-run`.
      Registrarlo en `package.json` como `migrate:tipo-mensaje`.
- [x] **`features/campaign/campaign.service.ts:102`** — `{ tipo: 'template' }` →
      `{ tipo: { $in: ['plantilla', 'template'] } }`. **No es opcional ni cosmético:** es el conteo
      del consumo del tier de Meta y, si devuelve 0, una campaña se pasa del límite del número.
- [x] Sustituir los literales en inglés en: `workers/inbound-message.processor.ts` (borrar su
      `mapMsgType` privado y consumir el normalizador), `workers/ai-reply.processor.ts`,
      `features/conversation/conversation.service.ts` (preview + transcript del resumen +
      `acusarNoTexto`), `features/flow/flow.runtime.service.ts`, `features/message/message.service.ts`,
      `seed/seed-inbox-demo.ts`.
- [x] `conversation.mapper.ts`: `toMessageResponse` devuelve `normalizarTipoMensaje(msg.tipo)` — esta
      defensa **se queda de forma permanente** (`.lean()` no valida el enum).
- [x] Hacer que **toda** decisión de "¿este mensaje tiene texto?" pase por `esTipoConTexto()`.
- [x] Fixtures de test: `grep -rn "tipo: 'text'" apps/backend/src` y actualizar (~20 archivos entre
      `tests/isolation/`, `tests/unit/` y los `*.test.ts` de features).
- [x] Frontend: `features/inbox/types.ts` tipa `tipo` con la unión en español (hoy es `string`).
- [x] **Puerta de fase:** `pnpm --filter @sofiapp/api typecheck` y `test` en verde, y
      `migrate:tipo-mensaje --dry-run` revisado sobre una copia de la base, antes de seguir.

## 2. Capa de almacenamiento

- [x] `integrations/storage/storage.types.ts` — `IMediaStorage`, `IObjetoAlmacenado`, `IArchivoLeido`.
- [x] `integrations/storage/local-disk.storage.ts` — guard anti path-traversal en `key`; claves
      siempre en POSIX (`/`), `path.resolve` solo al leer.
- [x] `integrations/storage/spaces.storage.ts` — cliente S3 + `getSignedUrl` + **`ACL: 'private'`
      explícito** en cada `PutObjectCommand`.
- [x] `integrations/storage/index.ts` — `getMediaStorage()` singleton **perezoso** por
      `env.MEDIA_DRIVER`, con un `setMediaStorageForTests()` para inyectar dobles.
- [x] `config/env.ts` — las env de `plan.md` §3, con `superRefine` que exige las `SPACES_*` cuando
      `MEDIA_DRIVER === 'spaces'`, y `MEDIA_INGEST_ENABLED` como enum `'on'|'off'` (**no booleano**:
      `z.coerce.boolean()` convierte `"false"` en `true`).
- [x] `tests/setup.ts` — `MEDIA_LOCAL_DIR` a un directorio de `os.tmpdir()` con limpieza en
      `afterAll`.
- [x] `docs/adr/0008-almacenamiento-de-media.md` (formato de los ADR 0005+) y fila en
      `docs/adr/README.md`.

## 3. Modelo `Message` + acceso firmado

- [x] `message.types.ts` / `message.model.ts`: `media?: IMensajeMedia`, `previewEnlace?`, índice
      parcial sobre `media.estado`, retirar `attachmentUrl`.
- [x] `features/media/media.types.ts` y `media.validation.ts`.
- [x] `media.service.ts`: `firmarUrlMedia`, `verificarTokenMedia` (con `timingSafeEqual`),
      `resolverMedia`, `clasificarTexto` (detecta URL → `tipo: 'enlace'` + `previewEnlace`).
- [x] `media.controller.ts` + `media.routes.ts` (`GET /:id`, `POST /:id/reintentar`) y montaje
      `app.use('/api/media', mediaRoutes)` en `app.ts`.
- [x] **Endurecer la respuesta de media**: `svg` y `html` fuera de la lista blanca de mimes,
      `X-Content-Type-Options: nosniff`, `Cache-Control: private, max-age=300`, y
      `Content-Disposition: attachment` por defecto en documentos (`inline` solo imagen y video).
- [x] Verificar que el almacenamiento **se toca después** del `findByIdScoped`, nunca antes.
- [x] `conversation.types.ts` / `conversation.mapper.ts`: `IMediaResponse`, `IMessageResponse` con
      `media` y `previewEnlace`; `toMessageResponse` firma la URL.
- [x] Preview de la bandeja: añadir `🎥 Video` y `🔗 Enlace`.

## 4. Ingesta inbound

- [x] `features/webhook/webhook.types.ts`: `IWhatsAppMedia` y los cinco campos de media en
      `IWhatsAppMessage`.
- [x] `integrations/meta/meta-whatsapp.normalizer.ts`: `parseInboundEvents` puebla `tipo`, `texto`
      (body o caption), `media` y `previewEnlace`. Dejar de ser código muerto.
- [x] `integrations/meta/meta-media.client.ts`: `descargar()` (Media ID → URL de 5 min → bytes) y
      `subir()`. Traducir el `404` de descarga a "media expirada" (fallo definitivo, sin reintentos).
- [x] `config/queues.ts`: `MEDIA_INGEST_QUEUE_NAME`, `MEDIA_INGEST_JOB`, `mediaIngestQueue`.
- [x] `workers/media-ingest.processor.ts`: `mediaIngestJobId` (**sin `:`**) y
      `processMediaIngestJob` (puro respecto de BullMQ).
- [x] `worker.ts`: construir el `Worker` de `media-ingest` con su `.on('failed')`.
- [x] `workers/inbound-message.processor.ts`: guardar con `estado: 'pendiente'` y encolar la ingesta.
- [x] `realtime/realtime.types.ts` + `realtime.publisher.ts`: evento `message:updated`.

## 5. Envío outbound

- [x] `message.types.ts`: `TipoMediaSaliente` y el cuarto modo de `ContenidoOutbound`.
- [x] `message.service.ts`: `sendOutbound` trata `modo: 'media'` como `'texto'` frente a la ventana
      de 24 h (mismo `422`), y persiste el `Message` con `media.estado: 'disponible'`.
- [x] `meta-whatsapp.client.ts`: `sendMedia(...)`; `sendText` pasa a enviar `preview_url: true`.
- [x] `media.service.ts`: `enviarMediaSaliente` (validar mime+tamaño → `storage.guardar` →
      `metaMediaClient.subir` → `sendOutbound`) y `reintentarIngesta`. **Almacenamiento antes que
      Meta**, con `storage.eliminar(key)` best-effort en el `catch` antes de re-lanzar.
- [x] `src/middlewares/upload.middleware.ts` — envuelve `upload.single('archivo')` y traduce
      `MulterError` (`LIMIT_FILE_SIZE`) a `AppError(…, 413)`. **Sin esto el `errorHandler` devuelve un
      500 opaco**, y es la ruta de fallo más frecuente en producción.
- [x] Descartar el `caption` en `audio` y `sticker` (Meta devuelve 400 si se manda).
- [x] `conversation.{validation,controller,routes}.ts`: `POST /:id/messages/media` con `multer`
      (`memoryStorage`, `files: 1`) **entre `authorize` y `validate`** — la única excepción admitida
      a la cadena fija de middlewares, documentada en `apps/backend/CLAUDE.md`.

## 6. Frontend

> **Antes de escribir o tocar cualquier componente**, invocar `emil-design-eng`,
> `impeccable:impeccable` y `frontend-design:frontend-design` y aplicar sus criterios (regla §7 del
> `CLAUDE.md` raíz). Todo componente queda terminado en **light y dark** con tokens semánticos.

- [x] `pnpm dlx shadcn@3.8.5 add aspect-ratio` desde `apps/frontend/`.
- [x] `features/inbox/lib/media.ts`: `LIMITES_BYTES`, `MIMES_ACEPTADOS`, `validarArchivo`,
      `formatearBytes`, `iconoPorMime`, `dominioDe`.
- [x] Extraer `MessageBubble.tsx` de `ConversationThread.tsx` **sin cambiar el aspecto actual**
      (commit aparte, para que el diff del renderizado por tipo se lea limpio).
- [x] `MessageMedia.tsx` (dispatcher + estados `pendiente`/`fallida`), `ImageMessage`,
      `VideoMessage`, `DocumentMessage`, `LinkPreviewCard`, `MediaLightbox`.
- [x] Actualizar `seed-inbox-demo.ts`: los tres `attachmentUrl: 'https://demo.invalid/…'` pasan a
      `media: { estado: 'fallida', … }` o a archivos reales. **Si se olvida, la demo muestra tres
      imágenes rotas** donde antes había texto en cursiva.
- [x] `MessageComposer.tsx`: botón `Paperclip` + input oculto + arrastrar y soltar **solo sobre el
      composer** (con contador de profundidad para el `dragleave` de los hijos) + `AttachmentPreview`
      + barra de progreso; el botón de adjuntar se deshabilita con la ventana de 24 h cerrada.
- [x] `AttachmentPreview`: `URL.createObjectURL` **con `revokeObjectURL` en el cleanup del efecto**
      (si no, cada adjunto descartado es una fuga de memoria).
- [x] Al llegar el progreso a 100, cambiar a "Enviando a WhatsApp…": `onUploadProgress` termina
      cuando el archivo llega al backend, no cuando Meta lo acepta, y la barra parece colgada.
- [x] Variante de `MessageBubble` **sin padding** (`p-0 overflow-hidden`) para imagen y video.
- [x] `api.ts`: `enviarMedia` con `FormData`, `timeout: 120_000` y `onUploadProgress`; **no fijar
      `Content-Type` a mano** (el navegador pone el `boundary`).
- [x] `hooks/useThread.ts`: `useSendMedia`. `hooks/useInboxRealtime.ts`: `message:updated` con
      `qc.setQueryData` (no `invalidateQueries`).

## 7. Tests (Vitest)

- [x] **Aislamiento multi-tenant** (`tests/isolation/media.isolation.test.ts`):
  - [x] Token firmado para el tenant A contra un `messageId` del tenant B → `404`, con **cuerpo
        idéntico al de un id inexistente** (sin oráculo de existencia).
  - [x] **El adaptador de almacenamiento no se invoca** en ese caso (espía sobre `leer`/`urlFirmada`):
        es lo que prueba que el corte ocurre antes de llegar al objeto.
  - [x] Token manipulado → `403`. Token vencido → `403`. Sin `t` → `403`.
  - [x] `POST /:id/messages/media` sobre una conversación de otro tenant → `404` y nada escrito en el
        almacenamiento.
  - [x] `GET /api/conversations/:id/messages` de una conversación de otro tenant → `404` y ninguna
        `urlArchivo` ajena en la respuesta.
  - [x] Un `Message` con `media` del tenant A no aparece en `findScoped(Message, tenantB)`.
  - [x] La `storageKey` generada empieza siempre por el `tenantId` del token.
- [x] `scripts`/migración: correr dos veces deja el mismo resultado; ningún documento queda con un
      literal en inglés.
- [x] `esTipoConTexto`: un mensaje `enlace` **no** dispara el acuse de "solo texto" (regresión del
      Riesgo #1), y `imagen`/`video`/`documento`/`audio` sí.
- [x] Normalizador: un webhook de `image`, `video`, `document`, `audio` y `sticker` produce el
      `tipo`, el `texto` (caption) y la `media` correctos; un texto con URL produce `enlace` +
      `previewEnlace`.
- [x] `media-ingest.processor`: éxito (pasa a `disponible` y publica `message:updated`); media
      expirada (fallo definitivo sin agotar intentos); agotamiento de reintentos (`fallida` + se
      publica igual); job repetido sobre un mensaje ya `disponible` es no-op.
- [x] **El `jobId` encolado por `processInboundJob` no contiene `:`** — assert explícito, no
      inspección visual: el mock de la cola acepta cualquier id y eso fue exactamente lo que dejó
      pasar HT-AI-02 con la suite entera en verde.
- [x] Conteo del tier de campañas: sigue contando correctamente con `plantilla` y, en fase expand,
      también con `template`.
- [x] `sendOutbound` con `modo: 'media'` fuera de ventana → `422` con el mismo mensaje que el texto,
      **y `sendMedia` nunca llega a llamarse**.
- [x] Límites por tipo: imagen > 5 MB, video > 16 MB y documento por encima del techo son rechazados,
      y un mime no permitido también (incluidos `svg` y `html`).
- [x] Rollback: si `metaMediaClient.subir` falla, se llama a `storage.eliminar`.
- [x] `local-disk.storage`: una `key` con `../` no escapa de `MEDIA_LOCAL_DIR`.
- [x] `meta-media.client`: 429 reintenta con backoff; un `content-length` mayor que el techo aborta
      **sin bufferizar**; un 404 no reintenta.
- [x] Frontend: `MessageBubble` renderiza cada tipo; `validarArchivo` rechaza por tipo y por tamaño;
      `AttachmentPreview` muestra el progreso.

## 8. Documentación

- [x] `docs/data-model.md` — §messages: enum nuevo, subdocumento `media`, `previewEnlace`, índices.
- [x] `docs/api-contract.md` — los tres endpoints nuevos **y** corregir la ruta del webhook
      (`/api/webhooks/meta` → `/api/webhooks/whatsapp`).
- [x] `docs/integrations/meta-whatsapp.md` — sección nueva de media (descarga, subida, límites,
      expiración del Media ID) y las env nuevas en §7.
- [x] `docs/multi-tenancy.md` — la tercera excepción documentada (token firmado de media).
- [x] `apps/backend/CLAUDE.md` — (a) `multer` es la única excepción admitida a la cadena fija de
      middlewares, con su posición y el motivo; (b) el feature `media/` **no tiene `.model.ts`** a
      propósito.
- [x] `apps/frontend/CLAUDE.md` — `aspect-ratio` en la lista de primitivos vendorizados.
- [x] `docs/architecture.md` — la capa de almacenamiento y el proceso worker con `media-ingest`.
- [x] `docs/domain.md` — los tipos de mensaje en español.
- [x] `CLAUDE.md` (raíz) y `apps/*/CLAUDE.md` — corregir los comandos de calidad:
      `--filter backend`/`--filter frontend` no matchean nada; son `@sofiapp/api` y `@sofiapp/web`.
- [x] `spec.md` → `**Estado:** implementado`.

## 9. Contract del enum (PR posterior, no en este feature)

- [ ] Bajar el `enum` del schema a los valores definitivos en español (quitar los 6 legacy).
- [ ] `campaign.service.ts`: el `$in` vuelve a `{ tipo: 'plantilla' }`.
- [ ] `normalizarTipoMensaje` **se queda** en el mapper: cubre réplicas y backups restaurados.

> Se hace cuando la migración lleve suficiente tiempo corrida en producción y no queden documentos
> con el enum viejo. Verificar con un `countDocuments` por cada valor legacy antes de cerrar.

## Verificación final

- [x] `pnpm --filter @sofiapp/api typecheck` sin errores.
- [x] `pnpm --filter @sofiapp/api test` en verde.
- [x] `pnpm --filter @sofiapp/web build && pnpm --filter @sofiapp/web lint` en verde.
- [x] Checklist de PR de `docs/multi-tenancy.md` §9 completo.
- [x] `git status` sin `*.png`/`*.jpg` de verificación visual coladas en el commit.

## Definición de "hecho"

Un asesor envía y recibe **una imagen, un video y un documento** en una conversación real de
WhatsApp. Cada uno se visualiza correctamente en el hilo, en orden cronológico; la imagen se abre en
lightbox y el video se reproduce embebido, **sin salir del CRM ni descargar el archivo a mano**; el
documento muestra nombre, tipo y tamaño con acción de abrir. Un enlace compartido se ve como tarjeta
con su dominio. Fuera de la ventana de 24 h, el composer no deja adjuntar y explica por qué.
