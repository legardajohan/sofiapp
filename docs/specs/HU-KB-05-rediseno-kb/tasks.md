# HU-KB-05 — Tasks (checklist ejecutable)

> Claude Code: ejecuta en orden. Marca cada casilla al terminar. No cierres el feature hasta que
> TODO esté en verde.

## Rama

- [x] Crear `feat/HU-KB-05` desde **`feat/HU-KB-04`** (no desde `develop`: se necesitan el fix de
      `AlertDialog` en la KB y los primitivos `scroll-area`/`tabs` que solo existen en esa rama).

## Implementación — Frontend

> HU sin backend. Orden de dentro hacia fuera: lógica pura → tarjeta → grilla → editor → modal →
> progreso → página → limpieza.

- [x] Invocar `emil-design-eng`, `impeccable:impeccable` y `frontend-design:frontend-design`
      **antes** de escribir cualquier componente (regla §7 del `CLAUDE.md` raíz).
      **Parcial:** `emil-design-eng` e `impeccable:impeccable` siguen sin estar registradas en este
      entorno (`Unknown skill`), igual que en HU-KB-04. Se invocó `frontend-design:frontend-design`
      y se aplicó su propia regla de que el brief manda: al ser una pantalla interna dentro de un UI
      kit ya establecido, la consistencia con shadcn y los tokens pesa más que una identidad visual
      propia. De la skill se tomó lo transferible: concentrar la audacia en **un solo** elemento (la
      tarjeta `bg-primary`), que la estructura codifique información (orden por prioridad,
      "Sin contenido todavía" en vez de metadatos inventados) y copy en voz activa con el mismo
      verbo de principio a fin ("Guardar e indexar" → "Guardado. Indexando su contenido…").
- [x] `lib/kb-presets.ts`:
  - [x] `normalizeTitulo(titulo)` — `trim` + minúsculas.
  - [x] `isTitleTaken(titulo, documents)` — títulos reales + los 5 de `PRESET_META` (reservados
        aunque el preset sea virtual), comparación normalizada.
  - [x] `buildKbGrid(documents)` — 5 presets fusionados en orden `PRESET_ORDER` + libres por
        `createdAt` asc.
  - [x] `nextVersion(doc)` — réplica de `isFirstFill`: virtual → 1; contenido vacío → `doc.version`;
        con contenido → `doc.version + 1`.
  - [x] `KbProgress`: añadidos `documentos`, `totalDocumentos`, `completedDocumentos`; eliminado
        `presetsSorted` (código muerto). **No** se cambió la semántica de `presets`/`obligatorios`.
        También se eliminó `presetOrderIndex`, que quedó sin consumidores al irse `presetsSorted`.
- [x] `components/KnowledgeCard.tsx` — migrados `presetStatus` (ahora `cardStatus`) y `cardBorder`
      desde `PresetKnowledgeBar.tsx` y `formatDate` desde `KnowledgeDocumentTable.tsx`. Título con
      `break-words`, badges Requerido/Predefinido, estado, fila
      `v{version} · {n} fragmentos · Actualizado {fecha}`, `doc.error` en `fallido`. Preset virtual
      → "Sin contenido todavía".
      _`STATUS_META` no se migró tal cual: los 4 estados de indexación los pinta ahora
      `IndexingStatusBadge` (que ya es dark-aware) y solo quedaron dos estados propios de la tarjeta,
      "Falta completarlo" y "Sin llenar", para documentos sin contenido._
- [x] Alinear los tonos ámbar/gris heredados (`bg-amber-500`, `bg-gray-400`, `text-amber-600`) con
      los del `IndexingStatusBadge`, que sí tiene rama `dark:`. Incluye el contador de caracteres del
      editor, que usaba `text-amber-600` sin variante oscura.
- [x] `components/KnowledgeGrid.tsx` — `grid-cols-1 sm:grid-cols-2`, skeletons en `isLoading`,
      aviso `bg-destructive-subtle` + "Reintentar" **en lugar de** la grilla en `isError`, y la
      tarjeta "Agregar nuevo conocimiento" al final en `bg-primary text-primary-foreground`.
