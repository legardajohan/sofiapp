# HU-OMNI-06 — Mensajería multimedia enriquecida (spec)

> **Spec-Driven Development.** Este es el QUÉ y el porqué. El CÓMO va en `plan.md`; la ejecución en
> `tasks.md`. Extiende el normalizador de `HT-WA-01` y la bandeja de `HU-OMNI-01` para que una
> conversación de WhatsApp deje de ser solo texto.

**Estado:** implementado

> Verificado automáticamente: `typecheck` en verde, **125 archivos de test del backend (1374 tests)** (incluido
> `tests/isolation/media.isolation.test.ts`) y **59 del frontend**, más `build` y `lint`.
>
> **Queda pendiente la prueba manual del Definition of Done** —enviar y recibir una imagen, un video
> y un documento en una conversación real— porque exige un número de WhatsApp conectado y no se
> puede automatizar. También queda pendiente la fase `contract` del enum (§9 de `tasks.md`), que es
> un PR posterior por diseño: no se puede hacer hasta que `migrate:tipo-mensaje` lleve tiempo
> corrido en producción.

## Contexto de dominio (importante)

- **No existe colección `Conversation`.** Una conversación es un `Cliente` proyectado para la
  bandeja; el hilo son los `Message` filtrados por `clienteId`. Por eso la metadata de media vive
  dentro de `Message` y el feature `media` **no tiene `model.ts` propio**.
- **`sendOutbound` (`message.service.ts`) es el único juez de la ventana de 24 h.** Todo envío
  —bandeja, flujos, recordatorios, campañas— pasa por ahí. La media **no** reimplementa la regla:
  añade un modo a `ContenidoOutbound`.
- Hoy el hilo renderiza `[image]` en cursiva para cualquier mensaje que no sea texto, y
  `Message.attachmentUrl` está declarado desde `HT-WA-01` pero **ningún camino de producción lo
  escribe** (su único escritor es `seed-inbox-demo.ts`). No hay ninguna capa de almacenamiento de
  archivos en el repositorio.

## Objetivo

Que un asesor reciba y envíe imágenes, videos, documentos y enlaces dentro de la conversación de
WhatsApp, y los vea en el hilo **sin salir del CRM ni descargar nada a mano** — como lo haría desde
la app oficial. Incluye la ingesta de la media entrante desde la Graph API, su almacenamiento propio
con acceso firmado, el envío saliente respetando los límites de Meta, y el renderizado por tipo en
la bandeja.

## Alcance

Incluye:
- Migración del enum `Message.tipo` a **español** (`texto`, `enlace`, `imagen`, `video`, `audio`,
  `documento`, `sticker`, `plantilla`, `otro`), con script de migración de datos.
- Capa de almacenamiento propia tras el puerto `IMediaStorage`: adaptador de **disco local** (dev) y
  adaptador **DO Spaces** (producción), elegidos por `MEDIA_DRIVER`.
- Extensión del tipado del webhook y del normalizador de entrantes para `image`, `video`,
  `document`, `audio` y `sticker`, con su metadata (`mimeType`, `caption`, `sha256`, tamaño).
- Cola BullMQ **`media-ingest`**: descarga de la media desde Graph (Media ID → URL temporal →
  almacenamiento propio), con reintentos y estados `pendiente | disponible | fallida`.
- Endpoints: `POST /api/conversations/:id/messages/media` (subida y envío),
  `GET /api/media/:id` (acceso firmado) y `POST /api/media/:id/reintentar`.
- Evento de tiempo real **`message:updated`**, para que el hilo pase de placeholder a media sin
  recargar.
- Frontend: `MessageBubble` extraído y ramificado por tipo (imagen con lightbox, video embebido,
  documento como tarjeta, enlace como tarjeta de dominio), composer con adjuntar + arrastrar y
  soltar + previsualización + barra de progreso, y validación de tipo/tamaño en cliente.
- ADR `0008` de almacenamiento de media y actualización de los docs afectados.

Fuera de alcance (otros features o deuda declarada):
- **Miniaturas generadas en servidor** (exigiría `sharp`/`ffmpeg`): la miniatura es la propia imagen
  reescalada por CSS, y el video usa su primer fotograma nativo.
- **Scraping Open Graph**: WhatsApp Cloud API **no envía metadata de previsualización** en los
  webhooks entrantes. La tarjeta de enlace muestra dominio + URL; los textos salientes se envían con
  `preview_url: true` para que la tarjeta rica la renderice WhatsApp del lado del cliente.
- **Plantillas HSM con header multimedia** (imagen/video/documento en la cabecera) → épica de
  plantillas.
- **Audio saliente / notas de voz** y transcripción de audio para Sofi.
- Reenvío de media entre conversaciones y galería de archivos del contacto.
- **Cuota de almacenamiento por tenant.** `HU-SAAS-02` limita `mensajesMes` y `campanasMes`, pero no
  hay ninguna métrica de MB: un tenant puede llenar el bucket sin límite ni coste imputado. Queda
  escrito como **deuda consciente** (candidatos: `almacenamientoMb` en el plan y retención de media a
  N días), no como descuido.

