# HU-MARK-07 — Plan técnico (CÓMO)

> Cubre los 14 criterios de `spec.md`. Cada contrato indica entre paréntesis el criterio que cierra.
> Nada aquí redefine las reglas del proyecto: multi-tenancy en `docs/multi-tenancy.md`, patrón de
> feature en `apps/backend/CLAUDE.md`, convenciones REST en `docs/api-contract.md`. Se extiende el
> feature `campaign` de HU-MARK-01; donde se dice "existente" se reutiliza **sin reimplementar**.

## Archivos a crear

```
apps/backend/src/
├── features/campaign/
│   ├── campaign.rango.ts                     # PURO: rango → { desde, hasta } en la zona del tenant (sin Mongo, sin IO)
│   ├── campaign.rango.test.ts
│   ├── campaign.audience-reciente.service.ts # aggregate de salientes → clienteIds → filtro de Cliente + preview
│   ├── campaign.audience-reciente.test.ts
│   ├── campaign.audience-reciente.isolation.test.ts
│   ├── campaign.send.test.ts                 # send + etiqueta (nueva / existente / colisión / ajena)
│   └── campaign.send.isolation.test.ts
├── utils/
│   └── zona-horaria.util.ts                  # esZonaValida, inicioDelDiaEnZona, finDelDiaEnZona, hoyEnZona (Intl, sin libs)
└── workers/
    └── campaign-broadcast.tag.test.ts        # etiqueta solo a `enviado`, no duplica, $pull en failed

apps/frontend/src/features/campaigns/
├── lib/rango.ts · lib/rango.test.ts          # etiquetas de rango, sugerencia de nombre, límites del picker (puro)
├── hooks/useAudiencePreview.ts               # preview con useDebouncedValue + keepPreviousData
└── components/
    ├── audiencia/AudienceTypeSwitch.tsx      # "Por filtros" | "Mensajes recientes"
    ├── audiencia/RecentMessagesAudience.tsx  # ToggleGroup 1d/3d/7d/Personalizado + conteo en vivo
    ├── audiencia/DateRangePicker.tsx         # Calendar mode="range" + Popover, futuro y >90 días deshabilitados
    ├── TagField.tsx · TagField.test.tsx      # Command: elegir existente o crear; nombre sugerido editable
    └── CampaignAudienceSummary.tsx           # detalle: filtro aplicado + chip de etiqueta

docs/specs/HU-MARK-07-campana-mensajes-recientes/{spec,plan,tasks}.md
```

## Archivos a modificar

