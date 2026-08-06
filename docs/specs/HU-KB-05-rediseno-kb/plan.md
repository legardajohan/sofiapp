# HU-KB-05 — Plan técnico (CÓMO)

> HU sin backend. Todo ocurre en `apps/frontend/src/features/knowledge-base/`.

## Archivos a crear / tocar

```
apps/frontend/
├── src/features/knowledge-base/
│   ├── lib/
│   │   ├── kb-presets.ts               # TOCAR  +normalizeTitulo, +isTitleTaken, +buildKbGrid,
│   │   │                               #        +nextVersion; KbProgress +documentos/
│   │   │                               #        totalDocumentos/completedDocumentos;
│   │   │                               #        −presetsSorted (código muerto)
│   │   └── kb-presets.test.ts          # NUEVO  port a Vitest de tests/kb-progress.test.ts + casos nuevos
│   ├── components/
│   │   ├── KnowledgeCard.tsx           # NUEVO  tarjeta única (preset real, preset virtual o libre)
│   │   ├── KnowledgeGrid.tsx           # NUEVO  grilla 2 col + "Agregar nuevo" + skeleton + banner de error
│   │   ├── KnowledgeDocumentDialog.tsx # NUEVO  shell del Dialog: encabezado fijo + leyenda de versión
│   │   ├── KnowledgeUploadEditor.tsx   # TOCAR  pierde el chrome de card; pasa a ser el cuerpo del modal
│   │   ├── PresetProgress.tsx          # TOCAR  dos contadores (obligatorios fijo + indexados dinámico)
│   │   ├── RequiredPresetsBanner.tsx   # TOCAR  onFix abre el modal de edición
│   │   ├── IndexingStatusBadge.tsx     # REUSAR sin cambios (ahora lo consume la tarjeta)
│   │   ├── PresetKnowledgeBar.tsx      # ELIMINAR
│   │   ├── KnowledgeDocumentTable.tsx  # ELIMINAR
│   │   └── KnowledgeEmptyState.tsx     # ELIMINAR (su único consumidor era la tabla)
│   └── pages/KnowledgeBasePage.tsx     # TOCAR  estado del modal, buildKbGrid, max-w-5xl,
│                                       #        −formRef, −scrollIntoView, −belongsInTable
└── tests/kb-progress.test.ts           # ELIMINAR (migrado a src/…/lib/kb-presets.test.ts)
```

**No se tocan:** `src/api/knowledge-base.ts`, `src/components/ui/**`, `router.tsx`,
`nav-config.ts`, `types/**` ni nada de `apps/backend/**`.

## Contratos

### `lib/kb-presets.ts` — helpers añadidos

```ts
/** Normaliza un título para comparar: trim + minúsculas. */
export function normalizeTitulo(titulo: string): string;

/**
 * `true` si el título ya está ocupado por un documento real del tenant o reservado por
 * `PRESET_META` (aunque ese preset siga siendo virtual). Comparación normalizada.
 */
export function isTitleTaken(titulo: string, documents: IKbDocument[]): boolean;

/**
 * Lista completa de la grilla: los 5 presets fusionados (orden `PRESET_ORDER`) seguidos de los
 * documentos libres —los que no coinciden con ningún título de `PRESET_META`— por `createdAt` asc.
 */
export function buildKbGrid(documents: IKbDocument[]): IKbDocument[];

/**
 * Versión con la que quedará el documento tras "Guardar e indexar". Réplica del `isFirstFill` de
 * `apps/backend/src/features/kb/kb.service.ts::updateDocument`:
 *   - preset virtual (`__preset_*`)      → 1                  (lo crea un POST)
 *   - documento real con contenido vacío → `doc.version`      (primer llenado: NO incrementa)
 *   - documento real con contenido       → `doc.version + 1`
 */
export function nextVersion(doc: IKbDocument): number;
```

**Orden de la grilla (decisión registrada).** Presets en orden fijo `PRESET_ORDER`, luego los libres
por `createdAt` **ascendente**. Se descarta `updatedAt` desc: guardar una tarjeta la haría saltar de
posición justo después de tocarla. El orden estable prima sobre la "recencia" en una vista de
inventario que se usa para verificar qué falta.

### `KbProgress` — extensión