## Criterios de aceptación

1. `Message.tipo` usa el enum en español y **todo el histórico está migrado** (el script es
   idempotente: correrlo dos veces no cambia nada la segunda). Ningún consumidor
   (`inbound-message.processor`, `acusarNoTexto`, preview de la bandeja, flujos, campañas, seed,
   frontend) queda con un literal en inglés.
2. Un mensaje de tipo `enlace` **sigue contando como mensaje con texto**: Sofi lo responde con
   normalidad y **no** dispara el acuse "solo entiendo texto". La decisión pasa por un único helper
   `esTipoConTexto(tipo)`.
3. Una imagen, un video o un documento entrantes se persisten al instante con
   `media.estado: 'pendiente'` y aparecen en el hilo como placeholder; cuando la cola `media-ingest`
   termina, el mismo mensaje pasa a `disponible` y el hilo lo muestra **sin recargar**
   (`message:updated`). El orden cronológico del hilo se conserva en todo momento.
4. Si la descarga falla de forma definitiva (Media ID expirado, Graph caído, agotados los
   reintentos), el mensaje queda en `media.estado: 'fallida'` con el motivo, el hilo lo comunica y
   ofrece reintentar. **La ingesta del mensaje nunca se pierde por un fallo de descarga.**
5. Las imágenes y los videos recibidos se muestran **inline** en el hilo; una imagen se abre a
   tamaño completo en un lightbox dentro del CRM y un video se reproduce embebido, sin descargar el
   archivo ni abrir otra aplicación.
6. Los documentos muestran **nombre, tipo y tamaño** legibles, con acción de abrir/descargar.
7. El asesor envía imágenes, videos y documentos desde el composer (botón adjuntar **y** arrastrar y
   soltar), con previsualización antes de enviar y barra de progreso durante la subida. El tipo y el
   tamaño se validan **en el cliente antes de subir** y de nuevo en el servidor, con los límites de
   Meta: imagen 5 MB, video 16 MB, audio 16 MB, documento 100 MB.
8. Un mensaje de texto que contiene una URL se clasifica como `enlace` y se renderiza con una
   tarjeta de previsualización (dominio + enlace), conservando el texto completo del mensaje.
9. El envío de media respeta la ventana de 24 h **a través de `sendOutbound`**: fuera de ventana
   devuelve el mismo `422` que el texto libre, y el banner de ventana cerrada del frontend deshabilita
   también el adjuntar. No hay una segunda implementación de la regla.
10. **El conteo del tier de campañas sobrevive a la migración.** La agregación de
    `campaign.service.ts` que mide el consumo de plantillas en 24 h rodantes sigue contando lo mismo
    antes, durante y después del cambio de enum. Es el único punto de esta HU cuyo fallo tiene
    consecuencia **externa e irreversible**: si devuelve 0, el pacing cree que hay cupo entero y la
    campaña puede pasarse del tier del número de Meta.
11. `GET /api/media/:id` sirve el archivo solo con un **token firmado vigente**: con el driver
    `spaces` responde `302` a una URL prefirmada de vida corta; con `local`, hace stream con su
    `Content-Type` y `Content-Disposition`. Token vencido o manipulado → `403`.
12. **La media servida no puede ejecutarse en nuestro origen.** `svg` y `html` quedan fuera de los
    mimes aceptados, la respuesta lleva `X-Content-Type-Options: nosniff` y `Cache-Control: private`,
    y los documentos se sirven como `attachment`. Un archivo subido por un cliente no puede
    convertirse en XSS almacenado con la cookie de sesión al alcance.
13. **Aislamiento multi-tenant:** un token de media firmado para el tenant A contra un `messageId`
    del tenant B devuelve `404` **idéntico al de un id inexistente** (sin oráculo de existencia), y
    **el adaptador de almacenamiento no llega a invocarse**; el hilo de una conversación de otro
    tenant devuelve `404` y jamás expone una `urlArchivo` ajena; y la clave de almacenamiento va
    siempre prefijada por `tenantId`. Hay test que lo prueba.
14. `pnpm --filter @sofiapp/api typecheck` y `pnpm --filter @sofiapp/web build` en verde, sin `any`.

## Dependencias

- `HT-WA-01` / `HT-WA-01-V2` — webhook, normalizador y conexión base de WhatsApp.
- `HT-WA-02` — catálogo de plantillas HSM y la regla de la ventana de 24 h en `sendOutbound`.
- `HU-OMNI-01` — bandeja omnicanal (hilo, composer, `message:new`).
- `INF-02` — repositorio tenant-safe.
- Credenciales de DO Spaces para el despliegue en producción (en dev basta el driver `local`).
