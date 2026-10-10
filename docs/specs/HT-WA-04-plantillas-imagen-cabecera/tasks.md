# HT-WA-04 — Tasks (checklist ejecutable)

> Claude Code: ejecuta en orden sobre la rama `feat/HT-WA-04`. Marca cada casilla al terminar. No
> cierres el feature hasta que TODO esté en verde. Antes de tocar `apps/frontend`, invoca
> `emil-design-eng`, `impeccable:impeccable` (si está instalada) y `frontend-design:frontend-design`.
> `(Cn)` = criterio del `spec.md` que cubre la tarea.

## Implementación — Backend

### 0. Configuración e infraestructura
- [ ] `config/env.ts`: `META_APP_ID` → `requiredInRuntime`; `TEMPLATE_SWEEP_MINUTES` (default 30). (C4, C9)
- [ ] `config/queues.ts`: `TEMPLATE_STATUS_JOB`, `TEMPLATE_SWEEP_JOB`, `TEMPLATE_SWEEP_SCHEDULER_ID`. (C7, C9)
- [ ] `features/channel/channel.model.ts`: índice `{ wabaId: 1 }`. (C7)
- [ ] `integrations/storage/index.ts`: `construirTemplateMediaKey`, `construirBorradorCampaignMediaKey`,
      `perteneceAlTenant(key, tenantId, carpeta)`. (C4, C5, C14, C24)
- [ ] `middlewares/upload.middleware.ts`: `subirImagenCabecera` (5 MB, `413` con mensaje claro). (C3, C9, C15)
- [ ] `features/media/media-imagen.validation.ts`: `validarImagenCabecera` por magic bytes. (C3)

### 1. Integraciones Meta
- [ ] `meta-resumable-upload.client.ts`: sesión `/{app-id}/uploads` + subida → `headerHandle`; reintentos 429/5xx. (C4)
- [ ] `meta-template.client.ts`: `create` con `HEADER(IMAGE)` + `FOOTER`; `getById`; `rejected_reason` en `fields`. (C5, C9)
- [ ] `meta-template.errors.ts`: traducción de duplicado / imagen / límite; **confirmar subcódigos en sandbox**. (C6)

### 2. Plantillas — patrón de 6 archivos
- [ ] `whatsapp-template.types.ts`: `IImagenAlmacenada`, `imagenPorDefecto`, `motivoRechazo`,
      `CabeceraAlta`, `pie`, `ISubidaImagenMuestraResponse`, `IEventoEstadoPlantilla`,
      `CATEGORIAS_CON_IMAGEN`. (C1, C2, C5)
- [ ] `whatsapp-template.model.ts`: `imagenPorDefecto`, `motivoRechazo`, `example.header_handle`,
      índice `{ tenantId, metaTemplateId }`. (C5, C7)
- [ ] `whatsapp-template.validation.ts`: `cabecera` discriminada, `pie`, refine de categoría,
      `templateIdSchema`, `uploadTemplateMediaSchema`. (C1, C2)
- [ ] `whatsapp-template.status.ts`: `normalizarEvento`, motivos legibles. (C7)
- [ ] `whatsapp-template.service.ts`:
  - [ ] `subirImagenMuestra` (validar → guardar en storage del tenant → Resumable Upload → URL firmada). (C3, C4)
  - [ ] `createTemplate` con imagen: revalida `imagenRef` (prefijo + existe), arma componentes, Meta, persiste
        `imagenPorDefecto`; solo-texto idéntico a `HT-WA-02`. (C1, C5, C6, C23)
  - [ ] `getTemplate`, `syncTemplate(id)`, `aplicarEventoEstado` (+ `publishRealtime`). (C7, C9, C10)
  - [ ] `mapToResponse`: `motivoRechazo`, `pie`, `imagenPorDefecto.url`. (C11, C19)
  - [ ] `resolverPlantillaEnviable(…, tieneReemplazo)` + `resolverCabeceraEnvio` (reemplazo > defecto > 422). (C12, C13)
- [ ] `whatsapp-template.controller.ts`: `uploadMedia`, `getById`, `syncOne` (delgados, `tenantId` del token).
- [ ] `whatsapp-template.routes.ts`: `POST /media` y `GET /:id`, `POST /:id/sync` (literales antes de `/:id`).
- [ ] `features/media`: ruta firmada `GET /media/templates/:id/imagen`. (C19)

### 3. Caché de media en Meta
- [ ] `features/media/media-meta-cache.ts`: `asegurarMediaEnMeta` (25 días + `metaPhoneNumberId`). (C17)
- [ ] `campaign.service.ts`: `prepararImagenCabecera` delega en `asegurarMediaEnMeta` (sin cambio de conducta). (C23)

