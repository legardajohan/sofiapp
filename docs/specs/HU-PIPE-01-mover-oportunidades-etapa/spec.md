# HU-PIPE-01 — Mover oportunidades por etapa (spec)

> **Spec-Driven Development.** Este es el QUÉ y el porqué. El CÓMO va en `plan.md`; la ejecución
> en `tasks.md`. Cierra el eje de la etapa comercial: HU-CRM-03 convirtió las etapas en un catálogo
> del tenant y dejó cambiarlas de una en una desde el panel de detalle; esta historia es la que por
> fin las **muestra como un embudo** y deja moverlas con el gesto que el trabajo pide.

**Estado:** creado

## Objetivo

Permitir que un **Administrador** vea sus oportunidades **agrupadas por etapa** en un tablero y
mueva una oportunidad de una etapa a otra **arrastrándola**, con el cambio persistido, validado,
registrado en un historial consultable y reflejado **en vivo** en el tablero de cualquier otro
administrador de la misma empresa.

Además, que el catálogo de fábrica incluya una etapa de salida explícita: **Declinado**.

## Contexto de dominio (importante)

Cinco cosas que hay que tener presentes antes de leer los criterios:

- **Las etapas configurables por tenant YA existen y NO se rehacen.** HU-CRM-03 entregó la
  colección `estados` (`key` estable, `label`, `color`, `orden`, `activo`, `esDefecto`), sus
  índices `{tenantId,key}` único y `{tenantId,orden}`, y `GET`/`POST /api/estados`. La tarea del
  backlog «etapas configurables del pipeline por tenant» está cumplida desde entonces. Esta
  historia **añade** a ese catálogo la noción de **etapa de salida** (`esSalida`), y nada más.

- **El endpoint de cambio de etapa YA existe, con otro nombre.** `PATCH /api/leads/:id` con
  `{ estado }` mueve el lead vía `updateLeadEstado()`, valida la clave contra el catálogo del
  tenant, es idempotente y audita el cambio. La historia pide `PATCH /leads/:id/stage`: se estrena
  esa ruta —más explícita, y consistente con el `/status` de la semaforización— **sobre el mismo
  service**, y la vieja **sigue funcionando**. Lo que sí es nuevo es rechazar el movimiento hacia
  una etapa archivada, publicar el evento de tiempo real y auditar con acción propia.

- **Etapa y semáforo son dos ejes distintos.** La **etapa** (`Lead.estado` ← catálogo `estados`)
  dice en qué punto del proceso está la oportunidad; el **semáforo** dice cómo de caliente es. Este
  tablero se ordena **por etapa**, nunca por semáforo. Ver `docs/domain.md` §5.

- **El historial no estrena colección.** Se apoya en `audit_events`, que ya registra `lead.create`,
  `lead.update` y `lead.delete`. Los cambios de etapa pasan a registrarse con acción propia
  (`lead.estado`) para que el historial sea consultable sin que se le cuelen las altas y las bajas.

- **El tiempo real ya está construido.** El gateway Socket.IO con rooms `tenant:<id>` y el puente
  Redis pub/sub (`publishRealtime` / `subscribeRealtime`, ADR 0004) están operativos desde
  HU-OMNI-02. Esta historia solo añade un evento a la unión existente; no monta infraestructura.

## Nota de producto: esta historia revierte una decisión documentada

`docs/product.md` §5 dice **«Sin tablero Kanban / sin drag&drop»** y lista el Kanban entre los
módulos eliminados; `apps/frontend/CLAUDE.md` lo repite («NO tablero Kanban, NO drag&drop»), y
`README.md` y `docs/data-model.md` se apoyan en ello. Aquellas exclusiones eran del M02 original,
cuando la gestión por estados se eligió como **sustituto** del tablero para no comprometer el MVP.

HU-PIPE-01 **revierte esa decisión de forma explícita**. La reversión no es implícita ni queda solo
en el código: se registra en **ADR 0007** y se corrige en los documentos que la afirman. Sin eso, el
repositorio diría dos cosas contradictorias y la siguiente sesión leería «Kanban descartado»
mientras el tablero está en producción.

Lo que **no** cambia es el sustrato: el tablero se dibuja sobre el catálogo `estados` y
`Lead.estado` que ya existen. No se introduce un pipeline paralelo.

## Alcance

Incluye:

- **Backend**
  - `Estado.esSalida`: marca de etapa terminal, expuesta en `GET /api/estados` y en el pipeline.
  - Etapa `declinado` en la semilla de fábrica + **backfill dirigido** a los tenants ya sembrados.
  - Feature `pipeline` (slice de lectura, sin colección propia): `GET /api/pipeline`.
  - `PATCH /api/leads/:id/stage` sobre el service existente, con rechazo de etapa archivada.
  - `GET /api/leads/:id/historial-etapa`.
  - Acción de auditoría `lead.estado` y filtro por acción en `listAuditEvents`.
  - Evento de tiempo real `lead:stage-changed` al room del tenant.