- [x] `components/KnowledgeUploadEditor.tsx` (refactor):
  - [x] Quitado el chrome de card y su cabecera; queda `<form>` + `DialogFooter`.
  - [x] El input de Título se renderiza **solo** en creación libre (fuera el `tituloLocked`).
  - [x] Sustituida la rama de éxito inline por `toast.success` + `onDone()` en los tres caminos.
  - [x] Añadida la mutación `deleteKbDocument` + `AlertDialog` controlado, visible solo si
        `doc && !doc.obligatorio && !isVirtualPresetId(doc.id)`.
  - [x] `DialogFooter` con `sm:justify-between`: Eliminar a la izquierda; Cancelar + "Guardar e
        indexar" a la derecha, con `Loader2 animate-spin` como pending.
  - [x] Regla de colisión: `isTitleTaken` → `disabled` en Guardar + aviso
        `Este conocimiento ya existe («<título>»). Ábrelo desde su tarjeta para editarlo.` +
        `aria-invalid` / `aria-describedby`. Sin request al backend.
  - [x] Migrados `<input>`/`<textarea>`/`<label>` crudos a `Input`/`Textarea`/`Label` de shadcn, y
        el `Spinner` SVG a mano a `Loader2` de lucide.
  - [x] **Desvío del plan:** la prop `document` pasó a llamarse `doc`. Con el nombre anterior
        ensombrecía el `document` global dentro del componente, un riesgo real ahora que el archivo
        creció con la mutación de borrado.
- [x] `components/KnowledgeDocumentDialog.tsx` — `Dialog` + `DialogContent`
      (`max-h-[90vh] overflow-y-auto sm:max-w-2xl`); `DialogTitle` = título fijo en edición /
      "Nuevo conocimiento" en creación; `DialogDescription` con la leyenda de versión. El editor se
      monta solo con `target !== null` y con `key`, así cada apertura arranca limpia.
      _La leyenda del primer llenado dice "El primer contenido no crea una versión nueva" en vez de
      "v1 → v1", que no explicaría nada._
- [x] `components/PresetProgress.tsx` — dos contadores: `X/2 obligatorios completados` y
      `Y/Z documentos indexados`; barra y `aria-valuenow`/`aria-valuemax` sobre
      `completedDocumentos`/`totalDocumentos`.
- [x] `components/RequiredPresetsBanner.tsx` — `onFix` abre el modal de edición (el cambio real está
      en el punto de llamada; aquí solo se actualizó la documentación de la prop).
- [x] `pages/KnowledgeBasePage.tsx` — estado `dialogTarget`, `buildKbGrid` + `computeKbProgress`,
      contenedor `max-w-5xl`; eliminados `formRef`, el `useEffect` de `scrollIntoView`,
      `belongsInTable`, `tableDocuments` y `editingDocument`. Conservados `isIndexingActive` y el
      `refetchInterval`.
- [x] Eliminados `PresetKnowledgeBar.tsx`, `KnowledgeDocumentTable.tsx` y `KnowledgeEmptyState.tsx`;
      `grep` confirma que no queda ningún import a los tres.
- [ ] Revisión visual en **light y dark** con captura desechable.
      **No realizado:** requiere el backend real contra MongoDB/Redis, y las credenciales viven en
      `apps/backend/.env`, sin acceso de lectura en este entorno (igual que en HU-KB-04). Tampoco hay
      MCP de Playwright disponible. En su lugar se verificó: (a) `grep` sin una sola utilidad de color
      arbitraria en el feature; (b) revisión clase por clase de los archivos tocados — todo son
      tokens semánticos definidos en `:root` y `.dark`, y los únicos colores de paleta (ámbar) llevan
      su rama `dark:` copiada de `IndexingStatusBadge`; (c) 17 tests RTL que ejercitan la vista
      completa. **Queda pendiente una pasada visual humana antes del merge.**

## Tests (Vitest)

- [x] Creado `src/features/knowledge-base/lib/kb-presets.test.ts` portando los casos de
      `tests/kb-progress.test.ts` a `describe/it/expect`, **corrigiendo** la constante obsoleta
      `OPCIONAL = 'Preguntas frecuentes'` → `'Información Complementaria'` (el preset se renombró en
      el commit `4ac6670`; esa constante era la causa del rojo en la rama base).
