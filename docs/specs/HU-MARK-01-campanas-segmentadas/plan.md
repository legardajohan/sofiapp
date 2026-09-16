# HU-MARK-01 — Plan técnico (CÓMO)

> Cubre los 16 criterios de `spec.md`. Cada contrato indica entre paréntesis el criterio que cierra.
> Nada aquí redefine las reglas del proyecto: multi-tenancy en `docs/multi-tenancy.md`, patrón de
> feature en `apps/backend/CLAUDE.md`, convenciones REST en `docs/api-contract.md`.

## Archivos a crear

```
apps/backend/src/
├── features/campaign/
│   ├── campaign.types.ts              # ICampaign, ICampaignRecipient, ISegmentoFiltros, DTOs, estados
│   ├── campaign.model.ts              # Campaign          — tenantId required + index
│   ├── campaign-recipient.model.ts    # CampaignRecipient — tenantId required + index
│   ├── campaign.validation.ts         # Zod { body, params, query }
│   ├── campaign.segment.service.ts    # constructor de segmentos: filtros → FilterQuery, conteo, muestra
│   ├── campaign.pacing.ts             # PURO: tier + calidad → presupuesto e intervalo (sin Mongo, sin IO)
│   ├── campaign.service.ts            # crear, lanzar, pausar/reanudar/cancelar, detalle, progreso
│   ├── campaign.controller.ts         # HTTP delgado; tenantId del token
│   └── campaign.routes.ts             # cadena canónica de middlewares
├── integrations/meta/
│   └── meta-phone-number.client.ts    # sonda health_status + quality_rating + messaging_limit_tier
└── workers/
    └── campaign-broadcast.processor.ts # processCampaignJob(data) — puro, sin BullMQ

apps/frontend/src/features/campaigns/
├── api.ts · types.ts · index.ts
├── hooks/useCampaigns.ts
├── lib/pacing.ts                      # formateo de tier/calidad/días estimados (puro)
├── pages/CampaignsPage.tsx · pages/CampaignDetailPage.tsx
└── components/
    ├── CampaignWizard.tsx             # 3 pasos
    ├── SegmentFilters.tsx             # atributo · rol · semáforo · interés · estado · etiquetas
    ├── AudienceMeter.tsx              # volumen vs presupuesto
    ├── CampaignProgress.tsx
    └── CampaignStatusBadge.tsx

docs/specs/HU-MARK-01-campanas-segmentadas/{spec,plan,tasks}.md
```

## Archivos a modificar

| Archivo | Cambio | Criterio |
|---|---|---|
| `apps/backend/src/app.ts` | `app.use('/api/campaigns', campaignRoutes)` — después de `/api/clientes`, antes del `errorHandler` | 1, 4 |
| `apps/backend/src/worker.ts` | Sustituir el **placeholder** `campaign-broadcast` (líneas 50-56) por el worker real | 9 |
| `apps/backend/src/config/queues.ts` | `CAMPAIGN_QUEUE_NAME`, `CAMPAIGN_BATCH_JOB`, `CAMPAIGN_START_JOB`, `campaignQueue` | 4, 9 |
| `apps/backend/src/config/env.ts` | `CAMPAIGN_BATCH_SIZE`, `CAMPAIGN_MIN_INTERVAL_MS`, `CAMPAIGN_SAFETY_MARGIN`, `CAMPAIGN_TIER_TTL_MS`, `CAMPAIGN_MAX_PER_SECOND` | 8, 9 |
| `features/channel/channel.{types,model,service,validation,controller,routes}.ts` | Campos de tier/calidad + `POST /tier/sync` + exponerlos en `GET /status` | 7 |
| `features/message/message.model.ts` | Índice `{ tenantId: 1, tipo: 1, createdAt: -1 }` para el conteo rodante de 24 h | 8 |
| `features/message/message.service.ts` | `updateDeliveryStatus` propaga el estado al `CampaignRecipient` por `metaMessageId` | 10 |
| `features/cliente/cliente.model.ts` · `cliente.types.ts` | `marketingOptOut: Boolean` (default `false`) + índice `{ tenantId, marketingOptOut }` | 3 |
| `features/cliente/cliente.validation.ts` · `cliente.service.ts` | Permitir alternar `marketingOptOut` desde `PATCH /api/clientes/:id` | 3 |
| `features/audit/audit.types.ts` | Acciones `campaign.create`, `campaign.launch`, `campaign.pause`, `campaign.resume`, `campaign.cancel`; entidad `'campaign'` | 4, 12 |
| `realtime/realtime.types.ts` | Variante `campaign:progress` de `RealtimeEvent` | 13 |
| `apps/frontend/src/router.tsx` · `components/layout/nav-config.ts` | Rutas `/campaigns` y `/campaigns/:id` + entrada en el grupo **Operación** | 14 |
| `docs/{data-model,api-contract,domain,product}.md` · `docs/integrations/meta-whatsapp.md` | Ver §Documentación | — |

