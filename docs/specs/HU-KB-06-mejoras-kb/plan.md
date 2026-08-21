# HU-KB-06 — Plan técnico (CÓMO)

> HU mixta. Backend: `features/kb/**` + `workers/kb-index.processor.ts`. Frontend:
> `features/knowledge-base/**` + un hook nuevo en `src/hooks/`. No se crean rutas ni endpoints
> nuevos; el contrato HTTP solo **gana un campo de salida** (`oculto`).

## Archivos a crear / tocar

```
apps/backend/
├── src/features/kb/
│   ├── kb.types.ts                    # TOCAR  +oculto en IKbDocument e IKbDocumentResponse
│   ├── kb-document.model.ts           # TOCAR  +oculto: { type: Boolean, default: false }
│   ├── kb.validation.ts               # SIN CAMBIOS (oculto no entra por el borde HTTP)
│   ├── kb.service.ts                  # TOCAR  +normalizeContenido, +PRESET_TITULOS,
│   │                                  #        no-op en updateDocument/createDocument,
│   │                                  #        validación obligatorio + soft-delete en deleteDocument,
│   │                                  #        oculto en mapKbDocumentToResponse y seedPresetDocuments
│   ├── kb.controller.ts               # SIN CAMBIOS
│   ├── kb.routes.ts                   # SIN CAMBIOS
│   ├── kb.service.test.ts             # TOCAR  reescribe la semántica vieja + casos nuevos
│   └── kb.routes.test.ts              # TOCAR  PATCH idéntico, DELETE de obligatorio, aislamiento
└── src/workers/
    ├── kb-index.processor.ts          # TOCAR  re-validación post-embed + limpieza defensiva
    └── kb-index.processor.test.ts     # TOCAR  +3 casos de carrera

apps/frontend/
├── src/hooks/
│   ├── use-debounced-value.ts         # NUEVO  useDebouncedValue<T>(value, delayMs = 300)
│   └── use-debounced-value.test.ts    # NUEVO  fake timers
└── src/features/knowledge-base/
    ├── types/domain.ts                # TOCAR  +oculto: boolean
    ├── lib/
    │   ├── kb-presets.ts              # TOCAR  +cardStatus/cardBorder (migradas), +filterKbGrid,
    │   │                              #        +normalizeContenido, nextVersion(doc, contenido),
    │   │                              #        merge/buildKbGrid excluyen oculto
    │   └── kb-presets.test.ts         # TOCAR  actualiza nextVersion + casos nuevos
    ├── components/
    │   ├── KnowledgeToolbar.tsx       # NUEVO  buscador + 2 Select
    │   ├── KnowledgeToolbar.test.tsx  # NUEVO  RTL
    │   ├── KnowledgeCard.tsx          # TOCAR  −cardStatus/−cardBorder (ahora importadas de lib/)
    │   ├── KnowledgeGrid.tsx          # TOCAR  +rama "sin resultados" (isFiltered/onClearFilters)
    │   ├── KnowledgeDocumentDialog.tsx# TOCAR  +DocumentDialogBody dueño de `contenido`
    │   └── KnowledgeUploadEditor.tsx  # TOCAR  `contenido` pasa a prop controlada
    └── pages/
        ├── KnowledgeBasePage.tsx      # TOCAR  estado de filtros + debounce + lista filtrada
        └── KnowledgeBasePage.test.tsx # TOCAR  leyenda de versión, filtros, preset oculto

docs/
├── data-model.md                                # TOCAR  kb_documents: +oculto, +obligatorio
└── specs/HU-KB-05-rediseno-kb/spec.md           # TOCAR  nota de superación en el criterio 11
```

**No se tocan:** `src/api/knowledge-base.ts` (las cuatro funciones bastan; `oculto` llega dentro del
DTO existente), `src/components/ui/**` (no se instala ningún primitivo nuevo), `router.tsx`,
`nav-config.ts`, `kb.repository.ts`, `kb.retrieval.service.ts`, `kb.chunker.ts`, `config/queues.ts`.

---

## Bloque A — Buscador y filtros (frontend)

### Contratos — `lib/kb-presets.ts`

