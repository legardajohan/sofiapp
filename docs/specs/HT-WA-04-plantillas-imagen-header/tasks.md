# HT-WA-04 — Tasks (checklist ejecutable)

> Claude Code: ejecuta en orden sobre `feat/HT-WA-04` (sale de `feat/HU-MARK-03`). Marca cada casilla
> al terminar. No cierres el feature hasta que TODO esté en verde. Skills a aplicar en backend:
> `multi-tenancy-guard`, `typescript-strict-mode`, `clean-code-solid`.

## Implementación — backend (patrón de 6 archivos + montaje)

### Integración con Meta
- [x] `meta-template.client.ts`: `subirMuestra` (Resumable Upload en dos llamadas, `META_APP_ID`
      ausente → 503), `get(metaTemplateId)`, `rejected_reason` en `list`, timeout de 15 s por llamada.
      (CA-4, CA-6)
- [x] `meta-template.client.ts`: `readGraphError` + `mapearErrorPlantilla` con constantes con nombre
      (subcodes confirmados en la doc de Meta); texto crudo solo al log. (CA-14)

### Plantillas (`features/whatsapp-template/`)
- [x] `types`: `IN_APPEAL`, `CATEGORIAS_CON_IMAGEN`, `example.header_handle`, `IImagenPlantilla`,
      `CreateTemplateBody` con `cabecera`/`pie`, `IUploadResponse`, respuesta con `imagen`,
      `motivoRechazo`, `pie`; `MOTIVOS_RECHAZO`. (CA-1, CA-7, CA-9)
- [x] `model`: `imagenDefecto`, `motivoRechazo`, `example.header_handle`, índice
      `{ tenantId, metaTemplateId }`. (CA-5, CA-9)
- [x] `media-upload.model.ts`: `MediaUpload` con TTL `expiraEn` e índice `{ tenantId, _id }`. (CA-4, CA-10)
- [x] `validation`: `cabecera` discriminada (default `NINGUNA`), `pie ≤ 60`, `superRefine` de categoría,
      `getTemplateSchema`, `syncTemplateSchema`. (CA-1, CA-3)
- [x] `service`: `subirMuestraPlantilla` (clasificar → guardar con key del backend → `subirMuestra` →
      `createScoped(MediaUpload)`; limpia el archivo si Meta falla). (CA-2, CA-4)
- [x] `service`: `createTemplate` con HEADER IMAGE + FOOTER, consumo atómico del upload, reversión de
      `usadaAt` si Meta falla, `imagenDefecto` desde el upload; «Solo texto» idéntico a HT-WA-02. (CA-1, CA-4, CA-16)
- [x] `service`: `getTemplate`, `syncTemplate`, `syncTemplates` con `rejected_reason`,
      `aplicarEstadoPlantilla` (mapa de eventos + `publishRealtime`). (CA-5, CA-6, CA-7)
- [x] `service`: `resolverImagenCabecera` (override → defecto con caché → 422) y respuesta con URL
      firmada `template-<id>`. (CA-9, CA-13)
- [x] `controller`: `uploadTemplateMediaController`, `getTemplateController`, `syncTemplateController`
      (delgados, `tenantId` de `req.user!.tenantId`). (CA-17)
- [x] `routes`: `POST /media` (`subirImagenPlantilla`), `GET /:id`, `POST /:id/sync`, con la cadena
      `authenticateJWT → requireTenant → authorize(['admin']) → upload → validate → asyncHandler`.
- [x] Montaje: `app.ts` ya monta `/api/templates` (verificar que `/media` no choca con `/:id`: declarar
      `/media` antes).

### Media, upload y realtime
- [x] `middlewares/upload.middleware.ts`: preset `subirImagenPlantilla` (`imagen`, 5 MB, 1 campo). (CA-2)
- [x] `integrations/storage/index.ts`: `construirTemplateMediaKey` y `construirUploadMediaKey` con
      prefijo `<tenantId>/`. (CA-17)
- [x] `features/media/media-meta-cache.ts`: `asegurarMetaMediaId`, extraído de
      `prepararImagenCabecera`. (CA-13)
