# HT-WA-04 — Plan técnico (CÓMO)

> Base: `feat/HU-MARK-03` (commit `b969bc9`). Cada archivo se marca **crear** o **ajustar**, con el
> criterio del `spec` que cubre. Reglas que mandan: `CLAUDE.md` raíz (aislamiento, `tenantId` del
> token, controllers delgados, Zod en el borde, sin `any`) y el patrón de 6 archivos de
> `apps/backend/CLAUDE.md`.

## Archivos a crear / tocar

```
apps/backend/src/
├── integrations/meta/
│   └── meta-template.client.ts                    ajustar  subirMuestra (Resumable Upload), get(id), errores mapeados (CA-4, CA-6, CA-14)
├── features/whatsapp-template/
│   ├── whatsapp-template.types.ts                 ajustar  IN_APPEAL, header_handle, IImagenPlantilla, DTOs, MOTIVOS_RECHAZO (CA-1…9)
│   ├── whatsapp-template.model.ts                 ajustar  imagenDefecto, motivoRechazo, example.header_handle, índice {tenantId, metaTemplateId}
│   ├── media-upload.model.ts                      crear    subidas pendientes de un solo uso, TTL 24 h (CA-4, CA-10, CA-12)
│   ├── whatsapp-template.validation.ts            ajustar  cabecera/pie + superRefine de categoría; get/sync por id (CA-3)
│   ├── whatsapp-template.service.ts               ajustar  subirMuestraPlantilla, createTemplate con HEADER, getTemplate, syncTemplate,
│   │                                                       aplicarEstadoPlantilla, resolverImagenCabecera (CA-4…13)
│   ├── whatsapp-template.controller.ts            ajustar  upload, get, syncOne (delgados)
│   ├── whatsapp-template.routes.ts                ajustar  POST /media, GET /:id, POST /:id/sync
│   ├── whatsapp-template.service.test.ts          ajustar
│   └── whatsapp-template.isolation.test.ts        ajustar  (CA-17)
├── features/media/
│   ├── media-meta-cache.ts                        crear    asegurarMetaMediaId, extraído de prepararImagenCabecera (CA-13)
│   ├── media.token.ts                             ajustar  recursoImagenPlantilla → `template-<id>` (CA-9, CA-17)
│   ├── media.controller.ts · media.routes.ts      ajustar  GET /media/templates/:id/imagen?t= (CA-9)
│   └── media.validation.ts                        ajustar
├── features/campaign/
│   ├── campaign.types.ts · validation.ts          ajustar  imagenHeaderUploadId en createCampaign (JSON) (CA-10)
│   ├── campaign.service.ts                        ajustar  subirImagenReemplazo, resolución override→defecto, prepararImagenCabecera usa la caché común (CA-10, CA-11, CA-13)
│   ├── campaign.controller.ts · routes.ts         ajustar  POST /campaigns/media
│   └── campaign.*.test.ts                         ajustar
├── features/message/
│   ├── message.validation.ts                      ajustar  sendTemplateSchema + imagenHeaderUploadId (CA-12)
│   ├── message.controller.ts                      ajustar  pasa el uploadId al service
│   ├── message.types.ts                           ajustar  ContenidoOutbound plantilla + imagenHeaderUploadId
│   └── message.service.ts                         ajustar  sendOutbound resuelve la imagen si no viene imagenCabecera (CA-12, CA-13)
├── features/webhook/
│   ├── webhook.types.ts                           ajustar  unión de changes por field (CA-5)
│   ├── webhook.service.ts                         ajustar  resolveWebhookTenantByWaba, enqueueTemplateStatusJob
│   └── webhook.controller.ts                      ajustar  ramifica por change.field
├── features/channel/channel.model.ts              ajustar  índice { wabaId: 1 }
├── middlewares/upload.middleware.ts               ajustar  preset subirImagenPlantilla (campo `imagen`, 5 MB, 1 campo)
├── config/queues.ts                               ajustar  templateQueue + nombres de job
├── workers/
│   ├── template.processor.ts                      crear    status-update, sync-sweep, sync-tenant (CA-5, CA-6, CA-7)
│   └── inbound-message.processor.ts               ajustar  ignora changes con field ≠ 'messages' (CA-5)
├── worker.ts                                      ajustar  Worker de templateQueue + upsertJobScheduler cada 30 min
└── realtime/realtime.types.ts                     ajustar  evento template:status-updated (CA-7)

apps/frontend/src/
├── components/media/ImageDropzone.tsx (+ test)    mover    desde features/campaigns/components (compartido)
├── components/whatsapp/WhatsAppMessagePreview.tsx mover    desde features/campaigns/components/MessagePreview.tsx (CA-15)
├── api/whatsapp-templates.ts                      ajustar  uploadTemplateImage(onProgress), getWhatsAppTemplate, syncWhatsAppTemplate, errores (CA-2, CA-14)
├── features/whatsapp-templates/
│   ├── types/{domain,api}.ts                      ajustar  imagen, motivoRechazo, IN_APPEAL
│   ├── components/CreateTemplateDialog.tsx        ajustar  tipo de encabezado, dropzone, Progress, pie, preview (CA-1…4, CA-15)
│   ├── components/HeaderTypeSelector.tsx          crear    RadioGroup shadcn, IMAGE deshabilitado en AUTHENTICATION (CA-3)
│   ├── components/TemplateList.tsx                ajustar  chip «Con imagen», motivo de rechazo, sync por fila (CA-7, CA-9)
│   ├── components/TemplateStatusBadge.tsx         ajustar  IN_APPEAL
│   ├── components/TemplatePreview.tsx             ajustar  delega en WhatsAppMessagePreview
│   └── hooks/useTemplateRealtime.ts               crear    template:status-updated → invalidate + toast (CA-7)
├── features/campaigns/
│   ├── components/HeaderImageField.tsx (+ test)   crear    «Imagen del mensaje»: defecto / Cambiar / Restaurar (CA-10, CA-15)
│   ├── components/CampaignWizard.tsx              ajustar  deja de filtrar IMAGE; usa HeaderImageField
│   ├── components/CampaignScheduler.tsx           ajustar  imagen opcional si hay defecto; HeaderImageField
│   ├── components/RescheduleDialog.tsx            ajustar  «Restaurar» = quitarImagen
│   └── api.ts                                     ajustar  uploadCampaignImage(onProgress), createCampaign + imagenHeaderUploadId
└── features/inbox/
    ├── components/SendTemplateDialog.tsx (+ test) crear    plantilla aprobada + parámetros + HeaderImageField + preview (CA-12)
    ├── components/WindowClosedBanner.tsx          ajustar  CTA «Enviar plantilla» (solo admin)
    └── api.ts                                     ajustar  sendTemplateMessage

docs/integrations/meta-whatsapp.md                 ajustar  §1 webhook por WABA, §4 alta con header, §5 resolución y caché, §8 env + paso del dashboard
docs/data-model.md                                 ajustar  WhatsAppTemplate (imagenDefecto, motivoRechazo), MediaUpload, índice wabaId
docs/api-contract.md                               ajustar  endpoints nuevos y extendidos
```