```ts
// ─── Migradas desde KnowledgeCard.tsx (hoy privadas) ────────────────────────
export type CardStatus = EstadoIndexacion | 'falta' | 'opcional';

/** El estado de indexación manda; solo cuando no hay nada que indexar hablamos de falta/opcional. */
export function cardStatus(doc: IKbDocument): CardStatus;

/** Borde por prioridad: falta un obligatorio > falló > ya indexado > neutro. */
export function cardBorder(status: CardStatus): string;

// ─── Filtro ─────────────────────────────────────────────────────────────────
export type KbTagFilter    = 'todos' | 'requerido' | 'predefinido' | 'custom';
export type KbEstadoFilter = 'todos' | 'indexado' | 'proceso' | 'fallido' | 'sinLlenar';

export interface KbFilterCriteria {
  texto: string;            // ya debounced por el llamador
  tag: KbTagFilter;
  estado: KbEstadoFilter;
}

export const EMPTY_FILTERS: KbFilterCriteria;                       // { texto: '', tag: 'todos', estado: 'todos' }
export function hasActiveFilters(c: KbFilterCriteria): boolean;
export function filterKbGrid(docs: IKbDocument[], c: KbFilterCriteria): IKbDocument[];
```

`filterKbGrid` recibe la lista **ya fusionada** por `buildKbGrid` y aplica los tres criterios en AND:

| Criterio | Regla exacta |
|---|---|
| `texto` | `normalizeTitulo(doc.titulo).includes(normalizeTitulo(c.texto))`; `texto` vacío no filtra |
| `requerido` | `doc.obligatorio` |
| `predefinido` | `doc.isPreset && !doc.obligatorio` |
| `custom` | `!doc.isPreset && !doc.obligatorio` |
| `indexado` | `cardStatus(doc) === 'indexado'` |
| `proceso` | `cardStatus(doc) === 'procesando' \|\| cardStatus(doc) === 'pendiente'` |
| `fallido` | `cardStatus(doc) === 'fallido'` |
| `sinLlenar` | `cardStatus(doc) === 'falta' \|\| cardStatus(doc) === 'opcional'` |

> **Por qué "En proceso" se define así.** `cardStatus` solo devuelve `'pendiente'` cuando el documento
> tiene contenido (si no, cae a `'falta'`/`'opcional'`). Eso hace que `procesando + pendiente` sea
> exactamente el mismo conjunto que dispara el `refetchInterval` de 3 s vía `isIndexingActive` en
> `KnowledgeBasePage.tsx`. Un documento vacío nunca aparece "en proceso": no hay nada indexándose.

> **Por qué `cardStatus`/`cardBorder` se mudan a `lib/`.** Hoy son privadas de `KnowledgeCard.tsx`.
> El filtro necesita la misma clasificación, y duplicarla garantizaría que tarjeta y filtro se
> desincronicen al primer cambio. Al ser puras, quedan además cubiertas por `kb-presets.test.ts` sin
> montar un componente.

### `src/hooks/use-debounced-value.ts` (NUEVO)

```ts
/** Devuelve `value` retrasado `delayMs`. Reinicia el temporizador en cada cambio. */
export function useDebouncedValue<T>(value: T, delayMs = 300): T;
```

`useState` + `useEffect` con `setTimeout` y `clearTimeout` en el *cleanup*. Sin dependencias nuevas.
Nombre de archivo kebab-case, como el vecino `src/hooks/use-mobile.tsx`. El único debounce que existía
en el repo estaba escrito inline en `admin-plans/components/PlanForm.tsx`; este hook no lo migra
(fuera de alcance), solo evita repetir el patrón.

### `components/KnowledgeToolbar.tsx` (NUEVO)

```ts
interface KnowledgeToolbarProps {
  texto: string;                                  // valor SIN debounce (controla el input)
  criteria: KbFilterCriteria;                     // criterios aplicados (texto ya debounced)
  resultCount: number;                            // para el aria-live
  onTextoChange: (v: string) => void;
  onTagChange: (v: KbTagFilter) => void;
  onEstadoChange: (v: KbEstadoFilter) => void;
  onClear: () => void;
}
```

