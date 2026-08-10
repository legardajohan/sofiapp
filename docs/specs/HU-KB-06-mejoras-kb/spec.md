# HU-KB-06 — Mejoras de la vista "Entrenar la IA" (spec)

> **Spec-Driven Development.** Este es el QUÉ y el porqué. El CÓMO va en `plan.md`; la ejecución
> en `tasks.md`. HU **mixta** (backend + frontend) que corrige cuatro defectos reales que quedaron
> al descubierto tras el rediseño de HU-KB-05.

**Estado:** implementado

## Historia

Como **admin** de un tenant, quiero **encontrar** un conocimiento entre todos los que tengo
cargados, que la versión de un documento **solo suba cuando de verdad cambio el texto**, que al
eliminar una categoría predefinida **desaparezca** de mi panel en vez de reaparecer vacía, y tener la
certeza de que **lo que borro deja de alimentar a la IA**, para poder mantener mi base de
conocimiento sin pelearme con la herramienta.

## Contexto: qué está mal hoy

`feat/HU-KB-05` dejó la vista unificada en una sola grilla de tarjetas. Sobre esa base quedan cuatro
defectos, todos verificados en el código de la rama:

| # | Defecto | Dónde |
|---|---|---|
| A | No existe buscador ni filtro. La grilla crece sin límite con los documentos libres y solo se puede recorrer a ojo. | `pages/KnowledgeBasePage.tsx` |
| B | La versión sube en **todo** guardado con contenido previo, aunque el texto sea idéntico: además borra los chunks, re-encola `kb-index` y hace `bumpKbVersion`. Un guardado sin cambios cuesta una re-indexación completa y tira la caché de respuestas de IA del tenant. | `kb.service.ts::updateDocument` y `::createDocument` |
| C | Eliminar un preset es un no-op visual: `mergePresetsWithDocuments` lo repone como tarjeta virtual "Sin llenar" en el siguiente render. Y el backend **no valida `obligatorio`**: un `DELETE` directo al endpoint borra un conocimiento requerido. | `lib/kb-presets.ts` + `kb.service.ts::deleteDocument` |
| D | El worker valida existencia y versión **al entrar**, pero `embedTexts` (segundos, red) va después y los `createScoped(KbChunk…)` posteriores no re-validan. Si el documento se elimina en esa ventana quedan chunks huérfanos **recuperables por `$vectorSearch`**: la IA sigue respondiendo con conocimiento que el admin cree borrado. | `workers/kb-index.processor.ts` |

## Objetivo técnico

1. **Bloque A** — Buscador con *debounce* y dos filtros combinables (tipo y estado), resueltos **en
   cliente** sobre la lista que ya produce `buildKbGrid`.
2. **Bloque B** — Comparación **normalizada de whitespace** del contenido: si no cambia, **no-op
   total** en backend y leyenda de versión honesta en el modal **antes** de guardar.
3. **Bloque C** — Borrado real de presets vía **soft-delete** (`oculto`), más validación de verdad de
   `obligatorio` en el servidor.
4. **Bloque D** — Re-validación del documento **antes** de crear los chunks, con limpieza defensiva
   posterior.

## Decisión de alcance: una sola HU

Se evaluó partirla en tres. Los cuatro bloques convergen en los mismos archivos —`kb.service.ts`,
`kb.types.ts`, `lib/kb-presets.ts` y sus tests— y **D depende de C** (la re-validación del worker
tiene que mirar el flag `oculto` que introduce C). Partirla obligaría a tres rondas de rebase sobre
`kb-presets.ts` sin ningún beneficio de entrega. Se mantiene un solo ID, con los criterios agrupados
por bloque para poder revisarlos y revertirlos por separado.

## Alcance

### Incluye

**Backend**

- `features/kb/kb.service.ts` — `normalizeContenido`, el guard de no-op en `updateDocument` y en la
  re-subida de `createDocument`, la validación de `obligatorio` y el soft-delete en `deleteDocument`,
  `PRESET_TITULOS` y `oculto` en `mapKbDocumentToResponse`.