**Sin cambios** en `features/usage/*`: se reutiliza `assertWithinQuota(tenantId, 'campanasMes')` y
`incrementUsage(tenantId, 'campanasMes')` tal cual (`usage.service.ts:87,101`).

## Contratos

### `campaign.types.ts` (criterios 1, 4, 6, 10, 12)

```ts
export const ESTADOS_CAMPANA = [
  'borrador', 'programada', 'en_curso', 'pausada', 'completada', 'cancelada', 'fallida',
] as const;
export type EstadoCampana = (typeof ESTADOS_CAMPANA)[number];

export const ESTADOS_DESTINATARIO = [
  'pendiente', 'enviado', 'entregado', 'fallido', 'omitido',
] as const;
export type EstadoDestinatario = (typeof ESTADOS_DESTINATARIO)[number];

/** Filtro por atributo personalizado de `Cliente.atributos`. "Grado" entra por aquí (spec §Contexto). */
export interface IFiltroAtributo { key: string; valores: string[] }

export interface ISegmentoFiltros {
  atributos?: IFiltroAtributo[];
  /** Keys del catálogo `contact_options` tipo `rol` — NO un enum: es dato del tenant (HU-CRM-02). */
  rolContacto?: string[];
  /** Keys del catálogo `semaforos` — eje COMERCIAL, `Lead.semaforo` (HU-CRM-04), no la etiqueta del hilo. */
  semaforoLead?: string[];
  nivelInteres?: string[];
  estadoComercial?: EstadoComercial[];
  tagIds?: string[];
}

export interface ICampaign {
  tenantId: Types.ObjectId;
  nombre: string;
  filtros: ISegmentoFiltros;
  /** Ref al catálogo local, NO el `name` suelto de `data-model.md`: así renombrar en Meta no rompe la campaña. */
  templateId: Types.ObjectId;
  /** Parámetros del BODY, FIJOS para toda la campaña (mail-merge por destinatario está fuera de alcance). */
  parametros: string[];
  estado: EstadoCampana;
  programadaPara: Date | null;
  totales: { destinatarios: number; enviados: number; entregados: number; fallidos: number; omitidos: number };
  /** Foto del presupuesto en el momento de lanzar. Es auditoría: explica por qué fue a la cadencia que fue. */
  presupuesto: { tier: MessagingTier; calidad: QualityRating; limiteDiario: number; intervaloMs: number } | null;
  creadaPor: Types.ObjectId;
  iniciadaAt: Date | null;
  finalizadaAt: Date | null;
  /** Motivo de `fallida`/`cancelada`. `null` mientras no aplique. */
  motivo: string | null;
}

export interface ICampaignRecipient {
  tenantId: Types.ObjectId;
  campaignId: Types.ObjectId;
  clienteId: Types.ObjectId;
  telefono: string;
  estado: EstadoDestinatario;
  /** Puente con los `statuses` del webhook. `null` hasta que Meta acepta el envío. */
  metaMessageId: string | null;
  error: string | null;
  enviadoAt: Date | null;
}

/** Datos del job de la cola. Lleva el tenant DENTRO: no hay barrido cross-tenant (criterio 15). */
export interface CampaignJobData { tenantId: string; campaignId: string; lote: number }
```

### `campaign.model.ts` / `campaign-recipient.model.ts` (criterios 6, 10, 15)

