# ADR 0007 — El embudo vuelve a tener tablero Kanban con drag & drop

**Estado:** aceptado · **Fecha:** 2026-09-07 · **Contexto:** HU-PIPE-01 (mover oportunidades por
etapa)

## Contexto

El material original del proyecto incluía un módulo **M02 — Kanban**. Al recortar el alcance del
MVP se eliminó y se sustituyó por "gestión basada en estados del cliente". La exclusión quedó
escrita en cinco sitios, y en todos como una prohibición, no como un aplazamiento:

- `docs/product.md` §5: *"**Sin tablero Kanban / sin drag&drop**"*, y en «Módulos eliminados»:
  *"**Kanban (M02 original):** reemplazado por gestión basada en estados del cliente"*.
- `apps/frontend/CLAUDE.md` §Vistas núcleo: *"lista/tabla filtrable por `estadoComercial` (**NO**
  tablero Kanban, **NO** drag&drop)"*.
- `README.md`: *"pipeline comercial basado en `estadoComercial` (sin Kanban)"*.
- `docs/data-model.md`: *"Kanban sigue descartado por `product.md` §5"*.
- Las specs de HU-CRM-01 y HU-CRM-03, que lo repiten al declarar su alcance.

La razón de aquella decisión era de **coste y riesgo**, no de producto: un tablero con arrastre era
trabajo de UI que no cabía en el MVP, y una tabla filtrable resolvía el 80 % del caso.

Dos cosas cambiaron desde entonces:

1. **El sustrato ya existe.** HU-CRM-03 convirtió las etapas en un catálogo por tenant (`estados`,
   con `orden` y `color`) y entregó el cambio de etapa (`updateLeadEstado`). Un tablero ya no es un
   módulo nuevo: es **una vista más** sobre datos y endpoints que están construidos y probados.
2. **HU-PIPE-01 lo pide explícitamente**, con drag & drop entre etapas en su Definición de Hecho.

Mantener la prohibición obligaría a entregar la historia a medias; ignorarla en silencio dejaría el
repositorio afirmando dos cosas contrarias, y la siguiente sesión leería "Kanban descartado" con el
tablero ya en producción.

## Decisión

**Se revierte la exclusión del Kanban.** El embudo se implementa como tablero con arrastre, y los
cinco documentos que afirmaban lo contrario se corrigen apuntando a este ADR.

La reversión es **acotada** y va con tres condiciones que la mantienen barata:

1. **El tablero no introduce un pipeline propio.** Se dibuja sobre el catálogo `estados` y sobre
   `Lead.estado`, que ya existen. No hay colección nueva: el feature `pipeline` es un slice de
   lectura sin `.model.ts`.
2. **La tabla se conserva.** El tablero es una segunda vista de la misma cartera, con un toggle
   `Tabla | Embudo` en `/leads`. Lo que el tablero no sabe hacer —paginar dentro de una etapa,
   ordenar, filtrar por etapa— sigue siendo trabajo de la tabla, y la columna que no cabe entera
   enlaza a ella.
3. **No se añade una máquina de transiciones.** Entre etapas activas el movimiento es libre,
   incluido retroceder. `Estado.esSalida` marca las etapas terminales, pero es **descriptivo**: le
   dice a la UI qué columnas cierran el embudo, sin bloquear ningún movimiento.

## Alternativas consideradas

- **Tabla agrupada por etapa, sin arrastre.** Cumple los dos primeros criterios de aceptación de la
  historia y respeta la decisión anterior sin tocarla. Se descartó porque deja fuera la tarea de la
  historia que da nombre al gesto ("drag-and-drop entre etapas") y porque, con el sustrato ya
  construido, el ahorro era pequeño.
- **Tablero de solo lectura** (embudo como métrica, sin mover nada). Encaja en el "dashboard de
  conversión" que M02 ya contemplaba, pero no resuelve la historia: lo que se pide es **mover**.
- **Renombrar la exclusión a "aplazado"** en `product.md` sin ADR. Se descartó porque una decisión
  escrita en cinco archivos no se deshace con una edición silenciosa: sin registro, nadie sabría
  por qué cambió.

## Consecuencias

**A favor:**

- La gestión del embudo deja de ser una sucesión de desplegables por lead y pasa a ser un gesto.
- El catálogo de etapas por tenant, que hasta ahora solo se veía como una columna de la tabla,
  se vuelve legible de un vistazo: el `orden` cuenta por fin su recorrido.
- `Estado.esSalida` da a los módulos que vengan (métricas de conversión, campañas de remarketing)
  una forma de saber qué etapas cierran el embudo sin adivinarlo por el nombre.

**En contra / a vigilar:**

- **Una dependencia nueva en el frontend:** `@dnd-kit/core`, `@dnd-kit/sortable` y
  `@dnd-kit/utilities`. Se eligió sobre los eventos nativos de HTML5 por el soporte de teclado y
  ARIA, que un tablero solo arrastrable no tendría.
- **Dos vistas que mantener.** Cualquier dato nuevo del lead que valga la pena escanear habrá que
  añadirlo a la fila **y** a la tarjeta. Se mitiga compartiendo la proyección del backend
  (`hidratarLeadsParaListado`): tarjeta y fila salen de la misma función, así que no pueden
  divergir en los datos, solo en la presentación.
- **El coste de un tablero crece con las etapas.** `GET /api/pipeline` hace un `find` y un `count`
  por etapa activa. Con los seis de fábrica es trivial; una empresa con treinta etapas notaría la
  diferencia, y ahí habría que pasar a una agregación —que hoy no se usa porque `base.repository`
  no expone `aggregateScoped` y el `$match: { tenantId }` a mano es justo lo que el ADR 0001 saca
  del alcance del programador.
