# HU-OMNI-06 — Plan técnico (CÓMO)

## Archivos a crear

```
apps/backend/src/
├── integrations/storage/
│   ├── storage.types.ts            # IMediaStorage, IObjetoAlmacenado, IArchivoLeido
│   ├── local-disk.storage.ts       # dev: <MEDIA_LOCAL_DIR>/<key>; guard anti path-traversal
│   ├── spaces.storage.ts           # prod: DO Spaces (S3) + getSignedUrl
│   ├── index.ts                    # getMediaStorage(): singleton según env.MEDIA_DRIVER
│   └── local-disk.storage.test.ts
├── integrations/meta/
│   └── meta-media.client.ts        # descargar() y subir() contra Graph
├── features/media/
│   ├── media.types.ts              # EstadoMedia, IMensajeMedia, IPreviewEnlace, IMediaResponse
│   ├── media.validation.ts         # getMediaSchema, retryMediaSchema, sendMediaSchema
│   ├── media.service.ts            # firmarUrlMedia, verificarTokenMedia, resolverMedia,
│   │                               # enviarMediaSaliente, reintentarIngesta, clasificarTexto
│   ├── media.controller.ts         # getMediaController, retryMediaController
│   ├── media.routes.ts             # GET /:id · POST /:id/reintentar
│   ├── media.service.test.ts
│   └── media.routes.test.ts        # ← test de aislamiento multi-tenant
├── workers/
│   ├── media-ingest.processor.ts   # processMediaIngestJob({ tenantId, messageId })
│   └── media-ingest.processor.test.ts
└── scripts/
    └── migrate-message-tipo.ts     # migración idempotente del enum a español

apps/frontend/src/
├── components/ui/aspect-ratio.tsx  # pnpm dlx shadcn@3.8.5 add aspect-ratio
└── features/inbox/
    ├── lib/media.ts                # LIMITES_BYTES, MIMES_ACEPTADOS, validarArchivo,
    │                               # formatearBytes, iconoPorMime, dominioDe
    └── components/
        ├── MessageBubble.tsx       # extraído del .map() de ConversationThread
        ├── MessageMedia.tsx        # dispatcher por tipo + estados pendiente/fallida
        ├── ImageMessage.tsx
        ├── VideoMessage.tsx
        ├── DocumentMessage.tsx
        ├── LinkPreviewCard.tsx
        ├── MediaLightbox.tsx       # sobre el dialog ya vendorizado
        ├── AttachmentPreview.tsx   # previsualización + progreso en el composer
        └── {MessageBubble,MessageMedia,AttachmentPreview}.test.tsx
```

> **`features/media/` no lleva `model.ts`**, y es deliberado: la metadata de media vive en
> `Message`, igual que `features/conversation/` proyecta sobre `Cliente` sin colección propia. Es la
> única desviación del patrón de 6 archivos de `apps/backend/CLAUDE.md`.

## Archivos a tocar

**Backend** — `config/env.ts` · `config/queues.ts` · `worker.ts` · `app.ts` ·
`features/message/{message.types,message.model,message.service}.ts` ·
`features/webhook/webhook.types.ts` ·
`integrations/meta/{meta-whatsapp.normalizer,meta-whatsapp.client}.ts` ·
`workers/{inbound-message.processor,ai-reply.processor}.ts` ·
`features/flow/flow.runtime.service.ts` ·
`features/conversation/{conversation.types,conversation.mapper,conversation.service,conversation.controller,conversation.routes,conversation.validation}.ts` ·
`realtime/{realtime.types,realtime.publisher}.ts` · `seed/seed-inbox-demo.ts` ·
`features/campaign/campaign.service.ts` (consulta por `tipo: 'template'`) · `package.json`.

**Frontend** — `features/inbox/{ConversationThread,MessageComposer}.tsx` ·
`features/inbox/{api.ts,types.ts}` · `features/inbox/hooks/{useThread,useInboxRealtime}.ts` ·
`features/inbox/pages/InboxPage.tsx`.

