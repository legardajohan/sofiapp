# HU-MARK-04 — Plan técnico (CÓMO)

> Cubre los 9 criterios de `spec.md`. Cada contrato indica entre paréntesis el criterio que cierra.
> Nada aquí redefine las reglas del proyecto: multi-tenancy en `docs/multi-tenancy.md`, patrón de
> feature en `apps/backend/CLAUDE.md`, convenciones REST en `docs/api-contract.md`. Es una
> **extensión** del feature `campaign`: no se crea feature nuevo.

## Archivos a crear

```
apps/backend/src/features/campaign/
├── campaign.metrics.service.ts            # captura de eventos + agregación (1–5)
├── campaign.metrics.service.test.ts       # captura idempotente, ventanas, last-touch, tasas (1–4)
├── campaign.metrics.routes.test.ts        # 200 forma, 403 no-admin, 400 rango (4, 5)
└── campaign.metrics.isolation.test.ts     # 404 cross-tenant; eventos de A no tocan B (8)

apps/frontend/src/features/campaigns/components/
├── CampaignMetricsPanel.tsx               # tarjeta del detalle: embudo + notas + estados vacíos (7)
├── CampaignMetricsPanel.test.tsx
├── MetricsFunnel.tsx                      # barras horizontales del embudo con conteo y tasa (7)
└── CampaignsOverview.tsx                  # fila de KPIs del período + selector 7/30/90 d (7)
```

`campaign.metrics.service.ts` va en archivo propio (como `campaign.segment.service.ts`): lo importan
`campaign.service.ts`, `lead.service.ts` y el worker de inbound, y meterlo en `campaign.service.ts`
crearía el ciclo `lead.service → campaign.service → … → lead.service`.

## Archivos a modificar

| Archivo | Cambio | Criterio |
|---|---|---|
| `features/campaign/campaign.types.ts` | `ICampaignRecipient` + `entregadoAt`, `leidoAt`, `respondidoAt`, `convertidoAt`; `ICampaignMetrics`, `ICampaignMetricsResponse`, `ICampaignsOverviewResponse`, `CampaignsOverviewQuery` | 1–5 |
| `features/campaign/campaign-recipient.model.ts` | 4 campos `Date` (default `null`) + índice de atribución | 1–3 |
| `features/campaign/campaign.service.ts` | `applyDeliveryStatusToRecipient`: `delivered` fija `entregadoAt`; `read` delega en `registrarLectura` | 1 |
| `workers/inbound-message.processor.ts` | Tras `notifyInboundMessage`, `registrarRespuestaCampana` en `try/catch` + `logger.error` | 2 |
| `features/lead/lead.service.ts` | `updateLeadEstado`: si la etapa destino es de conversión y la anterior no → `registrarConversionCampana` | 3 |
| `features/estado/estado.{types,model,validation,service}.ts` | `esConversion: boolean` (default `false`) en tipo, schema, Zod de create/update y respuesta | 6 |
| `seed/seed-estados.ts` | `esConversion: true` en la etapa `pagado` del set por defecto | 6 |
| `features/campaign/campaign.validation.ts` | `campaignMetricsSchema`, `campaignsOverviewSchema` | 4, 5 |
| `features/campaign/campaign.controller.ts` · `campaign.routes.ts` | `GET /metrics` (antes de `/:id`) y `GET /:id/metrics` | 4, 5 |
| `config/env.ts` | `CAMPAIGN_REPLY_WINDOW_HOURS` (72), `CAMPAIGN_CONVERSION_WINDOW_DAYS` (14) | 2, 3 |
| `apps/frontend/src/features/campaigns/{types,api}.ts` · `hooks/useCampaigns.ts` | Tipos, llamadas y `useCampaignMetrics` / `useCampaignsOverview` | 7 |
| `apps/frontend/src/features/campaigns/pages/{CampaignDetailPage,CampaignsPage}.tsx` | Montar panel y KPIs | 7 |
| `apps/frontend/src/features/estados/{types.ts,components/EstadoFormDialog.tsx,components/EtapaFila.tsx}` | `Switch` "Cuenta como conversión" + distintivo en la fila | 6 |
| `docs/data-model.md` · `docs/domain.md` · `docs/api-contract.md` · `docs/product.md` | Campos nuevos, glosario (apertura, respuesta, conversión, ventana de atribución), endpoints, M07 | — |

