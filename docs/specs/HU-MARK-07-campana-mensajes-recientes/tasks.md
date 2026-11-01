# HU-MARK-07 — Tasks (checklist ejecutable)

> Claude Code: ejecuta en orden. Marca cada casilla al terminar. No cierres el feature hasta que
> TODO esté en verde. El número entre paréntesis es el criterio de `spec.md` que cierra la tarea.

## Preparación

- [x] Rama `feat/HU-MARK-07` creada desde **develop** actualizado (se creó con la spec).
- [x] Releer `docs/multi-tenancy.md` §3-§5, `apps/backend/CLAUDE.md` y `apps/frontend/CLAUDE.md`.
- [x] Invocar `multi-tenancy-guard` antes de tocar modelos o services.
- [x] Invocar `typescript-strict-mode` y `clean-code-solid` para el código nuevo.
- [x] Instalar `impeccable:impeccable` si sigue sin estar disponible (o dejar constancia en el PR).
      **Constancia:** la skill no está instalada en este entorno (`Unknown skill`); se aplicaron
      `emil-design-eng` y `frontend-design:frontend-design`.

## Implementación — Backend

### Cimientos (zona horaria, bloqueados, etiquetas, índice)

- [x] `config/env.ts`: `CAMPAIGN_AUDIENCE_MAX_DAYS` (entero positivo, default 90). (3)
- [x] `utils/zona-horaria.util.ts`: `esZonaValida`, `fechaEnZona`, `inicioDelDiaEnZona`,
      `finDelDiaEnZona` con `Intl` (sin dependencias nuevas). (2, 3, 11)
- [x] `features/tenant/tenant.types.ts` → `model.ts`: `zonaHoraria` (default `America/Bogota`). (11)
- [x] `features/tenant/tenant.validation.ts`: `updateAjustesTenantSchema` (`zonaHoraria` refinada con
      `esZonaValida`, body `.strict()`). (11)
- [x] `features/tenant/tenant.service.ts`: `getAjustesTenant`, `updateAjustesTenant` (tenantId como
      argumento, `findByIdScoped`/`findOneAndUpdateScoped` sobre el propio tenant). (11)
- [x] `features/tenant/tenant.controller.ts` → `routes.ts`: `GET`/`PATCH /me/ajustes` con
      `authenticateJWT → requireTenant → authorize(['admin']) → validate → asyncHandler`,
      **antes** de `/:id`. (11)
- [x] `features/cliente/{types,model}.ts`: `bloqueado` (default `false`) + índice
      `{ tenantId: 1, bloqueado: 1 }`. (5)
- [x] `features/cliente/{validation,service}.ts`: admitir `bloqueado` en `PATCH /api/clientes/:id`. (11)
- [x] `features/campaign/campaign.segment.service.ts`: excluir `bloqueado: { $ne: true }` junto al
      opt-out y contar `bloqueados` en `resumirSegmento`; extraer el helper de resumen reutilizable. (5)
- [x] `features/tag/tag.types.ts` → `model.ts`: `origen` (`manual` | `campana`, default `manual`),
      `campaignId`, `maxlength: 60`. (9)
- [x] `features/tag/tag.validation.ts`: `nombre` hasta 60. (9)
- [x] `features/tag/tag.service.ts`: `findOrCreateTagPorNombre` con la **collation del índice** y
      relectura ante `E11000`; `ITagResponse` con `origen` y `campaignId`. (7, 9)
- [x] `features/message/message.model.ts`: índice `{ tenantId: 1, direccion: 1, createdAt: -1 }`. (4)
- [x] `features/lead/lead.{validation,service}.ts`: query `etiqueta` → salto previo a
      `Cliente.tagIds` (tag inexistente → lista vacía). (9)

### Feature `campaign` — orden del patrón de 6 archivos

- [x] `campaign.rango.ts` (puro): `RANGOS_AUDIENCIA`, `HORAS_POR_RANGO`, `resolverRangoAudiencia`. (2, 3)
- [x] `campaign.types.ts`: `TIPOS_AUDIENCIA`, `IAudienciaCampana`, `AudienciaInputDTO`, `tagId`,
      `etiquetaAgregada`, `SendCampaignDTO`, `IAudiencePreviewResponse`, `IResumenSegmento.bloqueados`,
      `audiencia` y `etiqueta` en `ICampaignResponse`. (1, 6, 7, 10)