**Dependencias nuevas** — backend: `multer@^2`, `@types/multer`, `@aws-sdk/client-s3`,
`@aws-sdk/s3-request-presigner`. Frontend: ninguna (el lightbox va sobre `dialog` y la barra sobre
`progress`, ambos ya vendorizados).

---

## Contratos

### 1. Enum `tipo` en español — `message.types.ts`

```ts
export type TipoMensaje =
  | 'texto' | 'enlace' | 'imagen' | 'video' | 'audio'
  | 'documento' | 'sticker' | 'plantilla' | 'otro';

/** Un `enlace` ES un mensaje con texto. Único sitio donde se decide. Ver Riesgo #1. */
export const TIPOS_CON_TEXTO: readonly TipoMensaje[] = ['texto', 'enlace'];
export function esTipoConTexto(tipo: TipoMensaje): boolean;

/** Tipos de la Cloud API → dominio. Sustituye a los DOS mapMsgType duplicados. */
export const TIPO_POR_TIPO_META: Record<string, TipoMensaje>;
```

> **Alternativa considerada: no tener `'enlace'` como `tipo`.** Un enlace es un mensaje de texto que
> contiene una URL; detectarlo en render con una función pura de cuatro líneas funciona
> **retroactivamente sobre todo el histórico**, no necesita campo, ni migración, ni recálculo cuando
> se afine la heurística — y elimina de raíz el Riesgo #1. Se mantiene `'enlace'` porque es lo que
> pide la historia de forma explícita y es la opción que se aprobó al planear. Si durante la
> implementación el coste de `esTipoConTexto()` se revela mayor de lo previsto, esta es la salida
> barata y hay que plantearla antes de seguir, no después.

Mapa de migración (`scripts/migrate-message-tipo.ts`): `text→texto`, `image→imagen`,
`document→documento`, `template→plantilla`, `other→otro`; `audio` no cambia. `video` y `sticker`
**no tienen origen legacy** (antes caían en `other`) y no se intenta recuperarlos: el payload
original no está guardado. Un `updateMany` por par **sobre `Message.collection`, no sobre el
modelo** —el schema ya no conoce `text`, así que un `updateMany` de Mongoose castearía y no haría
nada; mismo truco que `migrate-cliente-tags.ts`—, sin `tenantId` porque es mantenimiento
cross-tenant fuera del camino HTTP, igual que los cuatro `migrate-*` que ya existen. **No
reclasifica el histórico a `enlace`**: solo se clasifican los mensajes nuevos, porque reinterpretar
mensajes ya entregados no aporta nada y multiplica el riesgo.

Además, `toMessageResponse` aplica `normalizarTipoMensaje(msg.tipo)` **de forma permanente**:
`.lean()` no valida contra el enum, así que un documento heredado que se escape de la migración
—una réplica, un backup restaurado— se renderiza bien en vez de llegar como `"text"` al frontend.

#### Orden de despliegue: expand → migrate → contract

| Paso | Qué se despliega | Enum en el modelo |
|---|---|---|
| **1. Expand** | Backend que **escribe solo español** y **lee ambos** (`normalizarTipoMensaje` en el mapper, `$in` en campañas) | 14 valores (8 nuevos + 6 legacy) |
| **2. Migrate** | `migrate:tipo-mensaje --dry-run`, revisar el conteo, correr en real | — |
| **3. Frontend** | Frontend que entiende los valores nuevos | — |
| **4. Contract** | PR posterior: el enum baja a los valores definitivos y el `$in` vuelve a valor único | 9 valores |

> **El paso que no se puede saltar es el `$in` de campañas** (`campaign.service.ts:102`, hoy
> `{ tipo: 'template' }` literal). Ese `aggregateScoped` mide el consumo del tier de Meta en las 24 h
> rodantes. Si el enum cambia y la migración aún no ha corrido —o corre tres minutos después—, la
> agregación devuelve 0, el pacing cree que hay cupo entero y la campaña se pasa del tier del número.
> Es el único punto de esta HU donde un desfase de minutos tiene consecuencia **externa e
> irreversible**: Meta no devuelve un error, rechaza mensajes y baja la calidad de la WABA. En fase
> expand va `{ tipo: { $in: ['plantilla', 'template'] } }`.