| Archivo | Cambio | Criterio |
|---|---|---|
| `features/tenant/tenant.{types,model,validation,service,controller,routes}.ts` | `zonaHoraria` (default `America/Bogota`); `getAjustesTenant` / `updateAjustesTenant`; `GET`/`PATCH /me/ajustes` con `requireTenant` + `authorize(['admin'])`, **antes** de `/:id` | 2, 11 |
| `features/cliente/cliente.{types,model,validation,service}.ts` | `bloqueado: { type: Boolean, required: true, default: false }` + índice `{ tenantId, bloqueado }`; editable en `PATCH /api/clientes/:id` | 5, 11 |
| `features/campaign/campaign.segment.service.ts` | `construirFiltroSegmento` añade `{ bloqueado: { $ne: true } }` junto al opt-out; `resumirSegmento` cuenta `bloqueados` | 5 |
| `features/tag/tag.{types,model,validation,service}.ts` | `origen: 'manual' \| 'campana'` (default `manual`), `campaignId?`, `maxlength: 60`; `findOrCreateTagPorNombre(tenantId, nombre, origen, campaignId)` | 7, 9 |
| `features/message/message.model.ts` | Índice `{ tenantId: 1, direccion: 1, createdAt: -1 }` | 4 |
| `features/campaign/campaign.types.ts` | Tipos de audiencia, `tagId`, `etiquetaAgregada`, DTOs (ver Contratos) | 1, 6, 7, 8, 10 |
| `features/campaign/campaign.model.ts` · `campaign-recipient.model.ts` | Subdoc `audiencia` (default `{ tipo: 'segmento' }`), `tagId`, índice `{ tenantId, tagId }`; `etiquetaAgregada` en el destinatario | 6, 8 |
| `features/campaign/campaign.validation.ts` | `previewAudienciaSchema`, `audiencia` en `createCampaignSchema`, `sendCampaignSchema` | 1, 3, 7 |
| `features/campaign/campaign.service.ts` | `createCampaign` congela el rango; `materializarDestinatarios` recibe un `FilterQuery<ICliente>` ya construido (`construirFiltroAudiencia`); `sendCampaign`; `toCampaignResponse` con `audiencia` y `etiqueta`; `applyDeliveryStatusToRecipient` hace `$pull` | 6, 7, 8, 10 |
| `features/campaign/campaign.controller.ts` · `campaign.routes.ts` | `previewAudienceController`, `sendCampaignController`; rutas nuevas | 1, 7 |
| `workers/campaign-broadcast.processor.ts` | Tras marcar `enviado` (línea ~188): etiquetar si `campaign.tagId` | 8 |
| `features/lead/lead.{validation,service}.ts` | Query `etiqueta` (objectId) → salto previo a `Cliente.tagIds`, como `semaforo` | 9 |
| `features/audit/audit.types.ts` | Acción `campaign.send` | 7 |
| `config/env.ts` | `CAMPAIGN_AUDIENCE_MAX_DAYS: z.coerce.number().int().positive().default(90)` | 3 |
| `apps/frontend/src/features/campaigns/{api,types}.ts` · `hooks/useCampaigns.ts` | `previewAudience`, `sendCampaign`, `useSendCampaign` | 1, 7 |
| `apps/frontend/src/features/campaigns/components/CampaignWizard.tsx` | Paso 1 con `AudienceTypeSwitch`; revisión con `TagField`; el botón final llama a `send` | 12 |
| `apps/frontend/src/features/campaigns/pages/CampaignDetailPage.tsx` | `CampaignAudienceSummary` sobre `CampaignProgress` | 10, 12 |
| `apps/frontend/src/features/tags/components/TagChip.tsx` · `TagFormDialog.tsx` | Truncado + `Tooltip`; `maxLength` 60 | 9, 12 |
| `apps/frontend/src/features/leads/components/LeadsFilters.tsx` · `pages/LeadsPage.tsx` | Filtro "Etiqueta" (en la URL, como el resto) | 9, 12 |
| `apps/frontend/src/features/contacts/…` (ficha) | `Switch` "Bloqueado" con explicación de su efecto en campañas | 5, 12 |
| Ajustes del tenant (front, página de ajustes/canal existente) | `Select` de zona horaria (`Intl.supportedValuesOf('timeZone')`) | 11, 12 |
| `docs/{data-model,api-contract,domain}.md` | Ver §Documentación | — |

**Sin cambios** en el pacing (`campaign.pacing.ts`), la cola (`config/queues.ts`), el worker de
arranque programado ni `sendOutbound`: la campaña de mensajes recientes es una campaña más.

## Contratos

### `zona-horaria.util.ts` (criterios 2, 3, 11)

```ts
/** `true` si `Intl` reconoce la zona IANA. */
export function esZonaValida(zona: string): boolean;
/** `YYYY-MM-DD` de `fecha` vista en `zona`. */
export function fechaEnZona(fecha: Date, zona: string): string;
/** Instante UTC de las 00:00:00.000 del día `ymd` en `zona` (resuelve el offset con Intl, soporta DST). */
export function inicioDelDiaEnZona(ymd: string, zona: string): Date;
/** Instante UTC de las 23:59:59.999 del día `ymd` en `zona`. */
export function finDelDiaEnZona(ymd: string, zona: string): Date;
```

