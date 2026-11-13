# HU-PDF-02 — Tasks (checklist ejecutable)

> Claude Code: ejecuta en orden. Marca cada casilla al terminar. No cierres el feature hasta que
> TODO esté en verde. Rama: `feat/HU-PDF-02` (sale de `develop`). Sin commit/push/PR sin
> autorización del usuario.

## Preparación

- [ ] Correr `pnpm --filter @sofiapp/api test` y `pnpm --filter @sofiapp/web test` **antes** de tocar
      nada y anotar el resultado (línea base de regresión de HU-PDF-01, CA-16).

## Implementación — backend

### Fechas y nota — CA-03, CA-12, CA-16
- [x] `pendiente/pendiente.fechas.ts`: `HORA_AVISO_TODO_EL_DIA`, `instanteEnZona`, `instanteRecordatorio` (puros).
- [x] `contact-note.types.ts`: `recordatorioAt`, `programadoTz`, `notificadoPara`, `vecesPospuesto` (opcionales). `INotaResponse` sin cambios.
- [x] `contact-note.model.ts`: los 4 campos + índices parciales `{tenantId, estadoPendiente, recordatorioAt, _id}` y `{tenantId, autorId, estadoPendiente, recordatorioAt}`.

### `organizador` (feature nuevo) — patrón de 6 archivos
- [x] `organizador.types.ts`: estados, `MOTIVOS_PREDEFINIDOS`, `TIPOS_EVENTO`, interfaces de modelo y DTO.
- [x] `organizador.model.ts`: `PendienteEvento` (`pendiente_eventos`, índices + único parcial de `vencido`), `MotivoCierre` (`motivos_cierre`, único con collation es), `OrganizadorPreferencia` (`organizador_preferencias`, único `{tenantId,userId}`).
- [x] `organizador.estado.ts`: `derivarEstado`, `filtroPorEstado` (puros).
- [x] `organizador.eventos.ts`: `registrarEvento` (E11000 de `vencido` → `false`).
- [x] `organizador.validation.ts`: list, activos, historial, actividad, cerrar (refine motivo), posponer, preferencias, crear motivo.
- [x] `organizador.service.ts`: `getPreferencia`/`setPreferencia`, `listOrganizador`, `listActivos`, `historialPendiente`, `listActividad`, `cerrarConMotivo`, `posponer`, `listMotivos`, `crearMotivo`; hidratación en lote; escrituras condicionales con `version`; 404/409; auditoría sin texto; `pendiente:updated`.
- [x] `organizador.controller.ts`: un controller por endpoint, sin `try/catch`.
- [x] `organizador.routes.ts`: los 10 endpoints con `authenticateJWT → requireTenant → authorize(['admin']) → authorizeSubrol(SUBROLES_DATOS_SENSIBLES) → validate → asyncHandler`.
- [x] Montar en `app.ts`: `app.use('/api/organizador', organizadorRoutes)`.

### Integraciones
- [x] `contact-note.service.ts`: calcular recordatorio en `createNota`/`updateNota`, reset de `notificadoPara` al reprogramar, limpieza con `pendiente:false`, eventos `programado`/`reprogramado` (CA-12).
- [x] `pendiente.service.ts`: `cerrarPendiente`/`reabrirPendiente` registran evento (`origen: 'rapido'`); reabrir limpia `notificadoPara`.
- [x] `conversation.service.ts`: `addTagsToCliente` (`assertTagsDelTenant` + `$addToSet` + `conversation:updated`, tope 20 → 422) (CA-10).
- [x] `realtime.types.ts` + `realtime.publisher.ts`: `pendiente:vencido` (room `asesor:`) y `pendiente:updated` (room `tenant:`).

### Barrido — CA-03, CA-04, CA-09, CA-14
- [x] `config/queues.ts`: `ORGANIZADOR_SWEEP_JOB`, `ORGANIZADOR_SWEEP_SCHEDULER_ID`. `config/env.ts`: `ORGANIZADOR_SWEEP_EVERY_MS` (+ `.env.example`).
- [x] `workers/organizador-sweep.processor.ts`: backfill de legado + vencidos con escritura condicional y evento `vencido`; solo `{_id, tenantId}` global, escrituras `*Scoped`.
- [x] `worker.ts`: despachar el job en el worker de `flow-runtime` y `upsertJobScheduler`.