### 2. `IMediaStorage` — `integrations/storage/storage.types.ts`

```ts
export interface IObjetoAlmacenado { key: string; tamanoBytes: number; mimeType: string; }
export interface IArchivoLeido { stream: Readable; tamanoBytes: number; mimeType: string; }

export interface IMediaStorage {
  guardar(key: string, contenido: Buffer, mimeType: string): Promise<IObjetoAlmacenado>;
  leer(key: string): Promise<IArchivoLeido>;
  /** `null` si el adaptador no sabe firmar (disco local): el caller hace stream. */
  urlFirmada(key: string, segundos: number): Promise<string | null>;
  eliminar(key: string): Promise<void>;
}
export function getMediaStorage(): IMediaStorage;   // singleton según env.MEDIA_DRIVER
```

Forma de la clave: `<tenantId>/<messageId>/<uuid>.<ext>`. **El `tenantId` va primero a propósito**:
aunque el aislamiento real lo da `findByIdScoped`, un prefijo por tenant hace que una fuga sea
visible en el bucket y permite borrar por tenant de un solo barrido.

Tres detalles de los adaptadores que no son opcionales:

- **`spaces`: `ACL: 'private'` explícito** en cada `PutObjectCommand`. Un `public-read` por descuido
  es una fuga de datos entre tenants inmediata y silenciosa. Va escrito también en el ADR 0008.
- **`local`: guarda de path traversal.** `const abs = path.resolve(base, key); if
  (!abs.startsWith(base + path.sep)) throw new AppError('Clave inválida.', 400);` antes de tocar el
  disco.
- **La clave se persiste siempre en POSIX (`/`)**; solo `path.resolve` la traduce al leer. El
  desarrollo es en Windows y el despliegue en Linux: una clave con `\` guardada desde un portátil
  rompe el mismo objeto en el droplet.
- `getMediaStorage()` es un **singleton perezoso**. Construir el `S3Client` al importar el módulo
  rompería los tests, que corren con `MEDIA_DRIVER=local`.

### 3. Env nuevas — `config/env.ts`

```
MEDIA_DRIVER=local|spaces           # default 'local'
MEDIA_LOCAL_DIR=./var/media         # solo driver 'local'  (añadir a .gitignore)
MEDIA_URL_SECRET=<64 hex>           # HMAC de las URLs firmadas — requiredInRuntime
MEDIA_URL_TTL_S=3600                # vida del token de la URL que se pinta en el hilo
MEDIA_SIGNED_URL_TTL_S=300          # vida de la URL prefirmada de Spaces
MEDIA_MAX_BYTES_IMAGEN=5242880      # 5 MB    ─┐
MEDIA_MAX_BYTES_VIDEO=16777216      # 16 MB    │ límites reales de la Cloud API
MEDIA_MAX_BYTES_AUDIO=16777216      # 16 MB    │ (defaults, no una configuración a subir)
MEDIA_MAX_BYTES_DOCUMENTO=104857600 # 100 MB  ─┘
MEDIA_INGEST_ENABLED=on|off         # kill-switch de la descarga de entrantes
SPACES_ENDPOINT= / SPACES_REGION= / SPACES_BUCKET= / SPACES_KEY= / SPACES_SECRET=
```

`MEDIA_INGEST_ENABLED` es un **enum `'on'|'off'`, no un booleano**, por la misma razón que
`SEMAFORO_AUTO` y `EXTRACT_AUTO`: `z.coerce.boolean()` convierte la cadena `"false"` en `true`, que
es exactamente el fallo que un kill-switch no se puede permitir.

**Techo efectivo por archivo = `min(límite de Meta, MEDIA_MAX_BYTES_*)`.** Conviene mantener el
documento por debajo de los 100 MB nominales de Meta mientras el multipart sea `memoryStorage()`:
100 MB × N subidas concurrentes es un OOM esperando. Subir al límite real de Meta exige
`diskStorage` a un temporal y stream al almacenamiento, y eso se planifica aparte.

Validación condicional con `superRefine`: si `MEDIA_DRIVER === 'spaces'`, las cinco `SPACES_*` pasan
a obligatorias y el proceso **aborta al arrancar** si falta alguna. Mismo criterio que `JWT_SECRET`:
sin fallback inseguro.

### 4. `Message` extendido — `message.types.ts` / `message.model.ts`

```ts
export type EstadoMedia = 'pendiente' | 'disponible' | 'fallida';

