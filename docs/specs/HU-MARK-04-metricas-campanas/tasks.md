# HU-MARK-04 — Tasks (checklist ejecutable)

> Claude Code: ejecuta en orden. Marca cada casilla al terminar. No cierres el feature hasta que
> TODO esté en verde. Rama: `feat/HU-MARK-04` (worktree `../sofiapp-HU-MARK-04`, desde `origin/develop`).

## Implementación — backend

- [x] `config/env.ts`: `CAMPAIGN_REPLY_WINDOW_HOURS` (default 72) y `CAMPAIGN_CONVERSION_WINDOW_DAYS` (default 14) con Zod.
- [x] `campaign.types.ts`: `entregadoAt`, `leidoAt`, `respondidoAt`, `convertidoAt` en `ICampaignRecipient`; `ICampaignMetrics`, `ICampaignMetricsResponse`, `ICampaignsOverviewResponse`.
- [x] `campaign-recipient.model.ts`: los 4 campos (default `null`) + índice `{ tenantId, clienteId, enviadoAt: -1 }`.
- [x] `campaign.model.ts`: índice `{ tenantId: 1, iniciadaAt: -1 }` para el agregado del período.
- [x] `estado.types.ts` · `estado.model.ts` · `estado.validation.ts` · `estado.service.ts`: `esConversion` (default `false`) en tipo, schema, create/update y respuesta; `clavesDeConversion(tenantId, keys)` scoped en el service.
- [x] `seed/seed-estados.ts`: `esConversion: true` en `pagado`.
- [x] Crear `campaign.metrics.service.ts`: `calcularTasas` (pura), `registrarLectura`, `registrarRespuestaCampana`, `registrarConversionCampana`, `getCampaignMetrics`, `getCampaignsOverview`. Solo `*Scoped`.
- [x] `campaign.service.ts`: `applyDeliveryStatusToRecipient` fija `entregadoAt` en `delivered` y delega `read` en `registrarLectura`.
- [x] `workers/inbound-message.processor.ts`: `registrarRespuestaCampana` tras `notifyInboundMessage`, en `try/catch` con `logger.error`.
- [x] `lead.service.ts` (`updateLeadEstado`): transición a etapa de conversión → `registrarConversionCampana` en `try/catch`.
- [x] `campaign.validation.ts`: `campaignMetricsSchema`, `campaignsOverviewSchema`.
- [x] `campaign.controller.ts`: `getCampaignMetricsController`, `getCampaignsOverviewController` (delgados).
- [x] `campaign.routes.ts`: `GET /metrics` **antes** de `/:id`; `GET /:id/metrics`. Pipeline canónico con `authorize(['admin'])`.

## Implementación — frontend

- [x] Invocar `emil-design-eng`, `impeccable:impeccable`, `frontend-design:frontend-design` y `dataviz` **antes** de escribir componentes.
- [x] `features/campaigns/types.ts` · `api.ts` · `hooks/useCampaigns.ts`: tipos, `getCampaignMetrics`, `getCampaignsOverview`, `useCampaignMetrics`, `useCampaignsOverview`.
- [x] `MetricsFunnel.tsx` (embudo de 5 pasos, conteo + tasa, tooltip de cota inferior en "Abiertos").
- [x] `CampaignMetricsPanel.tsx` (Card, Skeleton, vacío, aviso de campañas previas, refresco si viva) y montarlo en `CampaignDetailPage.tsx`.
- [x] `CampaignsOverview.tsx` (4 KPIs + Select 7/30/90 d) y montarlo en `CampaignsPage.tsx`.
- [x] `features/estados`: `esConversion` en `types.ts`, `Switch` en `EstadoFormDialog.tsx`, distintivo en `EtapaFila.tsx`.
- [ ] Revisar light y dark con tokens semánticos (capturas en `.playwright-mcp/`, borrarlas después).

## Tests

- [x] `campaign.metrics.service.test.ts`:
  - [x] `calcularTasas`: denominador 0 → `null`; redondeo.
  - [x] `read` marca `leidoAt` una vez; duplicado no cambia nada.
  - [x] `read` antes que `delivered` → `entregado` + `entregadoAt`; el `delivered` tardío no duplica `entregados`.
  - [x] Respuesta dentro de ventana marca `respondidoAt` (y leído/entregado); fuera de ventana → no-op; sin campaña → no-op.
  - [x] Last-touch: con dos campañas, la respuesta va a la más reciente; una segunda respuesta no cae a la anterior.
  - [x] Conversión solo en la transición no-conversión → conversión, una sola vez; fuera de ventana → no-op.
  - [x] `getCampaignMetrics` cuadra con un set de destinatarios sembrado a mano (enviados excluye fallidos/omitidos/pendientes).
  - [x] `getCampaignsOverview` suma solo campañas iniciadas en el rango; top 5 ordenado por respuesta.
- [x] `campaign.metrics.routes.test.ts`: `200` con la forma del contrato; `403` rol no admin; `400` rango invertido o > 366 d; `404` id inexistente.
- [x] `campaign.metrics.isolation.test.ts`: métricas de campaña de B con token de A → `404`; el agregado de A no incluye campañas de B; inbound y cambio de etapa en A no marcan destinatarios de B.
- [x] Ajustar tests existentes que dependan de la forma de `applyDeliveryStatusToRecipient`, del procesador de inbound y de `estado` (respuesta con `esConversion`).
- [x] Front: `CampaignMetricsPanel.test.tsx` (carga, vacío, tasas formateadas, nota de apertura).

## Gráficas (criterio 7bis)

- [x] Backend: `serieDiaria` + `diasDelRango` y `zona` en los dos schemas; tests de la serie (zona, huecos, fallidos fuera) y de `zona` inválida → 400.
- [x] Frontend: `recharts@2.15.4` con pnpm (el CLI de shadcn usó npm y subió `lucide-react`: revertido).
- [x] Paleta validada con `validate_palette.js` contra `--card` light/dark; tokens `--serie-*`.
- [x] `ActividadDiaria` y `ComparacionCampanas`, montados en el resumen y en el panel; test de leyenda y tabla accesible.

## Docs

- [x] `docs/data-model.md`: campos nuevos de `campaign_recipients`, índices nuevos, `estados.esConversion`.
- [x] `docs/domain.md`: glosario — apertura, respuesta, conversión, ventana de atribución (last-touch).
- [x] `docs/api-contract.md`: `GET /api/campaigns/metrics` y `GET /api/campaigns/:id/metrics`.
- [x] `docs/product.md`: M07 con HU-MARK-04.

## Verificación final

- [x] `pnpm --filter @sofiapp/api typecheck` sin errores.
- [x] `pnpm --filter @sofiapp/api test` en verde.
- [x] `pnpm --filter @sofiapp/web build && pnpm --filter @sofiapp/web lint` en verde.
- [x] Checklist de PR de `docs/multi-tenancy.md` §9 revisado (sin `Model.find/aggregate` directos; índices nuevos con `tenantId` delante).
- [x] `git status` sin `*.png`/`*.jpg` de verificación.
- [ ] Prueba manual en sandbox (enviar → leer → responder → mover a `pagado`).
- [x] `spec.md` → `**Estado:** implementado`.

## Definición de "hecho"

Cada campaña muestra enviados, entregados, abiertos, respondidos y convertidos que coinciden con lo
que pasó en WhatsApp y en el pipeline; el resumen de `/campanas` agrega el período; ningún dato
cruza de tenant; todo en verde.
