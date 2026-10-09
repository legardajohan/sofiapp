# HU-MARK-03 — Plan técnico (CÓMO)

> Cubre los 11 criterios de `spec.md`. Cada contrato indica entre paréntesis el criterio que cierra.
> Nada aquí redefine las reglas del proyecto: multi-tenancy en `docs/multi-tenancy.md`, patrón de
> feature en `apps/backend/CLAUDE.md`, convenciones REST en `docs/api-contract.md`. Es una
> **extensión** del feature `campaign` de HU-MARK-01: no se crea feature nuevo.

## Archivos a crear

```
apps/backend/src/features/campaign/
├── campaign.schedule.test.ts            # programar, reprogramar, cancelar programada, validaciones (1, 2, 5)
└── campaign.schedule.isolation.test.ts  # tenant B no lee/reprograma/cancela; clave de storage con tenant (10)

apps/frontend/src/features/campaigns/components/
├── CampaignScheduler.tsx                # diálogo del programador (reutiliza el esqueleto del wizard)
├── CampaignScheduler.test.tsx
├── ImageDropzone.tsx                    # arrastrar/seleccionar, vista previa, validación en cliente
├── ImageDropzone.test.tsx
├── DateTimePicker.tsx                   # shadcn calendar + popover + hora, con zona horaria visible
├── MessagePreview.tsx                   # burbuja WhatsApp: imagen de cabecera + BODY resuelto
└── RescheduleDialog.tsx                 # cambiar fecha/hora de una programada

apps/frontend/src/components/ui/calendar.tsx   # pnpm dlx shadcn@3.8.5 add calendar (versión pinneada, Tailwind 3.4)
```

## Archivos a modificar

| Archivo | Cambio | Criterio |
|---|---|---|
| `features/campaign/campaign.types.ts` | `IImagenCampana`, `ICampaign.contenido`, `ScheduleCampaignDTO`, `RescheduleCampaignDTO`, `CampaignStartJobData`, `imagen` en `ICampaignResponse` | 1, 5, 6, 8 |
| `features/campaign/campaign.model.ts` | Subdocumento `contenido.imagen` (default `null`) | 1, 6 |
| `features/campaign/campaign.validation.ts` | `scheduleCampaignSchema`, `rescheduleCampaignSchema` | 1, 5 |
| `features/campaign/campaign.service.ts` | `scheduleCampaign`, `rescheduleCampaign`, `prepararImagenCabecera`, `launchCampaign` con guardas de arranque programado, `toCampaignResponse` con URL firmada | 1–8 |
| `features/campaign/campaign.controller.ts` · `campaign.routes.ts` | `POST /schedule` y `PATCH /:id/schedule` | 1, 5 |
| `middlewares/upload.middleware.ts` | Factoría `crearSubidaUnica({ campo, maxBytes, maxCampos })`; `subirArchivo` pasa a construirse con ella (sin cambio de comportamiento) y se añade `subirImagenCampana` | 2 |
| `features/whatsapp-template/whatsapp-template.service.ts` · `.types.ts` | `buildTemplatePayload(…, cabecera?)` + `formatoCabecera(tpl)` + `cabecera` en la respuesta | 2, 6, 8 |
| `features/message/message.types.ts` · `message.service.ts` | Modo `plantilla` con `imagenCabecera?: { metaMediaId }` | 6 |
| `workers/campaign-broadcast.processor.ts` | `processScheduledStart(data)`; el lote pasa `imagenCabecera` | 4, 6 |
| `config/queues.ts` · `worker.ts` | `CAMPAIGN_SCHEDULED_START_JOB` y su rama en el worker | 4 |
| `integrations/storage/index.ts` | `construirCampaignMediaKey(tenantId, campaignId, mime)` → `${tenantId}/campaigns/${campaignId}/<uuid>.<ext>` | 10 |
| `features/media/media.service.ts` | Reutilizar la firma de `firmarUrlMedia` para una URL de imagen de campaña (`firmarUrlImagenCampana`) | 8, 10 |
| `features/audit/audit.types.ts` | Acciones `campaign.schedule`, `campaign.reschedule` | 1, 5 |
| `apps/frontend/src/features/campaigns/{api,types,index}.ts` · `hooks/useCampaigns.ts` | `scheduleCampaign` (FormData), `rescheduleCampaign`, `imagen` y `cabecera` en tipos | 9 |
| `apps/frontend/src/features/campaigns/pages/{CampaignsPage,CampaignDetailPage}.tsx` | Botón "Programar", "Programada para …", acciones reprogramar/cancelar, imagen en detalle | 9 |
| `apps/frontend/src/features/campaigns/components/CampaignWizard.tsx` | Retirar el `datetime-local` suelto: programar pasa a ser el flujo del programador | 9 |
| `docs/{data-model,api-contract}.md` · `docs/integrations/meta-whatsapp.md` | Ver §Documentación | — |