export interface IMensajeMedia {
  mediaId?: string;          // id de Meta (inbound). Expira; solo trazabilidad y reintento.
  storageKey?: string;       // clave en nuestro almacenamiento (ausente mientras 'pendiente')
  mimeType: string;
  nombreArchivo?: string;    // documentos
  tamanoBytes?: number;
  sha256?: string;
  duracionSegundos?: number; // audio/video, si Meta lo informa
  estado: EstadoMedia;
  intentos: number;          // default 0
  error?: string;            // motivo del fallo definitivo, para la UI y el soporte
}
export interface IPreviewEnlace { url: string; dominio: string; }
```

`IMessage` gana `media?: IMensajeMedia` y `previewEnlace?: IPreviewEnlace`; el `caption` de Meta se
guarda en el `texto` que ya existe. **`attachmentUrl` se retira**: hoy solo lo escribe el seed y
mantenerlo sería un segundo camino para lo mismo.

Índices: se conservan los tres actuales y se añade `{ tenantId: 1, 'media.estado': 1 }` **parcial**
sobre `{ 'media.estado': 'pendiente' }`, para poder barrer media atascada sin escanear la colección.

> El modelo guarda `storageKey`, **nunca una URL**. Una URL persistida caduca o filtra el bucket; la
> del DTO se deriva y se firma en cada lectura.

### 5. Webhook y normalizador — `webhook.types.ts` / `meta-whatsapp.normalizer.ts`

```ts
export interface IWhatsAppMedia {
  id: string; mime_type: string; sha256?: string;
  caption?: string;     // image, video, document
  filename?: string;    // solo document
  animated?: boolean;   // solo sticker
}
export interface IWhatsAppMessage {
  from: string; id: string; timestamp: string;
  type: 'text' | 'image' | 'video' | 'audio' | 'document' | 'sticker' | 'other';
  text?: { body: string };
  image?: IWhatsAppMedia; video?: IWhatsAppMedia; audio?: IWhatsAppMedia;
  document?: IWhatsAppMedia; sticker?: IWhatsAppMedia;
}
```

`parseInboundEvents(value, clienteId, tenantId)` —hoy **código muerto**, nadie lo importa— se
extiende para poblar `tipo`, `texto` (body o caption), `media` y `previewEnlace`, e
`inbound-message.processor.ts` **pasa a consumirlo**, borrando su `mapMsgType` privado. Dejar dos
mapas de tipos que hay que mantener sincronizados a mano es justo lo que esta HU no puede permitirse.

### 6. Cola `media-ingest` — `config/queues.ts` + `workers/media-ingest.processor.ts`

```ts
export const MEDIA_INGEST_QUEUE_NAME = 'media-ingest';
export const MEDIA_INGEST_JOB = 'descargar';
export const mediaIngestQueue = new Queue(MEDIA_INGEST_QUEUE_NAME, { connection });