- [x] `campaign.model.ts`: subdoc `audiencia` (default `{ tipo: 'segmento' }`), `tagId`, índice
      `{ tenantId: 1, tagId: 1 }`. `campaign-recipient.model.ts`: `etiquetaAgregada` (default `null`). (6, 8)
- [x] `campaign.validation.ts`: `previewAudienciaSchema`, `audiencia` opcional en
      `createCampaignSchema` (`discriminatedUnion`), `sendCampaignSchema` (`tagId` XOR `nombre`). (1, 3, 7)
- [x] `campaign.audience-reciente.service.ts`: `resolverClientesConSalientes` (vía
      `aggregateScoped`), `construirFiltroMensajesRecientes`, `previewAudienciaReciente`. (1, 4, 5, 13)
- [x] `campaign.service.ts`:
  - [x] `construirFiltroAudiencia` (despacho por `audiencia.tipo`). (6)
  - [x] `createCampaign`: resuelve y **congela** el rango + `totales.destinatarios`. (6)
  - [x] `materializarDestinatarios` recibe el filtro construido (mismo cursor y dedupe). (4, 6)
  - [x] `previewAudience` y `sendCampaign` (orden de pasos de `plan.md`). (1, 7)
  - [x] `toCampaignResponse`: `audiencia` + `etiqueta` (`findByIdScoped(Tag)`). (10)
  - [x] `applyDeliveryStatusToRecipient`: `$pull` del tag en `failed` si `etiquetaAgregada`. (8)
- [x] `campaign.controller.ts`: `previewAudienceController`, `sendCampaignController` (delgados,
      `tenantId` del token). (1, 7)
- [x] `campaign.routes.ts`: `POST /audience/preview` (antes de `/:id`) y `POST /:id/send`. (1, 7)
- [x] `workers/campaign-broadcast.processor.ts`: `$addToSet` + `etiquetaAgregada` tras `enviado`. (8)
- [x] `features/audit/audit.types.ts`: acción `campaign.send`. (7)
- [x] Montaje: `/api/campaigns`, `/api/tags`, `/api/tenants`, `/api/leads` ya están en `app.ts`;
      verificar que las rutas literales nuevas quedan antes de `/:id`.

## Implementación — Frontend

> Antes de **cada** componente: invocar `emil-design-eng`, `impeccable:impeccable` y
> `frontend-design:frontend-design`, y aplicar sus criterios. shadcn primero; light y dark.

- [x] `pnpm dlx shadcn@3.8.5 add command toggle-group` (versión pinneada). (12)
- [x] `features/campaigns/{types,api}.ts`: `AudienciaInput`, `previewAudience`, `sendCampaign`. (1, 7)
- [x] `features/campaigns/lib/rango.ts`: etiquetas de rango, `sugerirNombreEtiqueta(nombre, fecha)`
      (≤ 60), límites del picker. (12)
- [x] `hooks/useAudiencePreview.ts` (debounce + `keepPreviousData`) y `useSendCampaign` (toast en el
      hook). (1, 7)
- [x] `components/audiencia/AudienceTypeSwitch.tsx`. (12)
- [x] `components/audiencia/RecentMessagesAudience.tsx` + `DateRangePicker.tsx` (futuro y > 90 días
      deshabilitados, `locale es`, rango resuelto mostrado desde el servidor). (2, 3, 12)
- [x] `components/TagField.tsx`: elegir existente o crear, sugerencia editable, contador. (7, 12)
- [x] `CampaignWizard.tsx`: integrar paso 1 y revisión; el botón final llama a `send`. (12)
- [x] `components/CampaignAudienceSummary.tsx` + `CampaignDetailPage.tsx`. (10, 12)
- [x] `features/tags/components/TagChip.tsx` (truncado + tooltip) y `TagFormDialog.tsx` (60). (9)
- [x] `features/leads/components/LeadsFilters.tsx` + `LeadsPage.tsx`: filtro "Etiqueta" en la URL. (9)
- [x] Ficha del contacto: `Switch` "Bloqueado" con texto de ayuda. (5, 11)
- [x] Ajustes del tenant: zona horaria con buscador (`Command` en `Dialog`), accesible desde el paso
      de audiencia «Los días se cuentan en … · Cambiar». No existe una página de ajustes generales. (11)

## Tests (Vitest)

### Puros

- [x] `campaign.rango.test.ts`: `1d`/`3d`/`7d` = 24/72/168 h hasta `ahora`; `custom` en
      `America/Bogota` (00:00 local = 05:00 UTC) y en una zona con DST (`America/New_York` en el
      cambio de hora); `desde > hasta` → 400; `hasta` futuro → 400; 91 días → 400, 90 → ok;
      `hasta = hoy` se recorta a `ahora`. (2, 3)