```ts
export interface KbProgress {
  presets: IKbDocument[];            // sigue filtrando por isPreset → denominador fijo 5
  totalPresets: number;              // 5 (se conserva: decide si la barra se muestra)
  completedPresets: number;
  obligatorios: IKbDocument[];       // denominador fijo 2
  completedObligatorios: number;
  missingObligatorios: IKbDocument[];
  documentos: IKbDocument[];         // NUEVO: toda la grilla (presets + libres)
  totalDocumentos: number;           // NUEVO: Z de "Y/Z documentos indexados"
  completedDocumentos: number;       // NUEVO: Y (estadoIndexacion === 'indexado')
}
```

> **Contrato del contador dinámico.** "Documento indexado" = `estadoIndexacion === 'indexado'`,
> evaluado sobre **toda** la grilla (`buildKbGrid`), no solo sobre los presets. Los presets virtuales
> cuentan en el denominador y nunca en el numerador (nacen `pendiente`): un tenant nuevo arranca en
> `0/5` y pasa a `0/6` en cuanto crea un documento libre.
>
> `presets` y `obligatorios` **no** cambian de semántica — siguen filtrando por `isPreset`, que es
> exactamente el invariante que arregló HU-KB-01-V3 (un preset recreado por POST nace
> `isPreset:false` y `mergePresetsWithDocuments` le re-impone la identidad por título). Por eso el
> contador nuevo se añade como campos aparte en vez de reinterpretar `totalPresets`.

`computeKbProgress` pasa a recibir la lista de `buildKbGrid` en lugar de la de
`mergePresetsWithDocuments`. Como los documentos libres llegan con `isPreset:false`, los filtros de
`presets`/`obligatorios` siguen dando 5 y 2.

### `components/KnowledgeCard.tsx` (NUEVO)

```ts
interface KnowledgeCardProps {
  doc: IKbDocument;                  // real o preset virtual
  onOpen: (doc: IKbDocument) => void;
}
```

`<button>` que ocupa toda la tarjeta, conservando la accesibilidad de `PresetKnowledgeBar`
(`aria-label={`Abrir ${doc.titulo}`}`, `focus:ring-2 focus:ring-ring/40`). Migran a este archivo:

- `presetStatus`, `STATUS_META`, `cardBorder` — hoy en `PresetKnowledgeBar.tsx`.
- `formatDate` — hoy en `KnowledgeDocumentTable.tsx`.

Contenido de la tarjeta:

| Elemento | Fuente | Nota |
|---|---|---|
| Icono | `presetIcon(doc.titulo)` | `FileText` para documentos libres |
| Título | `doc.titulo` | `break-words`, **sin** `truncate` (motivo de las 2 columnas) |
| Badge "Requerido" | `doc.obligatorio` | |
| Badge "Predefinido" | `doc.isPreset` | trasladado de la tabla |
| Estado | `IndexingStatusBadge` | reemplaza el punto de color de la barra |
| Metadatos | `v{version} · {chunkCount} fragmentos · Actualizado {formatDate(updatedAt)}` | trasladado de la tabla |
| Error | `doc.error` si `estadoIndexacion === 'fallido'` | trasladado de la tabla |

Si `isVirtualPresetId(doc.id)` → la fila de metadatos se sustituye por **"Sin contenido todavía"**:
`version`, `chunkCount` y `updatedAt` de un virtual los fabrica `mergePresetsWithDocuments`
(`new Date().toISOString()` en cada render) y no describen nada real.

Los tonos ámbar/gris heredados de `PresetKnowledgeBar` (`bg-amber-500`, `bg-gray-400`,
`text-amber-600`) se alinean con los del `IndexingStatusBadge`, que sí tiene rama `dark:`.

### `components/KnowledgeGrid.tsx` (NUEVO)

```ts
interface KnowledgeGridProps {
  documents: IKbDocument[];          // ya pasado por buildKbGrid
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  onOpen: (doc: IKbDocument) => void;
  onCreate: () => void;
}
```

- Contenedor: `grid grid-cols-1 gap-3 sm:grid-cols-2`.
- `isLoading` → 6 `Skeleton` con la forma de la tarjeta.
- `isError` → banner `bg-destructive-subtle` + `Button variant="outline"` "Reintentar", **en lugar
  de** la grilla.
