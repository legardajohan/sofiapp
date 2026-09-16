# HU-MARK-01 — Tasks (checklist ejecutable)

> Claude Code: ejecuta en orden. Marca cada casilla al terminar. No cierres el feature hasta que
> TODO esté en verde. El número entre paréntesis es el criterio de `spec.md` que cierra la tarea.

## Preparación

- [x] `git fetch origin && git switch -c feat/HU-MARK-01 origin/develop` — la rama sale de
      **develop**, no de la rama actual.
- [x] Releer `docs/multi-tenancy.md` §3-§5 y `apps/backend/CLAUDE.md` (patrón de 6 archivos).
- [x] Invocar la skill `multi-tenancy-guard` antes de tocar modelos o services.
- [x] Invocar `typescript-strict-mode` y `clean-code-solid` para el código nuevo.

## Implementación — Backend

### Cimientos (tier, opt-out, cola)

- [x] `config/env.ts`: `CAMPAIGN_BATCH_SIZE` (default 25), `CAMPAIGN_MIN_INTERVAL_MS` (default 1000),
      `CAMPAIGN_SAFETY_MARGIN` (0..1, default 0.8), `CAMPAIGN_TIER_TTL_MS` (default 3 600 000),
      `CAMPAIGN_MAX_PER_SECOND` (default 10), `CAMPAIGN_SWEEP_INTERVAL_MS` (default 60 000). (8, 9)
- [x] `config/queues.ts`: `CAMPAIGN_QUEUE_NAME = 'campaign-broadcast'`, `CAMPAIGN_BATCH_JOB = 'batch'`,
      `CAMPAIGN_START_JOB = 'start-scheduled'`, `CAMPAIGN_SWEEP_SCHEDULER_ID`, `campaignQueue`. (4, 9)
- [x] `integrations/meta/meta-phone-number.client.ts`: `getPhoneNumberHealth(phoneNumberId, token)`
      contra `?fields=health_status,quality_rating,messaging_limit_tier`. (7)
- [x] `features/channel/channel.types.ts`: `MESSAGING_TIERS`, `QUALITY_RATINGS`, campos nuevos en
      `IMetaIntegration` y en `IChannelStatusResponse`. (7)
- [x] `features/channel/channel.model.ts`: `messagingTier`, `qualityRating`, `healthStatus`,
      `tierSyncedAt`, `tierManual`. (7)
- [x] `features/channel/channel.service.ts`: `syncChannelTier(tenantId)` — no lanza si la sonda
      falla; conserva lo guardado y respeta `tierManual`. (7)
- [x] `features/channel/{validation,controller,routes}.ts`: `POST /api/channels/whatsapp/tier/sync`
      y tier/calidad expuestos en `GET /status`. (7)
- [x] `features/cliente/{types,model}.ts`: `marketingOptOut: Boolean` (default `false`) + índice
      `{ tenantId: 1, marketingOptOut: 1 }`. (3)
- [x] `features/cliente/{validation,service}.ts`: admitir `marketingOptOut` en
      `PATCH /api/clientes/:id` (schema `.strict()`, sin tocar el gate de subrol). (3)
- [x] `features/message/message.model.ts`: índice `{ tenantId: 1, tipo: 1, createdAt: -1 }`. (8)

### Feature `campaign` — orden del patrón de 6 archivos

- [x] `features/campaign/campaign.types.ts`: `ESTADOS_CAMPANA`, `ESTADOS_DESTINATARIO`,
      `ISegmentoFiltros`, `IFiltroAtributo`, `ICampaign`, `ICampaignRecipient`, `CampaignJobData`,
      DTOs y `I*Response`. (1, 4, 6, 10, 12)
- [x] `features/campaign/campaign.model.ts`: `Campaign` con `tenantId` required + index y los tres
      índices del `plan.md`. (15)
- [x] `features/campaign/campaign-recipient.model.ts`: `CampaignRecipient` con el único
      `{tenantId, campaignId, clienteId}` y el `sparse` de `metaMessageId`. (10, 15)
- [x] `features/campaign/campaign.validation.ts`: Zod `{ body, params, query }` para crear, listar,
      detalle, destinatarios, preview y las transiciones (body vacío `.strict()`). (1, 4, 12)
- [x] `features/campaign/campaign.pacing.ts` (**puro**): `LIMITE_POR_TIER`, `FACTOR_POR_CALIDAD`,
      `calcularPresupuesto`, `assertPuedeLanzar`. (8, 9)
- [x] `features/campaign/campaign.segment.service.ts`: `construirFiltroContacto` (puro),
      `resolverClientesPorSemaforo`, `construirFiltroSegmento` (opt-out **siempre**),
      `previewSegmento`. (1, 2, 3)
