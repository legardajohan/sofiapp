# HU-PDF-02 — Organizador inteligente de pendientes y notificaciones (spec)

> **Spec-Driven Development.** Este es el QUÉ y el porqué. El CÓMO va en `plan.md`; la ejecución
> en `tasks.md`. Se apoya en los pendientes programados de las notas del contacto (HU-PDF-01 + A1),
> en la campana (HU-NOTIF-01) y en las etiquetas (HU-OMNI-04): cada nota pendiente con fecha se
> convierte en un **recordatorio** que avisa dentro de la app y que solo desaparece cuando el
> usuario lo **cierra con motivo** o lo **pospone con justificación**.

**Estado:** creado

## Objetivo

Que el asesor no pierda ningún compromiso comercial: las notas pendientes que ya agenda desde la
bandeja omnicanal le avisan solas cuando llega su hora, el aviso persiste hasta que lo gestiona
(cerrar o posponer, ambos justificados) y una nueva sección **Organizador** le muestra todo lo
próximo, vencido, pospuesto y cerrado, con el historial completo de cada pendiente.

## Punto de partida: qué ya existe (verificado en el código)

| Pieza | Dónde vive hoy |
|---|---|
| Pendiente = atributo de la nota (`pendiente`, `programadoDia`, `programadoHora`, `estadoPendiente` `abierto\|cerrado`, `cerradoAt`, `cerradoPorId`) | `contact_notes` · `features/contact-note/` |
| Programar al crear/editar la nota (fecha + hora opcional, `tz` del navegador) | `createNota` / `updateNota` · `ContactNotesCard` + `ProgramacionPendiente` |
| Cierre rápido sin motivo / reabrir, transición condicional (409) | `POST /api/pendientes/:id/cerrar\|reabrir` · `PendienteCard` (toast «Deshacer») |
| «Vencido» solo visual, sin aviso (expresamente fuera de alcance de HU-PDF-01) | `estaVencido` en `lib/agenda.ts` |
| Campana con contador, en el pie del sidebar | `NotificationBell.tsx` en `SidebarUserBar` (HU-NOTIF-01) |
| Socket global por sesión | `useNotificationsRealtime` en `AppLayout` · `publishRealtime` (rooms `tenant:`/`asesor:`) |
| Etiquetas del contacto | `Cliente.tagIds` · `TagSelector` · `assertTagsDelTenant` |
| Barridos periódicos del worker | `upsertJobScheduler` en `worker.ts` (campañas, recordatorios de flujos) |
| Zona horaria de la empresa | `Tenant.zonaHoraria` |

## Contexto de dominio (importante)

- **El recordatorio NO es una entidad nueva: es la misma nota pendiente.** No se crea un sistema
  paralelo de notas (condición obligatoria de la historia): se añaden a `contact_notes` el
  **instante** del aviso en UTC y su control de idempotencia. Editar la fecha de la nota es, por
  construcción, reprogramar el recordatorio — no hay copia que sincronizar ni duplicar.
- **Pendiente sin hora (pendiente «de todo el día») → aviso a las 08:00** de ese día en la zona
  con que se agendó (decisión de producto D1). Una nota **no pendiente** sigue siendo una nota
  normal y nunca genera recordatorio.
- **Responsable = autor de la nota** (D2). Es quien recibe el aviso. No existe cartera por asesor
  (AUTH-02); el filtro «responsable» del Organizador filtra por autor.
- **Estados de la historia, derivados y no almacenados:**

  | Estado | Regla |
  |---|---|
  | PENDIENTE | abierto, instante del aviso en el futuro, nunca pospuesto |
  | VENCIDO | abierto y el instante del aviso ya llegó |
  | POSPUESTO | abierto, pospuesto al menos una vez, nuevo instante en el futuro |
  | CERRADO | cerrado (con su motivo) |

  Derivarlos garantiza que un pospuesto **vuelve a VENCIDO** por sí solo al llegar su nueva hora
  y que el estado nunca queda desfasado si el worker estuvo caído. `estadoPendiente` conserva su
  enum `abierto|cerrado`: HU-PDF-01 sigue leyendo exactamente lo mismo.