### 4. Webhook y worker
- [ ] `webhook.types.ts`: `IWebhookChange` discriminado por `field`. (C7, C8)
- [ ] `webhook.service.ts`: `resolveTenantsByWaba`, `enqueueTemplateStatusJob` (jobId idempotente). (C7)
- [ ] `webhook.controller.ts`: bifurcar por `change.field`, `try` por cambio, `200` inmediato intacto. (C7, C8)
- [ ] `workers/template-status.processor.ts` + despacho en `worker.ts` + scheduler `template-sweep`. (C7, C9)
- [ ] `realtime/realtime.types.ts`: `template:status`. (C10)

### 5. Campañas
- [ ] `campaign.types.ts` / `campaign.model.ts`: `contenido.imagen.metaPhoneNumberId`. (C17)
- [ ] `campaign.validation.ts`: `imagenRef?` en `createCampaignSchema`; schedule sin imagen obligatoria. (C14)
- [ ] `campaign.service.ts`: `subirImagenReemplazo` (borradores), alta con `imagenRef`, resolución
      reemplazo → defecto en lanzamiento y en arranque programado; `assertContenidoCompatible` con la regla nueva. (C13, C14, C16)
- [ ] `campaign.controller.ts` / `campaign.routes.ts`: `POST /campaigns/media` antes de `/:id`. (C14)

### 6. Envío desde conversación
- [ ] `message.routes.ts`: `subirImagenCabecera` entre `authorize` y `validate`. (C15)
- [ ] `message.validation.ts`: `parametros` como JSON en multipart; JSON plano sigue válido. (C15, C23)
- [ ] `message.service.ts`: imagen resuelta en `sendOutbound` modo plantilla; `Message.media` con la imagen
      cuando el envío la lleva. (C15, C18, C21)

### 7. Documentación
- [ ] `docs/adr/0013-tenant-por-waba-en-webhook-de-plantillas.md`. (C7, C24)
- [ ] `docs/integrations/meta-whatsapp.md`: alta con imagen, Resumable Upload, webhook de estado, paso manual.
- [ ] `docs/data-model.md`: `whatsapp_templates` (`imagenPorDefecto`, `motivoRechazo`, `header_handle`).
- [ ] `docs/multi-tenancy.md` §5: barrido de plantillas `PENDING`.

## Implementación — Frontend

- [ ] Mover `ImageDropzone` a `src/components/media/` (re-export temporal en `features/campaigns`); crear `UploadProgress`. (C4, C20)
- [ ] `api/whatsapp-templates.ts`: `uploadTemplateImage` (con `onUploadProgress`), `getTemplate`, `syncTemplate`;
      `templateErrorMessage` con los mensajes de C6. (C4, C6, C9)
- [ ] Tipos (`types/api.ts`, `types/domain.ts`): `imagenPorDefecto`, `motivoRechazo`, `pie`, evento de estado.
- [ ] `HeaderTypePicker` (RadioGroup; imagen deshabilitada en Autenticación con motivo visible). (C1, C2)
- [ ] `CreateTemplateDialog`: tipo de encabezado, carga + progreso, pie opcional, vista previa con imagen, errores. (C1–C6, C19)
- [ ] `TemplatePreview`: `imagenUrl` sobre el texto (burbuja WhatsApp), `alt` descriptivo. (C19)
- [ ] `TemplateList`: «Con imagen», motivo de rechazo visible, «Revisar estado». (C9, C11)
- [ ] `useTemplateStatusRealtime`: socket `template:status` → caché + toast; montado en `TemplatesPage`. (C10)
- [ ] `MessageImageField` (defecto / cambiar / restaurar / aviso de políticas / exige imagen sin defecto). (C13, C20)
- [ ] `CampaignWizard`: ofrecer plantillas `IMAGE`; `POST /campaigns/media` → `imagenRef`; vista previa real. (C14, C19, C20)
- [ ] `CampaignScheduler`: imagen opcional con defecto + `MessageImageField`. (C14, C20)
- [ ] Bandeja: `SendTemplateDialog`, botón en `WindowClosedBanner` y en `MessageComposer` (solo admin),
      `MessageBubble` de plantilla con imagen. (C15, C19, C21)
- [ ] Revisión light/dark, teclado, ancho móvil y `prefers-reduced-motion` de todo lo tocado. (C22)

## Tests

### Backend (Vitest + mongodb-memory-server; Meta mockeado)
- [ ] `media-imagen.validation`: JPEG y PNG válidos; GIF/WebP/PDF renombrado a `.jpg` → 400. (C3)
- [ ] `meta-resumable-upload.client.test.ts`: dos pasos, cabeceras `OAuth` y `file_offset`, reintento 5xx. (C4)
- [ ] `whatsapp-template.image.test.ts`:
  - [ ] `POST /templates/media` válida → guarda bajo `<tenantId>/templates/` y devuelve `headerHandle`. (C4)
  - [ ] > 5 MB → 413; no imagen → 400; **Meta no llamado** en ninguno. (C3)
  - [ ] Alta con imagen en MARKETING/UTILITY → componentes `HEADER(IMAGE)`+`BODY`(+`FOOTER`), `PENDING`,
        `imagenPorDefecto` guardada. (C4, C5, C7)
  - [ ] Alta con imagen en AUTHENTICATION → 400 sin llamar a Meta. (C2)
  - [ ] Meta falla → sin documento local; duplicado → 409; imagen → 400; límite → 422. (C5, C6)
  - [ ] Alta solo texto produce exactamente el payload de `HT-WA-02`. (C1, C23)