- `features/kb/kb-document.model.ts` — campo `oculto`.
- `features/kb/kb.types.ts` — `oculto` en `IKbDocument` e `IKbDocumentResponse`.
- `workers/kb-index.processor.ts` — cierre de la carrera.
- Tests: `kb.service.test.ts`, `kb.routes.test.ts`, `kb-index.processor.test.ts`.

**Frontend**

- `src/hooks/use-debounced-value.ts` (nuevo, sin dependencias nuevas).
- `features/knowledge-base/components/KnowledgeToolbar.tsx` (nuevo).
- `features/knowledge-base/lib/kb-presets.ts` — `cardStatus`/`cardBorder` migradas desde la tarjeta,
  `filterKbGrid`, `normalizeContenido`, `nextVersion` con contenido, `oculto` en el merge.
- `KnowledgeCard`, `KnowledgeGrid`, `KnowledgeDocumentDialog`, `KnowledgeUploadEditor`,
  `KnowledgeBasePage` y `types/domain.ts`.
- Tests: `kb-presets.test.ts`, `KnowledgeBasePage.test.tsx`, más los nuevos del hook y la toolbar.

**Documentación**

- `docs/data-model.md` — `oculto` (y `obligatorio`, que existe en el modelo desde HU-KB-01-V2 pero
  nunca se documentó) en `kb_documents`.
- `docs/specs/HU-KB-05-rediseno-kb/spec.md` — nota de superación en el **criterio 11**.

### Fuera de alcance

- **Paginación, virtualización o búsqueda en servidor.** `GET /api/kb/documents` no gana parámetros
  nuevos: el frontend ya pide `limit: 50`, el tope del backend es 100 y la lista de un tenant real es
  de decenas de documentos. Filtrar en cliente es la solución proporcionada al problema; si algún
  tenant supera ese orden de magnitud, se replantea con datos en mano.
- **Unificar los catálogos de presets** entre `PRESET_DOCUMENTS` (backend) y `PRESET_META`
  (frontend). El *drift* de `proposito` sigue siendo la deuda registrada en el `plan.md` de HU-KB-05.
- **Transacciones en `deleteDocument`.** El bloque D reduce la ventana de carrera de segundos a
  milisegundos y añade limpieza defensiva; cerrarla del todo exigiría una sesión transaccional y
  queda como riesgo residual aceptado y documentado.
- **Restaurar un preset oculto desde la UI.** El camino de re-alta es volver a crearlo con el mismo
  título desde "Agregar nuevo conocimiento"; no se añade un botón de "deshacer".
- La vista de FAQs (`KnowledgeFaqsPage`, `FaqTable`, `FaqFormDialog`, `FaqTester`).
- La suite roja preexistente `src/features/tags/components/TagSelector.test.tsx` (9 fallos por falta
  de `TooltipProvider`), ajena a esta HU.

## Criterios de aceptación

### Bloque A — Buscador y filtros (frontend · complejidad **media**)

1. La parte superior del panel, entre el progreso y la grilla, muestra un **buscador** con
   `debounce ≈ 300 ms` (hook nuevo `useDebouncedValue`, sin dependencias nuevas) y **dos selectores**
   de filtro. Se renderiza cuando la query resuelve; **no** se renderiza en el estado de error, donde
   el banner sigue sustituyendo a la grilla (criterio 13 de HU-KB-05).
2. Los tres criterios son **combinables (AND)** y se aplican **en cliente** sobre la lista de
   `buildKbGrid`. El texto compara con `normalizeTitulo` (la utilidad ya existente).
3. El filtro de **tipo** tiene exactamente: `Todos` · `Requerido` (`obligatorio`) · `Predefinido`
   (`isPreset && !obligatorio`) · `Custom` (el resto).
4. El filtro de **estado** tiene exactamente: `Todos` · `Indexado` · `En proceso` (= `procesando` +
   `pendiente` con contenido, coherente con el `isIndexingActive` que gobierna el *refetch*) ·
   `Fallido` · `Sin llenar` (= `falta` + `opcional`).
5. `cardStatus` y `cardBorder` viven en `lib/kb-presets.ts` —no en `KnowledgeCard.tsx`— y las
   consumen tanto la tarjeta como el filtro. Son funciones puras y están cubiertas por tests.