```ts
CampaignSchema.index({ tenantId: 1, createdAt: -1 });            // listado (orden por defecto)
CampaignSchema.index({ tenantId: 1, estado: 1, createdAt: -1 }); // ?estado= resuelve filtro y orden con un índice
// Arranque de las programadas. NO lleva `tenantId` delante a propósito, como el barrido de
// HU-FLOW-02: el disparador es global y solo devuelve identificadores; a partir de ahí todo
// vuelve a pasar por *Scoped. Documentar en docs/multi-tenancy.md §5 como excepción.
CampaignSchema.index({ estado: 1, programadaPara: 1 });

CampaignRecipientSchema.index({ tenantId: 1, campaignId: 1, estado: 1 }); // "dame el próximo lote"
CampaignRecipientSchema.index({ tenantId: 1, campaignId: 1, clienteId: 1 }, { unique: true }); // un contacto, un envío
CampaignRecipientSchema.index({ tenantId: 1, metaMessageId: 1 }, { sparse: true }); // statuses del webhook, POR TENANT
```

El índice único `{tenantId, campaignId, clienteId}` es la defensa real contra el doble envío: entre
leer los pendientes y marcarlos cabe otro proceso. El `sparse` sobre `metaMessageId` repite
deliberadamente la forma del de `Message` — `HT-WA-01-V2` cerró una fuga por resolver un
`metaMessageId` **sin** `tenantId`, y eso no se reabre.

### `campaign.pacing.ts` — puro, sin Mongo ni red (criterios 8, 9)

```ts
export const LIMITE_POR_TIER: Record<MessagingTier, number> = {
  TIER_50: 50, TIER_250: 250, TIER_1K: 1_000,
  TIER_10K: 10_000, TIER_100K: 100_000, TIER_UNLIMITED: Number.MAX_SAFE_INTEGER,
};

/** `RED` no reduce: BLOQUEA. Ver `assertPuedeLanzar`. Aquí solo se declara el factor por completitud. */
export const FACTOR_POR_CALIDAD: Record<QualityRating, number> = {
  GREEN: 1, YELLOW: 0.5, RED: 0, UNKNOWN: 0.5,
};

export interface Presupuesto {
  tier: MessagingTier; calidad: QualityRating;
  limiteDiario: number;   // techo tras margen y calidad
  consumido24h: number;   // destinatarios únicos de plantilla en las últimas 24 h
  disponible: number;     // max(limiteDiario - consumido24h, 0)
  intervaloMs: number;
  bloqueado: boolean; motivoBloqueo: string | null;
}

export function calcularPresupuesto(input: {
  tier: MessagingTier; calidad: QualityRating; consumido24h: number;
  margen: number; intervaloMinimoMs: number;
}): Presupuesto;

/** `AppError(…, 409)` si la calidad es RED o si no queda nada disponible hoy. */
export function assertPuedeLanzar(p: Presupuesto): void;
```

`intervaloMs = max(intervaloMinimoMs, floor(86_400_000 / limiteDiario))`. Con `TIER_UNLIMITED` el
divisor se satura y manda `intervaloMinimoMs`; el techo real lo pone entonces el `limiter` de BullMQ
(`CAMPAIGN_MAX_PER_SECOND`), no esta fórmula.

### `campaign.segment.service.ts` (criterios 1, 2, 3, 6)

```ts
/** Traduce los filtros a un FilterQuery de Cliente. NO toca Mongo: se testea sin base de datos. */
export function construirFiltroContacto(filtros: ISegmentoFiltros): FilterQuery<ICliente>;

/** Resuelve el eje del lead: keys de `semaforos` → clienteIds, vía findScoped + distinct. */
export async function resolverClientesPorSemaforo(
  tenantId: TenantId, keys: string[],
): Promise<Types.ObjectId[]>;

/** Filtro completo y tenant-safe: contacto + semáforo del lead + exclusión INCONDICIONAL del opt-out. */
export async function construirFiltroSegmento(
  tenantId: TenantId, filtros: ISegmentoFiltros,
): Promise<FilterQuery<ICliente>>;

export async function previewSegmento(
  tenantId: TenantId, filtros: ISegmentoFiltros,
): Promise<{ total: number; muestra: IContactoResumen[] }>;
```

Reglas de traducción:

| Filtro | Cláusula |
|---|---|
| `atributos: [{ key, valores }]` | `$and` de `{ atributos: { $elemMatch: { key, valor: { $in: valores } } } }` — un `$elemMatch` por clave, para que "grado 11 **y** colegio X" no se resuelva con un solo elemento |
| `rolContacto` | `{ rolContacto: { $in: keys } }` |
| `nivelInteres` / `estadoComercial` | `{ campo: { $in: … } }` |
| `tagIds` | `{ tagIds: { $in: ids } }` (un ObjectId suelto contra un array significa "contiene") |
| `semaforoLead` | `{ _id: { $in: await resolverClientesPorSemaforo(...) } }` |
| **siempre** | `{ marketingOptOut: { $ne: true } }` — `$ne` y no `false`: los documentos anteriores al campo no lo llevan |

Una key inexistente no se valida contra el catálogo: cae sola en un `$in` que no casa con nada y el
segmento sale vacío (criterio 2). Es la convención del proyecto y evita una consulta extra.

### `campaign.service.ts` (criterios 4, 5, 6, 8, 11, 12, 13)

```ts
export async function createCampaign(tenantId, actorId, dto: CreateCampaignDTO): Promise<ICampaignResponse>;
export async function launchCampaign(tenantId, actorId, campaignId): Promise<ICampaignResponse>;
export async function pauseCampaign(tenantId, actorId, campaignId): Promise<ICampaignResponse>;
export async function resumeCampaign(tenantId, actorId, campaignId): Promise<ICampaignResponse>;
export async function cancelCampaign(tenantId, actorId, campaignId): Promise<ICampaignResponse>;
export async function listCampaigns(tenantId, q: ListCampaignsQuery): Promise<IPaged<ICampaignResponse>>;
export async function getCampaign(tenantId, campaignId): Promise<ICampaignDetalleResponse>;
export async function listRecipients(tenantId, campaignId, q): Promise<IPaged<ICampaignRecipientResponse>>;

/** Presupuesto vigente del tenant. Lo usan la vista previa, el lanzamiento y cada lote del worker. */
export async function resolverPresupuesto(tenantId): Promise<Presupuesto>;

/** Destinatarios únicos de plantilla en las últimas 24 h — aggregateScoped + $group por clienteId. */
export async function contarConsumo24h(tenantId): Promise<number>;

/** Puente con el webhook: `delivered` → entregado, `failed` → fallido. No-op si el id no es de campaña. */
export async function applyDeliveryStatusToRecipient(
  tenantId, metaMessageId: string, status: MessageStatus,
): Promise<void>;
```

`launchCampaign` en orden, y el orden importa:

1. `findByIdScoped(Campaign, …)` → `404` si no es del tenant (nunca `403`).
2. Estado `en_curso`/`completada` → devuelve la campaña **sin escribir** (idempotencia, criterio 12).
3. `assertWithinQuota(tenantId, 'campanasMes')` → `429`.
4. `buildTemplatePayload(tenantId, templateId, parametros)` → valida `APPROVED` (422) y número de
   parámetros (400) **antes** de materializar nada (criterio 5).
5. `resolverPresupuesto` + `assertPuedeLanzar` → `409` si `RED` o sin cupo (criterio 8).
6. Materializa los destinatarios: `construirFiltroSegmento` → cursor sobre `findScoped(Cliente, …)`
   → `insertMany` por lotes con `tenantId` inyectado, `ordered: false` (los duplicados del índice
   único se ignoran, no tumban el lote). `totales.destinatarios` queda fijo (criterio 6).
7. `estado: 'en_curso'`, `iniciadaAt`, `presupuesto` congelado.
8. `incrementUsage(tenantId, 'campanasMes')`.
9. `campaignQueue.add(CAMPAIGN_BATCH_JOB, { tenantId, campaignId, lote: 0 }, { jobId: … })`.
10. `recordAuditEvent(tenantId, { actorId, accion: 'campaign.launch', entidad: 'campaign', … })`.

`programadaPara` no encola con `delay` de días: deja la campaña en `programada` y la levanta el
barrido (`CAMPAIGN_START_JOB`), igual que `REMINDER_SWEEP_JOB` de HU-FLOW-02. Un `delay` de BullMQ a
tres días vista se pierde si se purga Redis; un documento en Mongo, no.

