# HU-PDF-01 — Tasks (checklist ejecutable)

> Claude Code: ejecuta en orden. Marca cada casilla al terminar. No cierres el feature hasta que
> TODO esté en verde. Rama: `feat/HU-PDF-01` (sale de `develop`).

## Implementación — backend

### Dependencia
- [x] `pnpm --filter @sofiapp/api add pdfkit` y `pnpm --filter @sofiapp/api add -D @types/pdfkit`.

### `contact-note` (notas editables + pendiente) — CA1, CA2, CA8, CA9
- [x] `contact-note.types.ts`: `pendiente: boolean` en `IContactNote`; `pendiente` y `updatedAt` en `INotaResponse`; `updatedAt` en `IContactNoteLean`.
- [x] `contact-note.model.ts`: `pendiente: { type: Boolean, default: false }` + índice parcial `{ tenantId:1, createdAt:1, _id:1 }` con `partialFilterExpression: { pendiente: true }`.
- [x] `contact-note.validation.ts`: `pendiente` (default `false`) en `createNotaSchema`; `updateNotaSchema` con refine «al menos uno»; `deleteNotaSchema`; tipos `UpdateNotaBody`.
- [x] `contact-note.service.ts`: `createNota(…, pendiente)`; `updateNota` con `findOneAndUpdateScoped` filtrando `{ _id, clienteId }`; `deleteNota` con `findOneAndDeleteScoped`; 404 si `null`; auditoría `contact-note.update|delete` sin texto; `toNotaResponse` con `pendiente ?? false`.
- [x] `contact-note.controller.ts`: `updateNotaController` (200) y `deleteNotaController` (204), sin `try/catch`.
- [x] `contact-note.routes.ts`: `PATCH /:notaId` y `DELETE /:notaId` con `notasRoles`.

### `pendiente` (feature nuevo) — CA1, CA3–CA6, CA10, CA11
- [x] `pendiente.types.ts`: constantes de límites, `IPendienteResponse`, `IPendienteLeadResponse`, `IReportePendientes`.
- [x] `pendiente.validation.ts`: `listPendientesSchema`; `pdfPendientesSchema` (`desde`/`hasta` `YYYY-MM-DD`, `tz` IANA con default, refine RN7 y ≤ 366 días).
- [x] `pendiente.service.ts`: `rangoDiasAInstantes` (puro), `hidratarPendientes` en lote (Cliente, Lead, `listEstados`, `findUsersByIds`; sin lead → `etapa: null`), `listPendientes` (sort `createdAt:1, _id:1`), `listPendientesEnRango`, `generarPdfPendientes` (count 0 → 404, > máximo → 422, nombre de empresa del tenant del token, `filename`).
- [x] `pendiente.pdf.ts`: `renderReportePendientes` con pdfkit — encabezado, bloques por pendiente, total, «Página X de Y» con `bufferPages`.
- [x] `pendiente.controller.ts`: `listPendientesController` (JSON) y `pdfPendientesController` (headers + `pipe`).
- [x] `pendiente.routes.ts`: `GET /` y `GET /pdf` con `authenticateJWT → requireTenant → authorize(['admin']) → authorizeSubrol(SUBROLES_DATOS_SENSIBLES) → validate → asyncHandler`.
- [x] Montar en `app.ts`: `app.use('/api/pendientes', pendienteRoutes)`.

### Docs
- [x] `docs/data-model.md`: campo `contact_notes.pendiente` + índice parcial.
- [x] `docs/api-contract.md`: `PATCH`/`DELETE` de notas, `GET /api/pendientes`, `GET /api/pendientes/pdf` (400/403/404/422).
- [x] `docs/adr/0013-pdf-pendientes-sincrono-pdfkit.md` + entrada en `docs/adr/README.md`.

## Implementación — frontend

