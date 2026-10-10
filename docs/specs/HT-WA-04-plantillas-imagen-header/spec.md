# HT-WA-04 — Plantillas con imagen de encabezado y validación de Meta (spec)

> **Spec-Driven Development.** Este es el QUÉ y el porqué. El CÓMO va en `plan.md`; la ejecución
> en `tasks.md`. Extiende el catálogo HSM de HT-WA-02 y la imagen por campaña de HU-MARK-03.

**Estado:** implementado

> **Nota de ID.** El backlog la llamaba `HT-WA-03`, pero ese ID ya es Embedded Signup
> (`docs/specs/HT-WA-03-embedded-signup/`, PR #43). Se registra como **HT-WA-04**.
>
> **Nota de rama.** Depende de código de HU-MARK-03 (`contenido.imagen` de campaña,
> `prepararImagenCabecera`, `ImageDropzone`, `MessagePreview`) que aún no está en `develop`.
> `feat/HT-WA-04` sale de `feat/HU-MARK-03` (= `origin/develop` + 1 commit) y se rebasa sobre
> `develop` cuando se mergee el PR de MARK-03.

## Historia

Como **administrador de la empresa** quiero crear plantillas de WhatsApp con texto y una imagen de
encabezado, enviarlas a validación de Meta desde SofiApp y poder cambiar la imagen en cada envío o
campaña, para usar mensajes más visuales fuera de la ventana de 24 h sin tener que aprobar una
plantilla nueva por cada imagen.

## Objetivo

Que el admin cree desde `/settings/templates` una plantilla **texto + imagen**, Meta la apruebe y el
estado se actualice solo en SofiApp; y que luego cada campaña o envío use esa misma plantilla con la
imagen por defecto **o** con otra imagen, sin volver a pasar por aprobación.

### Por qué hay dos subidas distintas a Meta

| Momento | API de Meta | Qué devuelve | Para qué |
|---|---|---|---|
| **Crear** la plantilla | Resumable Upload: `POST /{META_APP_ID}/uploads` + `POST /{upload-id}` (`file_offset: 0`) | `header_handle` (`h`) | Ejemplo de la cabecera que revisa Meta (`example.header_handle`) |
| **Enviar** la plantilla | `POST /{PHONE_NUMBER_ID}/media` | `media id` (vida ~30 días) | Parámetro `header.image.id` de cada mensaje |

El `header_handle` **no sirve para enviar**, y el `media id` **no sirve para crear**. La imagen de la
cabecera que recibe el cliente es la del parámetro de envío: por eso puede cambiar por campaña sin
reaprobar la plantilla.

## Alcance

**Incluye**
- Alta de plantilla con tipo de encabezado **«Solo texto»** o **«Texto + imagen»** (JPG/PNG ≤ 5 MB),
  pie de página opcional y ejemplos de variables.
- Imagen de muestra subida a nuestro almacenamiento (capa de media de HU-OMNI-06, prefijo del tenant)
  y a Meta por Resumable Upload; queda como **imagen por defecto** de la plantilla.
- Webhook `message_template_status_update` para actualizar estado y motivo de rechazo, más un job
  periódico de sincronización y una sincronización manual por plantilla.
- Actualización en vivo por Socket.IO del listado de plantillas.
- Imagen de reemplazo opcional en campañas (enviar ahora y programadas) y en el envío de plantilla
  desde la conversación, con las mismas validaciones.
- Caché del `media id` de Meta por imagen (plantilla y campaña), renovado al vencer.
- Errores de Meta traducidos a mensajes entendibles.

**Fuera de alcance**
- Encabezados `TEXT`, `DOCUMENT` y `VIDEO` en el alta (siguen llegando por la sincronización; el envío
  de DOCUMENT/VIDEO sigue dando 422 como en HT-WA-02).
- Crear botones (se conservan si llegan por la sincronización).
- Editar o borrar plantillas en Meta.
- Guardar el contenido de la plantilla (texto/imagen) en el `Message` del inbox.
- Moderación automática de la imagen de reemplazo (la UI muestra el aviso de políticas de Meta).
- Borrar los archivos de subidas que caducan sin usarse (el TTL borra el documento; deuda anotada).

## Decisiones

1. **Se reutiliza el modelo existente, no se duplica.** Lo que la historia llama `componentes` es el
   `components` actual (forma de Meta). Se agregan `example.header_handle`, `imagenDefecto` y
   `motivoRechazo`. `metaTemplateId` y `language` ya existen.
2. **`imagenHeader` de Campaign = `contenido.imagen` de HU-MARK-03.** Pasa a ser **opcional también
   para plantillas IMAGE**: `null` significa «usar la imagen por defecto de la plantilla».
3. **Regla de resolución de la imagen** (una sola función, usada por campaña y por envío):
   imagen de reemplazo → `imagenDefecto` de la plantilla → **422** «La plantilla requiere imagen y no
   hay ninguna disponible».
4. **Subida en dos pasos con `uploadId` opaco.** `POST /templates/media` y `POST /campaigns/media`
   guardan la imagen y crean un `MediaUpload` (scoped, de un solo uso, TTL 24 h). Los endpoints de
   alta/envío reciben ese `uploadId`, **nunca un `mediaKey` del cliente**. Esto permite la barra de
   progreso real y que la imagen no se reenvíe con cada intento de alta.
5. **Una subida consumida, una copia.** Cada campaña o plantilla se queda con su propio `mediaKey`:
   cambiar la imagen de una campaña no toca la plantilla ni otras campañas.
6. **Tenant del webhook de plantillas por WABA.** Los eventos `message_template_status_update` no
   traen `phone_number_id`; el tenant se resuelve por `entry.id` (= `wabaId`). Es una **extensión
   documentada** de la excepción del webhook (regla 2 del `CLAUDE.md`), con índice en `wabaId`.
7. **Sincronización de respaldo cada 30 min**, solo para tenants con plantillas `PENDING`/`IN_APPEAL`.
8. **El envío desde la conversación queda para `admin`**, como `POST /messages/template` hoy.

## Criterios de aceptación

1. **Tipo de encabezado.** El formulario de alta permite elegir «Solo texto» o «Texto + imagen». Con
   «Solo texto», el payload a Meta y el documento guardado son idénticos a HT-WA-02.
2. **Validación de la imagen.** Solo JPG/PNG de hasta 5 MB, validado en el cliente (mensaje en línea,
   sin llamada al API) y en el servidor (415 tipo, 413 tamaño, con texto legible) **antes** de
   cualquier llamada a Meta.
3. **Categoría.** La opción de imagen solo está disponible para `MARKETING` y `UTILITY`: deshabilitada
   (con explicación) en la UI para `AUTHENTICATION`, y 400 en el backend si llega igual.
4. **Alta en Meta.** `POST /api/templates/media` obtiene el `header_handle` por Resumable Upload.
   `POST /api/templates` con `cabecera: { formato: 'IMAGE', uploadId }` envía `HEADER(IMAGE,
   example.header_handle)` + `BODY(example.body_text)` + `FOOTER` opcional, y guarda la plantilla en
   `PENDING` con `imagenDefecto`. Sin `META_APP_ID` → 503.
5. **Estado automático.** El webhook `message_template_status_update` actualiza `status` a
   `APPROVED`/`REJECTED`/`PAUSED`/`DISABLED`/`IN_APPEAL` y guarda `motivoRechazo`. El webhook responde
   200 inmediato y el trabajo va por BullMQ. Un payload con cambios de otro `field` **no rompe** el
   procesamiento de los `messages` del mismo payload.
6. **Respaldo.** Un job repetible (cada 30 min) sincroniza los tenants con plantillas
   `PENDING`/`IN_APPEAL`. `POST /api/templates/:id/sync` refresca una plantilla concreta.
7. **En vivo.** Cada cambio de estado emite `template:status-updated` a `tenant:<id>`; el listado se
   actualiza sin recargar y muestra el motivo de rechazo traducido.
8. **Solo aprobadas.** Una plantilla que no está `APPROVED` no se puede usar en envíos (422); los
   selectores de campaña e inbox solo ofrecen aprobadas.
9. **Imagen por defecto.** La imagen del alta queda como `imagenDefecto`. El listado y
   `GET /api/templates/:id` devuelven su URL firmada (`/media/templates/:id/imagen?t=`), y el listado
   marca «Con imagen».
10. **Reemplazo en campaña.** El asistente «Enviar ahora» y el programador aceptan plantillas IMAGE y
    muestran el bloque **«Imagen del mensaje»**: imagen por defecto, «Cambiar imagen» y «Restaurar
    imagen por defecto». La imagen de reemplazo pasa por las mismas validaciones. Sin reemplazo se
    envía la imagen por defecto. La plantilla **no** vuelve a aprobación.
11. **Independencia.** Cambiar la imagen de una campaña no modifica la plantilla ni otras campañas
    que la usan (test con dos campañas sobre la misma plantilla).
12. **Envío desde la conversación.** `POST /api/messages/template` acepta `imagenHeaderUploadId`
    opcional. Con la ventana cerrada, el admin abre «Enviar plantilla» desde el banner y envía con la
    imagen por defecto o con una de reemplazo.
13. **Caché del media id.** La imagen por defecto cachea `metaMediaId`/`subidaMetaAt` en la
    plantilla; la de reemplazo, en la campaña. Se renueva pasados 25 días. Una campaña sube **una**
    vez su imagen, no una por destinatario. Si la plantilla requiere imagen y no hay ninguna → 422.
14. **Errores de Meta legibles.** Nombre/idioma duplicado → 409; imagen o `header_handle` inválido →
    422; límite de plantillas de la WABA → 422; Meta no disponible o timeout → 502. Todos con mensaje
    en español sin texto crudo de la Graph API.
15. **Vista previa fiel.** La burbuja estilo WhatsApp muestra la imagen que realmente se enviará (por
    defecto o de reemplazo) sobre el texto con las variables sustituidas, en el alta, en las campañas
    y en el envío desde la conversación.
16. **Regresión.** Las plantillas de solo texto de HT-WA-02 y las campañas de HU-MARK-01/03 funcionan
    sin cambios; la suite existente sigue en verde.
17. **Aislamiento multi-tenant.** El tenant B no ve, no sincroniza ni usa la plantilla de A; no puede
    consumir un `uploadId` de A (404) ni leer su imagen (token de A no sirve para B); un evento del
    webhook con la WABA de A no toca plantillas de B. Toda query pasa por el repositorio `*Scoped` y el
    `tenantId` nace del token (salvo la resolución documentada del webhook). Tests de aislamiento en
    verde, `tsc --noEmit` sin errores, suite del backend en verde y `build` + `lint` del frontend en
    verde.

## Dependencias

- **HT-WA-01 / HT-WA-03**: credenciales por tenant (`MetaIntegration`) y webhook único de la app.
- **HT-WA-02**: catálogo, `buildTemplatePayload`, `sendOutbound`.
- **HU-OMNI-06**: almacenamiento de media (`getMediaStorage`, URLs firmadas).
- **HU-MARK-03**: imagen por campaña y caché de `media id` (base de la rama).
- `META_APP_ID` configurado y token del tenant con permiso `whatsapp_business_management`.
- **Paso manual en Meta**: suscribir el campo `message_template_status_update` en el webhook de la
  app (App Dashboard → WhatsApp → Configuration).
- Habilita imagen por plantilla y por campaña para HU-FLOW-02, HU-MARK-01 y HU-MARK-03.

> **Política de contenido.** La imagen de reemplazo no pasa por revisión de Meta, pero debe cumplir
> sus políticas: una imagen que las incumpla puede bajar la calidad del número o pausar la plantilla.
> La UI lo avisa junto a «Cambiar imagen».