Los helpers de `utils/date-range.util.ts` trabajan en UTC (`inicioDelDiaUtc`); no sirven para una
zona arbitraria, por eso se añaden aquí sin tocar los existentes. Sin dependencias nuevas: el
proyecto ya resuelve zonas con `Intl.DateTimeFormat` (`reports.service.ts`, `flow.trigger.ts`).

### `campaign.rango.ts` — puro (criterios 2, 3)

```ts
export const RANGOS_AUDIENCIA = ['1d', '3d', '7d', 'custom'] as const;
export type RangoAudiencia = (typeof RANGOS_AUDIENCIA)[number];

export const HORAS_POR_RANGO: Record<Exclude<RangoAudiencia, 'custom'>, number> = {
  '1d': 24, '3d': 72, '7d': 168,
};

export interface EntradaRango { rango: RangoAudiencia; desde?: string; hasta?: string } // YYYY-MM-DD
export interface RangoResuelto { desde: Date; hasta: Date }

/** Lanza `AppError(…, 400)` si custom viene incompleto, invertido, futuro o excede `maxDias`. */
export function resolverRangoAudiencia(
  entrada: EntradaRango, zona: string, ahora: Date, maxDias: number,
): RangoResuelto;
```

- Preset: `{ desde: ahora − horas, hasta: ahora }`.
- `custom`: `hoy = fechaEnZona(ahora, zona)`; `hasta > hoy` → 400 «No se permiten fechas futuras»;
  `desde > hasta` → 400; días inclusivos `> maxDias` → 400 «El rango máximo es de N días»;
  resultado `{ inicioDelDiaEnZona(desde), min(finDelDiaEnZona(hasta), ahora) }`.
- Zod valida la **forma** (`YYYY-MM-DD`, `custom` exige ambas); la **semántica** (futuro, máximo)
  vive aquí porque necesita la zona del tenant, que Zod no conoce.

### `campaign.types.ts` (criterios 1, 6, 7, 8, 10)

```ts
export const TIPOS_AUDIENCIA = ['segmento', 'mensajes_recientes'] as const;
export type TipoAudiencia = (typeof TIPOS_AUDIENCIA)[number];

/** Filtro aplicado, guardado para trazabilidad (criterio 6). En `segmento` solo va `tipo`. */
export interface IAudienciaCampana {
  tipo: TipoAudiencia;
  rango: RangoAudiencia | null;
  /** Instantes RESUELTOS y congelados al crear. `null` en `segmento`. */
  desde: Date | null;
  hasta: Date | null;
  /** Zona con la que se resolvió `custom` (y se muestra el rango). */
  zonaHoraria: string | null;
}

export type AudienciaInputDTO =
  | { tipo: 'segmento' }
  | { tipo: 'mensajes_recientes'; rango: Exclude<RangoAudiencia, 'custom'> }
  | { tipo: 'mensajes_recientes'; rango: 'custom'; desde: string; hasta: string };

// ICampaign + { audiencia: IAudienciaCampana; tagId: Types.ObjectId | null }
// ICampaignRecipient + { etiquetaAgregada: boolean | null }  // null = la campaña no etiqueta / aún no se envió
// CreateCampaignDTO + { audiencia?: AudienciaInputDTO }
// IResumenSegmento + { bloqueados: number }  → coinciden = validos + bajas + bloqueados + excluidosAMano + duplicados

export type EtiquetaEnvioDTO = { tagId: string } | { nombre: string };
export interface SendCampaignDTO { etiqueta?: EtiquetaEnvioDTO }

export interface IAudiencePreviewResponse extends ISegmentPreviewResponse {
  rango: { desde: string; hasta: string; zonaHoraria: string };
}

// ICampaignResponse + {
//   audiencia: { tipo; rango; desde: string | null; hasta: string | null; zonaHoraria: string | null };
//   etiqueta: { id: string; nombre: string; color: string } | null;
// }
```

### Modelos (criterios 6, 8, 9)