- [x] `zona-horaria.util.test.ts`: zona válida / inválida. (11)
- [x] Front `lib/rango.test.ts`: sugerencia de nombre y recorte a 60. (12)

### Audiencia y envío (Mongo en memoria)

- [x] Contacto con 3 salientes en el rango → 1 destinatario; dos fichas con el mismo teléfono → 1. (4)
- [x] Entrante en el rango no cuenta; saliente fuera del rango no cuenta. (4)
- [x] `marketingOptOut` y `bloqueado` excluidos y desglosados en `resumen`. (5)
- [x] `createCampaign` guarda `audiencia` con `rango`, `desde`, `hasta`, `zonaHoraria`. (6)
- [x] **Preview == envío:** `total` de la vista previa = `totales.destinatarios` = nº de
      `CampaignRecipient` tras `send`. Un saliente nuevo después de crear **no** se incorpora. (6)
- [x] `send` con `{ nombre }` nuevo crea `Tag { origen: 'campana', campaignId }`; con un nombre que
      ya existe con otra capitalización/acentos lo reutiliza; con `{ tagId }` existente lo usa. (7)
- [x] `send` idempotente sobre una campaña `en_curso`. (7)
- [x] Worker: etiqueta solo a `enviado`, nunca a `fallido`/`omitido`; contacto que ya la tenía →
      sin duplicado y `etiquetaAgregada: false`; `failed` posterior retira la etiqueta solo si
      `etiquetaAgregada: true`. (8)
- [x] `Tag.nombre` de 60 ok, 61 → 400; duplicado → 409 en `POST /api/tags`. (9)
- [x] `GET /api/leads?etiqueta=` devuelve solo los leads de contactos con esa etiqueta. (9)
- [x] `GET /api/campaigns/:id` incluye `audiencia` y `etiqueta`. (10)
- [x] `PATCH /api/tenants/me/ajustes` con zona inválida → 400; válida → persiste. (11)
- [x] Rutas: `401` sin token, `403` con un rol que no es `admin`, `400` con body inválido. (1, 7)

### Aislamiento multi-tenant

- [x] Mensajes salientes de B (mismo teléfono que un contacto de A) **no** aparecen en la vista
      previa ni en los destinatarios de A. (13)
- [x] `send` sobre una campaña de B desde A → `404` y nada escrito (ni tag creado ni campaña tocada). (13)
- [x] `send` con `{ tagId }` de B → `404` y nada escrito. (13)
- [x] `{ nombre }` igual a una etiqueta de B crea una **nueva** en A (la de B no se reutiliza). (13)
- [x] El worker con `tenantId` de A no modifica `Cliente.tagIds` de B. (13)
- [x] `GET /api/leads?etiqueta=<tagId de B>` desde A → lista vacía. (13)
- [x] `GET/PATCH /api/tenants/me/ajustes` solo toca el tenant del token. (13)

### Frontend

- [x] `TagField.test.tsx`: elegir existente, crear nueva, editar la sugerencia. (12)
- [x] Paso de audiencia: cambiar de preset dispara la vista previa; personalizado no deja elegir
      futuro. (12)

## Verificación final

- [x] `pnpm --filter @sofiapp/api typecheck` en verde. (14)
- [x] `pnpm --filter @sofiapp/api test` en verde. (14)
- [x] `pnpm --filter @sofiapp/web build && pnpm --filter @sofiapp/web lint` (+ `test`) en verde. (14)
- [x] Checklist de PR de `docs/multi-tenancy.md` §9 completo.
- [ ] Revisión visual en light y dark (capturas en `.playwright-mcp/`, borradas al terminar; nada de
      `*.png` en `git status`).
- [x] `docs/data-model.md`, `docs/api-contract.md`, `docs/domain.md` actualizados.
- [x] `spec.md` → `**Estado:** implementado`.

## Definición de "hecho"

- Campaña creada y enviada con `1d`, `3d`, `7d` y `custom`.
- El conteo de la vista previa coincide con los envíos reales (test verde).
- La etiqueta queda solo en los contactos enviados con éxito, sin duplicados, y filtra leads y
  segmentos.
- Deduplicación y aislamiento por tenant cubiertos por tests en verde.
- CI verde. Prueba manual con números sandbox de Meta pendiente de credenciales del usuario.