### `campaign-broadcast.processor.ts` (criterios 9, 10, 11)

```ts
export async function processCampaignJob(data: CampaignJobData): Promise<void>;
export async function processCampaignSweep(): Promise<void>;  // levanta las `programada` vencidas
```

Bucle de un lote:

1. Relee la campaña con `findByIdScoped`. Si está `pausada`, `cancelada` o `completada` → **sale sin
   reencolar**. Así se pausa sin matar jobs.
2. `resolverPresupuesto`. Si `disponible <= 0` → reencola con `delay` hasta que la ventana libere
   cupo y **sale sin enviar** (criterio 9).
3. Toma `min(CAMPAIGN_BATCH_SIZE, disponible)` destinatarios `pendiente` con
   `findScoped(CampaignRecipient, …)`.
4. Por cada uno: `sendOutbound(tenantId, clienteId, { modo: 'plantilla', templateId, parametros })`,
   marca `enviado` + `metaMessageId` + `enviadoAt`, e **incrementa `totales`**. Un error se captura
   por destinatario → `fallido` + `error`, y el lote sigue (criterio 11).
5. Espera `intervaloMs` entre envíos.
6. `publishRealtime({ type: 'campaign:progress', tenantId, campaignId, totales })`.
7. Si quedan pendientes → reencola `lote + 1`; si no → `completada` (o `fallida` si no se envió nada).

**`jobId` = `` `campaign-${campaignId}-${lote}` ``. Sin `:` y sin ser un entero puro**: BullMQ
rechaza ambos y fue exactamente el bug de `HT-AI-02` (ver `inbound-message.processor.ts:59`). El
`jobId` es también la idempotencia: reencolar el mismo lote es un no-op.

El procesador **no reimplementa** la regla de la ventana de 24 h ni la cuota de mensajes: las dos
viven en `sendOutbound` (`message.service.ts:46`), y `docs/integrations/meta-whatsapp.md` §4 lo exige
explícitamente.

### `channel.*` — tier y calidad (criterio 7)

```ts
export const MESSAGING_TIERS = ['TIER_50','TIER_250','TIER_1K','TIER_10K','TIER_100K','TIER_UNLIMITED'] as const;
export const QUALITY_RATINGS = ['GREEN','YELLOW','RED','UNKNOWN'] as const;

// MetaIntegration (campos nuevos)
messagingTier: { type: String, enum: MESSAGING_TIERS, default: 'TIER_250' }, // el de un número no verificado
qualityRating: { type: String, enum: QUALITY_RATINGS, default: 'UNKNOWN' },
healthStatus:  { type: String, enum: ['AVAILABLE','LIMITED','BLOCKED','UNKNOWN'], default: 'UNKNOWN' },
tierSyncedAt:  { type: Date, default: null },
/** `true` = lo fijó una persona; la sonda no lo pisa. Para cuando la Graph API no responde. */
tierManual:    { type: Boolean, default: false },

export async function syncChannelTier(tenantId): Promise<IChannelStatusResponse>;
```

`meta-phone-number.client.ts` expone `getPhoneNumberHealth(phoneNumberId, accessToken)` contra
`GET /{version}/{phoneNumberId}?fields=health_status,quality_rating,messaging_limit_tier` — la misma
sonda que `docs/integrations/meta-whatsapp.md` §8 ya documenta para diagnóstico. Si falla, se loguea
y se conservan los valores guardados: **no bloquea el lanzamiento** (criterio 7).

### Endpoints (`docs/api-contract.md` §1 y §3)

Cadena fija en todas: `authenticateJWT → requireTenant → authorize(['admin']) → validate(schema) →
asyncHandler(controller)`.

