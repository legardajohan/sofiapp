# HU-CRM-04 — Actualizar estado de oportunidad (semaforización) (spec)

> **Spec-Driven Development.** Este es el QUÉ y el porqué. El CÓMO va en `plan.md`; la ejecución
> en `tasks.md`. Cierra el eje comercial del lead: HU-OMNI-04 creó el vocabulario de semaforización
> y HU-CRM-03 lo mostró en la cartera; esta historia es la que por fin deja **cambiarlo** — y deja
> que cada empresa defina el suyo.

**Estado:** implementado

## Objetivo

Permitir que un **Administrador** cambie el semáforo de una oportunidad entre los estados de su
empresa —de fábrica **Azul** (frío), **Naranja** (potencial), **Verde** (venta concretada) y **Rojo**
(descartado)—, que cada cambio quede registrado en un historial consultable, y que el nuevo color se
refleje de inmediato en el listado, en el pipeline y en la conversación que originó el lead.

Además, que **gestione el catálogo como un CRUD**: renombrar y recolorear los cuatro base, crear los
suyos y archivarlos cuando dejen de usarlos.

## Contexto de dominio (importante)

Cuatro cosas que hay que tener presentes antes de leer los criterios:

- **La etapa del pipeline ya está resuelta y NO es lo que pide esta historia.** `Lead.estado` se
  mueve contra el catálogo `estados` del tenant mediante `PATCH /api/leads/:id`
  (`updateLeadEstado`), entregado dentro de HU-CRM-03 aunque su spec lo hubiera anotado como
  pendiente de HU-CRM-04. **Semáforo y etapa son dos ejes distintos**: la etapa dice en qué punto
  del proceso está el lead; el semáforo, cómo de caliente es. Esta historia solo toca el segundo, y
  por eso estrena una ruta propia (`/status`) en vez de reabrir la que ya funciona y está testeada.

- **Hasta hoy el semáforo no era un campo del lead.** HU-OMNI-04 lo materializó como cuatro
  etiquetas de sistema (`Tag.semaforo`) aplicadas a la **conversación** (`Cliente.tagIds`), y
  HU-CRM-03 las hidrataba en el listado de solo lectura. Esta historia lo convierte en
  **`Lead.semaforo`**, que pasa a ser la fuente de verdad del semáforo *del lead*: garantiza que
  haya exactamente uno, no depende de etiquetas que el administrador puede borrar, y convierte el
  filtro `?semaforo=` en un match indexado en vez de dos consultas encadenadas.

- **El catálogo es del tenant, no del código.** Es el mismo camino que ya recorrieron las etapas del
  pipeline en HU-CRM-03: `Lead.semaforo` guarda la `key` de un documento de `semaforos`, sin `enum`
  en el schema, validada por el service contra el catálogo de la empresa. Los **cuatro de fábrica
  están protegidos**: se renombran y recolorean, pero no se archivan, porque su `key` es el contrato
  estable con el que se sincroniza la bandeja y con el que IA-05 y MARK-01 los resolverán.

- **El historial no estrena colección.** Se apoya en `audit_events`, que ya registra `lead.create`,
  `lead.update` y `lead.delete`, y que `docs/data-model.md` describe como pensada exactamente para
  esto. El endpoint de lectura replica el precedente de `GET /api/conversations/:id/assignments`.

## Los cuatro de fábrica y su significado

La historia define los colores como **resultado comercial del lead**. `docs/domain.md` §5 los había
definido como **salud de la conversación**. Se conservan las cuatro claves —son el contrato estable
compartido— y se documenta que el `label` depende del eje:

| `key` | Conversación (HU-OMNI-04) | **Lead (esta historia)** | Color | Orden |
|---|---|---|---|---|
| `azul` | Informativo | **Frío** | `#2563EB` | 0 |
| `naranja` | Requiere atención | **Potencial** | `#EA580C` | 1 |
| `verde` | Avanza | **Venta concretada** | `#16A34A` | 2 |
| `rojo` | En riesgo | **Descartado** | `#DC2626` | 3 |

El orden cuenta un recorrido —frío → potencial → cerrado— y deja el descarte al final; alfabético lo
destruiría. `verde` se solapa conceptualmente con la etapa `pagado`: **redundancia aceptada**, porque
la etapa es un catálogo que cada empresa amplía a su gusto y el semáforo es el vocabulario con el que
los módulos transversales hablan entre sí.

## Alcance

Incluye:

- **Backend**
  - Feature `semaforo` completo (patrón de 6 archivos): colección `semaforos` por tenant con
    `key`/`label`/`color`/`orden`/`activo`/`esDefecto`, más `GET`/`POST /api/semaforos` y
    `PATCH /api/semaforos/:id`.
  - Semilla idempotente de los cuatro de fábrica por tenant (`Tenant.semaforosSeeded`) + backfill
    de arranque.
  - `Lead.semaforo` con su índice; `PATCH /api/leads/:id/status`; `GET /api/leads/:id/historial`.
  - Acción de auditoría `lead.semaforo` y filtro por acción en `listAuditEvents`.
  - Sincronización best-effort de la etiqueta de semáforo de la conversación.
  - `GET /api/leads`: `semaforo` sale del campo del lead, y `?semaforo=` filtra por él.
  - Script de migración de los leads existentes.
- **Frontend**
  - Selector de semáforo en el `Sheet` de detalle, junto al de etapa y con la misma forma.
  - Sección de historial en el mismo panel: quién cambió qué y cuándo.
  - Diálogo de gestión del catálogo: listar, crear, renombrar, recolorear y archivar.
  - Columna Semáforo de la tabla y filtro de la barra, servidos por el catálogo del tenant.
- **Documentación**
  - `docs/domain.md` §5, `docs/data-model.md` (colección `semaforos` + campo e índice de `leads`),
    `docs/api-contract.md` §6, y la nota de supersesión en la spec de HU-CRM-03.

Fuera de alcance (otros features / fases):

- Clasificación **automática** del semáforo por IA → `IA-05`.
- Métricas y reportes de conversión por semáforo → `CRM-05`.
- Cambio de semáforo **en lote** sobre una selección de la tabla.
- Reordenar el catálogo arrastrando: el `orden` existe y se respeta, pero no se edita desde la UI.
- Borrado real de un semáforo: los leads llevan la `key` grabada. Se archiva.
- Semáforo como campo propio del `Cliente`: la conversación sigue usando sus etiquetas.
- Máquina de transiciones: los estados son libremente alcanzables entre sí, como pide la historia.

## Criterios de aceptación

1. `PATCH /api/leads/:id/status` con `{ semaforo: <key> }` cambia el semáforo del lead **del tenant
   del token** y devuelve el lead actualizado. Una clave que no esté en el catálogo → `400`. Un body
   con llaves de más (p. ej. `estado`) → `400`. Un lead de otro tenant → `404`, **nunca** `403`: un
   `403` confirmaría que el lead existe en otra empresa.
2. `{ semaforo: null }` retira la clasificación. Reenviar el semáforo que el lead ya tiene es
   **idempotente**: `200` sin escribir y **sin** entrada de historial, mismo criterio que
   `updateLeadEstado`.
3. Cada cambio efectivo registra un `AuditEvent` `lead.semaforo` con el valor anterior y el nuevo.
   Un fallo del registro **no** le cuesta el cambio al usuario.
4. `GET /api/leads/:id/historial` devuelve los cambios paginados (`{ data, page, limit, total }`),
   **más reciente primero**, con el actor resuelto a `{ id, nombre }` y `de`/`a` como `key`. Devuelve
   **solo** eventos de semáforo, no las otras acciones auditadas del lead — y el `total` corresponde
   con las filas. Lead de otro tenant → `404`.
5. `GET /api/leads` devuelve `semaforo` —uno, resuelto a etiqueta y color— leído del **campo del
   lead**, y `?semaforo=<key>` filtra por él. Una clave que no esté en el catálogo del tenant →
   **página vacía**, no `400` ni el listado sin filtrar (mismo criterio que `?estado=`). Esto
   **supersede los criterios 2, 4 y 6 de HU-CRM-03** en lo relativo al semáforo.
6. `GET /api/semaforos` lista el catálogo del tenant en orden, **incluidos los archivados**: la tabla
   necesita resolver el `label` de un lead cuyo semáforo ya no se ofrece, y esconderlo dejaría la
   clave cruda a la vista.
7. `POST /api/semaforos` crea uno propio con `{ label, color? }`. La `key` se deriva del `label`, se
   desambigua contra las existentes —archivadas incluidas— y **no cambia al renombrar**. Sin color,
   gris neutro. Nombre repetido ignorando mayúsculas y tildes → `409`.
8. `PATCH /api/semaforos/:id` renombra, recolorea y archiva (`activo: false`). `key` no se admite →
   `400`. Archivar uno de los **cuatro de fábrica** → `409` explicando la alternativa. **No hay
   `DELETE`**: los leads llevan la `key` grabada.