`app.ts` ya monta `/api/templates`, `/api/campaigns`, `/api/messages`, `/api/media` y
`/api/webhooks/whatsapp`: **no hay montajes nuevos**.

## Contratos

### Cliente de Meta (`meta-template.client.ts`)

```ts
interface IMetaTemplateClient {
  list(wabaId: string, accessToken: string): Promise<IMetaTemplateRaw[]>;           // existente; + rejected_reason
  create(wabaId: string, accessToken: string, dto: ICreateMetaTemplateDto): Promise<{ id: string; status: string }>;
  get(metaTemplateId: string, accessToken: string): Promise<IMetaTemplateRaw>;      // nuevo (CA-6)
  /** Resumable Upload: POST /{META_APP_ID}/uploads?file_length&file_type → { id: 'upload:…' }
   *  luego POST /{upload-id} con `Authorization: OAuth <token>`, `file_offset: 0`, body binario → { h } */
  subirMuestra(accessToken: string, archivo: { buffer: Buffer; mimeType: string }): Promise<{ headerHandle: string }>;
}
```

- Todas las llamadas con `AbortSignal.timeout(15_000)` (patrón de `meta-onboarding.client.ts`).
- `META_APP_ID` ausente → `AppError('La creación de plantillas con imagen no está configurada.', 503)`.
- `readGraphError(res)` → `{ message, code, error_subcode }` y `mapearErrorPlantilla()`:

| Caso | Detección | HTTP | Mensaje |
|---|---|---|---|
| Nombre + idioma ya existe | subcode documentado de «content already exists» (verificar en docs de Meta en implement) o texto | 409 | «Ya existe una plantilla con ese nombre e idioma.» |
| Imagen / handle inválido | `code 100` + subcode de parámetro de media / texto `header_handle` | 422 | «Meta rechazó la imagen de muestra. Usa un JPG o PNG válido de hasta 5 MB.» |
| Límite de plantillas | subcode de límite de WABA / texto `limit` | 422 | «Tu cuenta de WhatsApp alcanzó el máximo de plantillas.» |
| 429 tras reintentos, 5xx, timeout | — | 502 | «Meta no respondió. Intenta de nuevo en unos minutos.» |

Los subcodes exactos se confirman con la documentación de Meta durante `/sdd-implement` y quedan en
constantes con nombre. Si no se reconoce el error, se cae al 502 genérico y el texto crudo va **solo**
al log.

### Tipos (`whatsapp-template.types.ts`)

```ts
export const ESTADOS_PLANTILLA = ['APPROVED', 'PENDING', 'REJECTED', 'PAUSED', 'DISABLED', 'IN_APPEAL'] as const;
export const CATEGORIAS_CON_IMAGEN = ['MARKETING', 'UTILITY'] as const;

export interface IPlantillaComponente {
  type: 'HEADER' | 'BODY' | 'FOOTER' | 'BUTTONS';
  format?: 'TEXT' | 'IMAGE' | 'DOCUMENT' | 'VIDEO';
  text?: string;
  buttons?: unknown[];
  example?: { body_text?: string[][]; header_handle?: string[] };
}

/** Imagen por defecto en nuestro almacenamiento + caché del media id de Meta (CA-9, CA-13). */
export interface IImagenPlantilla {
  mediaKey: string;            // <tenantId>/templates/<uuid>.<ext>
  mimeType: 'image/jpeg' | 'image/png';
  tamanoBytes: number;
  metaMediaId: string | null;
  subidaMetaAt: Date | null;
}

export interface CreateTemplateBody {
  name: string; language: string; category: CategoriaPlantilla;
  cuerpo: string; ejemplos: string[];
  cabecera: { formato: 'NINGUNA' } | { formato: 'IMAGE'; uploadId: string };   // default NINGUNA (CA-1)
  pie?: string;                                                                 // ≤ 60
}

export interface IWhatsAppTemplateResponse {   // existente +
  imagen: { url: string; mimeType: string; tamanoBytes: number } | null;
  motivoRechazo: { codigo: string; mensaje: string } | null;
  pie: string | null;
}

export interface IUploadResponse { uploadId: string; mimeType: string; tamanoBytes: number }

/** Código de Meta → texto en español (CA-7). Clave desconocida → mensaje genérico con el código. */
export const MOTIVOS_RECHAZO: Record<string, string>;   // INVALID_FORMAT, ABUSIVE_CONTENT, INCORRECT_CATEGORY, TAG_CONTENT_MISMATCH, SCAM, PROMOTIONAL, NONE…
```

### Modelos

**`WhatsAppTemplate`** (ajustar):
- `ComponenteSchema.example` + `header_handle: [String]` (deja de perderse en la sincronización).
- `imagenDefecto: { type: ImagenSchema, default: null }` (mismo shape que el `ImagenSchema` de
  campaña; se extrae a un schema común en `features/media/` si queda idéntico).
- `motivoRechazo: { type: String, default: null }`.
- Índice nuevo `{ tenantId: 1, metaTemplateId: 1 }` (búsqueda del webhook).