- `<Input>` de shadcn envuelto en un contenedor `relative` con `<Search className="absolute left-3">`
  y `pl-9` (el `Input` vendorizado no tiene slot de adorno). Botón `✕` a la derecha solo si hay texto.
- Dos `<Select>` de shadcn (ya vendorizados): "Todos los tipos" y "Todos los estados". **No** se
  instalan `toggle-group`, `popover` ni `command` — el UI kit no crece para esto.
- Región `aria-live="polite"` con el número de resultados, para que el filtrado sea perceptible con
  lector de pantalla (el debounce lo hace invisible si no).
- Layout `flex flex-col gap-2 sm:flex-row sm:items-center`: el buscador se estira (`flex-1`) y los dos
  selectores quedan a la derecha; en móvil se apilan.
- Tokens semánticos exclusivamente; el componente hereda light/dark del `Input`/`Select` de shadcn.

### `components/KnowledgeGrid.tsx` — rama nueva

Props añadidas: `isFiltered: boolean` y `onClearFilters: () => void`. Cuarta rama, **después** de
`isLoading` e `isError` y **antes** de la grilla normal: si `documents.length === 0 && isFiltered`,
se pinta dentro del mismo `grid` una celda a ancho completo (`sm:col-span-2`) con
"**Sin resultados**" + una línea de ayuda + `<Button variant="outline" size="sm">Limpiar filtros</Button>`,
**seguida de la tarjeta "Agregar nuevo conocimiento"**, que nunca se oculta.

Se mantiene intacta la decisión de HU-KB-05: en `isError` el banner **sustituye** a la grilla (pintar
5 presets virtuales haría creer que el tenant no tiene conocimiento). Por eso la toolbar tampoco se
renderiza en ese estado.

### `pages/KnowledgeBasePage.tsx`

```ts
const [texto, setTexto] = useState('');
const [tag, setTag] = useState<KbTagFilter>('todos');
const [estado, setEstado] = useState<KbEstadoFilter>('todos');
const textoDebounced = useDebouncedValue(texto, 300);
const criteria: KbFilterCriteria = { texto: textoDebounced, tag, estado };

const documents   = data?.data ?? [];                 // crudos: isTitleTaken + isIndexingActive
const gridDocs    = buildKbGrid(documents);           // SIN filtrar
const progress    = computeKbProgress(gridDocs);      // ← SIEMPRE la lista sin filtrar
const visibleDocs = filterKbGrid(gridDocs, criteria); // ← solo para pintar
```

> **Trampa registrada.** `computeKbProgress` debe seguir recibiendo `gridDocs`. Si se le pasa
> `visibleDocs`, los denominadores (`X/2` y `Y/Z`) bajan al filtrar y los tests de
> `kb-presets.test.ts` que fijan esos denominadores se caen. El progreso describe el inventario, no
> la vista.

El `refetchInterval` sigue evaluándose sobre `query.state.data.data` (la lista cruda del API), sin
cambios. La toolbar se monta entre `RequiredPresetsBanner` y `KnowledgeGrid`, condicionada a
`!isError`.

> **Decisión: filtrado en cliente, sin paginar ni virtualizar.** `getKbDocuments` ya pide `limit: 50`,
> el tope del backend es 100 (`kb.validation.ts`) y el endpoint no expone parámetros de búsqueda ni
> orden. Un tenant real tiene decenas de documentos: añadir búsqueda en servidor obligaría a tocar
> validación, servicio, índices y tests para resolver un problema que no existe todavía. Si algún
> tenant supera ese orden de magnitud, se replantea con datos en mano.

---

## Bloque B — Conteo de versiones

### Backend — `kb.service.ts`

```ts
/**
 * Normaliza el contenido para decidir si un guardado cambia algo: recorta los extremos y colapsa
 * cualquier racha de whitespace a un solo espacio. NO baja a minúsculas ni altera los espacios
 * entre palabras más allá de eso: cambiar "Bogotá" por "bogotá" ES un cambio de conocimiento.
 */
export function normalizeContenido(texto: string): string {
  return texto.trim().replace(/\s+/g, ' ');
}
```

**`updateDocument`** — guard **antes de cualquier escritura**, justo tras el `findByIdScoped` que ya
resuelve el 404:

```ts
if (normalizeContenido(contenido) === normalizeContenido(existing.contenido ?? '')) {
  return mapKbDocumentToResponse(existing);   // no-op total
}
```

No se ejecuta el `findOneAndUpdateScoped` → **`updatedAt` no se toca** (Mongoose solo estampa el
timestamp en la escritura). Tampoco `$inc version`, ni `deleteManyScoped(KbChunk…)`, ni
`bumpKbVersion`, ni `kbIndexQueue.add`. Responde `200` con el documento tal cual está.

**`createDocument`, rama `existing`** — mismo guard antes del `findOneAndUpdateScoped`, con una
diferencia importante: hoy el `kbIndexQueue.add` está **fuera** del `if/else` y se ejecuta siempre
(`kb.service.ts`). El guard tiene que salir de la función con un `return`, no solo saltarse la
escritura, para que la re-subida idéntica **tampoco encole el job**.

El resto de la lógica queda intacta cuando el contenido sí difiere, incluido el `isFirstFill` que no
incrementa `version` en el primer llenado de un documento vacío.

> **Por qué normalizar solo whitespace.** El objetivo es no castigar al admin que abre el modal, no
> toca nada y guarda —o que añade un salto de línea suelto al final—. Cualquier normalización más
> agresiva (minúsculas, acentos, puntuación) haría que un cambio real de contenido pasara por "sin
> cambios" y la IA quedaría entrenada con texto viejo. Ante la duda, la comparación es conservadora:
> prefiere re-indexar de más antes que perder una edición.

### Frontend — `lib/kb-presets.ts`

```ts
/** Espejo exacto de normalizeContenido del backend (kb.service.ts). Debe cambiar en lockstep. */
export function normalizeContenido(texto: string): string;

/**
 * Versión con la que quedará el documento tras "Guardar e indexar", conocido el texto tecleado:
 *  - preset virtual                          → 1              (lo crea un POST)
 *  - contenido normalizado igual al guardado → doc.version    (no-op del backend, HU-KB-06)
 *  - documento con contenido previo vacío    → doc.version    (isFirstFill)
 *  - resto                                   → doc.version + 1
 */
export function nextVersion(doc: IKbDocument, contenido: string): number;
```

La firma cambia (hoy es `nextVersion(doc)`); su único llamador es `leyendaVersion` en
`KnowledgeDocumentDialog.tsx`.

### Frontend — cableado de la leyenda

**Decisión: la leyenda se queda en el `DialogDescription` del header** (donde el usuario ya la
espera). Para que conozca el texto tecleado, el estado `contenido` **sube** del editor al modal. Para
conservar el reset por documento sin añadir un `useEffect`, se extrae un subcomponente interno que
hereda la `key` que hoy lleva el editor:

```tsx
// KnowledgeDocumentDialog.tsx
<DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
  {target !== null && (
    <DocumentDialogBody
      key={doc?.id ?? 'nuevo'}      // ← la key se sube del editor al body: cada apertura arranca limpia
      doc={doc}
      documents={documents}
      onDone={() => onOpenChange(false)}
    />
  )}
</DialogContent>

// DocumentDialogBody (mismo archivo, privado)
const [contenido, setContenido] = useState(doc?.contenido ?? '');
return (
  <>
    <DialogHeader>
      <DialogTitle>{doc ? doc.titulo : 'Nuevo conocimiento'}</DialogTitle>
      <DialogDescription>{leyendaVersion(doc, contenido)}</DialogDescription>
    </DialogHeader>
    <KnowledgeUploadEditor doc={doc} documents={documents}
      contenido={contenido} onContenidoChange={setContenido} onDone={onDone} />
  </>
);
```

`leyendaVersion(doc: IKbDocument | undefined, contenido: string): string` gana un cuarto texto:

| Situación | Texto |
|---|---|
| Creación libre | copy de creación actual |
| Preset virtual | `Aún sin contenido. Se guardará como v1.` |
| Primer llenado (`doc.contenido` vacío) | `Versión v{n}. El primer contenido no crea una versión nueva.` |
| **Sin cambios reales** (nuevo) | `Versión v{n}. Sin cambios por guardar.` |
| Texto modificado | `Versión v{n}. Al guardar pasará a v{n+1}.` |