- Cierre de la grilla: tarjeta/botón "Agregar nuevo conocimiento" con
  `bg-primary text-primary-foreground hover:bg-primary-hover` + icono `Plus`.

### `components/KnowledgeDocumentDialog.tsx` (NUEVO)

```ts
export type KbDialogTarget =
  | { mode: 'create' }
  | { mode: 'edit'; doc: IKbDocument };   // doc real o preset virtual

interface KnowledgeDocumentDialogProps {
  target: KbDialogTarget | null;     // null → cerrado
  documents: IKbDocument[];          // documentos REALES del API, para isTitleTaken
  onOpenChange: (open: boolean) => void;
}
```

`<Dialog open={target !== null} onOpenChange>` +
`<DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">`.

`DialogHeader`:

- **Edición** → `DialogTitle` = `doc.titulo` (encabezado fijo, no editable) y `DialogDescription`
  con `Versión actual v{doc.version} · se guardará como v{nextVersion(doc)}`. Para un preset
  virtual: `Aún sin contenido · se guardará como v1`.
- **Creación** → `DialogTitle` "Nuevo conocimiento" + descripción breve.

Cuerpo: `<KnowledgeUploadEditor document={…} documents={documents} onDone={() => onOpenChange(false)} />`.

El editor se monta solo cuando `target !== null`, de modo que cada apertura arranca con estado
limpio sin depender del `useEffect` de reset.

### `components/KnowledgeUploadEditor.tsx` (refactor)

```ts
interface KnowledgeUploadEditorProps {
  document?: IKbDocument;            // ausente → creación libre
  documents: IKbDocument[];          // para isTitleTaken en creación
  onDone: () => void;                // cierra el Dialog (guardado OK, borrado OK o Cancelar)
}
```

Cambios respecto de la versión actual:

- **Pierde el chrome de card** (`bg-card border rounded-xl shadow-card` y su cabecera "Editando" /
  "Cargar conocimiento"): eso lo aporta ahora el `Dialog`. Se queda con el `<form>` y un
  `DialogFooter`.
- **El input de título solo se renderiza en creación libre.** En edición y en preset virtual el
  título lo muestra el `DialogHeader`; desaparece el `tituloLocked` con un input deshabilitado.
- **Desaparece la rama de éxito inline** (`successMsg` + limpieza de campos): al guardar, el modal se
  cierra y el feedback va siempre por `toast.success`, homogeneizando los tres caminos (crear libre,
  llenar preset virtual, editar).
- **Se le suma la mutación de borrado** (`deleteKbDocument`) con su `AlertDialog` de confirmación,
  porque el botón Eliminar depende del estado de esa mutación. Se renderiza solo si
  `document && !document.obligatorio && !isVirtualPresetId(document.id)`. `onSuccess` →
  `invalidateQueries(['kb','documents'])` + `toast.success` + `onDone()`.
- **`DialogFooter` con `justify-between`:** Eliminar a la izquierda; Cancelar + "Guardar e indexar"
  a la derecha. `Button` de shadcn con `Loader2 animate-spin` como estado pendiente (patrón de
  `FaqFormDialog`), sustituyendo el `Spinner` SVG escrito a mano.
- **Regla de colisión:** en creación, `const taken = isTitleTaken(titulo, documents)` → `disabled` en
  Guardar + panel `bg-destructive-subtle` con
  `Este conocimiento ya existe ("<título>"). Ábrelo desde su tarjeta para editarlo.`, más
  `aria-invalid` y `aria-describedby` en el input.
- Se sustituyen los `<input>` / `<textarea>` / `<label>` crudos por `Input` / `Textarea` / `Label`
  de shadcn (regla de `apps/frontend/CLAUDE.md`).
- Se mantienen `CONTENIDO_MAX = 3000`, `CONTENIDO_WARN`, `counterColor` y el placeholder derivado de
  `document.proposito`.

### `components/PresetProgress.tsx`

Dos contadores sobre la misma barra:

- Izquierda: `{completedObligatorios}/{obligatorios.length} obligatorios completados` (fijo, 2).
- Derecha: `{completedDocumentos}/{totalDocumentos} documentos indexados` (dinámico).

La barra y sus `aria-valuenow` / `aria-valuemax` pasan a `completedDocumentos` /
`totalDocumentos`. El guard de visibilidad sigue siendo `totalPresets === 0 → null`.