**`MediaUpload`** (crear, `features/whatsapp-template/media-upload.model.ts`):

```ts
{
  tenantId: ObjectId (required, index),
  proposito: 'muestra-plantilla' | 'cabecera-reemplazo',
  mediaKey: string, mimeType: 'image/jpeg' | 'image/png', tamanoBytes: number,
  headerHandle: string | null,   // solo muestra-plantilla
  usadaAt: Date | null,
  expiraEn: Date,                // now + 24 h
}
// índices: { expiraEn: 1 } expireAfterSeconds: 0  ·  { tenantId: 1, _id: 1 }
```

Consumo atómico de un solo uso:
`findOneAndUpdateScoped(MediaUpload, tenantId, { _id, proposito, usadaAt: null }, { $set: { usadaAt: new Date() } })`
→ `null` = 404 «La imagen ya no está disponible, súbela de nuevo.» (cubre otro tenant, ya usada o
caducada). Si el alta en Meta falla después de consumirla, se revierte `usadaAt: null`.

**`MetaIntegration`**: índice `{ wabaId: 1 }`.

**`Campaign`**: sin campos nuevos. `contenido.imagen` (HU-MARK-03) es la `imagenHeader` de la historia.

### Validación (Zod)

```ts
createTemplateSchema = z.object({ body: z.object({
  name, language, category, cuerpo, ejemplos,                                   // existentes
  cabecera: z.discriminatedUnion('formato', [
    z.object({ formato: z.literal('NINGUNA') }),
    z.object({ formato: z.literal('IMAGE'), uploadId: objectIdSchema }),
  ]).default({ formato: 'NINGUNA' }),
  pie: z.string().trim().min(1).max(60).optional(),
}).superRefine((b, ctx) => {
  if (b.cabecera.formato === 'IMAGE' && !CATEGORIAS_CON_IMAGEN.includes(b.category)) ctx.addIssue(...); // CA-3
}) });
getTemplateSchema / syncTemplateSchema = z.object({ params: z.object({ id: objectIdSchema }) });
uploadTemplateMediaSchema = z.object({});                              // el archivo lo valida multer + service
sendTemplateSchema.body + imagenHeaderUploadId: objectIdSchema.optional()   // CA-12
createCampaignSchema.body + imagenHeaderUploadId: objectIdSchema.optional() // CA-10
```

Tipo y tamaño de la imagen: multer corta el tamaño (413) y el service valida el mime con
`clasificarArchivoSaliente(mime, size, ['image/jpeg','image/png'])` (415/413), igual que HU-OMNI-06.

### Endpoints

Todos con `authenticateJWT → requireTenant → authorize(['admin']) → [upload] → validate → asyncHandler`.

| Método y ruta | Body | Respuesta | CA |
|---|---|---|---|
| `POST /api/templates/media` | multipart `imagen` | 201 `IUploadResponse` | 2, 4 |
| `POST /api/templates` | `CreateTemplateBody` | 201 `IWhatsAppTemplateResponse` (`PENDING`) | 1, 3, 4, 14 |
| `GET /api/templates/:id` | — | 200 `IWhatsAppTemplateResponse` · 404 | 9 |
| `POST /api/templates/:id/sync` | — | 200 `IWhatsAppTemplateResponse` | 6 |
| `POST /api/campaigns/media` | multipart `imagen` | 201 `IUploadResponse` | 10 |
| `POST /api/campaigns` | + `imagenHeaderUploadId?` | sin cambios | 10, 11 |
| `POST /api/messages/template` | + `imagenHeaderUploadId?` | sin cambios | 12 |
| `GET /api/media/templates/:id/imagen?t=` | — (token HMAC, sin JWT) | 302 a URL firmada o stream | 9, 17 |

`POST /campaigns/schedule` y `PATCH /campaigns/:id/schedule` conservan su contrato multipart; con
plantilla IMAGE la imagen pasa a ser **opcional**, y `quitarImagen: 'true'` = «Restaurar por defecto».

### Service — funciones clave