`KnowledgeUploadEditor` recibe `contenido: string` y `onContenidoChange: (v: string) => void` y deja
de tener ese `useState`. **`titulo` sigue siendo suyo** (solo existe en creación libre, donde no hay
leyenda de versión que dependa de él). El resto —contador de caracteres, `CONTENIDO_MAX`,
`counterColor`, placeholder por `proposito`, regla de colisión, mutaciones de guardar y borrar— no
cambia.

---

## Bloque C — Borrado real de presets (soft-delete)

### Modelo y tipos

```ts
// kb-document.model.ts
// Soft-delete de presets: eliminar un preset no obligatorio lo oculta en vez de borrarlo, para que
// el merge del frontend no lo reponga como tarjeta virtual. El índice único {tenantId, titulo} sigue
// vigente sobre el documento oculto: re-crear ese título es una RE-ALTA, no un duplicado.
oculto: { type: Boolean, default: false },
```

`kb.types.ts`: `oculto: boolean` en `IKbDocument` y en `IKbDocumentResponse`.
`mapKbDocumentToResponse`: `oculto: doc.oculto ?? false` (mismo patrón defensivo que ya usa con
`isPreset` y `obligatorio`, para documentos anteriores a la migración).
`seedPresetDocuments`: `oculto: false` explícito en el `createScoped`.

**Sin migración de datos.** Los documentos existentes no tienen el campo; `?? false` en el mapper y
el `default: false` del schema los tratan como visibles. Ninguna query filtra por `oculto` en el
servidor, así que no hace falta backfill ni índice nuevo.

### `deleteDocument` — nueva forma

```ts
export async function deleteDocument(tenantId, id): Promise<DeleteKbDocumentResponse> {
  const existing = await findByIdScoped(KbDocument, tenantId, id).lean<…>().exec();
  if (!existing) throw new AppError('No se encontró el documento.', 404);

  // (a) Validación real, no solo el botón oculto en la UI.
  if (existing.obligatorio === true) {
    throw new AppError('No puedes eliminar un conocimiento obligatorio.', 400);
  }

  await deleteManyScoped(KbChunk, tenantId, { documentId: id });

  // (b) Preset → soft-delete; documento libre → borrado duro (comportamiento previo).
  if (esPreset(existing)) {
    await findOneAndUpdateScoped(KbDocument, tenantId, { _id: id }, {
      $set: { oculto: true, contenido: '', estadoIndexacion: 'pendiente', chunkCount: 0 },
      $unset: { error: 1 },
    });
  } else {
    await findOneAndDeleteScoped(KbDocument, tenantId, { _id: id });
  }

  await bumpKbVersion(tenantId);
  return { deleted: true };
}
```

> **`esPreset` se decide por TÍTULO, no solo por `isPreset`.**
> ```ts
> const PRESET_TITULOS: ReadonlySet<string> = new Set(PRESET_DOCUMENTS.map((p) => p.titulo));
> const esPreset = (d: IKbDocument): boolean => d.isPreset === true || PRESET_TITULOS.has(d.titulo);
> ```
> Un preset re-creado por `POST` nace `isPreset: false`: el `createDocumentSchema` solo acepta
> `titulo` y `contenido`, y el schema aplica el default (el bug que HU-KB-01-V3 parcheó en el
> frontend re-imponiendo la identidad por título en `mergePresetsWithDocuments`). Como el merge repone
> la tarjeta **por título**, el soft-delete tiene que usar el mismo criterio: con `isPreset` a secas,
> borrar un preset recreado lo haría reaparecer exactamente igual que hoy.

`contenido: ''` en el `$set` es deliberado: un preset oculto no debe conservar texto que ya no
alimenta a la IA (sus chunks acaban de borrarse). Si se resucita, se resucita vacío.

### `createDocument` — re-alta

