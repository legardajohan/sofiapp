# HU-MARK-03 — Tasks (checklist ejecutable)

> Claude Code: ejecuta en orden. Marca cada casilla al terminar. No cierres el feature hasta que
> TODO esté en verde. El número entre paréntesis es el criterio de `spec.md` que cierra la tarea.

## Preparación

- [x] `git fetch origin && git switch -c feat/HU-MARK-03 origin/develop` — la rama sale de
      **develop**, no de la rama actual.
- [x] Releer `docs/multi-tenancy.md` §3-§5, `apps/backend/CLAUDE.md` (patrón de 6 archivos) y
      `docs/specs/HU-MARK-01-campanas-segmentadas/plan.md`.
- [x] Invocar `multi-tenancy-guard` antes de tocar modelos o services.
- [x] Invocar `typescript-strict-mode` y `clean-code-solid` para el código nuevo.

## Implementación — Backend

### Plantillas y envío (cabecera IMAGE)

- [x] `whatsapp-template.types.ts` / `.service.ts`: `FormatoCabecera`, `formatoCabecera(tpl)` y
      `cabecera` en `IWhatsAppTemplateResponse`. (8)
- [x] `buildTemplatePayload(…, cabecera?)`: validación de cabecera tras `APPROVED` y nº de parámetros;
      componente `header` con `image.id`. Retrocompatible. (2, 6)
- [x] `assertContenidoCompatible(tenantId, templateId, parametros, tieneImagen)` reutilizando las
      mismas comprobaciones. (2)
- [x] `message.types.ts` / `message.service.ts`: `imagenCabecera?` en el modo `plantilla`, pasado a
      `buildTemplatePayload`. (6)

### Almacenamiento y subida

- [x] `integrations/storage/index.ts`: `construirCampaignMediaKey(tenantId, campaignId, mime)` bajo el
      prefijo del tenant. (10)
- [x] `middlewares/upload.middleware.ts`: factoría `crearSubidaUnica`; `subirArchivo` reconstruido con
      ella sin cambiar comportamiento; `subirImagenCampana` (campo `imagen`, ≤ 5 MB, 8 campos). (2)
- [x] `features/media`: `firmarUrlImagenCampana` + `GET /api/media/campaigns/:campaignId/imagen`
      que valida token y tenant. (8, 10)

### Feature `campaign` (patrón de 6 archivos)

- [x] `campaign.types.ts`: `IImagenCampana`, `IContenidoCampana`, `ScheduleCampaignDTO`,
      `RescheduleCampaignDTO`, `CampaignStartJobData`, `imagen` en la respuesta. (1, 5, 6, 8)
- [x] `campaign.model.ts`: `contenido.imagen` con default `null`. (1, 6)
- [x] `campaign.validation.ts`: `scheduleCampaignSchema` (JSON de multipart → issue de Zod si no
      parsea; antelación ≥ 60 s) y `rescheduleCampaignSchema` `.strict()`. (1, 5)
- [x] `campaign.service.ts`:
  - [x] `scheduleCampaign` — mime → contenido compatible → guardar imagen → `createScoped` (limpieza
        si falla) → job con `delay` exacto → auditoría. **Sin** consumir `campanasMes`. (1, 2, 4, 7)
  - [x] `rescheduleCampaign` — 404 cross-tenant, 409 si no es `programada`, revalidación, sustitución
        de imagen, update condicional, job nuevo si cambia la hora. (5, 10)
  - [x] `prepararImagenCabecera` — sube a Meta si falta id o tiene > 25 días; cachea `metaMediaId`. (6)
  - [x] `launchCampaign` — transición `programada → en_curso` **condicional**; imagen preparada antes
        de materializar destinatarios. (4, 6)
  - [x] `toCampaignResponse` — `imagen.url` firmada. (8)
  - [x] `cancelCampaign` — confirmar que cubre `programada` sin tocar cuota. (5)
- [x] `campaign.controller.ts`: `scheduleCampaignController`, `rescheduleCampaignController`;
      `tenantId` de `req.user!.tenantId`, archivo de `req.file`. (1, 5, 10)