### `pages/KnowledgeBasePage.tsx`

```ts
const [dialogTarget, setDialogTarget] = useState<KbDialogTarget | null>(null);
const documents = data?.data ?? [];
const gridDocs  = buildKbGrid(documents);
const progress  = computeKbProgress(gridDocs);
```

- Se conservan `isIndexingActive` y el `refetchInterval` de 3 s (siguen evaluándose sobre la lista
  cruda del API, no sobre la fusionada).
- Se eliminan `belongsInTable`, `tableDocuments`, `formRef`, el `useRef`/`useEffect` de scroll y el
  estado `editingDocument`.
- `RequiredPresetsBanner.onFix` → `setDialogTarget({ mode: 'edit', doc })`.
- Contenedor `max-w-3xl` → **`max-w-5xl`**: con 2 columnas cada tarjeta pasa de ~360 px a ~490 px,
  suficiente para el título completo en una línea más la fila de metadatos.

## Notas

- **El backend no rechaza títulos duplicados.** `createDocument` (`kb.service.ts`) busca con
  `findOneScoped({ titulo })` —comparación **exacta**— y, si encuentra, re-versiona en silencio el
  documento existente (`$inc: { version: 1 }`) en vez de fallar. La regla de colisión es por tanto
  una defensa **exclusivamente de frontend** y **más estricta** que el backend: bloquea variantes por
  capitalización o espacios que el backend trataría como títulos distintos. Es intencional — el
  objetivo es que el admin abra la tarjeta existente en vez de fabricar duplicados casi idénticos.
  No se modifica el backend.
- **`AlertDialog` anidado dentro de `Dialog`.** Patrón soportado por Radix. Al confirmar el borrado
  hay que cerrar **los dos**: el `AlertDialog` primero y, en el `onSuccess` de la mutación, el
  `Dialog` vía `onDone()`. Verificar en la revisión manual que el foco vuelve a la grilla y no queda
  atrapado.
- **Por qué el banner de error reemplaza a la grilla.** Con la query en error `documents` es `[]`, y
  `buildKbGrid([])` devuelve 5 presets virtuales. Pintarlos daría a entender que el tenant no tiene
  conocimiento cargado, cuando lo que ocurre es que no se pudo leer. El banner **ocupa el lugar** de
  la grilla, no la acompaña.
- **`presetsSorted` se elimina de `KbProgress`:** es código muerto (ningún consumidor;
  `PresetKnowledgeBar` re-derivaba la lista por su cuenta) y `buildKbGrid` cubre su propósito.
- **Doble cálculo del merge, resuelto.** Hoy la lista fusionada se calcula dos veces por render (en
  la página para el progreso y dentro de `PresetKnowledgeBar` para pintar). Con `buildKbGrid`
  llamado una sola vez en la página y pasado a la grilla, queda un único cálculo.
- **Deuda registrada, no corregida aquí: drift de `proposito`.** `PRESET_DOCUMENTS` (backend,
  `kb.service.ts`) y `PRESET_META` (frontend) discrepan en el texto de "Información Complementaria",
  y las dos listas están acopladas **solo** por igualdad de `titulo`. Como
  `mergePresetsWithDocuments` prefiere `real.proposito ?? meta.proposito`, el placeholder del editor
  cambia según cómo se creó el documento. Renombrar un preset en cualquiera de los dos lados
  rompería en silencio el merge, los denominadores y el icono.
- **Migración del test.** El encabezado de `tests/kb-progress.test.ts` justifica vivir fuera de
  `src/` "para no agregar un script `test`"; esa razón ya no aplica (existe `"test": "vitest run"` y
  Vitest lo recoge igual). Se mueve a `src/features/knowledge-base/lib/kb-presets.test.ts` con
  `describe/it/expect`, quedando además cubierto por `tsc --noEmit` y `eslint src`, igual que
  `FaqTable.test.tsx`.

## Verificación

- `pnpm --filter @sofiapp/web build` (incluye `tsc --noEmit`).
- `pnpm --filter @sofiapp/web lint`.
- `pnpm --filter @sofiapp/web test`.
- `git diff --stat feat/HU-KB-04 -- apps/backend` → vacío (criterio 14 del spec).
- `grep -r "bg-\[#" apps/frontend/src/features/knowledge-base` → sin resultados.