En la rama `existing`, el `$set` gana `oculto: false`. Re-subir un título oculto lo devuelve al panel
sobre el **mismo documento** —el índice único `{ tenantId, titulo }` no se ha liberado, así que no
hay forma de crear un duplicado—. Nota de orden: el guard de no-op del bloque B se evalúa **antes**;
un documento oculto siempre tiene `contenido: ''`, de modo que cualquier re-alta con texto real
difiere y entra por el camino normal (re-versiona, encola y desoculta). Una re-alta con contenido
vacío no llega: el `createDocumentSchema` exige `contenido.min(1)`.

### Contrato del listado

`listDocuments` **no filtra** por `oculto`. El DTO expone el flag y el frontend decide.

> **Por qué no se filtra en el servidor.** El frontend reconstruye la grilla desde `PRESET_META`. Si
> el listado ocultara el documento, `mergePresetsWithDocuments` no podría distinguir "este preset
> nunca se creó" de "este preset se eliminó" y volvería a fabricar la tarjeta virtual — justo el bug
> que esta HU corrige. El flag tiene que viajar.
>
> Consecuencia menor y aceptada: `total` (de `countScoped`) incluye los ocultos. Ningún contador de
> la UI lo usa —`PresetProgress` cuenta sobre la grilla— y el `limit: 50` tiene margen de sobra.
>
> Los documentos ocultos tampoco son alcanzables por RAG: sus `KbChunk` se borran, y
> `vectorSearchScoped` solo consulta la colección de chunks.

### Frontend — `lib/kb-presets.ts`

- `mergePresetsWithDocuments`: al buscar el documento real de cada preset, **ignora** los que tengan
  `oculto === true`, y en ese caso **no** genera el virtual de reposición: devuelve `null` y la
  categoría se cae de la lista. La firma pública sigue devolviendo `IKbDocument[]`, ahora de longitud
  ≤ 5 (antes siempre 5). Se documenta en el JSDoc, porque `computeKbProgress` deriva sus
  denominadores de ahí: ocultar un preset opcional baja `Z` de `Y/Z`, que es lo correcto — ya no es
  un documento pendiente de llenar. El denominador de obligatorios **no** puede moverse: los
  obligatorios no se pueden ocultar (criterio 13).
- `buildKbGrid`: los "libres" excluyen también `doc.oculto` (defensivo; hoy un libre siempre se borra
  duro, pero la lista no debe depender de esa política).
- `isTitleTaken`: **sin cambios** — un título oculto sigue ocupado, porque el índice único no se
  liberó y crear con él es una re-alta.
- `types/domain.ts` del frontend: `oculto: boolean`.

### Documentación a actualizar

- `docs/data-model.md` → `kb_documents`: añadir `oculto: Boolean` con su nota de soft-delete y,
  aprovechando, `obligatorio: Boolean` (existe en el modelo desde HU-KB-01-V2 y nunca se documentó).
- `docs/specs/HU-KB-05-rediseno-kb/spec.md` → **criterio 11**. Hoy dice que la tarjeta del preset
  eliminado "reaparece en la grilla como virtual … el comportamiento actual de
  `mergePresetsWithDocuments`, conservado". Se **añade una nota de superación** apuntando a
  HU-KB-06; no se reescribe el criterio ni el historial de la HU cerrada.

### Multi-tenancy

El campo nuevo no abre superficie cross-tenant: `tenantId` sigue `required + index`, toda operación
pasa por `*Scoped` con el `tenantId` del token y no hay rutas ni middlewares nuevos. Pero el bloque
añade ramas nuevas de escritura sobre `KbDocument`, así que la HU lleva su test de aislamiento
(checklist §9 de `docs/multi-tenancy.md`).

---

## Bloque D — Carrera del worker

En `processKbIndexJob`, entre el `provider.embedTexts(...)` y el bucle que crea los chunks:

```ts
// embedTexts tarda segundos: el documento pudo borrarse, ocultarse o re-versionarse mientras tanto.
// Sin esta re-validación quedan chunks huérfanos que $vectorSearch SÍ recupera — la IA respondería
// con conocimiento que el admin cree eliminado.
const vigente = await findByIdScoped(KbDocument, tenantId, documentId).lean<IKbDocument | null>().exec();
if (!vigente || vigente.version !== version || vigente.oculto === true) {
  logger.info('kb-index: documento cambió durante el embedding, se descarta', {
    tenantId, documentId, jobVersion: version,
    motivo: !vigente ? 'eliminado' : vigente.oculto === true ? 'oculto' : 'version-obsoleta',
  });
  return;                       // sin crear chunks y SIN escribir estado
}
```