- **Historial = registro inmutable de eventos** por pendiente (programado, reprogramado, vencido,
  pospuesto, cerrado, reabierto), con fechas anteriores/nuevas, motivos, comentarios, etiquetas y
  usuario. Igual que la auditoría de HU-PDF-01, **nunca guarda el texto de la nota**.
- **El cierre exige motivo** también desde el embudo (D3): el botón «Cerrar pendiente» de la
  columna Pendientes abre el mismo modal. El endpoint de cierre rápido se conserva por
  compatibilidad, pero deja de usarse en la UI.
- **Motivos personalizados compartidos por empresa** (D4): «Crear nuevo motivo» lo añade al
  catálogo del tenant; «Otros motivos» exige un texto que queda solo en el evento.
- **La preferencia «Activar Organizador y recordatorios» es por usuario** y por defecto está
  **activada**. Solo controla la **presentación** de avisos: desactivarla no borra ni pausa nada;
  al reactivarla, los vencidos sin gestionar aparecen de inmediato.
- **Ubicación en el menú.** «Embudo» no es un ítem del menú (es la vista `?vista=embudo` de
  `/leads`); el ítem más cercano es **«Etapas del embudo»**, y «Organizador» va inmediatamente
  debajo de él (confirmado por producto).
- **Acceso (RN8 de HU-PDF-01):** el Organizador muestra el texto de las notas, así que usa
  **exactamente** el gate de notas: `admin` sin subrol o con subrol de `SUBROLES_DATOS_SENSIBLES`.
  Quien no puede leer notas no ve el ítem del menú ni recibe avisos.

## Alcance

### Incluye

**Backend**
1. Campos nuevos en `contact_notes`: instante del aviso (UTC), zona con que se agendó, marca de
   «ya notificado para este instante» y contador de aplazamientos. Se calculan al crear, editar,
   activar o reprogramar el pendiente; quitar el pendiente los limpia.
2. Colección `pendiente_eventos` (historial), colección `motivos_cierre` (catálogo del tenant) y
   colección `organizador_preferencias` (switch por usuario).
3. Feature `organizador` (`/api/organizador`): preferencias, listado con filtros, recordatorios
   activos del usuario, historial por pendiente y feed de actividad, cerrar con motivo, posponer,
   catálogo de motivos.
4. **Barrido en el worker cada minuto** que detecta los recordatorios que acaban de vencer, deja
   un único evento «vencido» y avisa en tiempo real al autor. Rellena también, de forma perezosa,
   el instante de los pendientes creados antes de esta historia.
5. Al cerrar o posponer, las etiquetas elegidas se **añaden** al contacto (no reemplazan las que ya
   tiene), con el mismo evento de tiempo real que hoy refresca la bandeja.
6. Los cierres/reaperturas de HU-PDF-01 escriben también su evento de historial.

**Frontend**
7. Ítem **Organizador** en el menú y página `/organizador`: switch, pestañas Próximos · Vencidos ·
   Pospuestos · Cerrados · Historial, filtros (fecha, estado, cliente, responsable), filas con
   cliente, nota, fecha y hora programada, estado y responsable; historial por pendiente; acceso
   directo a la conversación.
8. **Pila de recordatorios** persistente montada en el layout: visible en cualquier pantalla, sin
   cierre automático, sin cierre por clic fuera, sin botón de descartar; cada tarjeta con cliente,
   nota, hora, «Abrir conversación», **Cerrar pendiente** y **Posponer pendiente**. Puede
   **minimizarse** a una píldora con el contador (para no bloquear el CRM), nunca ocultarse.
9. **Campana** (la existente): su contador suma los recordatorios activos y su panel añade una
   sección «Recordatorios» con las mismas dos acciones.