- [x] `features/campaign/campaign.service.ts`: `createCampaign`, `launchCampaign` (los 10 pasos del
      `plan.md`, en ese orden), `pause/resume/cancel`, `listCampaigns`, `getCampaign`,
      `listRecipients`, `resolverPresupuesto`, `contarConsumo24h` (`aggregateScoped` + `$group` por
      `clienteId`), `applyDeliveryStatusToRecipient`. (4, 5, 6, 8, 11, 12)
- [x] `features/campaign/campaign.controller.ts`: delgado, `req.user!.tenantId!.toString()`, sin
      `try/catch`, sin Mongoose. (criterio transversal)
- [x] `features/campaign/campaign.routes.ts`: cadena canónica; `/segmento/preview` registrada
      **antes** de `/:id`. (1)
- [x] Montar en `app.ts`: `app.use('/api/campaigns', campaignRoutes)`. (4)

### Worker y tiempo real

- [x] `workers/campaign-broadcast.processor.ts`: `processCampaignJob` (sale sin reencolar si está
      pausada/cancelada; reencola con `delay` si no hay cupo; error por destinatario no tumba el
      lote) y `processCampaignSweep` (levanta las `programada` vencidas). (9, 11)
- [x] `jobId` = `` `campaign-${campaignId}-${lote}` `` — **sin `:` y sin ser un entero puro**
      (trampa de `HT-AI-02`, ver `inbound-message.processor.ts:59`). (9)
- [x] `worker.ts`: sustituir el placeholder por el worker real
      (`{ connection, concurrency: 1, limiter: { max: env.CAMPAIGN_MAX_PER_SECOND, duration: 1000 } }`)
      y `upsertJobScheduler` para el barrido de programadas. (9)
- [x] `realtime/realtime.types.ts`: variante `campaign:progress`; publicar desde el worker con
      `publishRealtime` (room `tenant:<id>`, ADR 0004). (13)
- [x] `features/message/message.service.ts`: `updateDeliveryStatus` llama a
      `applyDeliveryStatusToRecipient` tras actualizar el `Message`. Mismo camino del webhook, sin
      duplicarlo. (10)
- [x] `features/audit/audit.types.ts`: acciones `campaign.create|launch|pause|resume|cancel`,
      entidad `'campaign'`; registrarlas en el service. (4, 12)

## Implementación — Frontend

> **Antes de escribir CADA componente**: invocar `emil-design-eng` y
> `frontend-design:frontend-design` y aplicar sus criterios (regla §7 del `CLAUDE.md` raíz).
> **Nota:** `impeccable:impeccable` **no está instalada** en este entorno (`skills-lock.json` solo
> registra `emil-design-eng`); si se instala antes de implementar, se suma a las otras dos.

- [x] `pnpm dlx shadcn@3.8.5 add progress alert` — versión **pinneada** (4.x asume Tailwind v4 y el
      proyecto es 3.4 + variables HSL). (14)
- [x] `features/campaigns/types.ts` + `api.ts` (funciones planas sobre `apiClient`; **las rutas nunca
      repiten el prefijo `/api`**). (14)
- [x] `features/campaigns/hooks/useCampaigns.ts`: `useCampaigns`, `useCampaign`, `useRecipients`,
      `useSegmentPreview` (debounced, `keepPreviousData`), `useCreateCampaign`, `useLaunchCampaign`,
      `usePauseCampaign`, `useResumeCampaign`, `useCancelCampaign`. Toasts **dentro** de los hooks. (14)
- [x] `features/campaigns/lib/pacing.ts` (puro): etiqueta del tier, color de la calidad, días
      estimados. (14)
- [x] `components/SegmentFilters.tsx`: selects de catálogo (rol, semáforo, interés, estado,
      etiquetas) + constructor de filtros por atributo; centinela `TODOS = '__todos__'` porque Radix
      `Select` prohíbe `value=""`; chips de color vía `tagColors(hex, resolvedTheme)`. (1, 14)
- [x] `components/AudienceMeter.tsx`: volumen vs presupuesto, tier, calidad, días estimados; `alert`
      si excede el cupo; **botón bloqueado con explicación** si la calidad es `RED`. (8, 14)
- [x] `components/CampaignWizard.tsx`: 3 pasos (segmento → plantilla → revisión), `useState` + `<form
      onSubmit>` + `useEffect` de reseteo al abrir, como `EstadoFormDialog`. Reutilizar
      `TemplatePreview` de `features/whatsapp-templates`. (14)
