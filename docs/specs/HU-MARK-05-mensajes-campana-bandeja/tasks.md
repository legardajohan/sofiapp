# HU-MARK-05 — Tasks (checklist ejecutable)

> Claude Code: ejecuta en orden en la rama `feat/HU-MARK-05` (sale de `develop`). Marca cada
> casilla al terminar. No cierres el feature hasta que TODO esté en verde. Entre paréntesis, el
> criterio de `spec.md` que cubre cada task.

## Rebase sobre `develop` (2026-10-15)

- [x] Rama `feat/HU-MARK-05` recreada desde `develop` (`bf3abc6`). WIP original respaldado en `backup/HU-MARK-05-wip`.
- [x] WIP traído con `cherry-pick -n 9ab71ff`. Conflictos resueltos en `campaign.{model,validation,service}.ts`, `message.service.ts`, `CampaignWizard.tsx` y `CampaignScheduler.tsx`: se conserva todo HT-WA-04/HU-MARK-04 y encima van los deltas de HU-MARK-05.
- [x] `pnpm --filter @sofiapp/api typecheck` en verde tras el merge.
- [x] Fixture de `CampaignWizard.test.tsx` actualizado a la forma de plantilla de HT-WA-04 (`pie`, `imagen`, `motivoRechazo`).
- [x] **A** · `buildTemplatePayload` devuelve `imagenDefecto` usada; `subirImagenReemplazo` devuelve la referencia almacenada; la rama plantilla de `sendOutbound` elige `contexto.mediaCabecera ?? reemplazo ?? imagenDefecto`. (3)
- [x] **B** · Test: envío suelto con `imagenHeaderUploadId` → `texto`, `plantilla` y `media` = subida; sin `origen`. (3, 12)
- [x] **A** · Test: campaña sin imagen propia + plantilla con `imagenDefecto` → `media` = imagen por defecto. (3)
- [x] **C** · Test: un estado que no avanza el `Message` (p. ej. `delivered` tras `read`) igual llega a `applyDeliveryStatusToRecipient`; suites `campaign.metrics.*` y `campaign.audience.*` en verde. (6, 12)
- [x] **D** · Backfill: media por `imagenDefecto` cuando la campaña no tenía imagen propia + test. (11)
- [x] Frontend: volver a invocar `emil-design-eng`, `impeccable:impeccable` y `frontend-design:frontend-design` antes de retocar `MessageBubble`, `CampaignWizard` y `MessagePreview`; verificar que `ParametrosPlantilla` convive con `HeaderImageField` y el `AudienceBuilder`. (9, 10)
      _`emil-design-eng` y `frontend-design` aplicadas: la composición huecos → imagen → vista previa queda coherente y no hizo falta tocar UI. `impeccable:impeccable` **sigue sin estar instalada**._
- [ ] Revalidar la suite backend completa (requiere MongoMemoryServer operativo) y la de frontend. (12, 13)
      _Frontend: `build` y `lint` en verde, y 16 suites relacionadas con 90/90 tests. La suite completa se cuelga en `knowledge-base/pages/KnowledgeBasePage.test.tsx` (`Maximum call stack size exceeded`), un archivo que esta rama no toca; el fallo es previo. Backend: `typecheck` en verde, pero los tests no corren en esta máquina porque Windows bloquea el `mongod` de MongoMemoryServer (`spawn UNKNOWN` / `Permission denied`)._

## Implementación — Backend

### Mensajes (types → model → service)
- [x] `message.types.ts`: `ORIGENES_MENSAJE`, `OrigenMensaje`, `IPlantillaEnviada`, `ContextoEnvio`; `origen?`, `campaignId?`, `plantilla?` en `IMessage`. (2)
- [x] `message.model.ts`: subschema `plantilla` (`_id:false`), `origen` enum, `campaignId` ref `Campaign`; índice `{ tenantId, metaMessageId }` → único parcial (`$type: 'string'`). (2, 7)
- [x] `whatsapp-template.service.ts`: exportar `renderizarPlantilla(components, parametros)`; `buildTemplatePayload` devuelve también `texto`. (1)
- [x] `message.service.ts` · `sendOutbound`: parámetro `contexto: ContextoEnvio = {}`; la rama plantilla persiste `texto`, `plantilla` y, con contexto, `origen`, `campaignId`, `media` disponible. `tipo` sigue `'plantilla'`. (1, 2, 3, 12)
- [x] `message.service.ts` · `saveMessage` → `{ message, creado }`, captura `E11000`. Actualizar todos sus llamadores. (7)
- [x] `message.service.ts` · `updateDeliveryStatus`: filtro atómico con `PREVIOS[status]`, `publishRealtime('message:updated')` si cambió; `applyDeliveryStatusToRecipient` intacto. (6)

