# HT-WA-04 — Plan técnico (CÓMO)

> Rama: `feat/HT-WA-04` (creada desde `develop` @ `8a0b347`). Reglas que manda: `CLAUDE.md` raíz
> (multi-tenancy, `tenantId` del token, controllers delgados, Zod en el borde, webhooks 200 + BullMQ),
> `apps/backend/CLAUDE.md` (6 archivos + montaje), `apps/frontend/CLAUDE.md` (shadcn, tokens, light/dark).

## Decisiones clave

1. **No se renombra el modelo.** La historia describe `Template { nombre, categoría, idioma,
   estadoAprobación, componentes: { header: {…} } }`. El modelo real (`WhatsAppTemplate`, `HT-WA-02`)
   es un **espejo de Meta** con sus nombres (`name`, `language`, `category`, `status`, `components[]`)
   y lo consumen campañas, flujos y el front. Se **amplía** sin romperlo:

   | Historia | Modelo real |
   |---|---|
   | `nombre`, `categoría`, `idioma` | `name`, `category`, `language` (sin cambios) |
   | `estadoAprobación` | `status` (sin cambios) |
   | `motivoRechazo` | **nuevo** `motivoRechazo: string \| null` |
   | `metaTemplateId` | `metaTemplateId` (sin cambios) |
   | `componentes.header.formato` | `components[HEADER].format` (derivado por `formatoCabecera`) |
   | `componentes.header.headerHandle` | `components[HEADER].example.header_handle[0]` (forma de Meta) |
   | `componentes.header.{urlArchivo, mimeType, tamañoBytes}` | **nuevo** `imagenPorDefecto` |
   | `componentes.cuerpo / pie / botones` | `components[BODY / FOOTER / BUTTONS]` |
   | `variablesEjemplo` | `components[BODY].example.body_text[0]` |

2. **`Campaign.imagenHeader` ya existe** como `Campaign.contenido.imagen` (`HU-MARK-03`:
   `mediaKey`, `mimeType`, `tamanoBytes`, `metaMediaId`, `subidaMetaAt`). No se duplica; se añade
   solo `metaPhoneNumberId` a la caché (ver 5). «Vacío = usar la imagen por defecto» pasa a ser la
   regla.

3. **La subida a Meta se hace en `POST /templates/media`, no en `POST /templates`.** Así el error
   «Meta no acepta esta imagen» aparece al soltar la imagen (con su barra de progreso), no al final
   del formulario. La respuesta trae `imagenRef` (clave de almacenamiento) + `headerHandle`; el alta
   los recibe y el servicio **revalida** que `imagenRef` empieza por `<tenantId>/templates/` y existe.

4. **Imagen de reemplazo de campaña por referencia; de conversación en la misma petición.**
   - Campañas: `POST /campaigns/media` → `imagenRef` (`<tenantId>/campaigns/borradores/<uuid>.<ext>`)
     que `POST /campaigns` acepta en JSON. El programador conserva su multipart de `HU-MARK-03`.
   - Conversación: `POST /messages/template` admite multipart con el archivo `imagenHeader`
     (mismo patrón `crearSubidaUnica`); un cuerpo JSON sigue funcionando igual que en `HT-WA-02`.

5. **Una sola función para «tener esta imagen subida a Meta».** Hoy `prepararImagenCabecera`
   (campañas) hace la subida + caché + renovación a 25 días. Se extrae a
   `features/media/media-meta-cache.ts → asegurarMediaEnMeta()`, y la usan la imagen de campaña, la
   imagen por defecto de la plantilla y el envío desde conversación. La caché guarda el
   `phoneNumberId` con el que se subió: si el tenant cambia de número, el id viejo no sirve y se resube.

6. **Webhook: bifurcar por `change.field`.** `webhook.controller.ts` hoy lee
   `change.value.metadata.phone_number_id` sin mirar el campo; un evento de plantilla (sin `metadata`)
   lanza y corta el resto del lote. Se separa: `messages` → flujo actual por `phone_number_id`;
   `message_template_status_update` → tenant(s) por `wabaId` → job `template-status` en BullMQ.
   Se registra como **ADR 0013** (extensión de la excepción del webhook, regla 2).