- **Frontend**
  - Tablero kanban con arrastre entre columnas (`@dnd-kit`), operable también por teclado.
  - Toggle `Tabla | Embudo` en `/leads`, persistido en la URL.
  - Actualización optimista con rollback, y refresco en vivo por socket.
- **Documentación**
  - ADR 0007 + corrección de `product.md`, `data-model.md`, `domain.md`, `api-contract.md`,
    `README.md`, `apps/frontend/CLAUDE.md` y las notas de supersesión en HU-CRM-01 / HU-CRM-03.

Fuera de alcance (otros features / fases):

- **Reordenar leads dentro de una columna.** Las tarjetas se ordenan por `createdAt: -1`, como la
  tabla. Una prioridad manual dentro de la etapa es otro dato y otra historia.
- **Reordenar o crear etapas arrastrando la columna.** El `orden` existe y se respeta, pero se
  edita desde el catálogo, no desde el tablero.
- **Mover en lote** una selección de tarjetas.
- **Máquina de transiciones dirigida.** Entre etapas activas el movimiento es libre por decisión
  explícita (ver criterio 4): el `orden` del catálogo es una narrativa, no un grafo de permisos, y
  cada empresa lo define a su gusto.
- **Métricas de conversión por etapa** (tiempo en etapa, tasa de avance) → `CRM-05`.
- **Clasificación automática de etapa por IA** → `IA-05`.
- **Scroll infinito por columna.** Cada columna trae su primera página y su `total`; paginar dentro
  de la columna queda para cuando exista una empresa con leads suficientes para necesitarlo.

## Criterios de aceptación

1. `GET /api/pipeline` devuelve las etapas **activas** del tenant del token en orden de pipeline
   (`orden: 1`), cada una con su `total` y su primera página de leads. Las archivadas no aparecen.
   Una etapa **sin leads aparece igual**, con `total: 0` y sin tarjetas: una columna vacía es
   información —«nadie está en pago pendiente»—, no un hueco que convenga esconder.
2. `GET /api/pipeline` acepta los mismos filtros que el listado (`asesor`, `semaforo`, `desde`,
   `hasta`) y un `?limit=` por columna (default 20, máximo 50). **No** acepta `estado`: agrupar por
   etapa y filtrar por una sola etapa se contradicen, y admitirlo devolvería un tablero de una
   columna que ya sabe dibujar la tabla. Una clave desconocida en un filtro → **columnas vacías**,
   no `400` (mismo criterio que `GET /api/leads`).
3. `PATCH /api/leads/:id/stage` con `{ estado: <key> }` mueve el lead **del tenant del token** y
   devuelve el lead actualizado. El body es `.strict()`: una llave de más → `400`. Un lead de otro
   tenant → `404`, **nunca** `403`: un `403` confirmaría que el lead existe en otra empresa.
4. Mover a una etapa **archivada** (`activo: false`) o a una `key` que no está en el catálogo del
   tenant → `400` **sin escribir**. Entre etapas **activas** la transición es **libre**, incluido
   retroceder: corregir un arrastre equivocado es una necesidad real, y bloquearlo obligaría a
   editar la base de datos a mano.
5. Reenviar la etapa que el lead ya tiene es **idempotente**: `200`, sin escritura y **sin** entrada
   de historial. Es exactamente el caso de soltar una tarjeta en la columna de la que salió.
6. Cada cambio efectivo registra un `AuditEvent` con acción **`lead.estado`**, con el valor
   anterior y el nuevo. Un fallo del registro **no** le cuesta el cambio al usuario.
7. `GET /api/leads/:id/historial-etapa` devuelve los cambios paginados
   (`{ data, page, limit, total }`), **más reciente primero**, con el actor resuelto a
   `{ id, nombre }` y `de`/`a` como `key`. Devuelve **solo** eventos de etapa: no cuela
   `lead.create` ni `lead.delete`, y el `total` corresponde con las filas —filtrar después de
   paginar rompería el conteo—. Lead de otro tenant → `404`.
8. Existe la etapa **`declinado`** (`label` «Declinado») en **todo** tenant: sembrada al crear el
   tenant y añadida a los ya existentes por un **backfill dirigido**, porque los tenants anteriores
   llevan `estadosSeeded: true` y la siembra general ya no vuelve a pasar por ellos. La operación es
   **idempotente** y **no pisa** el renombrado ni el recoloreado que el administrador le haya hecho.
9. `Estado.esSalida` distingue las etapas terminales. `perdido` y `declinado` nacen con
   `esSalida: true`; el resto con `false`. El campo sale en `GET /api/estados` y en
   `GET /api/pipeline`. Es **descriptivo**, no restrictivo: marca el final del recorrido para que la
   UI lo señale, sin bloquear ninguna transición (ver criterio 4).
