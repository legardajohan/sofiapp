# HU-CONF-01 — Tasks (checklist ejecutable)

> Claude Code: ejecuta en orden, por etapas. Cada etapa deja `typecheck` y `test` en verde antes de
> pasar a la siguiente. Marca cada casilla al terminar. No cierres el feature hasta que TODO esté en verde.

## Etapa 1 — Funciones puras (sin efecto en producción)

- [x] Crear `utils/zona-horaria.util.ts`: mover `momentoLocal` desde `features/flow/flow.trigger.ts`, añadir `fechaLocal` y `localAUtc`. `flow.trigger.ts` importa desde utils (sus tests siguen en verde).
- [x] Crear `features/send-window/send-window.types.ts` (`CATEGORIAS_ENVIO`, `IFranja`, `IRegla`, `IExcepcion`, `ISendWindowConfig`, `ResultadoVentana`, DTOs, `CONFIG_DEFECTO`).
- [x] Crear `features/send-window/send-window.policy.ts` (`aMinutos`, `normalizarFranjas`, `validarSolapes`, `evaluarVentana`, `siguienteApertura`, `siguienteCierre`).
- [x] Crear `features/send-window/send-window.holidays.ts` (`festivosColombia`).

## Etapa 2 — Configuración (CRUD + UI), sin control activo

- [x] Crear `features/send-window/send-window.model.ts` (`tenantId` requerido, indexado y único; colección `send_window_configs`).
- [x] Crear `features/send-window/send-window.validation.ts` (`updateSendWindowSchema` con refines de formato, cruce de medianoche, solapes vía `validarSolapes`, límites; `holidaysPreviewSchema`).
- [x] Crear `features/send-window/send-window.service.ts` (`getSendWindowConfig`, `updateSendWindowConfig` con auditoría `send-window.update`, caché con TTL e invalidación por Redis, `consultarVentana`, `getSendWindowStatus`).
- [x] Crear `features/send-window/send-window.controller.ts` y `send-window.routes.ts` (cadena canónica, `authorize(['admin'])`).
- [x] Montar en `app.ts`: `app.use('/api/send-window', sendWindowRoutes)`.
- [x] Suscribir web y worker a `send-window:invalidate`.
- [x] Frontend (invocar antes `emil-design-eng`, `impeccable:impeccable`, `frontend-design:frontend-design`): `features/send-window/{api,types,lib,hooks}`, componentes `CategoriaReglaCard`, `FranjasSemanaEditor`, `ExcepcionesTable`, `ImportarFestivosDialog`, `EstadoActualStrip`, página `SendWindowPage`; ruta `/settings/send-hours` en `router.tsx` y entrada «Horarios de envío» en `nav-config.ts`. Revisar light y dark.

## Etapa 3 — Clasificación de envíos (solo tipos)

- [x] `message.types.ts`: `ContextoEnvio.categoria: CategoriaEnvio` obligatoria; `sendOutbound` sin default de `contexto`; `sendMessage` recibe la categoría.
- [x] Pasar la categoría en los 13 puntos del inventario del `spec.md` (conversación, media, voz, `/messages/send`, `/messages/template`, `replyFromIa`, flujo inbound vs resume vía `correrMotor`, recordatorio, campañas).
- [x] `typecheck` en verde = ningún punto sin clasificar.

## Etapa 4 — Encender el control

- [x] `AppError`: campo opcional `detalles` (o subclase `VentanaCerradaError`) y `errorHandler` lo serializa. *(Ya existía como `details` desde HU-CRM-01; se reutiliza.)*
- [x] `send-window.service.ts`: `assertVentanaEnvio` (423 con `siguienteApertura`) y `registrarRetencion` (log `send_window.retenido` + auditoría).
- [x] `message.service.ts`: llamar `assertVentanaEnvio` tras `assertWithinQuota`, antes de cualquier llamada a Meta.

## Etapa 5 — Comportamientos por categoría

- [x] `campaign.model.ts`/`campaign.types.ts`: `retenidaHasta: Date | null`; `realtime.types.ts`: `campaign:progress` con `retenidaHasta`.
- [x] `campaign-broadcast.processor.ts`: consultar ventana antes del lote → retener (re-encolar con delay, `retenidaHasta`, emitir, auditar en la transición); 423 a mitad de lote corta sin marcar `fallido`; limpiar `retenidaHasta` al reanudar.
- [x] `campaign.service.ts`: `scheduleCampaign` y `rescheduleCampaign` → 422 con `siguienteApertura` si `programadaPara` está fuera de franja.
- [x] `flow.runtime.service.ts`: `reanudarFlujo` consulta `flujo` y re-encola el `resume` con el mismo token antes de avanzar el motor.
- [x] `flow.reminder.service.ts`: consultar `recordatorio` antes del marcado de idempotencia; `catch` con `[422, 423, 429]`.
- [x] `ai-reply.processor.ts` e `inbound-message.processor.ts` (y el efecto de flujo reactivo): 423 → `registrarRetencion` + `marcarParaAsesor`, sin relanzar.