| Método | Ruta | Descripción |
|---|---|---|
| `POST` | `/api/campaigns/segmento/preview` | `{ filtros }` → `{ total, muestra[], presupuesto }`. Registrada **antes** de `/:id`: es ruta literal, no un id. |
| `POST` | `/api/campaigns` | Crea. `{ nombre, filtros, templateId, parametros[], lanzar?, programadaPara? }` → `201`. `429` si la cuota `campanasMes` está agotada. |
| `GET` | `/api/campaigns` | Paginado `{ data, page, limit, total }`, `?estado=`, `createdAt` descendente. |
| `GET` | `/api/campaigns/:id` | Detalle + `totales` + desglose por estado + `presupuesto`. Otro tenant → `404`. |
| `GET` | `/api/campaigns/:id/destinatarios` | Paginado, `?estado=`. |
| `POST` | `/api/campaigns/:id/launch` | Lanza un borrador. Idempotente. |
| `POST` | `/api/campaigns/:id/pause` · `/resume` · `/cancel` | Transiciones. Body vacío, schema `.strict()`. |
| `POST` | `/api/channels/whatsapp/tier/sync` | Refresca tier, calidad y health desde Meta. |

`GET /api/clientes/filter` (fila placeholder de `api-contract.md:128`) **se retira**: los filtros son
un objeto anidado con arrays y no caben de forma legible en query params. Su función la cumple
`POST /api/campaigns/segmento/preview`.

Estados y transiciones válidas:

```
borrador ──lanzar──► en_curso ──┬──pausar──► pausada ──reanudar──► en_curso
    │                           ├──(sin pendientes)──► completada
    └──programar──► programada  └──cancelar──► cancelada
                        │                     (los pendientes quedan `omitido`)
                        └──(llega la hora)──► en_curso        fallida: no se envió nada
```

## Frontend — decisiones de diseño (regla §7 del CLAUDE.md raíz)

Antes de escribir **cada** componente se invocan `emil-design-eng` y
`frontend-design:frontend-design` y se aplican sus criterios. `impeccable:impeccable` no está
instalada en este entorno (`skills-lock.json` solo registra `emil-design-eng`); si se instala antes
de implementar, se suma a las otras dos.

- **shadcn/ui primero.** Faltan `progress` y `alert`: `pnpm dlx shadcn@3.8.5 add progress alert`
  (versión **pinneada**: 4.x asume Tailwind v4 y el proyecto es 3.4 + variables HSL). El resto ya
  está vendorizado: `dialog`, `select`, `table`, `tabs`, `badge`, `checkbox`, `card`, `tooltip`.
- **Registro en tres sitios**, como todo feature del repo: barrel `index.ts` → `router.tsx`
  (`lazy()` + `RequireRole(['admin'])` + `Suspense`) → `nav-config.ts`, grupo **Operación**.
- **Formularios sin librería**: el front no tiene react-hook-form ni zod. `useState` + `<form
  onSubmit>` + `useEffect` de reseteo al abrir, como `EstadoFormDialog.tsx`.
- **Estado**: servidor en TanStack Query (`['campaigns', filtros]`, `['campaign', id]`,
  `['campaign-segment', filtros]` con `keepPreviousData`); el filtro del listado en la **URL**,
  como `LeadsPage`; el borrador del wizard en estado local del componente, no en Zustand.
- **Toasts** de sonner dentro de los hooks de mutación, nunca en el componente.
- **Reutilizar**: `motivo(error, fallback)` de `features/leads/lib/errors.ts` y
  `tagColors(hex, resolvedTheme)` de `features/tags/lib/tag-color.ts` para los chips de semáforo y
  de rol (los colores son dato del tenant y pasan siempre por el helper de contraste).
- **Tiempo real**: `campaign:progress` actualiza la caché de Query con `setQueryData`; no se
  refetchea a mano (regla del `CLAUDE.md` del front).
- **Wizard de 3 pasos**, con el conteo visible desde el primero:
  1. **Segmento** — `SegmentFilters` con selects de catálogo (rol, semáforo, interés, estado,
     etiquetas) y un constructor de filtros por atributo (`key` + valores). Debajo, en vivo,
     "N contactos" con `useDebouncedValue` (ya existe en `hooks/use-debounced-value.ts`).
  2. **Plantilla** — solo `APPROVED`, con `TemplatePreview` reutilizado de
     `features/whatsapp-templates/components/`, y los parámetros del BODY.
  3. **Revisión** — `AudienceMeter`: volumen vs presupuesto, tier, calidad, días estimados. Aviso
     (`alert`) si el volumen excede el cupo del día; **botón deshabilitado con explicación** si la
     calidad es `RED`.