10. Modal **Cerrar pendiente** (motivos en casillas, crear motivo, otros motivos con texto,
    etiquetas, comentario, «Confirmar cierre») y modal **Posponer pendiente** (motivo obligatorio,
    nueva fecha y hora obligatorias y futuras, etiquetas, «Confirmar aplazamiento»).
11. La tarjeta de la columna Pendientes del embudo abre el modal de cierre.

**Docs:** `docs/data-model.md`, `docs/api-contract.md`, `docs/domain.md` y **ADR 0016**
(recordatorios por barrido del worker + estado derivado).

### Fuera de alcance

- Notificaciones fuera de la app: push del navegador, correo, WhatsApp (lo dice la historia).
- Crear pendientes desde el Organizador (se crean desde la nota, como hoy).
- Editar o borrar motivos del catálogo (solo crear y usar); editar o borrar eventos del historial.
- Asignar un responsable distinto del autor.
- Avisos a usuarios distintos del autor de la nota.
- Recordatorios anticipados («avisar 15 min antes»), repeticiones periódicas.
- Cambiar el PDF de HU-PDF-01 (sigue igual; ya refleja la nueva fecha tras un aplazamiento porque
  lee `programadoDia`/`programadoHora`).
- Preferencia de zona horaria por usuario: se muestra en la zona del navegador, como el resto del
  CRM.

## Criterios de aceptación

1. **CA-01 — Menú.** El menú lateral muestra «Organizador» inmediatamente debajo de «Etapas del
   embudo», visible para quien puede leer notas y oculto para los subroles sin ese acceso; lleva a
   `/organizador`.
2. **CA-02 — Switch persistente.** `PUT /api/organizador/preferencias { activo }` guarda la
   preferencia del usuario del token; `GET` la devuelve (sin documento → `activo: true`). En UI, el
   switch «Activar Organizador y recordatorios» refleja el valor guardado tras recargar y tras
   cerrar e iniciar sesión. La preferencia de un usuario no afecta a otro del mismo tenant.
3. **CA-03 — Aviso al vencer.** Una nota pendiente con fecha y hora genera `recordatorioAt` (UTC)
   = día + hora en la `tz` enviada; sin hora, a las 08:00 de ese día. Cuando llega el instante, con
   el Organizador activado, el recordatorio aparece en `GET /api/organizador/activos` del autor, la
   pila lo muestra y el contador de la campana sube, sin recargar (evento de tiempo real) y, como
   máximo, en el siguiente refresco periódico (≤ 60 s) si el socket no está conectado.
4. **CA-04 — Persistencia.** Un recordatorio vencido sin gestionar sigue en `activos` hasta que se
   cierra o se pospone: recargar, cerrar el navegador, perder conexión o volver a iniciar sesión no
   lo resuelve, y vuelve a mostrarse al regresar. La pila no tiene temporizador de cierre, no se
   cierra al hacer clic fuera ni ofrece «descartar»; minimizarla conserva la píldora con el
   contador. Varios recordatorios simultáneos se listan y gestionan uno por uno.
5. **CA-05 — Motivo obligatorio al cerrar.** `POST /pendientes/:id/cerrar` sin ningún motivo
   (ni predefinido, ni del catálogo, ni «otros» con texto) → `400`. En UI, «Confirmar cierre» está
   deshabilitado hasta que hay un motivo válido. Se pueden marcar varios motivos. «Crear nuevo
   motivo» lo guarda en `motivos_cierre` del tenant (`POST /motivos-cierre`; nombre duplicado sin
   distinguir mayúsculas → `409`) y queda disponible para todos los usuarios de la empresa.
6. **CA-06 — Otros motivos.** Con «Otros motivos» marcado, el texto es obligatorio (3–500
   caracteres); al confirmar, el pendiente queda cerrado y el evento guarda ese texto como
   `otroMotivo`, sin añadirlo al catálogo.