7. **Barrido de respaldo como el de campañas.** Job repetible cada 30 min que busca tenants con
   plantillas `PENDING` (lectura cross-tenant documentada en `docs/multi-tenancy.md` §5, misma forma
   que `campaign-broadcast.processor.ts:224`) y, por tenant, sincroniza con funciones scoped.

## Archivos a crear / tocar

```
apps/backend/src/
├── config/
│   ├── env.ts                                   # META_APP_ID → requiredInRuntime; TEMPLATE_SWEEP_MINUTES
│   └── queues.ts                                # TEMPLATE_STATUS_JOB, TEMPLATE_SWEEP_JOB + scheduler id
├── integrations/meta/
│   ├── meta-resumable-upload.client.ts          # NUEVO: POST /{app-id}/uploads + POST /{session} → h
│   ├── meta-resumable-upload.client.test.ts     # NUEVO
│   ├── meta-template.client.ts                  # create con HEADER/FOOTER; getById; fields con rejected_reason
│   ├── meta-template.client.test.ts             # + casos
│   └── meta-template.errors.ts                  # NUEVO: traducción de errores de Meta → AppError
├── integrations/storage/index.ts                # construirTemplateMediaKey, construirBorradorCampaignMediaKey,
│                                                #   perteneceAlTenant(key, tenantId, carpeta)
├── features/media/
│   ├── media-imagen.validation.ts               # NUEVO: validarImagenCabecera(buffer) → JPEG/PNG por magic bytes
│   ├── media-meta-cache.ts                      # NUEVO: asegurarMediaEnMeta() (extraído de campaign.service)
│   ├── media-meta-cache.test.ts                 # NUEVO
│   └── media.routes.ts / media.controller.ts    # GET firmado de la imagen por defecto de una plantilla
├── features/whatsapp-template/
│   ├── whatsapp-template.types.ts               # imagenPorDefecto, motivoRechazo, DTOs nuevos
│   ├── whatsapp-template.model.ts               # campos nuevos + example.header_handle
│   ├── whatsapp-template.validation.ts          # createTemplateSchema extendido, templateIdSchema
│   ├── whatsapp-template.service.ts             # subirImagenMuestra, createTemplate(+imagen), getTemplate,
│   │                                            #   syncTemplate(id), aplicarEventoEstado, resolverImagenEnvio
│   ├── whatsapp-template.status.ts              # NUEVO: mapeo evento/razón de Meta → estado + motivo legible
│   ├── whatsapp-template.controller.ts          # media, getById, syncOne
│   ├── whatsapp-template.routes.ts              # POST /media, GET /:id, POST /:id/sync
│   ├── whatsapp-template.image.test.ts          # NUEVO: alta con imagen, validaciones, errores de Meta
│   ├── whatsapp-template.status.test.ts         # NUEVO: eventos, sync uno, barrido
│   └── whatsapp-template.isolation.test.ts      # + casos de imagen y de evento por WABA
├── features/webhook/
│   ├── webhook.types.ts                         # IWebhookChange discriminado por field
│   ├── webhook.service.ts                       # resolveTenantsByWaba, enqueueTemplateStatusJob
│   ├── webhook.controller.ts                    # bifurcación por change.field (try por cambio)
│   └── webhook.routes.test.ts                   # + lote mixto, cambio sin metadata
├── features/channel/channel.model.ts            # índice { wabaId: 1 }
├── features/campaign/
│   ├── campaign.types.ts / .model.ts            # contenido.imagen.metaPhoneNumberId
│   ├── campaign.validation.ts                   # createCampaignSchema.imagenRef; schedule sin imagen obligatoria
│   ├── campaign.service.ts                      # subirImagenReemplazo, resolución reemplazo→defecto, usa asegurarMediaEnMeta
│   ├── campaign.controller.ts / .routes.ts      # POST /campaigns/media (antes de /:id)
│   └── campaign.image-default.test.ts           # NUEVO: dos campañas, misma plantilla, imágenes distintas
├── features/message/
│   ├── message.validation.ts                    # sendTemplateSchema tolera multipart (parametros como JSON)
│   ├── message.routes.ts                        # subirImagenCabecera entre authorize y validate
│   ├── message.service.ts                       # sendTemplate con imagen resuelta; Message.media con la imagen
│   └── message.template-image.test.ts           # NUEVO
├── middlewares/upload.middleware.ts             # subirImagenCabecera (= reglas de subirImagenCampana)
├── realtime/realtime.types.ts                   # evento 'template:status'
├── workers/template-status.processor.ts         # NUEVO: aplica evento / barrido
├── workers/template-status.processor.test.ts    # NUEVO
└── worker.ts                                    # despacha TEMPLATE_STATUS_JOB y TEMPLATE_SWEEP_JOB

apps/frontend/src/
├── api/whatsapp-templates.ts                    # uploadTemplateImage (onUploadProgress), getTemplate, syncTemplate
├── components/media/ImageDropzone.tsx           # MOVIDO desde features/campaigns (re-export temporal en el origen)
├── components/media/UploadProgress.tsx          # NUEVO: barra (shadcn Progress) + estado de la subida
├── features/whatsapp-templates/
│   ├── types/{api,domain}.ts                    # imagenPorDefecto, motivoRechazo, cabecera, TemplateStatusEvent
│   ├── components/CreateTemplateDialog.tsx      # tipo de encabezado, carga de imagen, pie, errores de Meta
│   ├── components/HeaderTypePicker.tsx          # NUEVO: «Solo texto» / «Texto + imagen» (RadioGroup)
│   ├── components/TemplatePreview.tsx           # prop imagenUrl: imagen sobre el texto, burbuja WhatsApp
│   ├── components/TemplateList.tsx              # «Con imagen», motivo de rechazo visible, «Revisar estado»
│   ├── components/MessageImageField.tsx         # NUEVO: bloque «Imagen del mensaje» (defecto / cambiar / restaurar)
│   ├── hooks/useTemplateStatusRealtime.ts       # NUEVO: socket 'template:status' → caché + toast
│   └── *.test.tsx                               # tests de los componentes tocados
├── features/campaigns/components/CampaignWizard.tsx     # ofrece plantillas IMAGE + MessageImageField
├── features/campaigns/components/CampaignScheduler.tsx  # imagen opcional si hay por defecto + MessageImageField
└── features/inbox/
    ├── components/SendTemplateDialog.tsx        # NUEVO: plantilla + parámetros + imagen + vista previa
    ├── components/WindowClosedBanner.tsx        # botón «Enviar plantilla»
    ├── components/MessageComposer.tsx           # acceso a «Enviar plantilla»
    └── components/MessageBubble.tsx             # tipo template con media: imagen sobre el texto

docs/
├── adr/0013-tenant-por-waba-en-webhook-de-plantillas.md   # NUEVO
├── integrations/meta-whatsapp.md                # alta con imagen, Resumable Upload, webhook de estado, paso manual
├── data-model.md                                # whatsapp_templates: imagenPorDefecto, motivoRechazo
└── multi-tenancy.md §5                          # barrido de plantillas PENDING como excepción listada
```