## Contratos

### Tipos (`campaign.types.ts`)

```ts
// Se añaden a ICampaignRecipient. `null` = el evento no ocurrió (o es anterior a HU-MARK-04).
entregadoAt: Date | null;
leidoAt: Date | null;
respondidoAt: Date | null;
convertidoAt: Date | null;

export interface ICampaignMetrics {
  destinatarios: number;
  enviados: number;     // estado ∈ { enviado, entregado } (fallido tras aceptar NO cuenta)
  entregados: number;   // estado === 'entregado'
  leidos: number;       // leidoAt != null
  respondidos: number;  // respondidoAt != null
  convertidos: number;  // convertidoAt != null
  fallidos: number;
  tasas: {
    entrega: number | null;     // entregados / enviados
    apertura: number | null;    // leidos / entregados
    respuesta: number | null;   // respondidos / entregados
    conversion: number | null;  // convertidos / entregados
  };
}

export interface ICampaignMetricsResponse extends ICampaignMetrics {
  campaignId: string;
  ventanas: { respuestaHoras: number; conversionDias: number };
  calculadoAt: string; // ISO
}

export interface ICampaignsOverviewResponse extends ICampaignMetrics {
  desde: string;
  hasta: string;
  totalCampanas: number;
  campanas: Array<{ id: string; nombre: string; estado: EstadoCampana; iniciadaAt: string | null } & ICampaignMetrics>;
  ventanas: { respuestaHoras: number; conversionDias: number };
  calculadoAt: string;
}
```

Las tasas se calculan en una función pura `calcularTasas(conteos)` (testeable sin Mongo) con
redondeo a 4 decimales; el front formatea el porcentaje.

### Modelo (`campaign-recipient.model.ts`)

```ts
entregadoAt: { type: Date, default: null },
leidoAt: { type: Date, default: null },
respondidoAt: { type: Date, default: null },
convertidoAt: { type: Date, default: null },

// Atribución: "el último envío de campaña a este contacto". Encabezado por tenantId (§2 de
// docs/multi-tenancy.md): la búsqueda nace de un inbound o de un lead, siempre con su tenant.
CampaignRecipientSchema.index({ tenantId: 1, clienteId: 1, enviadoAt: -1 });
```

La agregación por campaña usa el índice existente `{ tenantId, campaignId, estado }`.

### Captura de eventos (`campaign.metrics.service.ts`) — criterios 1–3

Todas las escrituras con `findOneAndUpdateScoped` **condicionadas** al campo en `null`: si dos
webhooks iguales llegan a la vez, solo uno casa el filtro. Idempotencia sin leer antes.

```ts
export async function registrarLectura(tenantId: TenantId, metaMessageId: string, at: Date): Promise<void>;
// 1) { metaMessageId, leidoAt: null } → $set { leidoAt: at }
// 2) { metaMessageId, estado: 'enviado' } → $set { estado: 'entregado', entregadoAt: at } + $inc totales.entregados
//    (read antes que delivered). El `delivered` tardío luego no casa `estado: 'enviado'`: no duplica.

export async function registrarRespuestaCampana(tenantId: TenantId, clienteId: string, at: Date): Promise<void>;
// Busca el destinatario más reciente: { clienteId, estado ∈ {enviado, entregado}, enviadoAt ≥ at − ventana }
// .sort({ enviadoAt: -1 }).limit(1). Si existe y respondidoAt === null → $set respondidoAt (condicionado),
// y leidoAt/entregado si faltaban (misma lógica que registrarLectura).
// Last-touch estricto: si la campaña más reciente ya tiene respuesta, NO cae a una anterior.

export async function registrarConversionCampana(tenantId: TenantId, clienteId: string, at: Date): Promise<void>;
// Igual que la respuesta, con CAMPAIGN_CONVERSION_WINDOW_DAYS y convertidoAt.
```