- [x] `campaign.routes.ts`: `POST /schedule` (antes de `/:id`) y `PATCH /:id/schedule` con
      `subirImagenCampana` entre `authorize` y `validate`. (1, 5)
- [x] Montaje: `/api/campaigns` ya montado en `app.ts` — solo verificar.
- [x] `features/audit/audit.types.ts`: `campaign.schedule`, `campaign.reschedule`. (1, 5)

### Cola y worker

- [x] `config/queues.ts`: `CAMPAIGN_SCHEDULED_START_JOB = 'start-exact'`. (4)
- [x] `workers/campaign-broadcast.processor.ts`: extraer `lanzarProgramada(tenantId, campaignId)` del
      barrido; `processScheduledStart` con sus tres salidas no-op; el lote pasa `imagenCabecera`. (4, 5, 6)
- [x] `worker.ts`: rama `CAMPAIGN_SCHEDULED_START_JOB`. (4)

## Implementación — Frontend

> Antes de **cada** componente: invocar `emil-design-eng`, `impeccable:impeccable` y
> `frontend-design:frontend-design`. Si `impeccable` no está disponible, avisar al usuario.

- [x] `pnpm dlx shadcn@3.8.5 add calendar` (versión pinneada; `react-day-picker` fijado a `^9`, la
      versión para la que está escrito el `calendar.tsx` de esa CLI). (9)
- [x] `types.ts` / `api.ts` / `hooks/useCampaigns.ts`: `scheduleCampaign` (FormData),
      `rescheduleCampaign`, `imagen`, `cabecera`; toasts en los hooks. (9)
- [x] `ImageDropzone.tsx` — arrastrar/clic, validación jpeg/png ≤ 5 MB, vista previa con
      `createObjectURL`/`revokeObjectURL`, accesible por teclado. (9)
- [x] `DateTimePicker.tsx` — `calendar` **en línea** + hora, días pasados deshabilitados, zona
      horaria y texto relativo visibles, ISO con offset. (9) — ver Notas: sin `popover`.
- [x] `MessagePreview.tsx` — burbuja WhatsApp con imagen + `BODY` resuelto. (9)
- [x] `CampaignScheduler.tsx` — pasos segmento → contenido → horario/revisión, reutilizando
      `SegmentFilters`, `AudienceMeter`; plantillas filtradas a `IMAGE` con estado vacío explicativo. (9)
- [x] `RescheduleDialog.tsx` + cancelar con `alert-dialog` en `CampaignsPage` y `CampaignDetailPage`;
      imagen visible en el detalle. (5, 9)
- [x] `CampaignWizard.tsx` — retirar el `datetime-local` suelto; "Programar" abre el programador. (9)
- [ ] Revisión visual en **light y dark** en el navegador — pendiente: en esta sesión no hay
      Playwright disponible. Todo usa tokens semánticos y componentes de shadcn/ui. (9)

## Tests

- [x] `whatsapp-template.service.test.ts`: sin cabecera → payload idéntico al actual; `IMAGE` con
      id → componente `header`; `IMAGE` sin id → 422; id con plantilla sin cabecera → 400;
      `DOCUMENT` → 422. (2, 6)
- [x] `campaign.schedule.test.ts`: 201 `programada`; pasado / < 60 s → 400; mime inválido → 400;
      > 5 MB → 413; plantilla no `APPROVED` → 422; parámetros → 400 `{ esperados, recibidos }`; no
      consume `campanasMes`; reprogramar en `programada` OK y en `en_curso` → 409; cancelar
      `programada` sin destinatarios ni cuota. (1, 2, 5, 7)
- [x] `campaign-broadcast.processor.test.ts`: job exacto lanza; job de hora anterior → no-op; job +
      barrido → un solo arranque; fallo de subida a Meta → `fallida` sin destinatarios enviados;
      id de Meta de > 25 días se resube; el lote envía con `imagenCabecera`. (4, 5, 6)