## Contratos

### `whatsapp-template.types.ts`

```ts
export const CATEGORIAS_CON_IMAGEN = ['MARKETING', 'UTILITY'] as const;
export const MIMES_IMAGEN_CABECERA = ['image/jpeg', 'image/png'] as const;
export type MimeImagenCabecera = (typeof MIMES_IMAGEN_CABECERA)[number];

/** Imagen guardada en NUESTRO almacenamiento + caché del media id de Meta (por número). */
export interface IImagenAlmacenada {
  mediaKey: string;                 // <tenantId>/templates/<uuid>.<ext>
  mimeType: MimeImagenCabecera;
  tamanoBytes: number;
  metaMediaId: string | null;       // id de /{phoneNumberId}/media; caduca a los 30 días
  metaPhoneNumberId: string | null; // número con el que se subió
  subidaMetaAt: Date | null;
}

export interface IWhatsAppTemplate {
  // …campos de HT-WA-02 sin cambios…
  /** Solo en plantillas con HEADER IMAGE creadas desde SofiApp. Las sincronizadas no la tienen. */
  imagenPorDefecto: IImagenAlmacenada | null;
  /** Motivo de Meta en REJECTED (legible). null en cualquier otro estado. */
  motivoRechazo: string | null;
}

export interface IPlantillaComponente {
  type: 'HEADER' | 'BODY' | 'FOOTER' | 'BUTTONS';
  format?: 'TEXT' | 'IMAGE' | 'DOCUMENT' | 'VIDEO';
  text?: string;
  buttons?: Array<Record<string, unknown>>;
  example?: { body_text?: string[][]; header_handle?: string[] };
}

export interface ISubidaImagenMuestraResponse {
  imagenRef: string;
  headerHandle: string;
  mimeType: MimeImagenCabecera;
  tamanoBytes: number;
  url: string;                      // firmada, vida corta, para la vista previa
}

export type CabeceraAlta =
  | { formato: 'NINGUNA' }
  | { formato: 'IMAGE'; imagenRef: string; headerHandle: string };

export interface CreateTemplateBody {
  name: string; language: string; category: CategoriaPlantilla;
  cuerpo: string; ejemplos: string[];
  cabecera?: CabeceraAlta;          // ausente = NINGUNA (contrato de HT-WA-02 intacto)
  pie?: string;                     // FOOTER opcional, ≤ 60 caracteres (límite de Meta)
}

export interface IWhatsAppTemplateResponse {
  // …campos actuales…
  motivoRechazo: string | null;
  pie: string | null;
  /** URL firmada de la imagen por defecto; null si no tiene. */
  imagenPorDefecto: { url: string; mimeType: string; tamanoBytes: number } | null;
}

/** Evento de estado ya normalizado (webhook o sync). */
export interface IEventoEstadoPlantilla {
  metaTemplateId: string;
  status: EstadoPlantilla;
  motivoRechazo: string | null;
}
```