### Campañas (types → model → validation → service)
- [x] `campaign.types.ts`: `CAMPOS_CONTACTO`, `IParametroDinamico`, `parametrosDinamicos` en `ICampaign` y DTOs. (4)
- [x] `campaign.model.ts`: `ParametroDinamicoSchema`, default `[]`. (4)
- [x] `campaign.validation.ts`: `parametrosDinamicos` con `superRefine` (rango, sin repetidos, respaldo no vacío) en create, schedule y reschedule. (4)
- [x] `campaign.service.ts`: persistir/propagar `parametrosDinamicos`; incluirlos en la respuesta de `GET /campaigns/:id`. (4)
- [x] `campaign.parametros.ts` (nuevo): `resolverParametros(parametros, dinamicos, cliente)`. (4)
- [x] `campaign-broadcast.processor.ts`: cargar clientes del lote en una consulta scoped, resolver parámetros por destinatario, pasar `contexto { campaignId, mediaCabecera }`, y `notificarSaliente` en `try/catch` propio tras marcar `enviado`. (2, 3, 4, 5)

### Conversación / hilo
- [x] `conversation.service.ts`: exportar `notificarSaliente`. (5)
- [x] `conversation.service.ts` / `inbound-message.processor.ts`: `notifyInboundMessage` solo si `creado`. (7)
- [x] `conversation.types.ts` + `conversation.mapper.ts`: `IMessageResponse` += `origen`, `campana`, `plantilla`; `toMessageResponse` recibe el mapa de campañas. (8)
- [x] `conversation.service.ts` · `getThread`: una consulta `findScoped(Campaign, { _id: { $in } })` por página para los nombres. (8)
- [x] Controllers y routes: **sin cambios** (verificar que no se necesitan; ningún endpoint nuevo).

### Histórico
- [x] `scripts/backfill-mensajes-campana.ts`: por tenant, solo `*Scoped`; reporte de duplicados de `metaMessageId`; reconstrucción vía `CampaignRecipient → Campaign → plantilla`; `--dry-run`; idempotente. (11)
- [x] `apps/backend/package.json`: script `backfill:mensajes-campana`. (11)

## Implementación — Frontend

- [x] **Antes de escribir:** invocar `emil-design-eng`, `impeccable:impeccable` (si no está instalada, pedirla al usuario) y `frontend-design:frontend-design`; aplicar sus criterios. (9, 10)
      _`emil-design-eng` y `frontend-design` aplicadas. `impeccable:impeccable` **no está instalada** en esta sesión: pendiente de pasarla cuando esté disponible._
- [x] `inbox/types.ts`: `MessageDTO` += `origen`, `campana`, `plantilla`. (8, 9)
- [x] `MessageBubble.tsx`: `tipoVisual` (plantilla + media por `mimeType`), etiqueta "Campaña" con `Tooltip` de shadcn en el slot de "Sofi", fallback "Plantilla enviada · contenido no disponible". Sin animación nueva. Light y dark. (3, 9)
- [x] `useInboxRealtime.ts`: confirmar que `message:updated` reemplaza el mensaje (ticks en vivo) y `message:new` refresca hilo y lista. (5, 6, 9)
- [x] `campaigns/types.ts` + `lib`: `ParametroDinamico`; `substituteEjemplos` reconoce variables. (10)
- [x] `CampaignWizard.tsx`: `Select` de shadcn por parámetro (Texto fijo / Nombre del contacto / Teléfono del contacto); en variable, el input pide el respaldo. (10)
- [x] `MessagePreview.tsx`: variable resaltada con tokens semánticos. (10)

## Docs
- [x] `docs/data-model.md`: `messages` (origen, campaignId, plantilla, índice único parcial) y `campaigns` (parametrosDinamicos).
- [x] `docs/domain.md`: origen de mensaje "campaña" y variables de contacto.
- [x] `apps/frontend/CLAUDE.md` (Bandeja): plantillas de campaña en la burbuja.