```ts
// campaign.model.ts
audiencia: {
  tipo:        { type: String, enum: TIPOS_AUDIENCIA, required: true, default: 'segmento' },
  rango:       { type: String, enum: RANGOS_AUDIENCIA, default: null },
  desde:       { type: Date, default: null },
  hasta:       { type: Date, default: null },
  zonaHoraria: { type: String, default: null },
},
tagId: { type: Schema.Types.ObjectId, ref: 'Tag', default: null },
CampaignSchema.index({ tenantId: 1, tagId: 1 });           // "campañas que generaron esta etiqueta"

// campaign-recipient.model.ts — índices {tenantId, campaignId, …} existentes, sin cambios
etiquetaAgregada: { type: Boolean, default: null },

// tag.model.ts
nombre:     { type: String, required: true, trim: true, maxlength: 60 },
origen:     { type: String, enum: ['manual', 'campana'], required: true, default: 'manual' },
campaignId: { type: Schema.Types.ObjectId, ref: 'Campaign', default: null },
// índice único { tenantId, nombre } con collation es/strength 2 — EXISTENTE, sin cambios

// cliente.model.ts
bloqueado: { type: Boolean, required: true, default: false },
ClienteSchema.index({ tenantId: 1, bloqueado: 1 });

// message.model.ts
MessageSchema.index({ tenantId: 1, direccion: 1, createdAt: -1 }); // $match de salientes por rango

// tenant.model.ts
zonaHoraria: { type: String, required: true, default: 'America/Bogota' },
```

Campañas existentes: sin `audiencia` en el documento → Mongoose aplica el default al leer
(`tipo: 'segmento'`) y todo el camino de MARK-01 sigue igual. Sin migración destructiva.

### `campaign.audience-reciente.service.ts` (criterios 1, 4, 5, 13)

```ts
/** clienteIds con al menos un saliente en el rango. Un $group = un contacto una vez (criterio 4). */
export async function resolverClientesConSalientes(
  tenantId: TenantId, rango: RangoResuelto,
): Promise<Types.ObjectId[]>;
// aggregateScoped<{ _id: Types.ObjectId }>(Message, tenantId, [
//   { $match: { direccion: 'outbound', createdAt: { $gte: desde, $lte: hasta } } },
//   { $group: { _id: '$clienteId' } },
// ])   ← aggregateScoped antepone { $match: { tenantId } } (base.repository.ts:117)

/** Filtro de Cliente tenant-safe para esta audiencia, con exclusiones INCONDICIONALES. */
export async function construirFiltroMensajesRecientes(
  tenantId: TenantId, rango: RangoResuelto,
): Promise<FilterQuery<ICliente>>;
// { _id: { $in: ids }, marketingOptOut: { $ne: true }, bloqueado: { $ne: true } }

export async function previewAudienciaReciente(
  tenantId: TenantId, entrada: EntradaRango,
): Promise<IAudiencePreviewResponse>;
```

`previewAudienciaReciente` lee `Tenant.zonaHoraria`, resuelve el rango con `resolverRangoAudiencia`
y reutiliza la lógica de `resumirSegmento` / `contarTelefonosUnicos` / `toContactoResumen` de
`campaign.segment.service.ts` (se exportan o se extrae un helper `resumirFiltro(tenantId,
coincidencia)` que reciben ambos tipos). El `presupuesto` sale de `resolverPresupuesto` existente.

Volumen: el `$group` devuelve un id por contacto con salientes en ≤ 90 días; para un tenant grande
son decenas de miles de ObjectIds, aceptable en un `$in`. Si un día no lo fuera, el sitio para
cambiarlo es esta función (un `$lookup` a `clientes` dentro del pipeline), sin tocar nada más.

### `campaign.service.ts` (criterios 6, 7, 8, 10)