- [ ] `whatsapp-template.status.test.ts`:
  - [ ] Evento `APPROVED` / `REJECTED` (con motivo) / `PAUSED`; aprobado tras rechazo limpia el motivo. (C7)
  - [ ] Evento de plantilla inexistente → `no-encontrada`, sin lanzar. (C7)
  - [ ] `syncTemplate(id)` refresca estado y motivo; el barrido solo toca `PENDING`. (C9)
  - [ ] `publishRealtime` llamado con `template:status`. (C10)
- [ ] `webhook.routes.test.ts`: lote mixto (`messages` + estado) encola ambos; cambio sin `metadata` no corta
      el lote; respuesta `200` inmediata; WABA desconocido → log y descarte. (C7, C8)
- [ ] `media-meta-cache.test.ts`: reutiliza < 25 días mismo número; resube si caducó o cambió el número. (C17)
- [ ] `campaign.image-default.test.ts`:
  - [ ] Sin reemplazo usa la imagen por defecto; con reemplazo usa la suya. (C13, C14)
  - [ ] **Dos campañas, misma plantilla**: payloads con ids de imagen distintos; la plantilla y la otra campaña
        quedan intactas (incluida la caché). (C16, C18)
  - [ ] Plantilla `IMAGE` sin defecto y sin reemplazo → 422 antes de crear destinatarios. (C13)
  - [ ] Payload final: `header.parameters[0].image.id` + `body` con variables sustituidas. (C18)
- [ ] `message.template-image.test.ts`: JSON sin imagen (igual que `HT-WA-02`); multipart con imagen; sin
      imagen usa defecto; no aprobada → 422 sin llamar a Meta. (C12, C15, C23)
- [ ] **Aislamiento** (`whatsapp-template.isolation.test.ts` + campañas):
  - [ ] B no lee (`GET /:id`), no sincroniza (`/:id/sync`) ni envía la plantilla de A → 404. (C24)
  - [ ] `imagenRef` con prefijo de A usado desde B (plantilla y campaña) → 400. (C24)
  - [ ] Evento del WABA de A con mismo `name`+`language` en B → solo cambia la de A. (C24)
  - [ ] URL firmada de la imagen por defecto de A no sirve con el token de B. (C24)
- [ ] Suites existentes de `HT-WA-02`, `HU-MARK-01`, `HU-MARK-03` en verde **sin modificarlas** salvo añadir casos. (C23)

### Frontend (Vitest + Testing Library)
- [ ] `CreateTemplateDialog`: imagen deshabilitada en Autenticación; validación de cliente (tipo/tamaño) con
      mensaje; progreso; envía `cabecera` con `imagenRef`/`headerHandle`. (C1–C4)
- [ ] `TemplateList`: «Con imagen» y motivo de rechazo visibles. (C11)
- [ ] `useTemplateStatusRealtime`: evento actualiza la caché del listado. (C10)
- [ ] `MessageImageField`: muestra defecto, cambia, restaura; sin defecto exige imagen. (C20)
- [ ] `TemplatePreview`: pinta la imagen que se enviará y la cambia al reemplazar. (C19)
- [ ] `CampaignWizard` / `CampaignScheduler`: plantilla `IMAGE` con y sin reemplazo llega al payload correcto. (C14)
- [ ] `SendTemplateDialog`: envía multipart con imagen y JSON sin ella. (C15, C21)

## Verificación final

- [ ] `pnpm --filter @sofiapp/api typecheck` en verde. (C25)
- [ ] `pnpm --filter @sofiapp/api test` en verde. (C25)
- [ ] `pnpm --filter @sofiapp/web build && pnpm --filter @sofiapp/web lint` en verde. (C25)
- [ ] Tests de frontend de los componentes tocados en verde. (C25)
- [ ] Checklist de PR de `docs/multi-tenancy.md` §9 (incluye ADR 0013 y la excepción del barrido). (C24)
- [ ] Revisión visual light/dark y móvil (capturas en `.playwright-mcp/`, borradas al terminar). (C22)
- [ ] **Prueba manual del DoD** (acción del usuario): suscribir `message_template_status_update` en el panel
      de Meta, crear plantilla con imagen, esperar aprobación en vivo, lanzar dos campañas (defecto y
      reemplazo) a contactos fuera de la ventana y comprobar cada imagen y las variables en el teléfono.

## Definición de "hecho"

Un administrador crea una plantilla con texto e imagen, Meta la aprueba y el estado cambia solo en
SofiApp; dos campañas con esa plantilla —una con la imagen por defecto y otra con una imagen distinta—
llegan a contactos fuera de la ventana de 24 h cada una con su imagen y sus variables, sin nueva
aprobación. Las plantillas de solo texto y las campañas existentes no cambian, y ningún dato cruza
de tenant.