- [x] `components/CampaignStatusBadge.tsx` y `components/CampaignProgress.tsx`. (13, 14)
- [x] `pages/CampaignsPage.tsx` (listado, filtro de estado **en la URL** como `LeadsPage`) y
      `pages/CampaignDetailPage.tsx` (progreso + tabla de destinatarios paginada). (13, 14)
- [x] Suscribir `campaign:progress` y actualizar la caché con `setQueryData` — nunca refetch manual. (13)
- [x] Registro en los tres sitios: barrel `index.ts` → `router.tsx` (`lazy()` + `RequireRole(['admin'])`
      + `Suspense`) → `components/layout/nav-config.ts`, grupo **Operación**. (14)
- [x] Repaso final en **light y dark**; cero `bg-[#...]` en `src/**`. (14)

## Documentación

- [x] `docs/data-model.md`: `campaigns` y `campaign_recipients` reales (sustituyen el boceto de las
      líneas 378-410), campos de tier en `MetaIntegration`, `Cliente.marketingOptOut`.
- [x] `docs/api-contract.md`: las 8 filas nuevas; **retirar** el placeholder
      `GET /api/clientes/filter`; evento `campaign:progress` en §7.
- [x] `docs/integrations/meta-whatsapp.md` §5: de "fuera de alcance" a implementado (pacing por tier,
      sonda de §8 promovida a uso en caliente).
- [x] `docs/domain.md`: entrada **Campaña** con su ciclo de estados y el eje comercial del semáforo.
- [x] `docs/multi-tenancy.md` §5: **quinta excepción** — barrido de campañas programadas (global,
      solo devuelve identificadores).
- [x] `docs/product.md`: M07 deja de estar pendiente.
- [x] `spec.md`: `**Estado:** implementado` al cerrar.

## Tests (Vitest)

**Aislamiento (criterio 15) — `features/campaign/campaign.isolation.test.ts`**

- [x] El tenant B no lee una campaña de A → `404`, nunca `403`.
- [x] El tenant B no lanza, pausa, reanuda ni cancela una campaña de A → `404` **y se comprueba que
      no escribió** (la campaña de A sigue en su estado previo).
- [x] `listCampaigns(tenantB)` nunca devuelve campañas de A; `listRecipients(tenantB, campaignDeA)`
      → `404`.
- [x] `createScoped(Campaign, tenantA, { tenantId: tenantB, ... })` → el documento queda en A.
- [x] **Segmento cruzado:** dos tenants con contactos de mismo teléfono, misma `key` de atributo
      (`grado=11`) y mismo `rolContacto`; el segmento de B no devuelve ni un contacto de A.
- [x] `applyDeliveryStatusToRecipient(tenantB, metaMessageIdDeA, 'delivered')` no toca el
      destinatario de A (no se reabre la fuga de `HT-WA-01-V2`).
- [x] El barrido de programadas solo devuelve identificadores y cada campaña se procesa con su
      propio `tenantId`.

**Segmentación — `campaign.segment.test.ts` (criterios 1, 2, 3)**

- [x] Filtro por atributo `grado` ∈ {10, 11}.
- [x] Filtro por `rolContacto` (keys del catálogo del tenant).
- [x] Filtro por `semaforoLead` (resuelve vía `Lead.clienteId`); un contacto sin lead queda fuera.
- [x] Los tres combinados, e intersección con `nivelInteres` / `estadoComercial` / `tagIds`.
- [x] Dos filtros de atributo distintos exigen **dos** `$elemMatch` (grado 11 **y** colegio X).
- [x] `key` inexistente en el catálogo → segmento **vacío**, sin lanzar.
- [x] `marketingOptOut: true` excluido siempre; documento sin el campo → **incluido** (`$ne: true`).

**Pacing — `campaign.pacing.test.ts` (criterios 8, 9), puro**

- [x] Cada tier produce su límite; `TIER_UNLIMITED` no desborda.
- [x] `YELLOW` y `UNKNOWN` reducen a la mitad; `GREEN` no reduce.
- [x] `RED` → `assertPuedeLanzar` lanza `409`.
- [x] `consumido24h` descuenta; `disponible` nunca es negativo.
- [x] `intervaloMs` respeta el mínimo de entorno.

**Servicio y feature — `campaign.service.test.ts` (criterios 4, 5, 6, 11, 12)**

- [x] `launchCampaign` materializa destinatarios y `totales.destinatarios` queda fijo; un contacto
      que entra en el filtro después **no** se incorpora.
- [x] Cuota `campanasMes` agotada → `429` **sin** materializar destinatarios.
- [x] Plantilla no `APPROVED` → `422` sin llamar a la Graph API; parámetros descuadrados → `400` con
      `{ esperados, recibidos }`.