```ts
/** Despacha por tipo. Lo usan createCampaign (conteo) y launchCampaign (materialización). */
async function construirFiltroAudiencia(tenantId, c: LeanCampaign): Promise<FilterQuery<ICliente>>;

export async function previewAudience(tenantId, dto): Promise<IAudiencePreviewResponse>;
export async function sendCampaign(
  tenantId: TenantId, actorId: string, campaignId: string, dto: SendCampaignDTO,
): Promise<ICampaignResponse>;
```

- `createCampaign`: si `audiencia.tipo === 'mensajes_recientes'`, resuelve el rango **una vez**,
  guarda `{ tipo, rango, desde, hasta, zonaHoraria }`, ignora `filtros` (se guarda `{}`) y fija
  `totales.destinatarios` con el conteo de válidos de ese rango.
- `materializarDestinatarios(tenantId, campaignId, filtro)` pasa a recibir el filtro ya construido
  (`construirFiltroAudiencia`) en vez de `filtros`; el cursor, el `Set` de teléfonos y el
  `insertMany` con `ordered: false` quedan **igual**. Así la vista previa y el envío cuentan con la
  misma regla y el mismo rango congelado (criterio 6).
- `sendCampaign`, en orden:
  1. `getCampaignOrFail` → `404` si no es del tenant.
  2. Ya `en_curso`/`completada` → devuelve sin escribir (idempotencia de `launchCampaign`).
  3. `etiqueta.tagId` → `findByIdScoped(Tag, tenantId, id)` o `404`. `etiqueta.nombre` →
     `findOrCreateTagPorNombre(tenantId, nombre, 'campana', campaignId)`.
  4. `findOneAndUpdateScoped(Campaign, …, { $set: { tagId } })`.
  5. `launchCampaign(tenantId, actorId, campaignId)` — cuota, plantilla, presupuesto, encolado y
     auditoría existentes. Si lanza un `AppError`, la etiqueta creada en 3 **se conserva** (queda
     vacía y reutilizable; reintentar `send` con el mismo nombre la reutiliza).
  6. `recordAuditEvent(… 'campaign.send', { tagId })`.
- `applyDeliveryStatusToRecipient`: con `failed`, si el destinatario tiene `etiquetaAgregada: true`
  y la campaña `tagId`, `findOneAndUpdateScoped(Cliente, tenantId, { _id }, { $pull: { tagIds } })`
  y `etiquetaAgregada: false`.

### `tag.service.ts` (criterios 7, 9)

```ts
/** Busca por nombre con la collation del índice; si no existe la crea. E11000 en carrera → relee. */
export async function findOrCreateTagPorNombre(
  tenantId: TenantId, nombre: string, origen: OrigenTag, campaignId: string | null,
): Promise<ITagResponse>;
```

Busca con `findOneScoped(Tag, tenantId, { nombre }).collation({ locale: 'es', strength: 2 })` —
**la misma collation del índice**, o "Campaña Promo" y "campaña promo" no colisionarían en la
consulta pero sí en el índice. El color de una etiqueta nueva sale de la paleta que ya usa
`createTag`. `ITagResponse` suma `origen` y `campaignId`.

### Worker — etiquetado (criterio 8, 13)

En `campaign-broadcast.processor.ts`, inmediatamente después del `$set: { estado: 'enviado' }`:

```ts
if (campaign.tagId) {
  const agregado = await findOneAndUpdateScoped(
    Cliente, tenantId,
    { _id: destinatario.clienteId, tagIds: { $ne: campaign.tagId } },
    { $addToSet: { tagIds: campaign.tagId } },
  );
  await findOneAndUpdateScoped(CampaignRecipient, tenantId, { _id: destinatario._id },
    { $set: { etiquetaAgregada: agregado !== null } });
}
```

El filtro `tagIds: { $ne }` es lo que permite saber si **esta** campaña puso la etiqueta (para el
`$pull` del `failed` posterior) sin leer antes; el `$addToSet` garantiza que no se duplique aunque
dos lotes coincidan. Los `fallido` caen en el `catch` por destinatario y nunca llegan aquí; los
`omitido` y excluidos nunca se envían. El `tenantId` es el del job (`CampaignJobData`).