9. Los cuatro de fábrica se siembran **una sola vez** por tenant (`Tenant.semaforosSeeded`), al
   crearlo y por backfill de arranque. Volver a sembrar **no pisa** el renombrado ni el recoloreado
   del administrador.
10. Al cambiar el semáforo del lead, su conversación queda con **esa única** etiqueta de semáforo: se
    retiran las otras y se conservan intactas las etiquetas libres del tenant. Si la etiqueta no
    existe —el administrador la borró— o el lead lleva un semáforo propio sin etiqueta equivalente,
    la operación **no falla**: el semáforo del lead ya se guardó y la bandeja se queda sin chip.
11. Un script idempotente con `--dry-run` rellena `Lead.semaforo` de los leads existentes a partir de
    la etiqueta de su conversación. Sin él, la columna Semáforo se vaciaría de golpe al desplegar.
12. **UI:** el `Sheet` ofrece un selector de semáforo junto al de etapa y con la misma forma; una
    sección de historial con sus estados de carga, vacío y error resueltos; y un diálogo que gestiona
    el catálogo entero. Todo prolijo en **claro y oscuro** con los tokens semánticos; los colores del
    dato van por `style`, nunca como `bg-[#...]`.
13. **UI:** cambiar el semáforo actualiza la tabla sin recargar, y un lead que deja de cumplir el
    filtro activo **desaparece** con el `total` corregido, en vez de quedarse mintiendo.
14. **Aislamiento multi-tenant:** el tenant B no cambia el semáforo de un lead del tenant A (`404` y
    **sin escribir**), no lee su historial, no ve ni edita su catálogo (`404` y sin escribir), y
    `?semaforo=` nunca arrastra ni cuenta leads ajenos. **Test de aislamiento en verde.**
15. `pnpm --filter @sofiapp/api typecheck` y `test` en verde; `pnpm --filter @sofiapp/web build`,
    `lint` y `test` sin errores.

## Nota sobre por qué un campo y no la etiqueta

Reutilizar `Tag.semaforo` sobre la conversación habría evitado toda duplicación, pero tenía tres
costes que el campo propio no tiene:

- **La etiqueta se puede borrar.** `docs/domain.md` §5 lo permite a propósito. Con el semáforo
  viviendo ahí, un administrador que borra "Verde" deja el `PATCH` sin destino: habría que resucitar
  la etiqueta —contradiciendo el borrado deliberado— o devolver un `409` que en la pantalla de leads
  no significa nada para quien lo recibe.
- **Nada garantiza que haya una sola.** Que los colores sean excluyentes es una convención de la UI,
  no algo que el modelo imponga: `setConversationTags` acepta las cuatro a la vez.
- **El filtro costaba dos consultas.** `aplicarFiltroSemaforo` resolvía la etiqueta y luego todos los
  clientes que la llevaban, para acabar en un `$in` sin índice propio.

Lo que se conserva es lo que valía: las cuatro claves como contrato estable, y el nombre y el color
que cada empresa les haya puesto.

## Nota sobre por qué un catálogo y no un enum

El enum cerrado era la decisión inicial de esta spec. Se abrió a CRUD por la misma razón por la que
HU-CRM-03 abrió las etapas del pipeline y HU-CRM-02 los catálogos de la ficha: **el vocabulario
comercial es de cada empresa**. Cuatro temperaturas le sobran a quien trabaja con dos y le faltan a
quien distingue "tibio" de "caliente".

Lo que **no** se abrió es el contrato: las cuatro claves de fábrica siguen existiendo siempre en todo
tenant, y por eso están protegidas contra el archivado. Es la diferencia con `estados`, donde
`esDefecto` es meramente informativo: aquí protege algo real.

## Dependencias

- `INF-02` — repositorio tenant-safe (`*Scoped`) y `requireTenant`.
- `AUTH-01` / `AUTH-02` — `tenantId` y `rol` en el token; `authorize(['admin'])`.
- `HU-CRM-01` — el feature `lead`, la colección `leads` y su modelo. Esta historia lo extiende.
- `HU-CRM-03` — el listado `/leads`, su tabla, sus filtros y el `Sheet`, donde aterriza toda la UI;
  y el catálogo `estados`, cuyo patrón replica `semaforos`.
- `HU-OMNI-02` — `findUsersByIds` y `listAssignments`, el patrón de historial auditado que replica.
- `HU-OMNI-04` — las cuatro claves de semaforización y las etiquetas con las que se sincroniza.
- `DSN-03` — UI kit shadcn (`select`, `sheet`, `accordion`, `dialog`, `input`, `skeleton`, `button`).