### `whatsapp-template.model.ts`

- `ImagenAlmacenadaSchema` (`_id: false`) con los campos de `IImagenAlmacenada`.
- `imagenPorDefecto: { type: ImagenAlmacenadaSchema, default: null }`,
  `motivoRechazo: { type: String, default: null }`.
- `ComponenteSchema.example` añade `header_handle: [String]`.
- Índices: los de `HT-WA-02` + `{ tenantId: 1, metaTemplateId: 1 }` (el evento de estado busca por él).

### Zod (`whatsapp-template.validation.ts`)

```ts
const cabecera = z.discriminatedUnion('formato', [
  z.object({ formato: z.literal('NINGUNA') }),
  z.object({ formato: z.literal('IMAGE'), imagenRef: z.string().min(1).max(300),
             headerHandle: z.string().min(1).max(4000) }),
]);
export const createTemplateSchema = { body: base.extend({ cabecera: cabecera.optional(),
  pie: z.string().trim().max(60).optional() })
  .refine(b => b.cabecera?.formato !== 'IMAGE' || CATEGORIAS_CON_IMAGEN.includes(b.category),
          { message: 'La imagen de encabezado solo está disponible en Marketing y Utilidad.', path: ['cabecera'] }) };
export const templateIdSchema = { params: { id: objectId }, body: {}, query: {} };
export const uploadTemplateMediaSchema = { body: {}, params: {}, query: {} }; // el archivo lo valida el service
```

### Validación de imagen (`media-imagen.validation.ts`)

`validarImagenCabecera(buffer, mimeDeclarado)`: firma JPEG `FF D8 FF` / PNG `89 50 4E 47 0D 0A 1A 0A`;
si no casa → `AppError('La imagen debe ser JPG o PNG.', 400)`. El tamaño lo corta multer
(`subirImagenCabecera`, límite `MEDIA_MAX_BYTES_IMAGEN` = 5 MB) con `413` y el mensaje
`'La imagen supera 5 MB. Redúcela o elige otra.'`. Una sola función para alta, campaña y conversación.

### Resumable Upload (`meta-resumable-upload.client.ts`)