**Enganches:**
- `applyDeliveryStatusToRecipient` (`campaign.service.ts`): `delivered` añade `entregadoAt: now`
  al `$set` existente; `read` → `registrarLectura`. `ESTADO_POR_STATUS` no cambia.
- `inbound-message.processor.ts`: tras persistir y notificar, antes de la respuesta automática:
  `registrarRespuestaCampana(tenantId, clienteId, new Date(Number(msg.timestamp) * 1000))` envuelto en
  `try/catch` con `logger.error` (criterio 2: no tumba la ingesta ni reintenta el job).
- `updateLeadEstado` (`lead.service.ts`): hoy solo valida con `existeEstadoActivo`. Tras persistir y
  auditar, una lectura scoped de las dos claves en `estados` (`findScoped(Estado, tenantId,
  { key: { $in: [anterior, destino] } })`, nueva función `clavesDeConversion` en `estado.service.ts`)
  decide la transición `!anterior.esConversion && destino.esConversion` →
  `registrarConversionCampana(tenantId, lead.clienteId.toString(), new Date())`, en `try/catch` (el
  cambio de etapa del asesor no falla por una métrica).

### Agregación — criterios 4 y 5

```ts
export async function getCampaignMetrics(tenantId: TenantId, campaignId: string): Promise<ICampaignMetricsResponse>;
// getCampaignOrFail (404 cross-tenant) → aggregateScoped(CampaignRecipient, tenantId, [
//   { $match: { campaignId } },
//   { $group: { _id: null, destinatarios: {$sum:1}, enviados: {$sum: {$cond: [{$in: ['$estado',['enviado','entregado']]},1,0]}},
//       entregados, fallidos, leidos: {$sum: {$cond: [{$ne: ['$leidoAt', null]},1,0]}}, respondidos, convertidos } } ])
// → calcularTasas.

export async function getCampaignsOverview(tenantId: TenantId, q: { desde: Date; hasta: Date }): Promise<ICampaignsOverviewResponse>;
// findScoped(Campaign, { iniciadaAt: { $gte: desde, $lte: hasta } }) (índice { tenantId, estado, createdAt }
// no aplica; se añade { tenantId: 1, iniciadaAt: -1 } a campaign.model.ts) → un $match { campaignId: { $in } }
// + $group por campaignId → suma global + top 5 por tasa de respuesta.
```

`aggregateScoped` (`repositories/base.repository.ts:117`) antepone `{ $match: { tenantId } }`: es el
mismo helper que ya usa `desgloseDestinatarios`.

### Validación (Zod) — `campaign.validation.ts`

```ts
export const campaignMetricsSchema = z.object({ params: z.object({ id: objectIdSchema }) });

export const campaignsOverviewSchema = z.object({
  query: z.object({
    desde: z.coerce.date(),
    hasta: z.coerce.date().default(() => new Date()),
  }).refine((q) => q.hasta >= q.desde, { message: '`hasta` debe ser posterior a `desde`.' })
    .refine((q) => q.hasta.getTime() - q.desde.getTime() <= 366 * 86_400_000, { message: 'Rango máximo: 366 días.' }),
});
```

### Endpoints — `campaign.routes.ts`

| Método | Ruta | Middlewares | Respuesta |
|---|---|---|---|
| GET | `/api/campaigns/metrics` | `authenticateJWT → requireTenant → authorize(['admin']) → validate(campaignsOverviewSchema) → asyncHandler` | `200 ICampaignsOverviewResponse` · `400` |
| GET | `/api/campaigns/:id/metrics` | ídem con `campaignMetricsSchema` | `200 ICampaignMetricsResponse` · `404` |

`/metrics` es ruta literal: va **antes** de `/:id` (mismo criterio que `/segmento/preview`).
Controllers delgados: `req.user!.tenantId` + DTO validado → service → `res.json`.

### Estados — criterio 6