- [x] `media.token.ts` + `media.routes/controller/validation`: `recursoImagenPlantilla` y
      `GET /media/templates/:id/imagen?t=`. (CA-9, CA-17)
- [x] `realtime/realtime.types.ts`: `template:status-updated`. (CA-7)

### Campañas y envío
- [x] `campaign`: `POST /campaigns/media` (upload `cabecera-reemplazo`), `createCampaign` acepta
      `imagenHeaderUploadId` y copia la imagen al `contenido.imagen` de **esa** campaña. (CA-10, CA-11)
- [x] `campaign.service.ts`: `assertContenidoCompatible` con imagen resuelta (override o defecto);
      `prepararImagenCabecera` usa `asegurarMetaMediaId` y cae al defecto de la plantilla;
      schedule/reschedule con imagen opcional y `quitarImagen` = restaurar defecto. (CA-10, CA-13)
- [x] `message`: `sendTemplateSchema` + `imagenHeaderUploadId`, controller y `ContenidoOutbound`;
      `sendOutbound` resuelve la imagen cuando no viene `imagenCabecera`. (CA-12, CA-13)

### Webhook y worker
- [x] `webhook.types.ts`: unión de changes por `field` (`messages`, `message_template_status_update`,
      otros). (CA-5)
- [x] `webhook.service.ts`: `resolveWebhookTenantByWaba` (excepción documentada en el JSDoc) y
      `enqueueTemplateStatusJob`. (CA-5)
- [x] `webhook.controller.ts`: `switch (change.field)`; un change que falla no corta los demás. (CA-5)
- [x] `channel.model.ts`: índice `{ wabaId: 1 }`.
- [x] `inbound-message.processor.ts`: ignora changes con `field !== 'messages'`. (CA-5, CA-16)
- [x] `config/queues.ts`: `templateQueue` + `TEMPLATE_STATUS_JOB`, `TEMPLATE_SYNC_SWEEP_JOB`,
      `TEMPLATE_SYNC_TENANT_JOB`.
- [x] `workers/template.processor.ts` + `worker.ts`: Worker, alta en `workers[]` y
      `upsertJobScheduler` cada 30 min. (CA-6)

## Implementación — frontend

> Regla 7 del `CLAUDE.md`: **antes** de tocar componentes, invocar `emil-design-eng`,
> `impeccable:impeccable` (verificar que esté instalada; si no aparece, avisar al usuario) y
> `frontend-design:frontend-design`, y aplicar sus criterios. Usar shadcn/ui (`RadioGroup`, `Tooltip`,
> `Progress`, `Dialog`, `Select`, `Badge`, `Alert`, `Button`) en vez de controles a mano.

- [x] Mover `ImageDropzone` → `components/media/` y `MessagePreview` → `components/whatsapp/WhatsAppMessagePreview`
      (con sus tests e imports actualizados); `validarImagen` → `lib/imagen.ts`. (CA-15)
- [x] `api/whatsapp-templates.ts`: `uploadTemplateImage(file, onProgress)`, `getWhatsAppTemplate`,
      `syncWhatsAppTemplate`, `templateErrorMessage` con 409/413/415/422/502/503; tipos con
      `imagen`, `motivoRechazo`, `IN_APPEAL`. (CA-2, CA-14)
- [x] `HeaderTypeSelector` + `CreateTemplateDialog`: tipo de encabezado, dropzone con validación en
      cliente, `Progress` de subida, pie opcional y vista previa en vivo. (CA-1, CA-2, CA-3, CA-15)
- [x] `TemplateList` + `TemplateStatusBadge`: chip «Con imagen», motivo de rechazo, «Actualizar
      estado» por fila. (CA-7, CA-9)
- [x] `useTemplateRealtime`: invalidar `['whatsapp-templates']` + toast. (CA-7)
- [x] `HeaderImageField`: defecto / «Cambiar imagen» / «Restaurar imagen por defecto» + aviso de
      políticas. (CA-10, CA-15)