- [x] Borrado `apps/frontend/tests/kb-progress.test.ts` (el directorio `tests/` quedó vacío y
      desapareció).
- [x] Casos nuevos:
  - [x] `buildKbGrid`: lista vacía → 5 en orden `PRESET_ORDER`; presets primero y libres después;
        libres por `createdAt` asc (con `updatedAt` desordenado a propósito, para demostrar que no se
        usa); un documento con título de preset no se duplica; el preset sin documento llega virtual.
  - [x] Contador dinámico: `totalDocumentos` 5 sin libres y 5 + n con n libres;
        `completedDocumentos` solo cuenta `indexado`; un libre indexado sube `Y/Z` pero no `X/2`.
  - [x] `isTitleTaken`: título de `PRESET_META` aunque sea virtual → `true`; libre existente →
        `true`; distinta capitalización y espacios → `true`; título nuevo → `false`; vacío → `false`.
  - [x] `nextVersion`: virtual → 1; contenido vacío en v1 → 1 y en v2 → 2; con contenido en v3 → 4.
- [x] **Desvío del plan (deliberado):** al planear se decidió *no* añadir tests RTL de componente.
      Se añadieron igual en `pages/KnowledgeBasePage.test.tsx` (17 casos) porque el encargo de
      implementación pedía dejarlo "funcional" y, sin acceso al backend, es la única forma de
      demostrar que los criterios 5, 6, 7, 9, 10 y 13 del spec se cumplen de verdad: apertura del
      modal, título fijo, contenido precargado, leyenda de versión en sus tres formas, bloqueo de
      título duplicado sin llamar al API, ausencia de Eliminar en obligatorios y virtuales, los dos
      contadores y el aviso de error. Si se prefiere el alcance original, el archivo es autónomo y se
      puede borrar sin tocar nada más.

## Verificación final

- [x] `pnpm --filter @sofiapp/web build` sin errores (incluye `tsc --noEmit`).
- [x] `pnpm --filter @sofiapp/web lint` en verde (`--max-warnings 0`).
- [x] `pnpm --filter @sofiapp/web test`: los 3 archivos de `knowledge-base` en verde — **49 tests**
      (26 de `kb-presets`, 17 de `KnowledgeBasePage`, 6 de `FaqTable`).
      `src/features/tags/components/TagSelector.test.tsx` sigue en rojo con **9 fallos**
      (`Tooltip` must be used within `TooltipProvider`): es **preexistente y ajeno** a esta HU —
      medido idéntico en `develop` antes de crear la rama, y `git diff feat/HU-KB-04 -- src/features/tags`
      está vacío. Queda fuera del alcance declarado en el spec.
- [x] `git diff --stat feat/HU-KB-04 -- apps/backend` vacío, y `apps/frontend/src/api/` sin cambios
      (criterio 14 del spec).
- [x] `grep -r "bg-\[#" apps/frontend/src/features/knowledge-base` sin resultados.
- [x] `git status` sin `*.png`/`*.jpg` colados (no se generaron capturas).
- [x] Checklist de PR de `docs/multi-tenancy.md` §9: **no aplica** — esta HU no añade código de
      servidor ni queries a Mongo. El aislamiento lo siguen garantizando los endpoints existentes de
      `features/kb`, que no se tocaron.

## Definición de "hecho"

El admin abre `/settings/knowledge` y ve una sola grilla de dos columnas con las 5 categorías
predefinidas más sus documentos propios; cada tarjeta lleva su estado de indexación, versión,
fragmentos y fecha de actualización. Un clic abre el modal de edición con el contenido precargado y
la versión de destino correcta; "Agregar nuevo conocimiento", en `bg-primary`, abre el modal de
creación y bloquea títulos ya existentes antes de enviar nada; cualquier tarjeta no obligatoria se
puede eliminar con confirmación por `AlertDialog`; y el encabezado informa por separado los
obligatorios (denominador fijo en 2) y los documentos indexados (denominador dinámico). No queda ni
tabla ni formulario embebido, y no se tocó una sola línea de backend.