```ts
export interface IMetaResumableUploadClient {
  /** 1) POST /{META_APP_ID}/uploads?file_length&file_type → { id: 'upload:…' }
   *  2) POST /{uploadId} con `Authorization: OAuth <token>`, `file_offset: 0`, cuerpo binario → { h } */
  subir(accessToken: string, archivo: { buffer: Buffer; mimeType: string }): Promise<{ headerHandle: string }>;
}
```
Reintentos 429/5xx como `meta-media.client.ts`. Sin `META_APP_ID` → `AppError` 500 con mensaje de configuración.

### `meta-template.client.ts`

- `create(wabaId, token, { name, language, category, components })` admite `HEADER{format:'IMAGE',
  example:{header_handle:[h]}}` y `FOOTER{text}`; devuelve `{ id, status }`.
- `getById(metaTemplateId, token)` → `GET /{id}?fields=id,name,language,status,category,components,rejected_reason`.
- `list` añade `rejected_reason` a `fields`.

### Errores de Meta (`meta-template.errors.ts`)

`traducirErrorCreacion(err): AppError` por `error.code` / `error_subcode` / mensaje. **Los subcódigos
exactos se confirman contra la respuesta real durante la implementación** (sandbox) y se fijan en tests:
| Caso | HTTP SofiApp | Mensaje |
|---|---|---|
| Nombre + idioma ya existen | 409 | «Ya tienes una plantilla con ese nombre en este idioma. Usa otro nombre.» |
| Imagen / handle rechazado | 400 | «Meta no aceptó la imagen. Prueba con otro JPG o PNG de hasta 5 MB.» |
| Límite de plantillas del WABA | 422 | «Llegaste al máximo de plantillas que permite Meta. Elimina alguna en Meta antes de crear otra.» |
| Otro | 502 | genérico de `HT-WA-02` |

### Estado (`whatsapp-template.status.ts`)

`normalizarEvento(value)`: `event` de Meta → `APPROVED | REJECTED | PAUSED | DISABLED` (`REINSTATED` →
`APPROVED`; `PENDING_DELETION`/`DELETED` → `DISABLED`; otros → `null` = ignorar con log).
`reason` (`INVALID_FORMAT`, `TAG_CONTENT_MISMATCH`, `ABUSIVE_CONTENT`, `SCAM`, `PROMOTIONAL`, `NONE`…)
→ texto legible en español; desconocido → «Meta la rechazó (motivo: <código>)».

Servicio:
```ts
aplicarEventoEstado(tenantId, evento): Promise<'actualizada' | 'no-encontrada'>
  // findOneAndUpdateScoped({ metaTemplateId }) → status, motivoRechazo (null si no es REJECTED), syncedAt
  // publishRealtime({ type: 'template:status', tenantId, templateId, status, motivoRechazo })
syncTemplate(tenantId, id): Promise<IWhatsAppTemplateResponse>   // getById en Meta → aplicarEventoEstado
getTemplate(tenantId, id): Promise<IWhatsAppTemplateResponse>    // 404 si no es del tenant
```

### Resolución de la imagen de envío

```ts
/** Reemplazo > por defecto > error. Sustituye al booleano `llevaImagen` de HU-MARK-03. */
export type FuenteImagen =
  | { tipo: 'reemplazo'; imagen: IImagenAlmacenada; guardarCache: (c: CacheMeta) => Promise<void> }
  | { tipo: 'defecto' } | { tipo: 'ninguna' };

resolverPlantillaEnviable(tenantId, templateId, parametros, tieneReemplazo)
  // IMAGE && !tieneReemplazo && !tpl.imagenPorDefecto → 422
  //   «Esta plantilla lleva imagen y no tiene una por defecto: adjunta una imagen.»
  // !IMAGE && tieneReemplazo → 400 (sin cambios)
resolverCabeceraEnvio(tenantId, tpl, reemplazo?): Promise<ICabeceraEnvio | undefined>
  // usa asegurarMediaEnMeta sobre la imagen elegida; para la por defecto persiste la caché en la
  // plantilla con findOneAndUpdateScoped (nunca toca campañas)
```

