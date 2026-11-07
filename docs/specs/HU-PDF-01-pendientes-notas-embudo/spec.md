# HU-PDF-01 — Pendientes desde notas y descarga en PDF desde el embudo (spec)

> **Spec-Driven Development.** Este es el QUÉ y el porqué. El CÓMO va en `plan.md`; la ejecución
> en `tasks.md`. Se apoya en las notas del contacto (HU-CRM-02) y en el embudo (HU-PIPE-01): el
> asesor marca una nota como **pendiente**, la ve en una columna «Pendientes» del embudo y puede
> descargar esos pendientes en PDF por rango de fechas.

**Estado:** implementado

## Objetivo

Que un asesor que trabaja desde la bandeja omnicanal pueda convertir una nota de la ficha de
contacto en un **compromiso visible**: al guardarla con el interruptor «Marcar como pendiente»
activo, la nota aparece en una columna **Pendientes** del embudo, en orden cronológico, con los
datos del lead. Desde esa columna —y solo desde ella— puede elegir un rango de fechas y descargar
un **Reporte de pendientes** en PDF para compartirlo o archivarlo.

## Contexto de dominio (importante)

- **El pendiente NO es una entidad nueva: es un atributo de la nota** (`contact_notes.pendiente`).
  Con eso RN2 (una nota ↔ un pendiente ↔ un contacto), RN3 (la descripción es la de la nota y se
  actualiza con ella) y RN4 (quitar el interruptor o borrar la nota lo saca del embudo) se cumplen
  **por construcción**: no hay una copia que sincronizar ni que se pueda desincronizar.

- **Las notas hoy solo se crean y se listan** (HU-CRM-02). RN3, RN4 y CA8 exigen editar el texto,
  activar/desactivar el pendiente y eliminar la nota. Esta historia añade `PATCH` y `DELETE` sobre
  las notas, con el mismo gate de acceso y auditoría sin el contenido.

- **La nota cuelga del contacto (`clienteId`), no del lead.** Un contacto tiene como mucho un lead
  (`Lead` es único por `{tenantId, telefono}`). Un pendiente de un contacto **sin convertir** se
  muestra igual, con los datos del contacto y la etapa **«Sin convertir»** (decisión de producto).

- **RN8 (acceso por rol) = el gate de las notas.** No existe cartera por asesor (AUTH-02): la nota
  es dato sensible entero y su acceso es `admin` + subrol de `SUBROLES_DATOS_SENSIBLES` (o sin
  subrol). La columna Pendientes y el PDF usan **exactamente** ese gate (ADR 0006). Quien no pueda
  leer notas no ve la columna ni puede pedir el PDF.

- **La columna Pendientes no es una etapa.** No vive en el catálogo `estados`, no recibe tarjetas
  arrastradas y sus tarjetas no se arrastran. Es una vista de seguimiento al lado del embudo.

- **Orden cronológico = más antiguo primero** (`createdAt` ascendente de la nota, RN5), en la
  columna y en el PDF: el compromiso más viejo es el primero que hay que atender.

## Alcance

### Incluye

1. **Interruptor en la nota nueva.** En `ContactNotesCard` (ficha de contacto, bandeja), un `Switch`
   «Marcar como pendiente», desactivado por defecto. Guardar con él activo crea la nota con
   `pendiente: true`; inactivo, la nota se guarda como hasta hoy.
2. **Edición y borrado de notas.** Cada nota permite: editar el texto, marcar/quitar pendiente y
   eliminar (con confirmación). Una nota pendiente lleva un distintivo «Pendiente».
3. **API de notas.** `POST /api/clientes/:clienteId/notas` acepta `pendiente`; nuevos
   `PATCH` y `DELETE /api/clientes/:clienteId/notas/:notaId`; las respuestas incluyen `pendiente`.
4. **API de pendientes.** `GET /api/pendientes` (paginado, más antiguo primero) y
   `GET /api/pendientes/pdf?desde&hasta&tz` (archivo PDF).
5. **Columna «Pendientes» en el embudo** (`PipelineBoard`), fija a la izquierda de las etapas, con
   contador, tarjetas y «Cargar más». Cada tarjeta: descripción, nombre, teléfono, correo, canal de
   origen, etapa actual (o «Sin convertir»), fecha y hora de creación, autor. Clic → abre la ficha
   de contacto en la bandeja (`/inbox?conversacion=<clienteId>&volverA=<embudo>`).
6. **Descarga en PDF** desde un control propio de la columna: fecha inicial + fecha final, botón
   «Descargar PDF» con validación, archivo `Pendientes_AAAA-MM-DD_a_AAAA-MM-DD.pdf`.
7. **Contenido del PDF.** Encabezado (nombre de la empresa, «Reporte de pendientes», rango
   consultado, fecha y hora de generación, usuario que lo generó); detalle por pendiente (fecha y
   hora, lead, teléfono, correo, canal, etapa, descripción, autor) en orden cronológico; pie con el
   total del rango y «Página X de Y».