### Endpoints (`docs/api-contract.md` §1 y §3)

Cadena fija: `authenticateJWT → requireTenant → authorize(['admin']) → validate(schema) → asyncHandler(controller)`.

| Método | Ruta | Descripción |
|---|---|---|
| `POST` | `/api/campaigns/audience/preview` | `{ audiencia }` → `IAudiencePreviewResponse`. Literal: **antes** de `/:id`. |
| `POST` | `/api/campaigns` | Existente; acepta `audiencia?`. `201`. |
| `POST` | `/api/campaigns/:id/send` | `{ etiqueta?: { tagId } \| { nombre } }` → `200` con la campaña. Body `.strict()`. |
| `GET` | `/api/campaigns/:id` | Existente; suma `audiencia` y `etiqueta`. |
| `GET` | `/api/tags` | Existente; suma `origen` y `campaignId`. |
| `GET` | `/api/leads?etiqueta=<tagId>` | Existente; filtro nuevo. Tag inexistente → lista vacía (convención de `?semaforo=`). |
| `GET`/`PATCH` | `/api/tenants/me/ajustes` | `{ zonaHoraria }`. `admin` + `requireTenant`. Registrada **antes** de `/:id` (superadmin). |

Zod (`campaign.validation.ts`):

```ts
const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha con formato AAAA-MM-DD.');
const audienciaSchema = z.discriminatedUnion('tipo', [
  z.object({ tipo: z.literal('segmento') }).strict(),
  z.object({
    tipo: z.literal('mensajes_recientes'),
    rango: z.enum(RANGOS_AUDIENCIA),
    desde: ymd.optional(), hasta: ymd.optional(),
  }).strict().refine((a) => a.rango !== 'custom' || (a.desde && a.hasta),
    { message: 'El rango personalizado necesita fecha de inicio y de fin.', path: ['desde'] }),
]);
const etiquetaSchema = z.union([
  z.object({ tagId: objectId }).strict(),
  z.object({ nombre: z.string().trim().min(1).max(60) }).strict(),
]);
export const sendCampaignSchema = z.object({
  body: z.object({ etiqueta: etiquetaSchema.optional() }).strict(),
  params: z.object({ id: objectId }), query: empty,
});
```

## Frontend — decisiones de diseño (regla §7 del CLAUDE.md raíz)

Antes de escribir **cada** componente se invocan `emil-design-eng`, `impeccable:impeccable` y
`frontend-design:frontend-design` y se aplican sus criterios. **`impeccable:impeccable` no está
instalada hoy en este entorno**: hay que instalarla antes de `/sdd-implement` (o dejar constancia si
no es posible), como ya anotó MARK-01.

- **shadcn/ui primero.** Faltan `command` (autocompletar) y `toggle-group` (selector de rango):
  `pnpm dlx shadcn@3.8.5 add command toggle-group` (versión pinneada, ver `apps/frontend/CLAUDE.md`).
  Ya vendorizados: `calendar` (react-day-picker 9, `mode="range"`), `popover`, `badge`, `tooltip`,
  `switch`, `select`, `alert`, `progress`.
- **Paso 1 (Audiencia).** `AudienceTypeSwitch` arriba (dos opciones, `ToggleGroup` tipo segmented).
  "Por filtros" muestra el `AudienceBuilder` actual sin cambios. "Mensajes recientes" muestra
  `RecentMessagesAudience`: `ToggleGroup` *Último día · 3 días · 7 días · Personalizado*; con
  Personalizado aparece `DateRangePicker` (`disabled={{ after: hoy }}` y, con el primer día elegido,
  días a más de 90 deshabilitados) con `locale es` como `DateTimePicker.tsx`. Debajo, el conteo en
  vivo (`SegmentCount`/`ResumenAudiencia` reutilizados) con el rango resuelto que devuelve el
  backend ("del 28/10 08:14 al 31/10 08:14 · America/Bogota") — la fuente de verdad es el servidor,
  el cliente no recalcula fechas.