## Etapa 6 — Pantallas afectadas

- [x] `features/inbox/components/SendWindowBanner.tsx` + integración en `MessageComposer.tsx` (banner y envío deshabilitado; 423 inesperado → mismo mensaje) y en `SendTemplateDialog.tsx`.
- [x] Campañas: badge «Retenida por horario» en `CampaignStatusBadge`/`CampaignProgress`; aviso y «Usar siguiente apertura» en `CampaignScheduler` y `RescheduleDialog`.

## Tests (Vitest)

- [x] `zona-horaria.util.test.ts`: `localAUtc` en `America/Bogota`, en una zona con horario de verano (`America/New_York`) incluido el hueco del cambio, y `fechaLocal` cerca de medianoche.
- [x] `send-window.policy.test.ts`:
  - [x] `activo: false` y regla `libre` → permitido.
  - [x] franja lun–vie 08:00–19:00: dentro, en el borde (19:00 cerrado), sábado cerrado con apertura el lunes 08:00.
  - [x] franja vie 22:00–02:00: sábado 01:00 permitido, sábado 03:00 cerrado; vuelta sábado→domingo.
  - [x] `24:00` como fin; `desde = hasta` rechazado; solapes detectados (también contra una franja que cruza medianoche).
  - [x] excepción `cerrado` para todas y solo para `campana`; excepción con franjas especiales.
  - [x] sin apertura en 14 días → `null`.
- [x] `send-window.holidays.test.ts`: festivos de Colombia 2026 y 2027 contra el calendario oficial.
- [x] `send-window.routes.test.ts`: GET con defaults sin documento; PUT válido; 400 por zona, formato, solape y límites; auditoría `send-window.update`; `/status`; `/holidays/preview`; `tenantId` del body ignorado.
- [x] `send-window.isolation.test.ts`: la configuración de A no aparece ni se modifica desde B; con A cerrado y B libre, un envío de B sale y uno de A da 423; la caché no mezcla tenants.
- [x] `message.service.test.ts`: fuera de franja → 423, sin llamada a Meta y sin `incrementUsage`; dentro → envía.
- [x] `campaign-broadcast.processor.test.ts`: lote en hora cerrada → re-encolado con el `delay` correcto, sin `fallido`, `retenidaHasta` puesto y auditado una vez; reanudación lo limpia; cierre a mitad de lote.
- [x] `campaign.schedule.test.ts`: programar en hora cerrada → 422 con `siguienteApertura`.
- [x] `flow.runtime.service.test.ts`: `reanudarFlujo` cerrado → re-encola con el mismo token y no cambia `FlowState`.
- [x] `flow.reminder.test.ts`: cerrado → no envía ni marca `recordatorioEnviadoParaVentana`; barrido posterior dentro de franja → envía.
- [x] `ai-reply.processor.test.ts`: `ia` restringida y cerrada → no envía, marca para asesor, el job no falla.
- [x] Front: `SendWindowPage.test.tsx` (validación en línea, cruce de medianoche, copiar a todos los días, importar festivos), banner del composer con 423, aviso del programador de campañas.

## Verificación final

- [x] `pnpm --filter @sofiapp/api typecheck` sin errores.
- [x] `pnpm --filter @sofiapp/api test` en verde.
- [x] `pnpm --filter @sofiapp/web build && pnpm --filter @sofiapp/web lint` en verde.
- [ ] Verificación visual light/dark *(pendiente: requiere el entorno local con Mongo y Redis)* (capturas en `.playwright-mcp/`, borradas al terminar; `git status` sin `*.png`).
- [ ] Prueba manual con número de pruebas de Meta *(pendiente: la hace el equipo)* (campaña retenida y reanudada; banner del asesor).
- [x] Checklist de PR de `docs/multi-tenancy.md` §9 revisado.
- [x] `docs/data-model.md`, `docs/domain.md` y `docs/integrations/meta-whatsapp.md` actualizados; ADR «Ventanas horarias de envío» registrado.

## Definición de "hecho"

Cada empresa puede definir desde Configuración en qué horarios sale cada tipo de mensaje; todo envío
pasa por un único control en `sendOutbound`; campañas, flujos diferidos y recordatorios esperan a la
siguiente apertura, la IA se calla y escala, el asesor ve por qué no puede enviar, y cada retención
queda en logs y auditoría, todo aislado por tenant.