- [x] **`campaign.schedule.isolation.test.ts`**: tenant B no lee, reprograma ni cancela la campaña
      de A (404, sin escribir); la `mediaKey` empieza por el `tenantId` de A; la URL firmada de A no
      sirve con una campaña de B; el job de arranque de A con `tenantId` de B no encuentra nada. (10)
- [x] `upload.middleware` — `subirArchivo` conserva su comportamiento (tests existentes en verde). (2)
- [x] Front: `ImageDropzone.test.tsx` (tipo/tamaño/vista previa), `CampaignScheduler.test.tsx`
      (envío de FormData, filtrado de plantillas `IMAGE`, bloqueo con calidad `RED`). (9)

## Documentación

- [x] `docs/data-model.md` — `campaigns.contenido.imagen`.
- [x] `docs/api-contract.md` — endpoints nuevos, `imagen`, `cabecera`, ruta firmada.
- [x] `docs/integrations/meta-whatsapp.md` — envío de plantillas con cabecera `IMAGE`, caducidad del
      `media id`.

## Verificación final

- [x] `pnpm --filter @sofiapp/api typecheck` en verde. (11)
- [ ] `pnpm --filter @sofiapp/api test` en verde — la corrida completa final se cortó por falta de
      memoria del sistema; los tests nuevos y la suite previa (1385) pasaron por separado. (11)
- [ ] `pnpm --filter @sofiapp/web test` en verde — ídem: los de `features/campaigns` (25) pasan;
      la suite completa no llegó a terminar. (11)
- [x] `pnpm --filter @sofiapp/web build && pnpm --filter @sofiapp/web lint` en verde. (11)
- [x] Checklist de PR de `docs/multi-tenancy.md` §9. (10)
- [x] `git status` sin `*.png`/`*.jpg` de verificación.
- [ ] Prueba manual en número **sandbox**: programar a +3 min con plantilla `IMAGE` aprobada;
      confirmar imagen + texto a la hora — requiere acción del usuario. (DoD)

## Notas de implementación

- **Calendario en línea, no en `popover`.** Un `Popover` de Radix dentro del `Dialog` peleaba con
  su trampa de foco (se cerraba al abrirse; con `modal`, bucle infinito de foco). El paso
  «¿Cuándo sale?» solo pregunta eso, así que el calendario abierto además ahorra un clic.
- **El programador también admite plantillas de solo texto** (cabecera `NINGUNA`/`TEXT`), para no
  perder la programación sin imagen que el wizard de MARK-01 ofrecía con su `datetime-local`, que
  se retiró. Las de `IMAGE` salen primero; las de `DOCUMENT`/`VIDEO` no aparecen. El wizard de envío
  inmediato oculta ahora las plantillas con media en la cabecera, que no puede rellenar.
- **`impeccable:impeccable` no está instalada** en este entorno: se invocaron `emil-design-eng` y
  `frontend-design:frontend-design`.
- **Firma de URLs extraída a `features/media/media.token.ts`** (con re-export desde
  `media.service`) para que `campaign.service` pueda firmar sin crear un ciclo de imports
  `media.service → message.service → campaign.service`.
- **Arranque del proceso web** verificado (`Servidor escuchando`); el worker no se arrancó contra
  la cola de desarrollo para no consumir jobs reales. Su rama nueva está cubierta por
  `campaign-schedule.processor.test.ts`.
- **Ejes del segmento ajustados (2026-09-28)**: fuera «Rol del contacto» y «Datos propios del
  contacto»; dentro «Intención de compra» (nuevo eje `intencionCompra` en `ISegmentoFiltros`,
  modelo, Zod y segmentador), «Estado comercial» y «Etiquetas» (ya soportados por el backend).
  Aplica también al wizard de MARK-01 porque comparten `SegmentFilters`.

## Definición de "hecho"

Todos los criterios 1–11 de `spec.md` cubiertos y verificados, tests de aislamiento en verde, y una
campaña programada que arranca a la fecha/hora exacta y entrega el contenido configurado (texto +
imagen) al segmento definido. `spec.md` pasa a `**Estado:** implementado`.