7. **CA-07 — Efectos del cierre.** Confirmar el cierre deja la nota `estadoPendiente: 'cerrado'`
   con `cerradoAt` (instante real) y `cerradoPorId`; escribe un evento `cerrado` con motivos
   (snapshot de nombre), otro motivo, comentario, etiquetas y actor; el recordatorio sale de
   `activos`, de la pila y del contador de la campana en todas las pestañas del usuario. Un
   pendiente cerrado nunca vuelve a notificarse (salvo que se reabra explícitamente desde el
   historial de HU-PDF-01).
8. **CA-08 — Posponer exige motivo y fecha futura.** `POST /pendientes/:id/posponer` sin motivo
   (3–500), sin `nuevoDia`, sin `nuevaHora` o con un instante ≤ ahora → `400`. En UI,
   «Confirmar aplazamiento» está deshabilitado hasta que los tres son válidos, con mensaje visible.
   Las etiquetas son opcionales.
9. **CA-09 — Re-notificación.** Al posponer, la nota guarda el nuevo `programadoDia`/
   `programadoHora`/`recordatorioAt`, incrementa `vecesPospuesto`, limpia `notificadoPara` y
   escribe un evento `pospuesto` con las fechas anteriores y nuevas, el motivo y el actor; el
   recordatorio sale de `activos` y pasa a «Pospuestos». Al llegar la nueva hora vuelve a VENCIDO,
   reaparece con las dos acciones y el barrido escribe un nuevo evento `vencido`.
10. **CA-10 — Etiquetas.** Las etiquetas elegidas al cerrar o posponer se **añaden** a
    `Cliente.tagIds` (sin quitar las existentes ni duplicar) y se ven en la bandeja; una etiqueta
    de otro tenant → `422` (la validación `assertTagsDelTenant` de siempre) y no se aplica nada —
    ni el cierre ni el aplazamiento. Solo se usan etiquetas existentes (`TagSelector`
    existente); no se crea ningún módulo de etiquetas.
11. **CA-11 — Historial completo.** `GET /pendientes/:id/historial` lista, en orden cronológico,
    todos los eventos de un pendiente: tras posponerlo N veces muestra N eventos `pospuesto` con
    fecha/hora anterior y nueva, motivo y usuario, además de `programado`, cada `vencido` y el
    `cerrado`. La pestaña Historial del Organizador muestra el feed de actividad del tenant.
12. **CA-12 — Editar la nota no duplica.** Cambiar fecha u hora de una nota pendiente desde la
    bandeja recalcula `recordatorioAt`, limpia `notificadoPara` y escribe un evento `reprogramado`:
    sigue existiendo **un solo** recordatorio para esa nota. Quitar el pendiente o borrar la nota lo
    retira del Organizador y de `activos`. Una nota sin pendiente no genera recordatorio.
13. **CA-13 — Organizador desactivado.** Con `activo: false` la pila y la sección de la campana no
    se muestran y el contador de la campana no suma recordatorios; las notas, los recordatorios, el
    barrido y el historial siguen funcionando. Al reactivar, los vencidos sin gestionar aparecen de
    inmediato.
14. **CA-14 — Sin duplicados ni dobles transiciones.** Dos ejecuciones concurrentes del barrido
    producen **un único** evento `vencido` por instante; dos cierres/aplazamientos simultáneos del
    mismo pendiente (dos pestañas, doble clic) → el primero `200`, el segundo `409`, y la UI lo
    trata como «ya gestionado» y refresca. Cerrar/posponer exige `version` = `recordatorioAt`
    vigente; uno distinto (se reprogramó en otra pestaña) → `409`.
15. **CA-15 — Aislamiento multi-tenant y por usuario.** Con tenants A y B: listado, activos,
    historial, motivos y preferencias de A nunca incluyen datos de B; cerrar/posponer/ver historial
    de un pendiente de B desde A → `404` y el documento de B queda intacto; las etiquetas de B no
    se pueden aplicar desde A. Dentro de un tenant, `activos` y `preferencias` son solo del usuario
    del token. Todas las queries pasan por `base.repository` y el `tenantId` sale del token; el
    barrido solo lee `{_id, tenantId}` globalmente y opera con `*Scoped`. Tests de aislamiento en
    verde.