10. `PATCH /api/leads/:id` (la ruta de HU-CRM-03) **sigue funcionando** con la misma semántica: las
    dos rutas comparten service, así que la validación nueva y la auditoría nueva las gana también.
    La ruta nueva no rompe a quien ya llamaba a la vieja.
11. Un cambio efectivo de etapa emite `lead:stage-changed` al room `tenant:<id>` y **solo** a ese:
    el tablero de otro administrador de la misma empresa se actualiza sin recargar, y ningún socket
    de otro tenant lo recibe. Un cambio idempotente (criterio 5) **no** emite nada.
12. **UI:** el tablero pinta una columna por etapa activa, con nombre, color del catálogo y conteo
    en la cabecera, y tarjetas arrastrables entre columnas. El movimiento es **optimista** —la
    tarjeta aterriza al soltarla, sin esperar al servidor— y **revierte con un toast explicando el
    motivo** si el backend lo rechaza.
13. **UI:** el tablero es operable **por teclado** (sensor de teclado de `@dnd-kit` + anuncios ARIA
    de inicio, cambio de columna, soltado y cancelación). Arrastrar con el ratón no puede ser la
    única forma de mover un lead.
14. **UI:** toggle `Tabla | Embudo` en `/leads`, persistido en la URL (`?vista=embudo`) para que la
    vista se comparta por enlace y sobreviva al refresco, igual que ya hacen los filtros. Los
    filtros activos se conservan al cambiar de vista.
15. **UI:** estados de carga, vacío y error resueltos en el tablero y en cada columna. Todo prolijo
    en **claro y oscuro** con los tokens semánticos; el color de la etapa es un **dato del tenant**
    y se pinta por `style` a través del motor de contraste, nunca como `bg-[#...]`.
16. **Aislamiento multi-tenant:** el tenant B no ve el pipeline del A, no mueve sus leads (`404` y
    **sin escribir**, comprobado releyendo el lead desde el tenant A), no lee su historial de etapa,
    y su `GET /api/pipeline` nunca arrastra **ni cuenta** leads ajenos. **Test de aislamiento en
    verde.**
17. `pnpm --filter @sofiapp/api typecheck` y `test` en verde; `pnpm --filter @sofiapp/web build`,
    `lint` y `test` sin errores.

## Nota sobre por qué una ruta nueva y no reutilizar `PATCH /leads/:id`

`PATCH /api/leads/:id` ya hace el trabajo, y la tentación de no tocar nada es legítima. Se estrena
`/stage` por tres razones concretas:

- **La historia la pide por nombre.** El contrato del backlog dice `PATCH /leads/:id/stage`, y es el
  contrato con el que otros consumidores van a integrarse.
- **`PATCH /:id` es una puerta genérica que hoy solo admite `estado`.** El día que la ficha del lead
  deje editar el correo o el responsable, ese endpoint crecerá y el cambio de etapa quedará mezclado
  con ediciones de otra naturaleza. Una ruta dedicada mantiene el gesto separado, igual que
  `/status` hizo con el semáforo.
- **No cuesta duplicación.** Las dos rutas llaman al **mismo** `updateLeadEstado`; lo único que se
  duplica es una línea de router y un controller de tres líneas.

## Nota sobre por qué `declinado` convive con `perdido`

Se podría haber renombrado `perdido` a «Declinado» y quedarse con una sola etapa de salida. Se
descartó: no son lo mismo. **`perdido`** es la oportunidad que se enfrió —dejó de responder, se
agotó el plazo—; **`declinado`** es la que dijo que no. Distinguirlas es justamente lo que hace
accionable un embudo: una se reintenta en la siguiente campaña, la otra no.

Además, la `key` de un estado **no se puede mutar** —está grabada en `Lead.estado`—, así que
renombrar `perdido` habría dejado una etapa cuya clave dice una cosa y cuya etiqueta dice otra, que
es precisamente la incoherencia que el catálogo evita.

Ambas quedan marcadas `esSalida: true`. Una empresa que no necesite el matiz archiva la que le
sobre: el catálogo es suyo.

## Dependencias

- `INF-02` — repositorio tenant-safe (`*Scoped`) y `requireTenant`.
- `AUTH-01` / `AUTH-02` — `tenantId` y `rol` en el token; `authorize(['admin'])`.
- `HU-CRM-01` — el feature `lead`, la colección `leads` y su modelo.
- `HU-CRM-03` — el catálogo `estados`, `listLeads` y su proyección de tabla, `updateLeadEstado`,
  la `LeadsTable` y el `LeadDetailSheet` donde aterriza el toggle de vista. Es la dependencia
  fuerte: esta historia es su continuación directa.
- `HU-OMNI-02` — `findUsersByIds` y el patrón de historial auditado que replica.
- `ADR 0004` — Socket.IO + puente Redis, sobre el que viaja `lead:stage-changed`.
- `DSN-03` — UI kit shadcn (`tabs`, `scroll-area`, `card`, `badge`, `skeleton`, `tooltip`).
- **Dependencia externa nueva:** `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`.