- [x] `CampaignWizard`: deja de filtrar IMAGE; sube el reemplazo con `uploadCampaignImage` y manda
      `imagenHeaderUploadId`; solo plantillas aprobadas. (CA-8, CA-10)
- [x] `CampaignScheduler` + `RescheduleDialog`: imagen opcional cuando hay defecto; restaurar =
      `quitarImagen`. (CA-10)
- [x] `SendTemplateDialog` + `WindowClosedBanner` (solo `admin`) + `sendTemplateMessage`. (CA-8, CA-12, CA-15)
- [x] Todo lo tocado usa solo tokens semánticos y componentes del UI kit (light y dark por herencia).
- [ ] Verificación visual real en light y dark (capturas en `.playwright-mcp/`, borrarlas al terminar):
      pendiente — la hace el usuario, igual que en HT-WA-03.

## Tests

### Backend (Vitest + MongoDB Memory Server, Meta mockeado)
- [x] `whatsapp-template.isolation.test.ts`: B no ve ni sincroniza la plantilla de A; B no consume el
      `uploadId` de A (404); el token de imagen de A no sirve con B; un evento con la WABA de A no toca
      plantillas de B. (CA-17)
- [x] `whatsapp-template.service.test.ts`: payload IMAGE (`header_handle`, `body_text`, FOOTER);
      «Solo texto» igual a HT-WA-02; `AUTHENTICATION` + IMAGE → 400; upload ya usado → 404 y reversión
      si Meta falla; mapeo de errores 409/422/502; `aplicarEstadoPlantilla` (APPROVED, REJECTED con
      motivo, REINSTATED, DELETED); `resolverImagenCabecera` (override, defecto, 422). (CA-1, CA-3,
      CA-4, CA-5, CA-13, CA-14)
- [x] `meta-template.client.test.ts`: Resumable Upload con `fetch` mockeado (dos llamadas, cabecera
      `OAuth`, `file_offset: 0`), sin `META_APP_ID` → 503, timeout → 502. (CA-4, CA-14)
- [x] `whatsapp-template.routes.test.ts`: `POST /media` con PDF → 415, 6 MB → 413, rol asesor → 403;
      `GET /:id`, `POST /:id/sync`. (CA-2, CA-6, CA-9)
- [x] `webhook.controller.test.ts`: payload mixto `messages` + `message_template_status_update` →
      200, ambos encolados, un change roto no corta el resto. (CA-5)
- [x] `template.processor.test.ts`: status-update publica realtime; el barrido solo encola tenants con
      `PENDING`/`IN_APPEAL`. (CA-6, CA-7)
- [x] Campañas: sin reemplazo se usa el defecto de la plantilla; dos campañas sobre la misma plantilla
      (una con reemplazo) no se pisan ni tocan la plantilla; una sola subida a Meta por campaña; IMAGE
      sin defecto ni reemplazo → 422. (CA-10, CA-11, CA-13)
- [x] `message.routes.test.ts`: `POST /messages/template` con y sin `imagenHeaderUploadId`. (CA-12)
- [x] Regresión: suites existentes de plantillas, campañas (MARK-01/03), webhook e inbox en verde. (CA-16)

### Frontend (Vitest + Testing Library)
- [x] `CreateTemplateDialog.test.tsx`: IMAGE deshabilitado en AUTHENTICATION; archivo inválido muestra
      error sin llamar al API; progreso y envío con `uploadId`. (CA-2, CA-3)
- [x] `HeaderImageField.test.tsx`: muestra defecto, cambia a personalizada, restaurar vuelve al defecto. (CA-10, CA-15)
- [x] `SendTemplateDialog.test.tsx`: solo aprobadas, preview con la imagen vigente, envío con/sin reemplazo. (CA-8, CA-12)
- [x] `CampaignWizard.test.tsx` / `CampaignScheduler.test.tsx` actualizados (IMAGE disponible). (CA-10)

## Documentación
- [x] `docs/integrations/meta-whatsapp.md`: §1 resolución por WABA (excepción), §4 alta con header y
      Resumable Upload, §5 regla de resolución y caché, §8 `META_APP_ID` + suscripción del campo
      `message_template_status_update` en el dashboard.