```ts
// whatsapp-template.service.ts
subirMuestraPlantilla(tenantId, archivo: IImagenSubida): Promise<IUploadResponse>
  // clasificar → guardar (<tenant>/templates/<uuid>.<ext>) → metaTemplateClient.subirMuestra
  // → createScoped(MediaUpload, { proposito:'muestra-plantilla', headerHandle }). Si Meta falla, borra el archivo.
createTemplate(tenantId, dto)            // + HEADER{format:'IMAGE', example:{header_handle:[h]}} + FOOTER; imagenDefecto desde el upload
getTemplate(tenantId, id)
syncTemplate(tenantId, id)               // metaTemplateClient.get(metaTemplateId) → status + rejected_reason
aplicarEstadoPlantilla(tenantId, metaTemplateId, evento, motivo): Promise<LeanWhatsAppTemplate | null>
  // REINSTATED → APPROVED; FLAGGED → sin cambio de status (log); PENDING_DELETION/DELETED → obsoleta:true;
  // REJECTED guarda motivo; cualquier otro estado lo limpia. Publica template:status-updated.
resolverImagenCabecera(tenantId, plantilla, override?: { metaMediaId } ): Promise<ICabeceraEnvio | undefined>
  // formato ≠ IMAGE → undefined; override → override; imagenDefecto → asegurarMetaMediaId(...); si no → 422 (CA-13)

// features/media/media-meta-cache.ts
asegurarMetaMediaId(tenantId, imagen: IImagenCacheable, persistir: (id: string, at: Date) => Promise<void>): Promise<string>
  // reutiliza si metaMediaId y edad < VIDA_MEDIA_META_MS (25 días); si no, leer → metaMediaClient.subir → persistir
```

`prepararImagenCabecera(tenantId, campana)` queda como: imagen propia → `asegurarMetaMediaId` sobre la
campaña; sin imagen → `resolverImagenCabecera` (defecto de la plantilla, caché en la plantilla).
`processCampaignJob` ya la llama una vez por lote: **una subida por imagen**, no por destinatario.

`sendOutbound` (modo `plantilla`): si llega `imagenHeaderUploadId`, consume el upload
(`cabecera-reemplazo`), lo sube a Meta y envía con ese id; si no, `resolverImagenCabecera`.

### Webhook y jobs (BullMQ)

```ts
// webhook.types.ts
type IWebhookChange =
  | { field: 'messages'; value: IWebhookValue }
  | { field: 'message_template_status_update'; value: ITemplateStatusValue }
  | { field: string & {}; value: unknown };             // campos que Meta añada: se ignoran
interface ITemplateStatusValue {
  event: string; message_template_id: number | string;
  message_template_name: string; message_template_language: string; reason?: string | null;
}
```

- `receiveController`: HMAC → 200 → por cada change, `switch (change.field)`. `messages` sigue igual;
  `message_template_status_update` → `resolveWebhookTenantByWaba(entry.id)` (`MetaIntegration.findOne({ wabaId })`,
  **excepción documentada** junto a la de `phone_number_id`) → `templateQueue.add(TEMPLATE_STATUS_JOB, { tenantId, ...value })`.
  Un change que falla no corta los demás.
- `inbound-message.processor.ts`: `if (change.field !== 'messages') continue;`.
- `templateQueue` (`config/queues.ts`), jobs:
  - `TEMPLATE_STATUS_JOB` → `aplicarEstadoPlantilla` (attempts 5, backoff exponencial).
  - `TEMPLATE_SYNC_SWEEP_JOB` (repetible, `upsertJobScheduler` cada 30 min en `worker.ts`) → lectura
    de sistema de `tenantId` distintos con plantillas `PENDING`/`IN_APPEAL` (igual que el barrido de
    campañas; comentada como excepción) → encola un `TEMPLATE_SYNC_TENANT_JOB` por tenant.
  - `TEMPLATE_SYNC_TENANT_JOB` → `syncTemplates(tenantId)` y publica un evento por plantilla que cambió.

### Realtime

```ts
| { type: 'template:status-updated'; tenantId: string; templateId: string;
    status: EstadoPlantilla; motivoRechazo: { codigo: string; mensaje: string } | null }
```