- [x] **Invocar antes de escribir componentes** `emil-design-eng`, `impeccable:impeccable` (_no instalada en este entorno: no se pudo invocar_) y `frontend-design:frontend-design`; aplicar los criterios de `plan.md` §«Criterios de diseño».
- [x] `contacts/types.ts` y `contacts/api.ts`: `pendiente`, `updatedAt`; `createNota(clienteId, texto, pendiente)`, `updateNota`, `deleteNota`.
- [x] `contacts/hooks/useNotas.ts`: `useUpdateNota`, `useDeleteNota`; todas las mutaciones invalidan `['contact-notas', clienteId]` y `['pendientes']`.
- [x] `contacts/components/NotaItem.tsx`: lectura, `Badge` «Pendiente», `DropdownMenu` (Editar / Marcar–Quitar pendiente / Eliminar), edición inline, `AlertDialog` de borrado.
- [x] `contacts/components/ContactNotesCard.tsx`: `Switch` «Marcar como pendiente» apagado por defecto y reseteado tras guardar; lista con `NotaItem`.
- [x] `pipeline/types.ts` y `pipeline/api.ts`: `PendienteDTO`, `fetchPendientes`, `downloadPendientesPdf` (blob + parseo de error JSON).
- [x] `pipeline/lib/rango-pdf.ts`: `rangoValido(desde, hasta)`, `aDiaCivil(date)`, `nombreArchivoPendientes(desde, hasta)`.
- [x] `pipeline/hooks/usePendientes.ts` (`useInfiniteQuery`, sin reintentar 403) y `useDescargarPendientesPdf.ts`.
- [x] `pipeline/components/PendienteCard.tsx`: campos de la tarjeta, `button` accesible, navegación a `/inbox?conversacion=…&volverA=…`.
- [x] `pipeline/components/PendientesPdfPopover.tsx`: `Popover` + `Calendar` rango, validación visible, botón deshabilitado, spinner, toasts.
- [x] `pipeline/components/PendientesColumn.tsx`: cabecera + contador + PDF, skeleton/error/vacío/«Cargar más», `null` si 403, no droppable.
- [x] `pipeline/components/PipelineBoard.tsx`: renderizar `<PendientesColumn />` como primera columna del contenedor con scroll horizontal.
- [ ] Revisar visualmente light y dark de `ContactNotesCard`, `PendientesColumn`, `PendienteCard` y el popover. _Solo tokens semánticos + `tagColors` por tema; falta la revisión en navegador._

## Tests

### Backend (Vitest + mongodb-memory-server)
- [x] `contact-note.isolation.test.ts` **(aislamiento)**: `PATCH`/`DELETE` de tenant A sobre nota de B → 404 y la nota de B intacta; `PATCH` con `clienteId` de A y `notaId` de otro contacto → 404.
- [x] `contact-note.service.test.ts`: crear con/sin pendiente (CA1/CA2); editar texto actualiza la respuesta (CA8); `pendiente:false` y borrado (CA8); auditoría sin texto (CA9); notas antiguas sin campo → `pendiente: false`.
- [x] `pendiente.isolation.test.ts` **(aislamiento)**: listado y PDF de A sin rastro de notas/contactos/leads/etapas/autores de B (CA11).
- [x] `pendiente.service.test.ts`: orden ascendente con empates (CA3); contacto sin lead → `etapa: null` (decisión de producto); etapa resuelta con label/color; rango por días civiles en `tz` incluye bordes (CA4); rango vacío → 404 (CA5); > máximo → 422.
- [x] `pendiente.pdf.test.ts`: el buffer empieza por `%PDF`; contiene «Reporte de pendientes», el total y «Página 1 de N» (texto extraído o inspección del stream sin comprimir).
- [x] `pendiente.routes.test.ts`: 403 con subrol no autorizado en ambos GET y en `PATCH`/`DELETE` de notas (CA10); 400 con `hasta < desde`, fecha faltante, `tz` inválida, rango > 366 días (CA6); 200 con headers `application/pdf` y `filename="Pendientes_AAAA-MM-DD_a_AAAA-MM-DD.pdf"` (CA4); `PATCH` con body vacío → 400 (CA8).