- **Detalle** (`CampaignDetailPage`): `CampaignProgress` con barra y desglose
  enviados/entregados/fallidos/omitidos + tabla de destinatarios paginada con filtro por estado.
  Fila vacía distinguiendo "sin datos" de "los filtros no casan", como `LeadsTable`.
- **Light y dark** con tokens semánticos (`bg-card`, `text-muted-foreground`, `border-border`…).
  Cero `bg-[#...]` en `src/**`.

## Migración

Ninguna destructiva. Tres campos nuevos con default:

- `Cliente.marketingOptOut` → ausente se lee como "no excluido" (`$ne: true` lo cubre sin backfill).
- `MetaIntegration.messagingTier` → default `TIER_250`, el de un número sin verificar; el
  administrador lo corrige con el sync o a mano.
- `MetaIntegration.qualityRating` / `healthStatus` → `UNKNOWN`, que se trata como `YELLOW` a efectos
  de presupuesto (mitad de cupo): ante la duda, conservador.

Los índices nuevos los crea Mongoose al arrancar. El de `Message` (`{tenantId, tipo, createdAt}`) es
el único sobre una colección grande; se crea en segundo plano, que es el comportamiento por defecto
de Atlas.

## Notas

- **Excepción cross-tenant nueva.** El barrido de campañas programadas (`CAMPAIGN_START_JOB`) es
  global, como el de recordatorios de HU-FLOW-02: consulta `{ estado: 'programada', programadaPara:
  { $lte: now } }` y **solo devuelve `tenantId` + `campaignId`**; a partir de ahí todo vuelve a pasar
  por `*Scoped`. Hay que **añadirlo a `docs/multi-tenancy.md` §5** como la quinta —y por ahora
  última— excepción documentada, y cubrirlo con un test de aislamiento.
- **Concurrencia 1 + `limiter`.** El worker de campañas va con `concurrency: 1` (el pacing es
  secuencial por definición) y un `limiter: { max: CAMPAIGN_MAX_PER_SECOND, duration: 1000 }` como
  red de seguridad frente al límite de ~80 msg/s de la Graph API (`meta-whatsapp.md` §5). El
  reintento ante `429` ya lo hace `meta-whatsapp.client.ts` con backoff exponencial.
- **El conteo de 24 h cuenta destinatarios únicos, no mensajes.** El tier de Meta se mide en
  *conversaciones iniciadas por la empresa*, así que dos plantillas al mismo contacto el mismo día
  cuentan una vez. De ahí el `$group` por `clienteId` en `contarConsumo24h`.
- **`parametros` fijos por campaña** es una limitación consciente (spec §Alcance). El día que haga
  falta mail-merge, el sitio donde entra es `CampaignRecipient` (una columna `parametros` propia),
  sin tocar el resto del diseño.
- **La campaña no abre ventana de 24 h.** Enviar una plantilla no habilita texto libre; si el
  contacto responde, el inbound normal abre la ventana por el camino de siempre.

## Documentación a actualizar

| Archivo | Qué |
|---|---|
| `docs/data-model.md` | `campaigns` y `campaign_recipients` reales (sustituyen al boceto de las líneas 378-410), campos de tier en `MetaIntegration`, `Cliente.marketingOptOut` |
| `docs/api-contract.md` | Las 8 filas de arriba; retirar el placeholder `GET /api/clientes/filter`; evento `campaign:progress` en §7 |
| `docs/integrations/meta-whatsapp.md` | §5 pasa de "fuera de alcance" a implementado: pacing por tier, sonda de §8 promovida a uso en caliente |
| `docs/domain.md` | Entrada **Campaña** con su ciclo de estados y la aclaración de que segmenta por el eje comercial |
| `docs/multi-tenancy.md` | §5: quinta excepción (barrido de campañas programadas) |
| `docs/product.md` | M07 deja de ser "Fase 3 pendiente" |

## Verificación

- `pnpm --filter backend typecheck`
- `pnpm --filter backend test` (incluye los tests de `tasks.md`)
- `pnpm --filter frontend build && pnpm --filter frontend lint`
- Checklist de PR de `docs/multi-tenancy.md` §9
- Prueba manual con números **sandbox** antes de producción, como exige `meta-whatsapp.md` §5: una
  infracción de políticas puede suspender la WABA del tenant.