Se sale con `return` limpio (no se lanza): el job no debe reintentarse, el documento ya no interesa.
Tampoco se escribe `estadoIndexacion`: el documento puede no existir, y si fue re-versionado hay otro
job en vuelo que es el dueño legítimo de su estado.

**Limpieza defensiva** tras crear los chunks y antes del `$set: { estadoIndexacion: 'indexado' }`:

```ts
const sigueVivo = await findByIdScoped(KbDocument, tenantId, documentId).lean<IKbDocument | null>().exec();
if (!sigueVivo || sigueVivo.oculto === true) {
  await deleteManyScoped(KbChunk, tenantId, { documentId }).exec();
  logger.warn('kb-index: documento eliminado durante el guardado, chunks descartados', { tenantId, documentId });
  return;
}
```

> **Riesgo residual aceptado.** `deleteDocument` no es transaccional (borra chunks y después toca el
> documento), así que la ventana no se cierra al 100 %: un borrado que caiga entre la última
> comprobación y el `createScoped` final seguiría dejando chunks. Con las dos guardas la ventana pasa
> de **segundos** (la llamada de red a Gemini) a **milisegundos**, y el peor caso queda acotado a una
> carrera de escritura simultánea. Cerrarla del todo exige una sesión transaccional de Mongo sobre
> `KbDocument` + `KbChunk`, que es una decisión de arquitectura fuera del alcance de esta HU.
>
> No se cambia el bucle `for` de `createScoped` por un `insertMany`: sería otra mejora, y mezclarla
> aquí enturbiaría la revisión del fix de carrera.

---

## Notas

- **`normalizeContenido` está duplicada a propósito** (backend + frontend). `packages/shared/` hoy
  solo tiene `tenant.types.ts` y no está cableado en el frontend; montar el paquete compartido para
  una función de una línea es peor negocio que un test en cada lado que fije la misma semántica. Se
  documenta el acoplamiento en el JSDoc de ambas: **cambian en lockstep**.
- **El `drift` de `proposito`** entre `PRESET_DOCUMENTS` (backend) y `PRESET_META` (frontend) sigue
  siendo deuda de HU-KB-05, y el bloque C lo agrava un poco: ahora también `PRESET_TITULOS` depende
  de que las dos listas coincidan por título. Renombrar un preset en un solo lado rompería el
  soft-delete además del merge. Se registra; unificar los catálogos merece su propia HU.
- **`updateDocument` mantiene su lectura defensiva.** `existing.contenido ?? ''` en el guard cubre
  documentos legacy sin el campo; hoy la línea `existing.contenido.trim()` lo asume presente.
- **Orden de los guards en `deleteDocument`:** el 404 primero, luego el 400 de `obligatorio`, y solo
  después cualquier escritura. Un tenant B que apunte al `id` de un obligatorio del tenant A recibe
  `404` (no `400`): el aislamiento se resuelve antes que la regla de negocio y no filtra la
  existencia del documento ajeno.
- **`AppError` no tiene campo `code`**, solo `statusCode` + `details` opcional. El 400 del criterio 13
  usa la firma de dos argumentos, como el resto del feature.

## Verificación

- `pnpm --filter @sofiapp/api typecheck` (`tsc --noEmit`) — el paquete se llama `@sofiapp/api`, no
  `backend`.
- `pnpm --filter @sofiapp/api test` — incluye los tests de aislamiento del bloque C y los 3 de
  carrera del D.
- `pnpm --filter @sofiapp/web build` (incluye `tsc --noEmit`).
- `pnpm --filter @sofiapp/web lint` (`--max-warnings 0`).
- `pnpm --filter @sofiapp/web test` — todos los de `knowledge-base` en verde.
- `grep -r "bg-\[#" apps/frontend/src/features/knowledge-base` → sin resultados.
- Checklist de PR de `docs/multi-tenancy.md` §9.