`esConversion: { type: Boolean, default: false }` en `estado.model.ts`; opcional en
`createEstadoSchema` / `updateEstadoSchema`; `toEstadoResponse` lo devuelve con `?? false` (como
`esSalida`). `seed-estados.ts` lo pone en `pagado`; el `backfillEstados()` del arranque **no** lo
toca en tenants existentes (lo decide la empresa).

### Frontend — criterio 7

- `useCampaignMetrics(id, { viva })`: TanStack Query, `queryKey: ['campaigns', id, 'metrics']`,
  `refetchInterval: viva ? 30_000 : false`. Se invalida también con el evento realtime de progreso
  que ya escucha el detalle.
- `useCampaignsOverview(dias)`: `['campaigns', 'metrics', dias]`, `staleTime` 60 s.
- `MetricsFunnel`: barras horizontales proporcionales a `enviados` (una serie, un color de acento,
  nada de leyenda); conteo tabular y tasa respecto del paso anterior. `Tooltip` en "Abiertos" con la
  nota de cota inferior.
- `CampaignMetricsPanel`: `Card` + `Skeleton` mientras carga; vacío si `enviados === 0`; aviso
  discreto si la campaña se inició antes del despliegue de HU-MARK-04 (todos los `leidos`,
  `respondidos`, `convertidos` en 0 y `iniciadaAt` anterior a la fecha de corte constante).
- `CampaignsOverview`: 4 tarjetas (Enviados, Apertura, Respuesta, Conversión) + `Select` de período.
- Antes de escribir cada componente: `emil-design-eng`, `impeccable:impeccable`,
  `frontend-design:frontend-design` y `dataviz`. Tokens semánticos, light y dark.

### Gráficas (criterio 7bis)

- **Backend:** `serieDiaria(tenantId, campaignIds, rango, zona)` en `campaign.metrics.service.ts`:
  `aggregateScoped` → `$match { campaignId: { $in } }` → `$facet` con una rama por serie
  (`enviadoAt` con `estado ∈ {enviado, entregado}`, `respondidoAt`, `convertidoAt`), cada una
  agrupada por `$dateToString` con `timezone: zona`. `diasDelRango` rellena los huecos con ceros
  (máx. 366 días). Rango del detalle: `iniciadaAt` → `min(ahora, iniciadaAt + ventana de conversión
  + 1 d)`.
- **Zod:** `zona` (IANA validada con `Intl.DateTimeFormat`, default `UTC`) en `campaignMetricsSchema`
  y `campaignsOverviewSchema`.
- **Frontend:** `recharts@2.15.4` vía el `chart` de shadcn (`src/components/ui/chart.tsx`).
  `ActividadDiaria.tsx` (barras + líneas, small multiples) y `ComparacionCampanas.tsx` (barras
  horizontales con etiqueta directa). Tokens `--serie-enviados|respuestas|conversiones` en
  `index.css` (light, dark y `.light`), slots 1–3 de la paleta de `dataviz` validados contra
  `--card`. Sin animación de entrada (pantalla de consulta frecuente, refresco automático).

## Notas

- **Sin jobs BullMQ nuevos.** La captura corre dentro del worker que ya procesa `statuses` e
  inbounds (regla 6: el webhook sigue respondiendo 200 inmediato).
- **Sin barridos cross-tenant nuevos.** Toda búsqueda de atribución parte de un `tenantId` que ya
  viene en el evento (job de inbound o token del asesor).
- **`Campaign.totales.entregados`** se sigue incrementando para el progreso en vivo; las métricas no
  lo leen.
- **Coste:** una consulta indexada extra por inbound (la mayoría no casan y salen en el índice).

## Verificación

```bash
pnpm --filter @sofiapp/api typecheck
pnpm --filter @sofiapp/api test
pnpm --filter @sofiapp/web build && pnpm --filter @sofiapp/web lint
```

Manual en sandbox: lanzar campaña a un número de prueba → leer y responder → mover el lead a
`pagado` → `GET /api/campaigns/:id/metrics` y panel en `/campanas/:id` muestran
enviados = entregados = leídos = respondidos = convertidos = 1; KPIs de `/campanas` lo incluyen.