Se publica con `publishRealtime` (funciona desde el worker) y llega a `tenant:<id>`.

### Frontend

- **`HeaderTypeSelector`**: `RadioGroup` de shadcn con dos tarjetas («Solo texto» / «Texto + imagen»).
  Con `AUTHENTICATION` la segunda queda deshabilitada con `Tooltip` explicativo y, si estaba elegida,
  vuelve a «Solo texto».
- **`CreateTemplateDialog`**: al soltar la imagen valida en cliente (`validarImagen` de
  `features/campaigns/lib/programacion.ts`, movida a `lib/imagen.ts`), sube con `uploadTemplateImage`
  mostrando `Progress` y guarda el `uploadId`; el envío del formulario solo se habilita con el upload
  listo. Vista previa en vivo a la derecha (`WhatsAppMessagePreview` con la URL local del archivo).
- **`TemplateList`**: `TemplateStatusBadge` (+ `IN_APPEAL`), chip «Con imagen» (icono), motivo de
  rechazo en una línea bajo el nombre con `Tooltip` del texto completo, acción «Actualizar estado»
  (`POST /:id/sync`) por fila.
- **`useTemplateRealtime`**: escucha `template:status-updated` con `getSocket()`, invalida
  `['whatsapp-templates']` y muestra un `toast` (sonner) «Meta aprobó/rechazó …».
- **`HeaderImageField`** (props: `imagenDefectoUrl`, `valor: File | null`, `onChange`, `uploading`,
  `progreso`): muestra la imagen vigente con etiqueta «Por defecto» o «Personalizada», botón «Cambiar
  imagen» (abre el `ImageDropzone`) y «Restaurar imagen por defecto» (solo si hay reemplazo), más el
  aviso de políticas de Meta.
- **`SendTemplateDialog`**: `Dialog` de shadcn; `Select` de plantillas aprobadas, campos por variable,
  `HeaderImageField` si la plantilla es IMAGE y la vista previa; envía con `sendTemplateMessage`.
  Se abre desde `WindowClosedBanner` y solo se renderiza para `admin`.
- Todo con tokens semánticos del proyecto, light y dark; animaciones según `emil-design-eng`
  (transiciones cortas de opacidad/escala al cambiar la imagen, sin layout shift).

## Notas

- **Regla de oro del aislamiento**: todas las lecturas/escrituras de `WhatsAppTemplate`, `MediaUpload`
  y `Campaign` van por `*Scoped`. Las únicas lecturas sin tenant son `resolveWebhookTenantByWaba` y el
  barrido de sincronización, ambas comentadas como excepción y cubiertas por tests.
- El `mediaKey` siempre lo construye el backend (`construirTemplateMediaKey(tenantId, mime)`), nunca
  sale al cliente: el cliente solo maneja `uploadId` y URLs firmadas.
- El `header_handle` caduca en Meta (horas): por eso el upload vive 24 h y la UI pide subirla de nuevo
  si el alta tarda más.
- `syncTemplates` hace `$set` solo de campos de Meta: no pisa `imagenDefecto` ni `motivoRechazo`
  locales salvo que Meta traiga `rejected_reason`.
- Si una plantilla llega por sincronización con header IMAGE pero sin imagen por defecto (creada en
  Business Manager), sigue funcionando con imagen de reemplazo obligatoria (comportamiento de MARK-03).

## Verificación

```bash
pnpm --filter @sofiapp/api typecheck
pnpm --filter @sofiapp/api test
pnpm --filter @sofiapp/web build && pnpm --filter @sofiapp/web lint
pnpm --filter @sofiapp/web test
```

Manual (sandbox de Meta, DoD): crear plantilla IMAGE → queda `PENDING` → el webhook la pasa a
`APPROVED` y el listado cambia solo → lanzar dos campañas con la misma plantilla (una con la imagen
por defecto, otra con reemplazo) a contactos fuera de la ventana de 24 h → cada contacto recibe su
imagen y las variables sustituidas, sin nueva aprobación.