8. **Docs:** `docs/data-model.md`, `docs/api-contract.md` y **ADR 0013** (PDF síncrono con pdfkit).

### Fuera de alcance

- Fecha de vencimiento, prioridad o responsable distinto del pendiente.
- Marcar pendientes como completados (hoy se «cierran» quitando el interruptor).
- Notificaciones o recordatorios automáticos.
- Exportar en formatos distintos a PDF.
- Actualización **en tiempo real** de la columna en la sesión de *otro* usuario (la propia sesión se
  refresca al mutar; las demás al reenfocar o recargar).
- Filtrar la columna con los filtros del embudo (asesor, semáforo, fechas de alta del lead): la
  columna lista **todos** los pendientes del tenant; el rango solo aplica al PDF.

## Criterios de aceptación

1. **CA1 — Crear pendiente.** `POST /notas` con `{ texto, pendiente: true }` → 201 con
   `pendiente: true`; la nota sale en `GET /notas` y en `GET /api/pendientes` con su descripción y
   los datos del lead. En UI, al guardar con el switch activo la nota aparece en la ficha y en la
   columna Pendientes sin recargar.
2. **CA2 — Nota sin pendiente.** Sin `pendiente` (o `false`) la nota se guarda con
   `pendiente: false` y **no** aparece en `GET /api/pendientes` ni en la columna. El switch arranca
   apagado y vuelve a apagado tras guardar.
3. **CA3 — Orden cronológico.** `GET /api/pendientes` devuelve los pendientes por `createdAt`
   ascendente (empates por `_id` ascendente); la columna respeta ese orden entre páginas.
4. **CA4 — PDF por rango.** `GET /api/pendientes/pdf` con `desde`/`hasta` válidos devuelve
   `200`, `Content-Type: application/pdf`, `Content-Disposition: attachment;
   filename="Pendientes_AAAA-MM-DD_a_AAAA-MM-DD.pdf"` (fechas en la zona `tz`), cuerpo que empieza
   por `%PDF`, con **solo** los pendientes cuyo `createdAt` cae en `[inicio del día desde, fin del
   día hasta]`, en orden cronológico, y con encabezado, detalle y pie definidos en Alcance §7.
5. **CA5 — Rango vacío.** Si el rango no tiene pendientes → `404` JSON
   `{ message: "No hay pendientes en el rango seleccionado." }`, sin archivo; la UI muestra ese
   mensaje y no descarga nada.
6. **CA6 — Validación de fechas.** En UI, «Descargar PDF» está deshabilitado si falta una fecha o
   la final es anterior a la inicial, con mensaje de validación visible. En API, `hasta < desde`,
   falta de alguna, `tz` inválida o rango > 366 días → `400` (RN7).
7. **CA7 — Restricción de la descarga.** El control «Descargar PDF» existe **solo** en la columna
   Pendientes; ninguna columna de etapa, cabecera del embudo ni la vista de tabla lo ofrece.
8. **CA8 — Editar / quitar / eliminar.** `PATCH` con `texto` → la columna y el PDF muestran la
   descripción nueva; `PATCH { pendiente: false }` o `DELETE` → el pendiente deja de aparecer.
   `PATCH` con body vacío → `400`.
9. **CA9 — Auditoría.** Crear, editar y eliminar notas registran `contact-note.create|update|delete`
   en `audit_events` con `clienteId` y `pendiente`, **nunca** con el texto.
10. **CA10 — Permisos (RN8).** Un `admin` con subrol fuera de `SUBROLES_DATOS_SENSIBLES` recibe
    `403` en `GET /api/pendientes`, `GET /api/pendientes/pdf`, `PATCH` y `DELETE` de notas; la UI no
    pinta la columna Pendientes (ni muestra error) cuando el listado responde 403.
11. **CA11 — Aislamiento multi-tenant.** Con dos tenants A y B: `GET /api/pendientes` y el PDF de A
    nunca incluyen notas, contactos, leads, etapas ni autores de B; `PATCH`/`DELETE` de A sobre una
    nota de B (o con `clienteId` de B) → `404` y la nota de B queda intacta. Todas las queries pasan
    por `base.repository` y el `tenantId` sale del token.
12. **CA12 — Calidad.** `pnpm --filter @sofiapp/api typecheck` y `test` en verde;
    `pnpm --filter @sofiapp/web build && lint` en verde; los componentes nuevos o tocados se ven
    correctos en **light y dark** con tokens semánticos.

## Dependencias

- **HU-CRM-02** — notas del contacto (`contact-note`), gate `authorizeSubrol`, ADR 0006.
- **HU-PIPE-01** — embudo (`PipelineBoard`, `pipeline` feature), catálogo `estados` (HU-CRM-03).
- **HU-CRM-03** — enlace profundo de la bandeja `?conversacion=&volverA=`.
- **INF-02** — `base.repository` (`findScoped`, `findOneAndUpdateScoped`, `findOneAndDeleteScoped`, …).
- Nueva dependencia de backend: **pdfkit** (+ `@types/pdfkit`). Ver ADR 0013.