**Sin cambios** en el segmentador, el pacing, `features/usage/*` ni el montaje de `app.ts`
(`/api/campaigns` ya está montado por MARK-01).

## Contratos

### `campaign.types.ts` (criterios 1, 5, 6, 8)

```ts
/** Imagen de cabecera. Vive en NUESTRO storage; el `metaMediaId` es una caché de la subida a Meta. */
export interface IImagenCampana {
  mediaKey: string;            // `${tenantId}/campaigns/${campaignId}/<uuid>.<ext>` (criterio 10)
  mimeType: 'image/jpeg' | 'image/png';
  tamanoBytes: number;
  /** `null` hasta el arranque: el id de Meta caduca a los 30 días y no se pide antes de tiempo. */
  metaMediaId: string | null;
  subidaMetaAt: Date | null;
}

export interface IContenidoCampana { imagen: IImagenCampana | null }

// ICampaign gana:
contenido: IContenidoCampana;   // default { imagen: null } — las campañas de MARK-01 siguen igual

export interface ScheduleCampaignDTO {
  nombre: string;
  filtros: ISegmentoFiltros;
  templateId: string;
  parametros: string[];
  programadaPara: string;         // ISO 8601 con offset
}

export type RescheduleCampaignDTO = Partial<ScheduleCampaignDTO> & { quitarImagen?: boolean };

/** Job de arranque exacto. Lleva el tenant DENTRO (criterio 10) y la hora que lo originó (criterio 5). */
export interface CampaignStartJobData { tenantId: string; campaignId: string; programadaParaMs: number }

// ICampaignResponse gana:
imagen: { url: string; mimeType: string; tamanoBytes: number } | null;   // URL firmada (criterio 8)
```

### `campaign.validation.ts` (criterios 1, 5)

Los campos llegan como **texto de multipart**: `filtros` y `parametros` son JSON serializado.

```ts
const jsonDe = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((v) => (typeof v === 'string' ? JSON.parse(v) : v), schema);

const MARGEN_MINIMO_MS = 60_000;
const programadaParaFutura = z.string().datetime({ offset: true })
  .refine((s) => new Date(s).getTime() - Date.now() >= MARGEN_MINIMO_MS,
    { message: 'Programa la campaña con al menos un minuto de antelación.' });

export const scheduleCampaignSchema = z.object({
  body: z.object({
    nombre, templateId: objectId,
    filtros: jsonDe(segmentoFiltrosSchema),        // el MISMO de MARK-01 (criterio 3)
    parametros: jsonDe(z.array(z.string().max(1024)).max(10)),
    programadaPara: programadaParaFutura,
  }).strict(),
});

export const rescheduleCampaignSchema = z.object({
  params: z.object({ id: objectId }),
  body: scheduleBody.partial().extend({ quitarImagen: z.enum(['true']).optional() }).strict(),
});
```

`JSON.parse` que falla se traduce a un issue de Zod (`ctx.addIssue`), no a un 500.

### `upload.middleware.ts` (criterio 2)

`subirArchivo` hoy fija `fields: 4` y el campo `archivo`: no sirve para los 5 campos del
programador. Se extrae una factoría y se construyen los dos a partir de ella:

```ts
export function crearSubidaUnica(o: { campo: string; maxBytes: number; maxCampos: number }): RequestHandler;
export const subirArchivo = crearSubidaUnica({ campo: 'archivo', maxBytes: techoGlobal(), maxCampos: 4 });
export const subirImagenCampana = crearSubidaUnica({
  campo: 'imagen', maxBytes: Math.min(env.MEDIA_MAX_BYTES_IMAGEN, 5 * 1024 * 1024), maxCampos: 8,
});
```