6. Con filtros activos y cero coincidencias, la grilla muestra un estado vacío propio
   (**"Sin resultados…"** + acción para **limpiar filtros**), visualmente distinto del banner de
   error. La tarjeta **"Agregar nuevo conocimiento" permanece visible**.
7. Los contadores de `PresetProgress` se calculan sobre la lista **sin filtrar**: filtrar no altera
   `X/2 obligatorios` ni `Y/Z documentos indexados`.

### Bloque B — Conteo de versiones (backend + frontend · complejidad **media**)

8. `normalizeContenido(texto)` = `trim()` + colapsar `\s+` a un espacio simple. **No** baja a
   minúsculas ni toca nada más. Existe con idéntica semántica en backend y frontend, y ambas
   implementaciones están cubiertas por tests.
9. `PATCH /api/kb/documents/:id` con contenido cuya normalización coincide con la del contenido
   guardado es un **no-op total**: sin `$inc version`, sin borrar `KbChunk`, sin encolar `kb-index`,
   sin `bumpKbVersion` y **sin tocar `updatedAt`**. Responde `200` con el documento tal cual estaba.
10. `POST /api/kb/documents` sobre un título ya existente aplica **la misma** comparación: si el
    contenido no cambia, no re-versiona ni encola job.
11. Cuando el contenido **sí** difiere, el comportamiento actual se conserva intacto, incluido el
    `isFirstFill` que no incrementa la versión en el primer llenado de un documento vacío.
12. El modal muestra la leyenda de versión **correcta antes de guardar**, reaccionando al texto que
    se está tecleando: sin contenido previo → "se guardará como v1"; primer llenado → "el primer
    contenido no crea una versión nueva"; texto modificado → "pasará a v{n+1}"; texto sin cambios
    reales → **"sin cambios por guardar"**.

### Bloque C — Borrado real de presets (backend + frontend · complejidad **alta**)

13. `DELETE /api/kb/documents/:id` sobre un documento con `obligatorio === true` responde **4xx** con
    `AppError`, sin borrar nada. Es validación de servidor, no solo el botón oculto en la UI.
14. `KbDocument` tiene el campo **`oculto: boolean`** (`default: false`). Eliminar un **preset no
    obligatorio** lo marca `oculto: true`, borra sus `KbChunk` y hace `bumpKbVersion`, pero **no**
    borra el documento. Un documento **libre** conserva el borrado duro actual.
15. La condición de "es preset" se decide **por título** (`PRESET_TITULOS`) además de por `isPreset`.
    Un preset recreado por `POST` nace `isPreset: false` —el borde HTTP solo acepta `titulo` y
    `contenido`—, y como el merge lo repone por título, decidir solo por `isPreset` haría reaparecer
    la tarjeta igual que hoy.
16. `GET /api/kb/documents` **sigue devolviendo** los documentos ocultos, con `oculto` en el DTO. Es
    el frontend quien los excluye: si el servidor los filtrara, el merge no podría distinguir
    "nunca existió" de "eliminado" y volvería a fabricar la tarjeta virtual.
17. Tras eliminar un preset no obligatorio, su tarjeta **desaparece** del panel y **no reaparece** al
    recargar. Volver a crearlo con el mismo título lo **resucita** (`oculto: false`) sobre el mismo
    documento; el índice único `{ tenantId, titulo }` sigue vigente y no se generan duplicados.
18. `isTitleTaken` **sigue considerando ocupado** el título de un documento oculto: el índice único no
    se ha liberado, y crear con ese título es una re-alta, no un documento nuevo.
19. El **criterio 11 de HU-KB-05** —que fijaba la reaparición de la tarjeta como comportamiento
    deseado— queda anotado como **superado por esta HU** en su `spec.md`, y `docs/data-model.md`
    documenta `oculto` y `obligatorio` en `kb_documents`.

### Bloque D — Carrera del worker de indexación (backend · complejidad **baja**)

20. `processKbIndexJob` **re-valida el documento después de `embedTexts` y antes de crear los
    chunks**: si ya no existe, cambió de `version` o llegó con `oculto: true`, registra el motivo y
    sale **sin crear un solo `KbChunk`** y sin escribir estado sobre un documento que puede no estar.