### `asegurarMediaEnMeta` (`media-meta-cache.ts`)

```ts
export async function asegurarMediaEnMeta(
  tenantId: TenantId, imagen: IImagenAlmacenada,
  persistir: (cache: { metaMediaId: string; metaPhoneNumberId: string; subidaMetaAt: Date }) => Promise<void>,
): Promise<string>
// reutiliza si metaMediaId && metaPhoneNumberId === integración.phoneNumberId && edad < 25 días;
// si no: storage.leer(mediaKey) → metaMediaClient.subir(phoneNumberId, …) → persistir(…)
```
Campañas pasan un `persistir` que escribe `contenido.imagen.*` de **esa** campaña; plantillas, uno que
escribe `imagenPorDefecto.*` de **esa** plantilla. Criterio 16 por construcción.

### Endpoints (todas: `authenticateJWT → requireTenant → authorize(['admin']) → [subida] → validate → asyncHandler`)

| Método | Ruta | Notas |
|---|---|---|
| `POST` | `/api/templates/media` | multipart `imagen` (`subirImagenCabecera`); 201 `ISubidaImagenMuestraResponse`. Literal, antes de `/:id`. |
| `POST` | `/api/templates` | extendido (`cabecera`, `pie`); 201. |
| `GET` | `/api/templates/:id` | 200 con `imagenPorDefecto.url` firmada; 404 cross-tenant. |
| `POST` | `/api/templates/:id/sync` | 200 plantilla refrescada; 404 cross-tenant. |
| `POST` | `/api/campaigns/media` | multipart `imagen`; 201 `{ imagenRef, url, mimeType, tamanoBytes }`. Literal, antes de `/:id`. |
| `POST` | `/api/campaigns` | `imagenRef?` (prefijo `<tenantId>/campaigns/borradores/`, existente) → `contenido.imagen`. |
| `POST` | `/api/messages/template` | JSON (igual) **o** multipart con `imagenHeader`; `parametros` como JSON en multipart. |
| `GET` | `/api/media/templates/:id/imagen?t=` | stream / 302 firmado, mismo patrón que la imagen de campaña. |

Roles: todas `admin`, como hoy (`/messages/template` ya es `authorize(['admin'])` en `HT-WA-02`).
Abrir el envío de plantillas a asesores es una decisión de producto aparte, fuera de esta historia;
la UI de la bandeja muestra «Enviar plantilla» solo a `admin`.

### Webhook

```ts
type IWebhookChange =
  | { field: 'messages'; value: IWebhookValue }
  | { field: 'message_template_status_update'; value: IMetaTemplateStatusValue }
  | { field: string; value: unknown };          // cualquier otro: se ignora con log

interface IMetaTemplateStatusValue {
  event: string; message_template_id: number | string;
  message_template_name: string; message_template_language: string; reason?: string | null;
}
```
Controller: responde `200` (como hoy) y por cada cambio, en su propio `try`:
`messages` → flujo actual; `message_template_status_update` →
`resolveTenantsByWaba(entry.id)` (`MetaIntegration.find({ wabaId })`, excepción ADR 0013) →
`enqueueTemplateStatusJob(tenantId, value)`.

### BullMQ

- Cola existente `inbound-messages`, job nuevo `template-status`
  `{ tenantId, metaTemplateId, event, reason }` → `aplicarEventoEstado`. `jobId` =
  `tpl-${tenantId}-${metaTemplateId}-${event}` (idempotente ante reentregas de Meta).
- Scheduler `template-sweep` cada `TEMPLATE_SWEEP_MINUTES` (default 30): `WhatsAppTemplate.distinct('tenantId',
  { status: 'PENDING' })` (excepción §5) → por tenant, `syncTemplate` de cada `PENDING` (máx. 50 por
  tenant y pasada).

### Realtime

`{ type: 'template:status'; tenantId; templateId; status; motivoRechazo }` → room `tenant:<id>`.

## Frontend — dirección de diseño

Aplicado con `emil-design-eng` y `frontend-design`. `impeccable` no está disponible en este entorno:
sus criterios (jerarquía, estados vacíos/error, copy, accesibilidad) se cubren en la lista de abajo.