La traducción de `LIMIT_FILE_SIZE` → `413` se conserva. El mime (`image/jpeg`, `image/png`) se
valida en el service (400), igual que `clasificarArchivoSaliente`.

### `whatsapp-template.service.ts` (criterios 2, 6, 8)

```ts
export type FormatoCabecera = 'NINGUNA' | 'TEXT' | 'IMAGE' | 'DOCUMENT' | 'VIDEO';
export function formatoCabecera(tpl: Pick<IWhatsAppTemplate, 'components'>): FormatoCabecera;

export async function buildTemplatePayload(
  tenantId: TenantId,
  templateId: string,
  parametros: string[],
  cabecera?: { tipo: 'image'; metaMediaId: string },
): Promise<{ name: string; langCode: string; components: unknown[] }>;
```

- Orden de validación: existe (404) → `APPROVED` (422) → nº de parámetros (400) → **cabecera**.
- `formatoCabecera === 'IMAGE'` y sin `cabecera` → `AppError(…, 422)`.
- `cabecera` presente y el formato no es `IMAGE` → `AppError(…, 400)`.
- `DOCUMENT` / `VIDEO` → `AppError(…, 422)` (fuera de alcance).
- Con cabecera: `components = [{ type: 'header', parameters: [{ type: 'image', image: { id } }] }, body…]`.
- **Retrocompatible**: sin el cuarto argumento y con plantillas sin cabecera de media, el resultado es
  idéntico al actual (recordatorios de HU-FLOW-02, envíos manuales y campañas de MARK-01).

Para validar **al programar** sin tener aún `metaMediaId`, el service expone
`assertContenidoCompatible(tenantId, templateId, parametros, tieneImagen)`, que reutiliza las mismas
comprobaciones sin armar el payload.

### `message.service.ts` (criterio 6)

```ts
| { modo: 'plantilla'; templateId: string; parametros: string[]; imagenCabecera?: { metaMediaId: string } }
```

`sendOutbound` pasa `imagenCabecera` a `buildTemplatePayload`. La regla de la ventana de 24 h sigue
viviendo **solo** aquí (`meta-whatsapp.md` §4).

### `campaign.service.ts` (criterios 1–8)

```ts
export async function scheduleCampaign(
  tenantId: TenantId, actorId: string, dto: ScheduleCampaignDTO, imagen: IArchivoSaliente | undefined,
): Promise<ICampaignResponse>;

export async function rescheduleCampaign(
  tenantId: TenantId, actorId: string, campaignId: string,
  dto: RescheduleCampaignDTO, imagen: IArchivoSaliente | undefined,
): Promise<ICampaignResponse>;

/** Sube la imagen a Meta si no hay id o si tiene más de 25 días. Devuelve el id vigente. */
export async function prepararImagenCabecera(
  tenantId: TenantId, campana: LeanCampaign,
): Promise<{ metaMediaId: string } | undefined>;
```

`scheduleCampaign`, en orden:

1. Mime de la imagen ∈ {jpeg, png} → si no, `400`.
2. `assertContenidoCompatible(…)` → `404/422/400` **antes** de guardar nada (criterio 2).
3. Genera el `_id` de la campaña, guarda la imagen con `construirCampaignMediaKey(tenantId, id, mime)`
   en `getMediaStorage()`.
4. `createScoped(Campaign, tenantId, { _id, …, estado: 'programada', contenido: { imagen } })`. Si
   falla, borra la imagen (best-effort, mismo patrón que `enviarMediaSaliente`).
5. `campaignQueue.add(CAMPAIGN_SCHEDULED_START_JOB, { tenantId, campaignId, programadaParaMs },
   { delay: programadaParaMs - Date.now(), jobId: `campaign-start-${id}-${programadaParaMs}` })`.
6. `recordAuditEvent(… 'campaign.schedule' …)`.

**No** consume `campanasMes` al programar: la cuota se cobra al arrancar, que es cuando se gasta
(criterio 7). Programar diez campañas no debe bloquear el mes por adelantado.

`rescheduleCampaign`: `findByIdScoped` (404 si es de otro tenant, criterio 10) → estado ≠
`programada` → `409` → revalida contenido si cambia plantilla/parámetros/imagen → sustituye imagen
(borra la anterior del storage tras guardar la nueva) → `findOneAndUpdateScoped` con condición
`{ estado: 'programada' }` → si cambia la hora, encola un **job nuevo** con el nuevo `jobId`. El job
viejo no se busca ni se borra: al dispararse será no-op (ver abajo).

