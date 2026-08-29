# HU-KB-06 — Tasks (checklist ejecutable)

> Claude Code: ejecuta en orden. Marca cada casilla al terminar. No cierres el feature hasta que
> TODO esté en verde. Los bloques A–D son los del `spec.md`; el orden de abajo es de dentro hacia
> fuera (backend → worker → lógica pura del frontend → componentes → página), no por bloque.

## Rama

- [x] **NO crear `feat/HU-KB-06`.** Se trabaja directamente sobre **`feat/HU-KB-05`**, por indicación
      explícita del encargo. Verificar antes de empezar: `git branch --show-current` → `feat/HU-KB-05`
      y árbol limpio (el commit `be9813f feat(web): unify knowledge base into single card grid
      (HU-KB-05)` ya aisló el diff de la HU anterior).

## Implementación — Backend

> Orden del patrón de 6 archivos, saltándose los que no cambian. `kb.validation.ts`,
> `kb.controller.ts` y `kb.routes.ts` **no se tocan**: `oculto` nunca entra por el borde HTTP, solo
> sale en la respuesta, y no hay endpoints ni middlewares nuevos.

- [x] `kb.types.ts` — `oculto: boolean` en `IKbDocument` y en `IKbDocumentResponse`, con comentario
      de una línea sobre el soft-delete.
- [x] `kb-document.model.ts` — `oculto: { type: Boolean, default: false }`. **Sin índice nuevo** (no
      hay query que filtre por el campo) y **sin migración de datos** (el default y el `?? false` del
      mapper cubren los documentos previos).
- [x] `kb.service.ts` — **bloque B**:
  - [x] `export function normalizeContenido(texto: string): string` → `texto.trim().replace(/\s+/g, ' ')`,
        con JSDoc explicando por qué **no** baja a minúsculas y que es espejo de la del frontend.
  - [x] `updateDocument`: guard de no-op justo después del `findByIdScoped`/404 y **antes** de
        cualquier escritura → `return mapKbDocumentToResponse(existing)`. Sin `$inc`, sin
        `deleteManyScoped`, sin `bumpKbVersion`, sin `kbIndexQueue.add`, sin tocar `updatedAt`.
  - [x] `createDocument`, rama `existing`: mismo guard, con **`return` que sale de la función** — el
        `kbIndexQueue.add` de hoy está fuera del `if/else` y se ejecuta siempre.
- [x] `kb.service.ts` — **bloque C**:
  - [x] `PRESET_TITULOS: ReadonlySet<string>` derivado de `PRESET_DOCUMENTS`, y el helper
        `esPreset(doc) = doc.isPreset === true || PRESET_TITULOS.has(doc.titulo)`.
        **Por título, no solo por `isPreset`**: un preset recreado por POST nace `isPreset: false` y
        el merge del frontend lo repone por título — decidir solo por el flag reproduce el bug.
  - [x] `deleteDocument`: `AppError('No puedes eliminar un conocimiento obligatorio.', 400)` si
        `existing.obligatorio === true`, **después** del 404 (el aislamiento se resuelve primero y no
        filtra la existencia de un documento ajeno).
  - [x] `deleteDocument`: borra chunks siempre; si `esPreset(existing)` → `$set { oculto: true,
        contenido: '', estadoIndexacion: 'pendiente', chunkCount: 0 }` + `$unset error` (NO borra el
        documento); si no → `findOneAndDeleteScoped` como hasta ahora. `bumpKbVersion` en ambos casos.
  - [x] `createDocument`, rama `existing`: `oculto: false` en el `$set` (re-alta).
  - [x] `mapKbDocumentToResponse`: `oculto: doc.oculto ?? false`.
  - [x] `seedPresetDocuments`: `oculto: false` explícito.
- [x] Verificar que **ninguna** query nueva escapa del repositorio tenant-safe: todo pasa por
      `findByIdScoped` / `findOneAndUpdateScoped` / `findOneAndDeleteScoped` / `deleteManyScoped`, con
      el `tenantId` que llega como argumento desde el controller (`req.user!.tenantId`).

## Implementación — Worker (bloque D)