- **Identidad:** la del CRM (tokens semánticos, shadcn). Lo único memorable es la **vista previa
  WhatsApp**: burbuja con la imagen real arriba y el texto con las variables sustituidas debajo. Todo
  lo demás, sobrio.
- **Alta (`CreateTemplateDialog`)**, dos columnas en `lg` (formulario | vista previa fija), apiladas
  en móvil:
  ```
  ┌ Nombre · Idioma · Categoría ─────────┐ ┌ Vista previa ─────┐
  │ Encabezado: (•) Solo texto ( ) Texto + imagen  │ │ [ imagen ]        │
  │ [ Suelta un JPG o PNG de hasta 5 MB ]│ │ Hola {{1}} → Ana  │
  │ ▓▓▓▓▓▓░░ 62 % Subiendo a Meta        │ │ pie               │
  │ Cuerpo · Ejemplos · Pie (opcional)   │ └───────────────────┘
  └──────────────────────────────────────┘
  ```
  *Texto + imagen* deshabilitado en Autenticación con el motivo escrito debajo (no tooltip).
- **Carga:** `ImageDropzone` (movido a `components/media`) + `UploadProgress` (barra `Progress`,
  `transition: transform` lineal; texto «Subiendo… / Lista / No se pudo subir» con reintentar). La
  validación de cliente corre **antes** de subir y usa el mismo copy que el backend.
- **Listado:** insignia de estado existente; «Con imagen» como icono + texto pequeño; en `REJECTED`,
  el motivo en una línea `text-destructive` bajo el nombre; acción «Revisar estado» (sync uno).
- **«Imagen del mensaje» (`MessageImageField`)**, idéntico en wizard, programador y conversación:
  miniatura + «Imagen por defecto» / «Imagen para este envío», botones *Cambiar imagen* y *Restaurar
  imagen por defecto*; nota: «Esta imagen no pasa por la revisión de Meta. Si incumple sus políticas,
  puede afectar a la calidad de tu número.»
- **Motion:** sin animación entre pasos ni al abrir diálogos ya existentes; *press* `scale(.97)` en
  botones (160 ms ease-out); cambio de imagen en la vista previa con `opacity` 150 ms; toasts de
  estado vía Sonner. Todo bajo `motion-safe`.
- **Accesibilidad:** el dropzone es un `button` con texto y acepta teclado; errores en `aria-live`;
  imagen de vista previa con `alt` descriptivo; contraste de tokens en light y dark.

## Notas

- **Orden de seguridad en el alta:** validar Zod → validar `imagenRef` (prefijo del tenant + existe
  en almacenamiento) → Meta → persistir. Nada local si Meta falla (criterio 5).
- **El `headerHandle` caduca** (Meta lo conserva poco tiempo): el alta debe hacerse en la misma
  sesión. Si Meta lo rechaza por caducado, el error pide volver a subir la imagen.
- **Imágenes huérfanas:** subidas a `/templates/media` o `/campaigns/media` que nunca se usan quedan
  en el almacenamiento. Se acepta en esta historia; la limpieza (TTL por prefijo `borradores/`) queda
  como deuda anotada en `docs/adr/0008`.
- **`DOCUMENT`/`VIDEO`** siguen rechazándose con el `422` de `HU-MARK-03`.
- **Plantillas sincronizadas con `HEADER IMAGE`** (creadas fuera de SofiApp) no tienen imagen por
  defecto: se pueden usar, pero el bloque de imagen exige un reemplazo (criterio 13).
- **Paso manual:** suscribir `message_template_status_update` en *App Dashboard → WhatsApp →
  Configuración → Webhook fields*. Sin él, el barrido de respaldo sigue actualizando el estado.

## Verificación

- `pnpm --filter @sofiapp/api typecheck` · `pnpm --filter @sofiapp/api test`
- `pnpm --filter @sofiapp/web build && pnpm --filter @sofiapp/web lint` · tests de los componentes tocados
- Checklist de PR de `docs/multi-tenancy.md` §9.
- Prueba manual del DoD en sandbox/número real (requiere credenciales del usuario).