16. **CA-16 — Sin regresiones de HU-PDF-01.** Crear/editar/borrar notas, la columna Pendientes con
    Abiertos/Historial, reabrir y el PDF siguen funcionando; los tests existentes de
    `contact-note` y `pendiente` siguen en verde sin cambiar sus expectativas (salvo el botón de
    cierre de la tarjeta, que ahora abre el modal — D3). Las notas creadas antes de esta historia
    siguen leyéndose y reciben su `recordatorioAt` por el barrido.
17. **CA-17 — Calidad.** `pnpm --filter @sofiapp/api typecheck` y `test` en verde;
    `pnpm --filter @sofiapp/web build && lint && test` en verde; componentes nuevos o tocados
    correctos en **light y dark** con tokens semánticos, invocando antes `emil-design-eng`,
    `impeccable:impeccable` (si está instalada) y `frontend-design:frontend-design`.

## Dependencias

- **HU-PDF-01 (+A1)** — pendiente como atributo de la nota, programación, `transicionar`,
  `hidratarPendientes`, `pendiente.fechas.ts`, columna Pendientes, `ProgramacionPendiente`.
- **HU-CRM-02** — `contact-note`, gate `authorizeSubrol(SUBROLES_DATOS_SENSIBLES)`, ADR 0006.
- **HU-NOTIF-01** — campana (`NotificationBell`), socket global en `AppLayout`.
- **HU-OMNI-01** — gateway Socket.IO y puente Redis pub/sub (`publishRealtime`).
- **HU-OMNI-04** — etiquetas (`Tag`, `Cliente.tagIds`, `TagSelector`, `assertTagsDelTenant`).
- **HU-FLOW-02 / HU-MARK-03** — patrón de barrido con `upsertJobScheduler` en el worker.
- **INF-02** — repositorio `*Scoped`, `requireTenant`, `tenantId` del token.
- **DSN-03 / INF-03** — UI kit shadcn y tokens light/dark.
- Sin dependencias nuevas de npm ni servicios externos de pago.

---

## Ampliación A1 — Recordar 5 o 10 minutos antes (2026-11-10)

> Pedida por producto antes de liberar la historia. Se suma a lo anterior sin cambiarlo.

### Qué se añade

1. Al programar un pendiente desde la ficha del contacto (alta o edición), además de la fecha y la
   hora, una casilla **«Recordarme antes»**. Al activarla se elige **5 min** o **10 min** (arranca en
   5). Apagada, el aviso sale a la hora del pendiente, como hasta ahora.
2. Con anticipación, la notificación (pila y campana) aparece esos minutos **antes**. Mientras no
   llega la hora del pendiente, el aviso dice «Vence en N min» y el pendiente sigue en estado
   PENDIENTE; al llegar la hora pasa a VENCIDO como siempre.
3. Posponer conserva la anticipación que tenía la nota.

### Reglas

- **RN-A1:** la anticipación solo existe en un pendiente (`avisoAntesMin` ∈ {0, 5, 10}); sin
  `pendiente: true` → `400`.
- **RN-A2:** instante del aviso = instante del pendiente − anticipación. Cambiar solo la anticipación
  rearma el aviso en la misma nota, sin duplicarlo.

### Criterios de aceptación nuevos

18. **CA-18 — Anticipación.** `POST /notas` con `{ pendiente: true, programadoDia, programadoHora,
    avisoAntesMin: 10 }` guarda `avisoAt` = hora del pendiente − 10 min; `PATCH` con
    `avisoAntesMin` lo recalcula. El barrido avisa en `avisoAt` y `GET /organizador/activos` lo
    incluye desde ese instante, con estado `pendiente` hasta la hora del pendiente. Un valor distinto
    de 0, 5 o 10 → `400`. En UI, la casilla «Recordarme antes» con 5/10 min aparece al programar la
    nota y el aviso anticipado dice «Vence en N min».