export interface MediaIngestJobData { tenantId: string; messageId: string; }
export function mediaIngestJobId(tenantId: string, messageId: string): string;
export async function processMediaIngestJob(data: MediaIngestJobData): Promise<void>;
```

Opciones del job: `{ jobId: mediaIngestJobId(...), attempts: 3, backoff: { type: 'exponential', delay: 2000 }, removeOnComplete: 1000, removeOnFail: 5000 }`.

> **Sin `:` en el `jobId`.** BullMQ rechaza un id custom que los contenga (`Custom Id cannot
> contain :`). Fue el defecto de `HT-AI-02`, que dejó el auto-reply sin encolar jamás mientras la
> suite entera pasaba en verde. El id es `media-<tenantId>-<messageId>`.

**Por qué una cola aparte y no inline en `processInboundJob`:** `inboundQueue` corre con
`attempts: 5`. Si la descarga de un video de 16 MB falla, BullMQ reintentaría **toda** la ingesta
—upsert del cliente, guardado del mensaje, disparo de la IA— por un fallo que no está ahí. La
persistencia del mensaje tiene que sobrevivir a la descarga.

Secuencia del processor: `findByIdScoped(Message, tenantId, messageId)` → si ya está `disponible`,
no-op (idempotencia) → `getIntegrationWithToken` → `metaMediaClient.descargar(mediaId)` → guard de
tamaño contra el límite del tipo → `storage.guardar` → `findOneAndUpdateScoped` a `disponible` con
`storageKey`/`tamanoBytes` → `publishRealtime({ type: 'message:updated', … })`. Al agotar los
intentos: `estado: 'fallida'` + `error`, y **se publica igual** — el hilo tiene que enterarse del
fallo, no quedarse girando.

### 7. Cliente de media de Meta — `integrations/meta/meta-media.client.ts`

```ts
export interface IMetaMediaClient {
  /** GET /{mediaId} → { url } que CADUCA EN 5 MINUTOS → GET de esa url con Bearer. */
  descargar(mediaId: string, accessToken: string):
    Promise<{ buffer: Buffer; mimeType: string; tamanoBytes: number }>;
  /** POST /{phoneNumberId}/media (multipart, messaging_product=whatsapp) → { id }. */
  subir(contenido: Buffer, mimeType: string, nombreArchivo: string,
        phoneNumberId: string, accessToken: string): Promise<{ mediaId: string }>;
}
export const metaMediaClient: IMetaMediaClient;
```

Mismo trato de errores que `meta-whatsapp.client.ts`: reintento solo en `429` con backoff
exponencial, cualquier otro no-OK → `AppError(…, 502)`. Un `404` en la descarga se traduce a un
error específico de **media expirada**, que el processor marca como fallo definitivo sin gastar los
tres intentos: un Media ID caducado no se arregla repitiendo.

### 8. Envío outbound — `ContenidoOutbound` + `meta-whatsapp.client.ts`

```ts
export type TipoMediaSaliente = 'imagen' | 'video' | 'documento';

export type ContenidoOutbound =
  | { modo: 'auto'; texto: string; plantillaFallback?: { templateId: string; parametros: string[] } }
  | { modo: 'texto'; texto: string }
  | { modo: 'plantilla'; templateId: string; parametros: string[] }
  | { modo: 'media'; tipo: TipoMediaSaliente; mediaId: string; storageKey: string;
      mimeType: string; tamanoBytes: number; nombreArchivo?: string; caption?: string };
```

En `sendOutbound`, `modo: 'media'` cae del **mismo lado que `'texto'`**: fuera de ventana lanza el
mismo `AppError(FUERA_DE_VENTANA, 422)`. Meta no acepta media libre fuera de ventana, y la única
alternativa —plantilla con header multimedia— está declarada fuera de alcance.

`metaWhatsAppClient` gana `sendMedia(to, tipo, mediaId, phoneNumberId, accessToken, opts)` →
`{ messaging_product: 'whatsapp', to, type: 'image'|'video'|'document', image: { id, caption } }`.
Y `sendText` pasa a enviar `text: { body, preview_url: true }`, que es lo que hace que WhatsApp
renderice la tarjeta rica del enlace **en el teléfono del cliente** (criterio 8 del `spec`).

**Orden de operaciones en `enviarMediaSaliente`, y por qué:** validar → `storage.guardar` →
`metaMediaClient.subir` → `sendOutbound`. **El almacenamiento va antes que Meta, no al revés.** Si
Meta va primero y el almacenamiento falla, el cliente ya recibió un archivo que nuestra propia
bandeja no puede mostrar: una inconsistencia visible e irreversible. Al revés, el peor caso es un
objeto huérfano, y el `catch` lo limpia con un `storage.eliminar(key)` best-effort antes de
re-lanzar.

**`multer` necesita un traductor de errores.** Un `MulterError` (`LIMIT_FILE_SIZE`, típicamente) no
es `AppError` ni `ZodError`, así que el `errorHandler` central lo despacha como **`500` opaco** — y
es la ruta de fallo más frecuente en producción, porque es lo que pasa cada vez que alguien adjunta
algo demasiado grande. Hace falta `src/middlewares/upload.middleware.ts` que envuelva
`upload.single('archivo')` y traduzca a `AppError(…, 413)` con un mensaje en español. Es la **única
excepción admitida** a la cadena fija de middlewares, y va entre `authorize` y `validate` porque
`validate` necesita `req.body` ya poblado con los campos del multipart.

Restricciones de Meta que conviene dejar escritas, porque producen rechazos opacos: `video/mp4` debe
ser H.264 + AAC con una sola pista de audio; `audio/ogg` solo Opus mono; el `caption` **solo lo
aceptan `image`, `video` y `document`** (mandarlo en audio o sticker devuelve 400, así que se
descarta en silencio); `filename` solo aplica a `document`; caption máximo 1024 caracteres.

### 9. Endpoints

```
POST /api/conversations/:id/messages/media     → 201 IMessageResponse
  authenticateJWT, requireTenant, authorize(['admin']),
  subidaMedia.single('archivo'),               # multer ANTES de validate: los campos del
  validate(sendMediaSchema),                   # body llegan dentro del multipart
  asyncHandler(sendMediaController)
  body: { caption?: string (máx. 1024) }   ·   file: archivo