- **Revisión.** `AudienceMeter` existente + muestra + desglose (bajas, bloqueados, duplicados). Bajo
  él, `TagField`: `Switch` "Etiquetar a los destinatarios" (activo por defecto) y un `Command` en
  `Popover` con las etiquetas existentes y la opción "Crear «…»" cuando el texto no coincide. El
  valor inicial es la sugerencia `Campaña {nombre} - {dd/mm/aaaa}` (`lib/rango.ts`, recortada a 60),
  editable; contador de caracteres discreto. El botón final pasa a "Enviar campaña" y llama a
  `POST /:id/send` (el flujo segmento sin etiqueta sigue usando el mismo botón).
- **Detalle.** `CampaignAudienceSummary`: tipo de audiencia, rango y fechas resueltas con la zona, y
  el `TagChip` de la etiqueta enlazado a `/leads?etiqueta=<id>`. Encima de `CampaignProgress`.
- **Estado.** Servidor en TanStack Query (`['campaign-audience', audiencia]` con `keepPreviousData`);
  borrador del wizard en estado local; toasts de sonner dentro de los hooks; `motivo()` para errores.
- **Movimiento.** Sin animación entre pasos (decisión existente del wizard). Transiciones solo de
  opacidad/altura al aparecer el date picker, ≤ 200 ms, `ease-out`, respetando
  `prefers-reduced-motion` (criterio `emil-design-eng`).
- **Light y dark** con tokens semánticos (`bg-card`, `text-muted-foreground`, `border-border`…);
  colores de etiqueta siempre vía `tagColors(hex, resolvedTheme)`. Cero `bg-[#…]`.

## Notas

- **Presets rodantes.** "Último día (24 h)" es literalmente 24 h; con "días calendario" el 1d de las
  08:00 cubriría solo 8 h. La zona del tenant importa para `custom` y para mostrar el rango.
- **Sin excepción cross-tenant nueva.** No hay barridos: la vista previa y el envío son por tenant y
  el job ya lleva `tenantId` dentro. `docs/multi-tenancy.md` §5 no cambia.
- **El pacing sigue mandando.** Una audiencia de mensajes recientes puede ser grande; el envío pasa
  por el mismo presupuesto diario y `limiter` de MARK-01 ("envío controlado" de la HU).
- **El índice de `Message`.** `{ tenantId, direccion, createdAt }` hace que el `$match` sea un rango
  sobre índice; sin él, en un tenant con meses de historial el aggregate recorrería todos sus
  mensajes, entrantes incluidos.
- **`etiquetaAgregada`** es lo mínimo para no borrar una etiqueta que el contacto ya tenía cuando un
  `failed` llega tarde.

## Documentación a actualizar

| Archivo | Qué |
|---|---|
| `docs/data-model.md` | `campaigns.audiencia`, `campaigns.tagId`, `campaign_recipients.etiquetaAgregada`, `tags.origen/campaignId/maxlength 60`, `clientes.bloqueado`, `tenants.zonaHoraria`, índice nuevo de `messages` |
| `docs/api-contract.md` | Filas de §Endpoints |
| `docs/domain.md` | En **Campaña**: tipos de audiencia y regla de etiquetado; **Contacto bloqueado** |

## Verificación

- `pnpm --filter @sofiapp/api typecheck`
- `pnpm --filter @sofiapp/api test` (incluye los tests de `tasks.md`)
- `pnpm --filter @sofiapp/web build && pnpm --filter @sofiapp/web lint` (+ `test` del front)
- Checklist de PR de `docs/multi-tenancy.md` §9
- Prueba manual con números **sandbox** de Meta: campaña `1d` y `custom` con etiqueta nueva; ver la
  etiqueta en el detalle, en `/etiquetas` y filtrando `/leads`.