`cancelCampaign` (existente): ya cubre `programada` sin destinatarios; se añade test explícito y se
confirma que **no** incrementa cuota.

`launchCampaign` gana un paso entre el 4 y el 5 del plan de MARK-01: `prepararImagenCabecera` cuando
`contenido.imagen` no es `null`. Si falla, `AppError` que el llamador (job o barrido) convierte en
`fallida` con `motivo` — **antes** de materializar destinatarios (criterio 6).

### Arranque exacto e idempotencia (criterio 4, 5)

```ts
export async function processScheduledStart(data: CampaignStartJobData): Promise<void>;
```

1. `findByIdScoped(Campaign, data.tenantId, data.campaignId)`. No existe → sale.
2. `estado !== 'programada'` → sale (ya la lanzó el barrido, la cancelaron, o ya corrió).
3. `programadaPara.getTime() !== data.programadaParaMs` → sale: es el job de una hora **anterior** a
   una reprogramación.
4. Delega en el mismo camino que el barrido (`lanzarProgramada(tenantId, campaignId)`, extraído del
   cuerpo de `processCampaignSweep`), que marca `fallida` si el arranque lanza.

La **idempotencia real** entre job y barrido la da `launchCampaign`: la transición
`programada → en_curso` se hace con `findOneAndUpdateScoped({ _id, estado: 'programada' }, …)`
**antes** de materializar; quien pierde la carrera recibe `null` y sale sin escribir. Se añade esa
condición si hoy la transición no es condicional.

`jobId` sin `:` y no entero puro (bug de `HT-AI-02`, `inbound-message.processor.ts:59`). Encolar el
mismo `jobId` dos veces es no-op en BullMQ.

### Endpoints (`docs/api-contract.md` §1 y §3)

Cadena: `authenticateJWT → requireTenant → authorize(['admin']) → subirImagenCampana →
validate(schema) → asyncHandler(controller)`. La subida va entre `authorize` y `validate`, la única
excepción ya documentada en `upload.middleware.ts`.

| Método | Ruta | Descripción |
|---|---|---|
| `POST` | `/api/campaigns/schedule` | Multipart. `201` con la campaña `programada`. Registrada **antes** de `/:id`. |
| `PATCH` | `/api/campaigns/:id/schedule` | Multipart. Reprograma / edita una `programada`. `409` en otro estado. |
| `POST` | `/api/campaigns/:id/cancel` | Existente. Cubre `programada`. |
| `GET` | `/api/campaigns/:id` | Existente. Añade `imagen.url` firmada. |
| `GET` | `/api/whatsapp-templates` | Existente. Añade `cabecera`. |

La URL firmada de la imagen reutiliza el mecanismo de `firmarUrlMedia` (token HMAC con `tenantId` +
recurso + expiración) servido por `GET /api/media/campaigns/:campaignId/imagen?token=…`, que
comprueba que la campaña es del tenant del token (criterio 10).

### Worker (`worker.ts`, `config/queues.ts`)

```ts
export const CAMPAIGN_SCHEDULED_START_JOB = 'start-exact';
```

Rama nueva en el procesador de la cola `campaign-broadcast`, junto a `CAMPAIGN_START_JOB` (barrido)
y `CAMPAIGN_BATCH_JOB`. Misma `concurrency: 1` y mismo `limiter`.

## Frontend — decisiones de diseño (regla §7 del CLAUDE.md raíz)

Antes de escribir **cada** componente se invocan `emil-design-eng`, `impeccable:impeccable` y
`frontend-design:frontend-design`. (`impeccable` no figura en `skills-lock.json`: si no está
disponible al implementar, se avisa al usuario en lugar de omitirla en silencio.)

- **shadcn/ui primero.** Falta `calendar`: `pnpm dlx shadcn@3.8.5 add calendar` (pinneada: 4.x
  asume Tailwind v4). Ya vendorizados: `dialog`, `popover`, `select`, `input`, `textarea`, `button`,
  `card`, `badge`, `alert`, `alert-dialog`, `tooltip`, `progress`.