### Docs
- [x] `docs/data-model.md`: campos nuevos de `contact_notes`, colecciones `pendiente_eventos`, `motivos_cierre`, `organizador_preferencias` con índices.
- [x] `docs/api-contract.md`: `/api/organizador/*` con 400/403/404/409/422.
- [x] `docs/domain.md`: estados PENDIENTE/VENCIDO/POSPUESTO/CERRADO y transiciones.
- [x] `docs/multi-tenancy.md`: el barrido del Organizador en la lista de barridos del worker.
- [x] `docs/adr/0016-recordatorios-por-barrido.md` + entrada en `docs/adr/README.md`.

## Implementación — frontend

- [x] **Invocar antes de escribir componentes** `emil-design-eng`, `impeccable:impeccable` (_no instalada en este entorno: no se pudo invocar_) y `frontend-design:frontend-design`; aplicar los criterios de `plan.md` §«Criterios de diseño».
- [x] `organizador/types.ts`, `api.ts`, `lib/motivos.ts`.
- [x] Hooks: preferencia, lista, activos (refetch 60 s/foco/reconexión), historial, actividad, motivos, cerrar, posponer (409 = «ya gestionado»), `useOrganizadorRealtime`.
- [x] `useNotas.ts` y `usePendientes.ts`: invalidar `['organizador']`.
- [x] `ProgramacionPendiente.tsx`: prop opcional `horaObligatoria` (comportamiento por defecto intacto).
- [x] Componentes: `OrganizadorSwitch`, `OrganizadorFilters`, `OrganizadorTable`, `EstadoPendienteBadge`, `HistorialPendienteSheet`, `ActividadFeed`, `CerrarPendienteDialog`, `PosponerPendienteDialog`, `RecordatorioCard`, `RecordatoriosStack`.
- [x] `pages/OrganizadorPage.tsx` con pestañas y filtros en URL.
- [x] `router.tsx`: `/organizador` (lazy, `RequireRole admin`). `nav-config.ts`: «Organizador» tras «Etapas del embudo», mismo gate de subrol (CA-01).
- [x] `AppLayout.tsx`: `<RecordatoriosStack />` + `useOrganizadorRealtime()`.
- [x] `NotificationBell.tsx`: contador sumado y sección «Recordatorios» (CA-03, CA-13).
- [x] `PendienteCard.tsx`: «Cerrar pendiente» abre `CerrarPendienteDialog` (D3).
- [ ] Revisar visualmente light y dark de página, pila, campana y ambos modales (capturas en `.playwright-mcp/`, borradas al terminar).

## Tests

### Backend (Vitest + mongodb-memory-server)
- [x] `pendiente.fechas` (ampliar test existente): `instanteEnZona` en `America/Bogota` y `Europe/Madrid` (cambio de horario); sin hora → 08:00.
- [x] `organizador.estado.test.ts`: las 4 derivaciones; pospuesto que vence vuelve a `vencido`; `filtroPorEstado` coherente con `derivarEstado`.
- [x] `contact-note.service.test.ts` (ampliar): nota pendiente con hora/sin hora genera `recordatorioAt`; nota normal no (CA-03); reprogramar recalcula, limpia `notificadoPara` y deja **un** documento + evento `reprogramado` (CA-12); `pendiente:false` limpia campos.
- [x] `organizador.service.test.ts`:
  - [x] preferencia por defecto `true`, persistente y por usuario (CA-02).
  - [x] `activos` solo vencidos abiertos del autor; desaparece al cerrar/posponer (CA-03, CA-04, CA-07).
  - [x] cerrar sin motivo → 400; con «otros» guarda `otroMotivo` y no toca el catálogo (CA-05, CA-06); cierre registra `cerradoAt`, `cerradoPorId`, evento con snapshot (CA-07).
  - [x] crear motivo y reutilizarlo; duplicado sin mayúsculas → 409 (CA-05).
  - [x] posponer: motivo/fecha/hora obligatorios, pasado → 400; guarda antes/después, `vecesPospuesto++`, estado `pospuesto`; al pasar la hora → `vencido` (CA-08, CA-09).
  - [x] etiquetas se añaden sin borrar ni duplicar; etiqueta de otro tenant → 404 sin efectos (CA-10).
  - [x] historial tras 2 aplazamientos y cierre: todos los eventos en orden (CA-11).
  - [x] doble cierre / doble aplazamiento / `version` vieja → segundo 409 (CA-14).