- [x] Lanzar dos veces es idempotente (no duplica destinatarios ni vuelve a consumir cuota).
- [x] `cancel` deja los pendientes en `omitido`; `pause` + `resume` no reenvía lo ya enviado.
- [x] `contarConsumo24h` cuenta **destinatarios únicos**, no mensajes (dos plantillas al mismo
      contacto cuentan una).

**Worker — `workers/campaign-broadcast.processor.test.ts` (criterios 9, 10, 11)**

- [x] Con presupuesto menor que los destinatarios, **nunca** envía más de `disponible` y reencola con
      `delay`; la campaña sigue `en_curso`.
- [x] Un envío que falla marca `fallido` + `error` y el lote continúa con el siguiente.
- [x] Al agotar pendientes → `completada`; si no se envió nada → `fallida`.
- [x] Campaña `pausada`/`cancelada` → sale **sin enviar y sin reencolar**.
- [x] El `jobId` generado no contiene `:` ni es un entero puro.
- [x] Emite `campaign:progress` al room del tenant.
- [x] Mock de la cola con `vi.mock('../../config/queues.js', …)`, como en `flow.ia-node.test.ts`.

**Canal — `channel.tier.test.ts` (criterio 7)**

- [x] `syncChannelTier` persiste tier, calidad y health; actualiza `tierSyncedAt`.
- [x] La sonda caída **no lanza**: conserva los valores guardados.
- [x] `tierManual: true` no se pisa con el valor de Meta.

**Frontend**

- [x] `CampaignWizard.test.tsx`: navegación entre pasos, conteo del segmento, bloqueo del
      lanzamiento con calidad `RED`.
- [x] `AudienceMeter.test.tsx`: aviso cuando el volumen excede el presupuesto; días estimados.

## Verificación final

- [x] `pnpm --filter backend typecheck` sin errores. (16) ✅
- [x] `pnpm --filter backend test` en verde: **1302 tests / 119 archivos**, incluidos los 66 nuevos
      de campañas y canal. (16) ✅
- [x] `pnpm --filter frontend build && pnpm --filter frontend lint` en verde; **723 tests / 57
      archivos** del frontend en verde. (16) ✅
- [x] Checklist de PR de `docs/multi-tenancy.md` §9 completo.
- [x] `git status`: ningún `.png`/`.jpg` de verificación colado (no se tomaron capturas).
- [ ] **Pendiente de cierre manual (DoD):** envío de prueba con **números sandbox** y credenciales
      reales de Meta, verificando que el tier real se sincroniza y que la cadencia no lo supera.
      Requiere acción del usuario; una infracción de políticas puede suspender la WABA
      (`docs/integrations/meta-whatsapp.md` §5).
- [ ] **Pendiente:** arranque de `worker.ts` contra Redis y Mongo reales. El proceso web sí quedó
      verificado de punta a punta (`campaign.routes.test.ts` levanta `app.ts` con supertest), y el
      procesador está cubierto por sus propios tests, pero el `Worker` de BullMQ y el
      `upsertJobScheduler` del barrido no se ejercitan sin infraestructura levantada.

### Desviaciones respecto al `plan.md`

- **`FilaAtributo` extraída dentro de `SegmentFilters.tsx`.** No estaba en el plan; la pidió un test
  que falló: pintar el input desde `valores.join(', ')` hacía **imposible teclear la coma** (el array
  no la conserva, así que desaparecía en el mismo render). El texto crudo vive ahora en la fila y
  solo sube la lista ya partida.
- **`campaign.routes.test.ts` añadido.** No estaba en el plan. Cubre la cadena de middlewares, el
  guard CSRF, que `/segmento/preview` no se resuelva como un `:id`, y de paso demuestra que `app.ts`
  arranca con el router montado.
- **`PATCH /api/channels/whatsapp/tier`** (override manual) se añadió junto al `POST /tier/sync`: el
  plan describía el override pero no le había asignado endpoint.
- **`channel.service.ts` migrado a `*Scoped`.** Sus tres funciones usaban `MetaIntegration.findOne`
  directo (filtrando por `tenantId` a mano). Se convirtieron al repositorio tenant-safe al tocarlas,
  porque el feature nuevo lee de ahí el tier y el checklist §9 no admite `Model.find` directos.

## Definición de "hecho"

Una campaña segmentada por grado, rol y semáforo se lanza desde el panel, se envía por lotes con una
plantilla aprobada, respeta el tier y la calidad del número —descontando lo que ya gastaron los
recordatorios y los envíos manuales—, deja registro por destinatario del resultado real de Meta, y
se puede pausar, reanudar o cancelar en caliente. El número de WhatsApp del tenant termina la
campaña con la misma calidad con la que la empezó.