21. Si el documento desaparece **entre** la re-validación y el final del guardado, los chunks
    recién creados se limpian (`deleteManyScoped`). Ningún escenario de la suite deja `KbChunk`
    apuntando a un `documentId` inexistente u oculto.
22. El camino feliz y los casos ya cubiertos (reindexado idempotente, versión obsoleta, fallo del
    proveedor → `fallido` + *rethrow*) siguen exactamente igual.

### Transversales

23. **Aislamiento multi-tenant.** El bloque C añade campo y ramas nuevas al modelo `KbDocument`, así
    que la HU lleva test de aislamiento: el tenant B no puede ocultar ni borrar un documento del
    tenant A (`404`), y ocultar un documento del tenant A no altera el listado del tenant B. Toda
    query nueva pasa por el repositorio `*Scoped` y el `tenantId` nace del token; no se abren rutas
    nuevas ni cambia la cadena de middlewares.
24. **Todo componente tocado** queda correcto en **light y dark** con tokens semánticos y cero
    `bg-[#...]`, usando primitivos de `src/components/ui/` ya vendorizados (no se instala
    `toggle-group`, `popover` ni `command`). Se invocan `emil-design-eng`, `impeccable:impeccable` y
    `frontend-design:frontend-design` **antes** de escribir componentes (regla §7 del `CLAUDE.md`
    raíz); si alguna no está registrada en el entorno, se documenta en `tasks.md`.
25. `pnpm --filter @sofiapp/api typecheck` (`tsc --noEmit`) y `pnpm --filter @sofiapp/api test` en
    verde (el paquete del backend se llama `@sofiapp/api`; el filtro `backend` del `CLAUDE.md` no
    existe);
    `pnpm --filter @sofiapp/web build`, `lint` (`--max-warnings 0`) y `test` en verde, con todos los
    tests de `knowledge-base` pasando. `TagSelector.test.tsx` sigue rojo por causa preexistente y
    queda fuera de alcance, declarado aquí.

## Dependencias

Depende de:

- Rama base **`feat/HU-KB-05`** (no `develop`): esta HU **no crea rama nueva**, se trabaja
  directamente sobre `feat/HU-KB-05` por indicación explícita. Aporta la grilla única, el modal, el
  merge de presets y los 49 tests de la vista.
- `features/kb/**` — `createDocument`, `updateDocument`, `deleteDocument`, `listDocuments`,
  `seedPresetDocuments`, `PRESET_DOCUMENTS`, `bumpKbVersion`.
- `repositories/base.repository.ts` — `findByIdScoped`, `findOneScoped`, `findOneAndUpdateScoped`,
  `findOneAndDeleteScoped`, `deleteManyScoped`, `createScoped`, `countScoped`, `findScoped`.
- `lib/kb-presets.ts` — `PRESET_META`, `PRESET_ORDER`, `normalizeTitulo`, `mergePresetsWithDocuments`,
  `buildKbGrid`, `computeKbProgress`, `isVirtualPresetId`, `isTitleTaken`, `nextVersion`.
- `src/components/ui/` — `input`, `select`, `button`, `badge`, `dialog`, `alert-dialog`, `textarea`,
  `label`, `skeleton` (**todos ya vendorizados**).

No bloquea ni la bloquea ninguna otra HU en curso.

## Definición de "hecho"

El admin abre `/settings/knowledge`, escribe tres letras en el buscador y la grilla se reduce a lo
que le interesa; combina el filtro de tipo y el de estado para ver, por ejemplo, solo los requeridos
que le faltan, y si no hay coincidencias lee "Sin resultados…" con un botón para limpiar, sin que los
contadores de arriba se muevan. Abre una tarjeta, no toca el texto y el modal le dice "sin cambios
por guardar"; si guarda igual, la versión, la fecha y los fragmentos se quedan donde estaban y la IA
no se re-entrena por nada. Elimina una categoría predefinida que no usa y **desaparece de verdad**;
si un día la quiere de vuelta, la crea con el mismo título y recupera su tarjeta. Y ningún fragmento
de lo que borró puede volver a aparecer en una respuesta de la IA, ni siquiera si el borrado ocurrió
mientras el worker estaba a mitad de indexarlo.