- [x] `organizador-sweep.processor.test.ts`: avisa una vez por instante; dos ejecuciones concurrentes (`Promise.all`) → un solo evento `vencido` (CA-14); tras posponer y vencer, nuevo evento (CA-09); cerrado no se re-avisa (CA-07); backfill de nota legada con zona del tenant (CA-16).
- [x] `organizador.routes.test.ts`: 403 con subrol no autorizado en todos los endpoints; 400 de validación; 200/201 felices.
- [x] `organizador.isolation.test.ts` **(aislamiento)**: listado, activos, historial, actividad, motivos y preferencias de A sin datos de B; cerrar/posponer/historial de nota de B desde A → 404 y la nota de B intacta; tags de B rechazadas; `activos`/`preferencias` de otro usuario del mismo tenant invisibles (CA-15).
- [x] Regresión: tests existentes de `contact-note` y `pendiente` en verde sin cambiar expectativas (CA-16).

### Frontend (Vitest + Testing Library)
- [x] `nav-config` / sidebar: «Organizador» justo después de «Etapas del embudo» y oculto para subrol sin acceso (CA-01).
- [x] `OrganizadorSwitch.test.tsx`: refleja la preferencia y llama a `setPreferencia` (CA-02).
- [x] `RecordatoriosStack.test.tsx`: muestra varios; sin botón de descartar; clic fuera y Esc no lo ocultan; minimizar deja la píldora con el contador; no se muestra con `activo:false` (CA-04, CA-13).
- [x] `CerrarPendienteDialog.test.tsx`: confirmar deshabilitado sin motivo; «Otros» exige texto; crear motivo lo añade y marca; envía etiquetas (CA-05, CA-06, CA-10).
- [x] `PosponerPendienteDialog.test.tsx`: exige motivo, fecha y hora futura con mensaje visible (CA-08).
- [x] `NotificationBell` (ampliar): el contador suma recordatorios activos y la sección aparece; sin ellos con organizador apagado (CA-03, CA-13).
- [x] `PendientesColumn.test.tsx` (ajustar): «Cerrar pendiente» abre el modal (D3); resto intacto (CA-16).

## Verificación final

- [x] `pnpm --filter @sofiapp/api typecheck` sin errores.
- [ ] `pnpm --filter @sofiapp/api test` en verde (incluye `organizador.isolation.test.ts` y los de HU-PDF-01). _Suites del feature + HU-PDF-01 ✅ (94); la suite completa se cortó por falta de memoria._
- [ ] `pnpm --filter @sofiapp/web build && pnpm --filter @sofiapp/web lint` en verde; `pnpm --filter @sofiapp/web test` en verde. _Lint completo ✅ y tests de organizador/pipeline/contacts ✅ (126); falta la suite completa y el build (enlace local de `@sofiapp/shared` sin instalar)._
- [x] Checklist de PR de `docs/multi-tenancy.md` §9: cero `Model.find/create/findById` directos fuera de las dos lecturas `{_id, tenantId}` del barrido; `tenantId` solo de `req.user!.tenantId`; índices nuevos empiezan por `tenantId`.
- [ ] Prueba manual de `plan.md` §Verificación completada (worker corriendo).
- [x] `git status` sin capturas `*.png`/`*.jpg` sueltas.
- [ ] `spec.md` → `**Estado:** implementado`.

## Definición de "hecho"

El Organizador está en el menú; el switch se guarda por usuario; toda nota pendiente programada
produce un único recordatorio que avisa en la pila y en la campana al vencer, persiste tras recargas
y sesiones hasta cerrarlo (con motivo, catálogo reutilizable u «otros») o posponerlo (con
justificación y fecha futura), ambos con etiquetas opcionales aplicadas al contacto; el historial de
cada pendiente es completo; no hay avisos ni transiciones duplicadas; todo está aislado por tenant y
por usuario; y HU-PDF-01 funciona igual que antes.

## Ampliación A1 — Recordar 5 o 10 minutos antes (CA-18)

- [x] Backend: `avisoAntesMin` + `avisoAt` en `contact_notes`, índices, Zod, cálculo en alta/edición/posponer.
- [x] Backend: `filtroAvisoDisparado` en `listActivos`; barrido por `avisoAt` + `rellenarAvisos`.
- [x] Frontend: casilla «Recordarme antes» (5/10 min) en `ProgramacionPendiente`, cableada en `ContactNotesCard` y `NotaItem`.
- [x] Frontend: «Vence en N min» en `RecordatorioCard`; evento `vencido` rotulado «Aviso enviado».
- [x] Tests backend: anticipación al crear, editar y posponer; barrido avisa antes de la hora sin marcar vencido.
- [x] Tests frontend: la casilla devuelve 0/5/10; el aviso anticipado dice «Vence en…».