### Frontend (Vitest + Testing Library)
- [x] `ContactNotesCard.test.tsx`: switch apagado por defecto; enviar con switch activo manda `pendiente: true`; se resetea tras guardar; distintivo «Pendiente»; editar y eliminar llaman a la API.
- [x] `PendientesPdfPopover.test.tsx`: botón deshabilitado sin fechas o con fin < inicio y mensaje visible (CA6); 404 muestra «No hay pendientes en el rango seleccionado» y no descarga (CA5).
- [x] `PendientesColumn.test.tsx`: respeta el orden recibido (CA3); clic en tarjeta navega a la bandeja; 403 → no se renderiza (CA10); «Sin convertir» cuando `etapa` es `null`.
- [x] Test de `PipelineBoard`/`PipelineColumn`: ninguna columna de etapa expone «Descargar PDF» (CA7).

## Verificación final

- [x] `pnpm --filter @sofiapp/api typecheck` sin errores.
- [x] `pnpm --filter @sofiapp/api test` en verde (incluye los dos tests de aislamiento).
- [x] `pnpm --filter @sofiapp/web build && pnpm --filter @sofiapp/web lint` en verde; `pnpm --filter @sofiapp/web test` en verde.
- [x] Checklist de PR de `docs/multi-tenancy.md` §9 revisado: cero `Model.find/create/findById` directos; `tenantId` solo de `req.user!.tenantId`; índices nuevos empiezan por `tenantId`.
- [ ] Prueba manual end-to-end (bandeja → embudo → PDF) en light y dark; capturas en `.playwright-mcp/` y borradas después; `git status` sin `*.png`/`*.jpg` sueltos. _Pendiente: requiere levantar la app con `.env` y datos reales; no se hizo en esta sesión._

## Definición de "hecho"

Un asesor con acceso a notas marca una nota como pendiente desde la ficha del contacto, la ve en la
columna «Pendientes» del embudo en orden cronológico con los datos del lead, abre la ficha desde la
tarjeta, edita o retira el pendiente desde la nota, y descarga un PDF por rango de fechas con
encabezado, detalle y pie definidos — sin que ningún dato cruce entre tenants y con typecheck,
tests, build y lint en verde. `spec.md` pasa a `**Estado:** implementado`.

## Ampliación A1 — Programación, cierre e historial

### Backend
- [x] `contact-note.types.ts` / `.model.ts`: `programadoDia`, `programadoHora`, `estadoPendiente`, `cerradoAt`, `cerradoPorId`; índices parciales de agenda e historial.
- [x] `contact-note.validation.ts`: día, hora y `tz` en create/update; programar sin pendiente → 400.
- [x] `contact-note.service.ts`: `createNota(…, opciones)`, reglas RN9/RN10 en `cambiosDePendiente`, 422 al reprogramar una nota normal.
- [x] `pendiente.fechas.ts`: `diaEnZona`.
- [x] `pendiente.validation.ts`: `?estado=`, `transicionPendienteSchema`.
- [x] `pendiente.service.ts`: orden de agenda, historial, `cerrarPendiente` / `reabrirPendiente` con condición en el filtro, PDF por `programadoDia` con abiertos y cerrados.
- [x] `pendiente.pdf.ts`: línea de agenda, estado y desglose en el pie.
- [x] `pendiente.controller.ts` / `.routes.ts`: `POST /:id/cerrar`, `POST /:id/reabrir`.
- [x] `audit.types.ts`: `contact-note.pendiente-cerrar|reabrir`.

### Frontend
- [x] `src/lib/agenda.ts` + tests.
- [x] `ProgramacionPendiente.tsx`; `ContactNotesCard` y `NotaItem` con programación, vencido y cerrado.
- [x] `pipeline/api.ts` + `usePendientes.ts`: estado, cerrar (con «Deshacer»), reabrir.
- [x] `PendienteCard` (variantes abierta/cerrada) y `PendientesColumn` con pestañas.

### Tests
- [x] Backend: orden de agenda (CA15), cerrar/historial/reabrir y 409 (CA16, CA17), PDF por día programado con abiertos y cerrados (CA18), aislamiento de cerrar/reabrir/historial (CA19), programar/reprogramar y RN9/RN10 (CA13, CA14), rutas.
- [x] Frontend: programación en el alta y la edición, vencido, cerrar sin abrir la ficha, historial perezoso y reabrir.
- [ ] Revisión visual en navegador, light y dark (pendiente, igual que en la entrega anterior).