- **Programador** (`CampaignScheduler`): mismo esqueleto de pasos que `CampaignWizard`
  (segmento → contenido → horario y revisión) para no inventar otro patrón. Paso **contenido**:
  plantillas filtradas a `cabecera === 'IMAGE'` (estado vacío que explica cómo crear una en Meta y
  sincronizar), parámetros del `BODY`, `ImageDropzone` y `MessagePreview` a la derecha en desktop,
  debajo en móvil.
- **`ImageDropzone`**: arrastrar o clic; valida tipo y 5 MB en cliente con mensaje concreto;
  `URL.createObjectURL` para la vista previa y `revokeObjectURL` al desmontar/cambiar; accesible por
  teclado (`button` con `aria-describedby` al hint de formato).
- **`DateTimePicker`**: `popover` + `calendar` (días pasados deshabilitados) + campo de hora; muestra
  la zona (`Intl.DateTimeFormat().resolvedOptions().timeZone`) y una línea relativa ("dentro de 3 días,
  el jueves a las 9:00"). Envía ISO con offset.
- **`MessagePreview`**: burbuja estilo WhatsApp con la imagen y el `BODY` con los `{{n}}` sustituidos
  (reutiliza la lógica de `TemplatePreview` de `features/whatsapp-templates`). Colores por tokens,
  nunca `bg-[#…]`.
- **Movimiento** (criterios de Emil): entrada de la vista previa de imagen con `opacity` +
  `scale(0.98)` ≤ 200 ms `ease-out`; sin animación entre pasos (decisión ya tomada en
  `CampaignWizard.tsx`); `prefers-reduced-motion` respetado.
- **Formularios sin librería** (`useState` + `<form onSubmit>`), toasts de sonner en los hooks de
  mutación, `motivo(error, fallback)` de `features/leads/lib/errors.ts` para los mensajes.
- **Listado/detalle**: badge `programada` con la fecha formateada; acciones **Reprogramar**
  (`RescheduleDialog`) y **Cancelar** (`alert-dialog` de confirmación) solo en `programada`.
- **Light y dark** con tokens semánticos (`bg-card`, `text-muted-foreground`, `border-border`…).

## Migración

Ninguna. `contenido` nace con default `{ imagen: null }`; las campañas existentes se leen igual.
Sin índices nuevos: el arranque exacto va por `_id`, y el barrido usa `{ estado, programadaPara }`
de MARK-01.

## Notas

- **Sin excepción cross-tenant nueva.** El job de arranque lleva `tenantId`; el único barrido
  global sigue siendo el de MARK-01, ya en `docs/multi-tenancy.md` §5.
- **Por qué job con `delay` + barrido y no solo uno.** El `delay` da la hora exacta; el barrido
  cubre la pérdida de Redis (un `delay` de días vive solo en Redis, un documento en Mongo no). Juntos,
  sin coordinación explícita, gracias a la transición condicional `programada → en_curso`.
- **"Exacta" tiene un matiz honesto**: la campaña **arranca** a la hora indicada; el último
  destinatario puede recibirla más tarde por el pacing del tier. Se refleja en la revisión del
  programador ("empieza a las 9:00; con tu cupo termina hacia las 11:40").
- **La plantilla puede dejar de estar `APPROVED`** entre programar y arrancar: `buildTemplatePayload`
  lo detecta al arrancar y la campaña queda `fallida` con el motivo visible en el detalle.

## Documentación a actualizar

| Archivo | Qué |
|---|---|
| `docs/data-model.md` | `campaigns.contenido.imagen` |
| `docs/api-contract.md` | `POST /api/campaigns/schedule`, `PATCH /api/campaigns/:id/schedule`, `imagen` en detalle, `cabecera` en plantillas, ruta firmada de la imagen |
| `docs/integrations/meta-whatsapp.md` | Plantillas con cabecera `IMAGE` en envío (parámetro `header`), caducidad del `media id` |

## Verificación

- `pnpm --filter @sofiapp/api typecheck`
- `pnpm --filter @sofiapp/api test` (incluye los tests de `tasks.md`)
- `pnpm --filter @sofiapp/web build && pnpm --filter @sofiapp/web lint`
- Checklist de PR de `docs/multi-tenancy.md` §9
- Prueba manual con número **sandbox**: programar a +3 min con una plantilla de cabecera `IMAGE`
  aprobada y confirmar recepción de imagen + texto a la hora.