GET  /api/media/:id?t=<token>[&descargar=1]    → 302 (spaces) | 200 stream (local)
  validate(getMediaSchema), asyncHandler(getMediaController)     # SIN authenticateJWT

POST /api/media/:id/reintentar                 → 202 { estado: 'pendiente' }
  authenticateJWT, requireTenant, authorize(['admin']),
  validate(retryMediaSchema), asyncHandler(retryMediaController)
```

Montaje en `app.ts`: `app.use('/api/media', mediaRoutes);` dentro del bloque tenant-aware.

**`GET /api/media/:id` no lleva `authenticateJWT`, y es la parte del diseño que hay que entender
bien.** El JWT viaja en cookie `httpOnly`; en producción el frontend está en Vercel y el API en el
droplet, así que un `<img src="https://api…/media/x">` es una petición **cross-site** y la cookie no
viaja con `SameSite=lax`. La autorización de esta ruta **es el HMAC de la URL** — que es,
literalmente, la "URL firmada de acceso" que pide la historia:

```ts
firmarUrlMedia(tenantId, messageId): string                  // HMAC-SHA256(`${tenantId}.${messageId}.${exp}`)
verificarTokenMedia(token, messageId): { tenantId: string }  // AppError 403 si no cuadra o venció
```

El `tenantId` sale del token firmado, se verifica con `timingSafeEqual`, y **el lookup sigue siendo
`findByIdScoped(Message, tenantId, id)`**: ahí está el aislamiento, no en el token. Es la **tercera
excepción documentada** a "el `tenantId` nace del token", junto al `login` y el webhook de Meta —y
la más benigna de las tres, porque aquí el tenant sí nace de un token, solo que no del JWT. Va
anotada en `docs/multi-tenancy.md` y en el ADR 0008.

`csrfGuard` ya exime los métodos seguros, así que el `GET` pasa sin tocarlo; el `POST` multipart
lleva `X-CSRF-Token` en la cabecera, que el `apiClient` añade con independencia del tipo de cuerpo.

**Endurecimiento de la respuesta — no es decorativo.** Un `.svg` o un `.html` subido por un cliente
y servido `inline` desde nuestro propio origen es **XSS almacenado con la cookie de sesión al
alcance**. Tres defensas, las tres obligatorias:

- `svg` y `html` **fuera de la lista blanca de mimes**, en la subida y en la ingesta.
- `X-Content-Type-Options: nosniff` en toda respuesta de media.
- `Content-Disposition: attachment` por defecto para `tipo === 'documento'`; `inline` solo para
  imagen y video.

Y `Cache-Control: private, max-age=300`: sin el `private`, un proxy compartido puede cachear la
media de un tenant y servírsela a otro.

> El adaptador `local` **no implementa `Range`**, así que en desarrollo no se puede buscar dentro de
> un video (Spaces sí lo soporta sobre una URL prefirmada, luego en producción funciona). Es
> cosmético y está documentado aquí para que no se diagnostique como bug; implementarlo son ~15
> líneas en el controller si molesta.

El orden importa: **el almacenamiento se toca después del `findByIdScoped`, jamás antes.** El test
de aislamiento lo verifica espiando el adaptador — que no se invoque es lo que prueba que el corte
ocurre antes de llegar al objeto.

### 10. DTO del hilo — `conversation.types.ts` / `conversation.mapper.ts`

```ts
export interface IMediaResponse {
  urlArchivo: string | null;      // '/media/<id>?t=<token>' — null mientras no esté disponible
  mimeType: string;
  nombreArchivo: string | null;
  tamanoBytes: number | null;
  estado: EstadoMedia;
  error: string | null;
}
export interface IMessageResponse {
  id: string; direccion: Direccion; sender: Sender; tipo: TipoMensaje;
  texto: string | null;
  media: IMediaResponse | null;            // reemplaza a attachmentUrl
  previewEnlace: IPreviewEnlace | null;
  status: MessageStatus; createdAt: string;
}
```

`toMessageResponse` firma la URL en cada lectura. El preview de la lista de conversaciones amplía
sus etiquetas con `🎥 Video` y `🔗 Enlace`, junto a las cuatro que ya existen.

### 11. Tiempo real — `realtime.types.ts`

```ts
| { type: 'message:updated'; tenantId: string; conversationId: string; message: IMessageResponse }
```

Se emite a `tenant:<tenantId>` como el resto. En `useInboxRealtime` **se escribe en la caché** con
`qc.setQueryData(['thread', id], …)` en vez de invalidar: una ráfaga de diez fotos dispararía diez
refetches del hilo completo. Es la misma decisión que ya tomó `useCampaignRealtime`.

### 12. Frontend — composer y renderizado

- `MessageComposer` pasa de `onSend(texto)` a `onSend(texto)` + `onEnviarMedia(archivo, caption)`,
  con `<input type="file">` oculto disparado por un botón `Paperclip` y zona de arrastrar y soltar
  sobre el hilo (`onDragOver`/`onDrop` con overlay de destino).
- `enviarMedia` en `api.ts`: `FormData` + `{ timeout: 120_000, onUploadProgress }`. **El
  `timeout: 10000` global del `apiClient` no sirve para subir 100 MB**; el override por llamada ya
  tiene precedente en `TIMEOUT_IA_MS`. **No fijar `Content-Type` a mano**: el navegador tiene que
  poner el `boundary` del multipart.
- **La miniatura del adjunto usa `URL.createObjectURL`, y exige `revokeObjectURL` en el cleanup del
  efecto.** Sin eso, cada archivo adjuntado y descartado es una fuga de memoria que sobrevive al
  desmontaje del componente.
- **`onUploadProgress` termina cuando el archivo llega a nuestro backend, no cuando Meta lo acepta.**
  Si no se maneja, la barra se queda clavada en 100 % varios segundos y parece colgada: al llegar a
  100 se cambia a un estado "Enviando a WhatsApp…".
- Con la ventana de 24 h cerrada, **el botón de adjuntar también se deshabilita**. Si no, el asesor
  sube 8 MB para recibir un 422.
- La zona de arrastrar y soltar es **solo el composer, no el hilo entero**: soltar un archivo sobre
  un mensaje no debe enviar nada. Hace falta un contador de profundidad para que el `dragleave` de un
  hijo no apague el estado.
- Imagen y video necesitan una variante de burbuja **sin padding** (`p-0 overflow-hidden`): la
  burbuja actual tiene `px-3.5 py-2` y la foto quedaría con un marco raro. Va como variante de
  `MessageBubble`, no parcheado desde el renderer.
- `lib/media.ts` concentra límites, mimes aceptados, `validarArchivo` (devuelve el motivo en
  español, listo para el toast) y los formateadores. Mapas y etiquetas fuera de los componentes,
  como en `features/campaigns/lib/pacing.ts`.
- **Antes de escribir un solo componente** hay que invocar `emil-design-eng`,
  `impeccable:impeccable` y `frontend-design:frontend-design` (regla §7 del `CLAUDE.md` raíz) y
  aplicar lo que dicten. Todo queda terminado en light **y** dark con tokens semánticos, cero
  `bg-[#...]`, y con `aspect-ratio` para que la llegada de una imagen no haga saltar el scroll del
  hilo.

---

## Notas

- **Riesgo #1 — `enlace` es texto.** Hoy `atenderConSofi`, `acusarNoTexto` y el runtime de flujos
  preguntan `tipo !== 'text'` para decidir si Sofi puede leer el mensaje. Si `enlace` cae del lado
  "no texto", mandar un link dispara el acuse "solo entiendo texto": una regresión visible para el
  cliente final. Por eso existe `esTipoConTexto()` y **todos** esos sitios pasan por él, con un test
  por cada uno.
- **Riesgo #2 — orden de despliegue.** La validación de enum de Mongoose solo actúa en escritura, no
  en lectura: un documento con `tipo: 'image'` se lee sin error y el frontend no sabría pintarlo. El
  script de migración **corre antes** de que el código nuevo atienda tráfico, y es idempotente para
  poder repetirlo sin miedo.
- **Riesgo #3 — tamaño del feature.** Toca el enum de un modelo central, estrena una capa de
  infraestructura, añade una cola y reescribe el hilo y el composer. El paso 1 de `tasks.md`
  (migración del enum) es separable en su propio PR, y es recomendable si el equipo prefiere lotes
  pequeños. Queda dicho aquí para que sea una decisión consciente y no un descubrimiento a mitad de
  camino.
- Subir un documento de 100 MB ocupa un worker de Express durante toda la petición, con el archivo
  **en memoria** (`multer.memoryStorage()`). Es aceptable para el MVP —un asesor, un archivo a la
  vez— y la alternativa (subida en dos fases sobre la cola `outbound-send`, hoy un placeholder en
  `worker.ts`) queda anotada como el siguiente paso natural si el uso lo pide.
- **El seed de demo revienta la demo si se olvida.** `seed-inbox-demo.ts` siembra
  `attachmentUrl: 'https://demo.invalid/media/…'` en tres mensajes (comprobante, nota de voz,
  documento de identidad). Hoy eso se renderiza como texto en cursiva; **con los renderers nuevos se
  convierte en tres `<img>`/`<video>` rotos**. Hay que migrarlo a `media: { estado: 'fallida', error:
  'Demo sin archivo real' }` o sembrar archivos de verdad dentro de `MEDIA_LOCAL_DIR`.
- `attachmentUrl` se retira del schema, pero `toMessageResponse` puede seguir rellenando el campo del
  DTO con `media.url ?? legado` durante una versión, para no romper documentos antiguos de un tirón.
- **Sin cuota de almacenamiento.** `HU-SAAS-02` mide `mensajesMes` y `campanasMes`, nada de MB: un
  tenant puede llenar el bucket sin límite ni coste imputado. Declarado como deuda en el `spec`.
- `MEDIA_LOCAL_DIR` (`./var/media`) tiene que entrar en `.gitignore`, y en los tests conviene
  apuntarlo a `os.tmpdir()` con limpieza en `afterAll` o los archivos de test se pisan entre sí.
- De paso se corrige en `docs/api-contract.md` la ruta del webhook, que documenta
  `/api/webhooks/meta` mientras el código monta `/api/webhooks/whatsapp`.

## Verificación

- `pnpm --filter @sofiapp/api typecheck` · `pnpm --filter @sofiapp/api test`
- `pnpm --filter @sofiapp/web build` · `pnpm --filter @sofiapp/web lint`

> **Los filtros que documenta el repo están mal.** `pnpm --filter backend` no matchea ningún
> proyecto: los paquetes se llaman `@sofiapp/api` y `@sofiapp/web`. Se corrige en `CLAUDE.md` y en
> los comandos de calidad como parte de este feature.