## Tests

### Backend (Vitest)
- [x] `renderizarPlantilla`: solo BODY; HEADER TEXT + BODY + FOOTER; `{{n}}` sin parámetro queda literal; sin BODY → `null`. (1)
- [x] `resolverParametros`: nombre presente, nombre vacío → respaldo, teléfono, sin dinámicos = idéntico. (4)
- [x] `campaign.validation`: acepta dinámicos válidos; rechaza índice fuera de rango, repetido o respaldo vacío; en create, schedule y reschedule. (4)
- [x] `sendOutbound` plantilla: persiste `texto`, `plantilla`; con contexto, `origen`, `campaignId`, `media` disponible; `tipo === 'plantilla'`. (1, 2, 3, 12)
- [x] Processor: un lote con dos clientes envía parámetros distintos por nombre; publica `message:new` por envío; si `notificarSaliente` lanza, el destinatario queda `enviado`. (4, 5)
- [x] `updateDeliveryStatus`: `delivered` tras `read` no retrocede; `failed` no pisa `read`; publica `message:updated` solo si cambió; el destinatario de campaña sigue actualizándose como antes. (6)
- [x] Webhook reenviado: el mismo mensaje entrante dos veces → un solo documento, un solo `message:new`, `noLeidos` +1. (7)
- [x] `getThread`: devuelve `origen`, `campana.nombre` (y `null` si la campaña no existe) en orden cronológico mezclado con inbound/IA/asesor. (8)
- [x] Backfill: `--dry-run` no escribe; ejecución real rellena texto/media/origen; segunda ejecución no cambia nada; reporta no recuperables y duplicados. (11)
- [x] **Aislamiento:** mismo `metaMessageId` en tenant A y B → `updateDeliveryStatus(A)` no toca B; `saveMessage` en B no se deduplica contra A; `getThread` de A no resuelve campañas de B; backfill de A no lee recipients de B. (13)
- [x] Suite completa en verde (campañas, pacing, IA, asignación, inbound). (12)

### Frontend (Vitest + Testing Library)
- [x] `MessageBubble`: plantilla de campaña muestra texto y "Campaña" (sin "Sofi"); plantilla con imagen usa `MediaImagen` y texto debajo; plantilla sin texto muestra el fallback nuevo y nunca "Mensaje sin contenido"; mensajes manuales, IA e inbound sin cambios. (3, 9, 12)
- [x] `CampaignWizard`: elegir "Nombre del contacto" envía `parametrosDinamicos` y la vista previa muestra la variable. (10)
- [x] `useInboxRealtime`: `message:updated` reemplaza el estado del mensaje en la caché del hilo. (6, 9)

## Verificación final

- [x] `pnpm --filter @sofiapp/api typecheck` sin errores. (13)
- [x] `pnpm --filter @sofiapp/api test` en verde. (12, 13)
- [x] `pnpm --filter @sofiapp/web build && pnpm --filter @sofiapp/web lint` en verde; tests frontend en verde. (13)
- [ ] `pnpm --filter @sofiapp/api backfill:mensajes-campana --dry-run` contra la base de desarrollo: sin duplicados pendientes. *Acción del usuario: requiere la base real.*
- [x] Checklist de PR de `docs/multi-tenancy.md` §9 revisado (todas las consultas nuevas son `*Scoped`; `tenantId` del token / del job).
- [ ] Revisión visual light y dark de la burbuja y del wizard (capturas en `.playwright-mcp/`, borradas después; `git status` sin `*.png`). *Pendiente: solo tokens semánticos (`bg-primary/10`, `text-primary`, `text-primary-foreground/80`), sin verificación con capturas en esta sesión.*
- [ ] Prueba manual sandbox Meta: los 6 escenarios de `spec.md` (texto, personalizada, imagen, respuesta del cliente, estados, reenvío de webhook). *Requiere credenciales reales: acción del usuario.*

## Definición de "hecho"

Los mensajes enviados por campañas masivas quedan guardados con su contenido real (texto con
variables resueltas e imagen), ligados a su cliente y campaña, etiquetados como "Campaña", con su
estado de entrega al día y visibles en vivo en la bandeja, sin duplicados; los históricos se
recuperan con el backfill; y el envío masivo, la IA, la asignación y la recepción siguen
funcionando igual. Criterios 1–13 de `spec.md` en verde.