- [x] `workers/kb-index.processor.ts` — re-validación **después de `embedTexts` y antes** del bucle de
      `createScoped(KbChunk…)`: `findByIdScoped`; si no existe, `version` cambió u `oculto === true`
      → `logger.info` con el motivo y `return` **sin crear chunks y sin escribir estado** (el
      documento puede no existir, y si se re-versionó hay otro job dueño de su estado).
- [x] `workers/kb-index.processor.ts` — limpieza defensiva tras crear los chunks y antes del
      `$set: { estadoIndexacion: 'indexado' }`: si el documento ya no está u quedó oculto,
      `deleteManyScoped(KbChunk, tenantId, { documentId })` + `logger.warn` + `return`.
- [x] Comentario en el código señalando el **riesgo residual aceptado**: `deleteDocument` no es
      transaccional, así que la ventana pasa de segundos a milisegundos pero no se cierra del todo.
      **No** convertir el bucle `for` en `insertMany` (mejora aparte, enturbiaría la revisión).

## Implementación — Frontend

> Orden: skills de diseño → lógica pura → hook → toolbar → tarjeta → grilla → modal → editor →
> página.

- [x] Invocar `emil-design-eng`, `impeccable:impeccable` y `frontend-design:frontend-design`
      **antes** de escribir o modificar cualquier componente (regla §7 del `CLAUDE.md` raíz).
      **Parcial:** `emil-design-eng` e `impeccable:impeccable` siguen sin estar registradas en este
      entorno (`Unknown skill`), igual que en HU-KB-04 y HU-KB-05. Se invocó
      `frontend-design:frontend-design` antes de escribir la toolbar y el estado vacío, y se aplicó
      su propia regla de que el brief manda: al ser una pantalla interna dentro de un UI kit ya
      establecido, la consistencia con shadcn y los tokens pesa más que una identidad visual propia.
      De la skill se tomó lo transferible:
      · **Concentrar la audacia en un solo elemento** — la tarjeta `bg-primary` sigue siendo el único
        elemento enfático; la toolbar es *chrome* deliberadamente callado, sin chips ni color propio.
      · **El vocabulario es señalización** — las etiquetas del filtro repiten palabra por palabra las
        de las tarjetas ("Requerido", "Predefinido", "Indexado", "Fallido", "Sin llenar"), para que
        el admin pueda predecir qué va a filtrar. La única etiqueta nueva es "En proceso", que agrupa
        dos estados y por eso necesita un nombre paraguas.
      · **Un estado vacío es una invitación a actuar, no un lamento** — "Sin resultados" +
        "Ajusta el nombre o los filtros" + botón, y la acción de crear se queda visible: "no existe
        lo que buscas" y "puedes crearlo" son la misma conversación.
      · **Quitar un accesorio** — se eliminó el `onClear` de la toolbar: el botón "Limpiar filtros"
        del estado vacío ya cubre ese caso, y la ✕ del buscador solo limpia el texto.
- [x] `types/domain.ts` — `oculto: boolean` en `IKbDocument`.
- [x] `lib/kb-presets.ts` — **bloque A**:
  - [x] Mover `cardStatus` y `cardBorder` desde `KnowledgeCard.tsx` (hoy privadas) y **exportarlas**,
        junto con el tipo `CardStatus`. Sin cambiar su lógica.
  - [x] `KbTagFilter`, `KbEstadoFilter`, `KbFilterCriteria`, `EMPTY_FILTERS`, `hasActiveFilters`.
  - [x] `filterKbGrid(docs, criteria)` — AND de los tres criterios, con la tabla de mapeos del
        `plan.md`. Texto vía `normalizeTitulo` (ya existente). "En proceso" = `procesando` +
        `pendiente`, que gracias a `cardStatus` es exactamente el conjunto de `isIndexingActive`.
- [x] `lib/kb-presets.ts` — **bloque B**: `normalizeContenido` (espejo del backend, con el JSDoc de
      lockstep) y `nextVersion(doc, contenido)` con la rama nueva de "sin cambios".
- [x] `lib/kb-presets.ts` — **bloque C**: `mergePresetsWithDocuments` ignora los documentos con
      `oculto === true` **y no repone el virtual** (la lista pasa a tener longitud ≤ 5; documentarlo
      en el JSDoc porque `computeKbProgress` deriva de ahí su denominador `Z`). `buildKbGrid` excluye
      también los libres ocultos. **`isTitleTaken` no cambia**: el título oculto sigue ocupado.