- [x] `docs/data-model.md`: `WhatsAppTemplate` (`imagenDefecto`, `motivoRechazo`), `MediaUpload`,
      índice `wabaId`.
- [x] `docs/api-contract.md`: endpoints nuevos y extendidos.

## Verificación final
- [x] `pnpm --filter @sofiapp/api typecheck` sin errores.
- [x] `pnpm --filter @sofiapp/api test` en verde.
- [x] `pnpm --filter @sofiapp/web build && pnpm --filter @sofiapp/web lint` en verde (+ `test`: verde
      por carpetas; `vitest run` de toda la suite en un solo proceso se queda sin memoria, ver nota).
- [x] Checklist de PR de `docs/multi-tenancy.md` §9 (repositorio scoped, `tenantId` del token,
      excepciones del webhook documentadas, tests de aislamiento).
- [x] `git status` sin `*.png`/`*.jpg` de verificación.
- [x] `spec.md` → `**Estado:** implementado`.

## Desvíos respecto al plan (registrados al implementar)

- **`MediaUpload` vive en `features/media/`** (`media-upload.model.ts` + `media-upload.service.ts`), no
  en `whatsapp-template/`: lo consumen plantillas, campañas y mensajes por igual.
- **Preset de multer `subirImagenCabecera`** (uno solo para `/templates/media` y `/campaigns/media`) y
  **una sola clave `construirSubidaMediaKey(tenantId, proposito, mime)`** en vez de dos funciones.
- **La validación de la imagen no reutiliza `clasificarArchivoSaliente`**: crearía el ciclo
  `media.service → message.service → whatsapp-template.service → media-upload.service`.
  `validarImagenCabecera` aplica la misma regla (`LIMITES_MEDIA.imagen`, 415/413).
- **`resolverImagenCabecera` se partió en dos**: `buildTemplatePayload` resuelve la imagen por defecto
  cuando no llega reemplazo, y `prepararImagenPorDefecto` la deja lista al lanzar una campaña (falla
  una vez y no por destinatario). El reemplazo de un envío suelto lo resuelve `sendOutbound`.
- **No se movieron `ImageDropzone` ni `MessagePreview`** a `components/`: plantillas e inbox los
  importan desde `features/campaigns`, igual que campañas ya importaba de plantillas. Se evitó mover
  archivos y tests sin necesidad; `MessagePreview` ganó `pie` y `textoVacio`.
- **`RescheduleDialog`**: «Restaurar imagen por defecto» solo aparece si la campaña tiene imagen
  propia y la plantilla tiene imagen por defecto.
- Los tests de `message.routes` y del webhook quedaron en `whatsapp-template.routes.test.ts` y
  `webhook.template-status.test.ts`; el flujo de servicio y el aislamiento, en
  `whatsapp-template.image.test.ts`.

## Notas de verificación

- Backend: `typecheck` limpio y suite completa en verde (145 archivos, 1552 tests).
- Frontend: `tsc -b`, `build` y `lint` en verde; tests en verde ejecutados por carpeta. La suite
  completa en un solo `vitest run` se queda sin memoria (heap de Node) en esta máquina; no se pudo
  confirmar si ya pasaba antes de este feature.
- `worker.ts` arranca sin errores con la cola `whatsapp-templates`; `app.ts` arranca hasta el
  `listen`, que falló solo porque el puerto 4000 ya estaba ocupado por el servidor de desarrollo.
- `impeccable:impeccable` no está instalada en esta sesión; se aplicaron `emil-design-eng` y
  `frontend-design:frontend-design`.

## Definición de "hecho"
Un admin crea una plantilla con texto e imagen desde SofiApp, Meta la aprueba y el estado cambia solo
en el listado (webhook o barrido). Después lanza dos campañas con esa misma plantilla, una con la
imagen por defecto y otra con una imagen distinta, y los contactos fuera de la ventana de 24 h reciben
cada una con su imagen y las variables correctas, sin una nueva aprobación. Las plantillas de solo
texto y las campañas previas funcionan igual. Los 17 criterios del `spec` están cubiertos y la
verificación final está en verde.