---

## Ampliación A1 — Programación, cierre e historial (2026-11-03)

> Pedida por producto sobre la misma historia, antes de liberarla. **Sustituye** dos puntos de lo
> anterior: el orden cronológico ya no es por fecha de creación (RN5) sino por **fecha programada**,
> y «marcar pendientes como completados» deja de estar fuera de alcance.

### Qué se añade

1. **Programar el pendiente.** Con el interruptor activo, la nota permite elegir **fecha** y,
   opcionalmente, **hora**. Si no se elige fecha, el pendiente es **del día en que se crea** (en la
   zona horaria del usuario). Sin hora, es un pendiente «de todo el día».
2. **Reprogramar.** Al editar una nota pendiente se puede cambiar su fecha y su hora.
3. **Cerrar.** Desde la tarjeta del embudo, «Cerrar pendiente» lo marca como cumplido: sale de la
   lista de abiertos y queda **archivado** con fecha, hora y usuario que lo cerró.
4. **Historial.** La columna Pendientes tiene dos pestañas: **Abiertos** e **Historial** (cerrados,
   el más recién cerrado primero).
5. **Reabrir.** Desde el Historial, «Reabrir» lo devuelve a Abiertos con su programación intacta.
6. **PDF por fecha programada.** El rango del PDF filtra por **fecha programada**, no por creación,
   e incluye **abiertos y cerrados**, cada uno con su estado. Cada pendiente muestra su fecha y hora
   programadas (o «Todo el día»).
7. **Vencido.** Un pendiente abierto cuya fecha (y hora, si la tiene) ya pasó se señala «Vencido»
   en la tarjeta. Es solo visual: no notifica ni cambia su estado.

### Reglas de negocio nuevas

- **RN9:** la programación solo existe si la nota es pendiente. Quitar el interruptor borra la
  programación y el estado de cierre (RN4 sigue vigente: el pendiente desaparece del embudo).
- **RN10:** sin fecha elegida → fecha programada = día de creación en la zona del usuario. La hora es
  opcional y nunca se inventa.
- **RN11 (sustituye RN5):** los abiertos se ordenan por fecha programada, luego por hora (los «de
  todo el día» antes que los de hora concreta), luego por creación.
- **RN12:** solo un pendiente abierto se puede cerrar y solo uno cerrado se puede reabrir; lo
  contrario responde `409`.
- **RN13:** cerrar y reabrir quedan auditados (`contact-note.pendiente-cerrar|reabrir`), sin texto.
- **RN14:** el PDF filtra por fecha programada dentro de `[desde, hasta]` (días civiles, ambos
  incluidos) y trae abiertos y cerrados.

### Criterios de aceptación nuevos

13. **CA13 — Programar.** `POST /notas` con `{ pendiente: true, programadoDia, programadoHora }`
    guarda ambos; la tarjeta y la nota los muestran. Sin `programadoDia` se guarda el día actual en
    la `tz` enviada; sin `programadoHora` queda `null`. `programadoDia`/`programadoHora` sin
    `pendiente: true` → `400`.
14. **CA14 — Reprogramar.** `PATCH /notas/:id` con `programadoDia`/`programadoHora` (la hora admite
    `null` para quitarla) los cambia; en una nota no pendiente → `422`.
15. **CA15 — Orden.** `GET /api/pendientes?estado=abierto` respeta RN11.
16. **CA16 — Cerrar.** `POST /api/pendientes/:id/cerrar` → `200` con `estado: 'cerrado'`,
    `cerradoAt` y `cerradoPor`; desaparece de Abiertos y aparece en Historial. Cerrar uno ya
    cerrado → `409`. En UI, el botón «Cerrar pendiente» de la tarjeta lo hace y ofrece «Deshacer».
17. **CA17 — Historial y reabrir.** `GET /api/pendientes?estado=cerrado` lista los cerrados por
    `cerradoAt` descendente. `POST /api/pendientes/:id/reabrir` → `200` abierto, con la misma
    programación; reabrir uno abierto → `409`.
18. **CA18 — PDF.** El PDF de `[desde, hasta]` incluye los pendientes **programados** en ese rango,
    abiertos y cerrados, con «Programado: dd/mm/aaaa · hh:mm» (o «Todo el día»), el estado y, si está
    cerrado, quién y cuándo lo cerró; el pie dice el total y cuántos están abiertos y cerrados. Un
    pendiente creado en el rango pero programado fuera **no** aparece.
19. **CA19 — Aislamiento.** Cerrar o reabrir un pendiente de otro tenant → `404` y el documento ajeno
    no cambia; el historial de A no lista cerrados de B.