- [x] `src/hooks/use-debounced-value.ts` — `useDebouncedValue<T>(value, delayMs = 300)`, `useState` +
      `useEffect` con `clearTimeout` en el cleanup. Sin dependencias nuevas.
- [x] `components/KnowledgeToolbar.tsx` — `Input` con icono `Search` (contenedor `relative` + `pl-9`;
      el `Input` vendorizado no tiene slot de adorno) y botón de limpiar; **dos `Select` de shadcn**,
      ya vendorizados. **No** instalar `toggle-group`, `popover` ni `command`. Región
      `aria-live="polite"` con el número de resultados. `flex-col` en móvil, `sm:flex-row` arriba.
      Tokens semánticos, cero `bg-[#...]`, terminado en light y dark.
- [x] `components/KnowledgeCard.tsx` — importa `cardStatus`/`cardBorder` de `lib/kb-presets`.
      **No tocar el `aria-label`** (`Editar|Completar <título>`): es el selector de los 17 tests de
      `KnowledgeBasePage.test.tsx`.
- [x] `components/KnowledgeGrid.tsx` — props `isFiltered` y `onClearFilters`; rama de resultados
      vacíos (después de `isLoading`/`isError`): celda `sm:col-span-2` con "Sin resultados" + botón
      "Limpiar filtros", **seguida de la tarjeta "Agregar nuevo conocimiento"**, que nunca se oculta.
      El banner de `isError` sigue **sustituyendo** a la grilla, sin cambios.
- [x] `components/KnowledgeDocumentDialog.tsx` — extraer `DocumentDialogBody` (privado, mismo
      archivo) dueño del estado `contenido`, con la `key={doc?.id ?? 'nuevo'}` que hoy lleva el
      editor. `leyendaVersion(doc, contenido)` con los 5 textos de la tabla del `plan.md`, incluido el
      nuevo "Sin cambios por guardar."
- [x] `components/KnowledgeUploadEditor.tsx` — `contenido` pasa a props controladas
      (`contenido: string`, `onContenidoChange: (v: string) => void`); pierde su `useState` de
      contenido. `titulo` sigue siendo estado local. Sin cambios en contador, `CONTENIDO_MAX`,
      placeholder por `proposito`, regla de colisión ni mutaciones.
- [x] `pages/KnowledgeBasePage.tsx` — estado `texto`/`tag`/`estado`, `useDebouncedValue(texto, 300)`,
      `visibleDocs = filterKbGrid(gridDocs, criteria)`. **`computeKbProgress` sigue recibiendo
      `gridDocs` sin filtrar** (si recibe la filtrada, los denominadores se desploman y rompen los
      tests que los fijan). Toolbar entre `RequiredPresetsBanner` y `KnowledgeGrid`, condicionada a
      `!isError`. `refetchInterval` intacto sobre la lista cruda.

## Documentación

- [x] `docs/data-model.md` → `kb_documents`: añadir `oculto: Boolean` con su nota de soft-delete y
      `obligatorio: Boolean` (existe desde HU-KB-01-V2 y nunca se documentó).
- [x] `docs/specs/HU-KB-05-rediseno-kb/spec.md` → **criterio 11**: añadir nota de **superado por
      HU-KB-06**. No reescribir el criterio ni el historial de la HU cerrada.

## Tests — Backend (Vitest)

- [x] `kb.service.test.ts` — **bloque B**. Actualizar la suite
      `updateDocument — bump de Tenant.kbVersion (HU-KB-03)` (codifica la semántica vieja) y añadir:
  - [x] Guardar contenido idéntico → `version`, `chunkCount`, `updatedAt` y `kbVersion` **sin
        cambios**, `KbChunk` intactos y `mockAdd` **sin llamadas**.
  - [x] Solo-whitespace (`"  a\n\n b "` vs `"a b"`) → no-op.
  - [x] Cambio solo de mayúsculas (`"Bogotá"` → `"bogotá"`) → **sí** re-versiona (la normalización no
        baja capitalización).
  - [x] `createDocument` re-subiendo el mismo título con contenido idéntico → sin `$inc version` y
        **sin encolar** el job.
  - [x] El camino con contenido distinto conserva la semántica actual, incluido `isFirstFill`.
- [x] `kb.service.test.ts` — **bloque C**:
  - [x] `deleteDocument` de un obligatorio → `AppError` 400 y el documento **sigue existiendo**.
  - [x] `deleteDocument` de un preset no obligatorio → documento presente con `oculto: true`,
        `contenido: ''`, `chunkCount: 0`, cero `KbChunk` y `kbVersion` incrementado.
  - [x] `deleteDocument` de un preset **recreado por POST** (`isPreset: false`, título de preset) →
        también se oculta (cubre el `esPreset` por título).
  - [x] `deleteDocument` de un documento libre → borrado duro, como hasta ahora.
  - [x] `createDocument` re-subiendo el título de un preset oculto → `oculto: false`, mismo `_id`, un
        solo documento en la colección.
  - [x] `listDocuments` **sigue devolviendo** los ocultos, con `oculto: true` en el DTO.
- [x] `kb.service.test.ts` — **aislamiento multi-tenant** (checklist §9):
  - [x] `deleteDocument(tenantB, idDeA)` → `AppError` 404, y el documento de A intacto (visible y sin
        ocultar), incluso si es obligatorio (el 404 gana al 400).
  - [x] Ocultar un preset del tenant A no altera el listado del tenant B.
- [x] `kb.routes.test.ts`:
  - [x] El caso de la línea que hoy espera `version: 2` en `PATCH` debe enviar contenido **distinto**.
  - [x] `PATCH` con contenido idéntico → `200` con `version` sin cambiar.
  - [x] `DELETE` de un obligatorio → **400** con el mensaje de `AppError`.
  - [x] `DELETE` cross-tenant → `404` (aislamiento por ruta).
- [x] `kb-index.processor.test.ts` — **bloque D** (el archivo ya inyecta un `ILlmProvider` falso):
  - [x] Documento **eliminado** durante `embedTexts` → cero `KbChunk` creados.
  - [x] Documento marcado **`oculto`** durante la ventana → cero `KbChunk`.
  - [x] Documento re-versionado durante la ventana → cero `KbChunk` y sin pisar el estado.
  - [x] Camino feliz, reindexado idempotente, versión obsoleta y fallo del proveedor → **sin cambios**.

## Tests — Frontend (Vitest + RTL)

- [x] `src/hooks/use-debounced-value.test.ts` — con fake timers: no emite antes del delay, emite
      después, y reinicia el temporizador en cambios sucesivos.
- [x] `lib/kb-presets.test.ts`:
  - [x] `cardStatus`/`cardBorder` — los 6 estados, ahora que son públicas y puras.
  - [x] `filterKbGrid` — cada tag; cada estado; combinación texto+tag+estado; texto con acentos y
        distinta capitalización (vía `normalizeTitulo`); criterios vacíos → lista completa.
  - [x] `normalizeContenido` — trim, saltos de línea, tabs, espacios múltiples; **no** baja a
        minúsculas.
  - [x] `nextVersion(doc, contenido)` — actualizar los 4 casos existentes a la firma nueva y añadir:
        contenido igual normalizado → misma versión; cambio solo de whitespace → misma versión.
  - [x] `mergePresetsWithDocuments`/`buildKbGrid` con un preset `oculto: true` → la categoría
        **desaparece** y **no** vuelve como virtual; `computeKbProgress` baja `Z` en consecuencia y
        deja `X/2` intacto.
  - [x] `isTitleTaken` con un documento oculto → sigue `true`.
- [x] `components/KnowledgeToolbar.test.tsx` — teclear dispara `onTextoChange`; el botón de limpiar
      aparece solo con texto y llama a `onClear`; cambiar cada `Select` emite el valor esperado.
- [x] `pages/KnowledgeBasePage.test.tsx`:
  - [x] Escribir en el buscador reduce las tarjetas visibles (avanzando los timers del debounce) y la
        tarjeta "Agregar nuevo conocimiento" **sigue presente**.
  - [x] Filtro sin coincidencias → "Sin resultados" + botón que restaura la grilla completa.
  - [x] Los dos contadores de `PresetProgress` **no cambian** al filtrar.
  - [x] La leyenda del modal muestra "Sin cambios por guardar" al abrir un documento con contenido y
        pasa a "pasará a v{n+1}" al teclear (actualizar los asserts de leyenda existentes).
  - [x] Un preset con `oculto: true` en la respuesta del API **no** tiene tarjeta en la grilla.

## Verificación final

> **Corrección del filtro de pnpm.** El paquete del backend se llama `@sofiapp/api`, no `backend`:
> `pnpm --filter backend …` responde `No projects matched the filters`. Los comandos reales son
> `pnpm --filter @sofiapp/api typecheck|test`. El `CLAUDE.md` raíz tiene el nombre viejo.

- [x] `pnpm --filter @sofiapp/api typecheck` sin errores.
- [x] `pnpm --filter @sofiapp/api test` en verde: **57 archivos, 447 tests**, incluidos los de
      aislamiento del bloque C y los 3 de carrera del D.
- [x] `pnpm --filter @sofiapp/web build` sin errores (incluye `tsc --noEmit`).
- [x] `pnpm --filter @sofiapp/web lint` en verde (`--max-warnings 0`).
- [x] `pnpm --filter @sofiapp/web test`: los 4 archivos de `knowledge-base` + el del hook en verde —
      **82 tests** del feature (47 de `kb-presets`, 30 de `KnowledgeBasePage`, 5 de
      `KnowledgeToolbar`) más 4 de `use-debounced-value`. Total de la suite: 168 en verde.
      **Fuera de alcance, documentado:** `src/features/tags/components/TagSelector.test.tsx` sigue
      rojo con **9 fallos** (`Tooltip` must be used within `TooltipProvider`) — preexistente y ajeno
      a esta HU; `git status apps/frontend/src/features/tags` está vacío. No se tocó.
- [x] `grep -r "bg-\[#" apps/frontend/src/features/knowledge-base` sin resultados (también en
      `src/hooks`).
- [x] `git status` sin `*.png`/`*.jpg` colados (no se generaron capturas).
- [x] Checklist de PR de `docs/multi-tenancy.md` §9 completo:
      queries vía `*Scoped` · `tenantId` del token (los controllers no cambiaron) · `KbDocument`
      conserva `tenantId` required+indexado y el campo nuevo no añade query alguna · `requireTenant`
      tras `authenticateJWT` en las 4 rutas, sin cambios · **tests de aislamiento añadidos**: tenant
      B no puede ocultar ni borrar un documento de A (404), el 404 gana al 400 sobre un obligatorio
      ajeno, y ocultar un preset de A no altera el listado de B.
- [ ] Revisión visual en **light y dark**.
      **No realizado**, igual que en HU-KB-04/05: requiere el backend real contra MongoDB/Redis y las
      credenciales viven en `apps/backend/.env`, sin acceso de lectura en este entorno; tampoco hay
      MCP de Playwright disponible. Verificación sustitutiva: (a) `grep` sin una sola utilidad de
      color arbitraria; (b) revisión clase por clase de lo tocado — la toolbar usa solo `Input` y
      `Select` de shadcn más tokens semánticos (`text-muted-foreground`, `hover:bg-muted`,
      `focus:ring-ring/40`), y el estado vacío `border-dashed border-border bg-card`, todos definidos
      en `:root` y `.dark`; `cardBorder` se movió **sin tocar sus clases**, que ya tenían rama
      `dark:`. (c) 82 tests RTL sobre el feature. **Queda pendiente una pasada visual humana antes
      del merge.**
- [x] Actualizar `**Estado:**` del `spec.md` a `implementado`.

## Definición de "hecho"

El admin abre `/settings/knowledge`, escribe tres letras y la grilla se reduce a lo que busca;
combina tipo y estado para ver, por ejemplo, solo los requeridos que le faltan, y si no hay
coincidencias lee "Sin resultados" con un botón para limpiar — sin que los contadores de arriba se
muevan. Abre una tarjeta, no toca el texto y el modal le dice "sin cambios por guardar"; si guarda
igual, versión, fecha y fragmentos se quedan donde estaban y la IA no se re-entrena por nada. Elimina
una categoría predefinida que no usa y desaparece de verdad, también tras recargar; si la quiere de
vuelta, la crea con el mismo título y recupera su tarjeta. Un intento de borrar un conocimiento
obligatorio se rechaza en el servidor, no solo escondiendo el botón. Y ningún fragmento de lo
eliminado puede volver a aparecer en una respuesta de la IA, ni siquiera si el borrado ocurrió
mientras el worker estaba a mitad de indexarlo.
