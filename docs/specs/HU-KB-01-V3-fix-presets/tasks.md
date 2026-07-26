# HU-KB-01-V3 — Tasks (checklist ejecutable)

> Fix de 2 bugs en el módulo KB. Cambios quirúrgicos sobre la slice `kb` existente. No cerrar hasta
> que typecheck, tests y build/lint estén en verde.

## 1. Backend — Bug 2 (versión condicional en primer llenado)
- [x] `kb.service.ts` · `updateDocument()`: tipar `existing` con `.lean<(IKbDocument & { _id })>()`;
      calcular `isFirstFill = !existing.contenido || existing.contenido.trim().length === 0`; aplicar
      `$inc: { version: 1 }` **solo** si `!isFirstFill` (spread condicional). `$set`, `$unset`, el
      borrado de chunks y el re-encolado del job quedan igual.
- [x] `kb.service.ts`: docstring de `updateDocument` documenta que el primer llenado deja `version: 1`.

## 2. Frontend — Bug 1 (5 tarjetas de preset siempre visibles)
- [x] `lib/kb-presets.ts`: `interface PresetMeta`; constante `PRESET_META` (5 presets con `proposito`
      y `obligatorio`); `PRESET_ORDER` derivado de `PRESET_META`; `VIRTUAL_PRESET_ID_PREFIX` +
      `isVirtualPresetId()`; `mergePresetsWithDocuments(documents)` (real por título o virtual vacío).
- [x] `components/PresetKnowledgeBar.tsx`: usar `mergePresetsWithDocuments(documents)` en vez del
      `filter(isPreset).sort(...)`; retorno siempre `React.ReactElement` (se elimina el guard `null`).
- [x] `components/KnowledgeUploadEditor.tsx`: `isVirtualPreset = isVirtualPresetId(document?.id)`;
      `isEdit = document && !isVirtualPreset`; `mutationFn` usa `createKbDocument` cuando no es edición;
      `onSuccess` cierra con toast + `onDone()` también para el preset virtual; título bloqueado y
      `proposito` como placeholder en modo preset virtual.
- [x] `pages/KnowledgeBasePage.tsx`: comentarios de intención (preset virtual → editor; tabla se
      alimenta de la lista cruda). Sin cambios de lógica: el editor auto-detecta el preset virtual.

## 3. Tests (Vitest)
- [x] `kb.service.test.ts`: nuevo test "primer llenado de un preset vacío mantiene version 1, limpia
      chunks y encola el job" (crea preset vacío con `createScoped`, chunk residual, verifica `v1`,
      chunks vacíos y `mockAdd` con `version: 1`).
- [x] `kb.service.test.ts`: nuevo test de regresión "preset vacío → primer llenado (v1) → segunda
      edición (v2)".
- [x] `kb.service.test.ts`: el test existente de re-versión (contenido real `v1 → v2`) se mantiene sin
      cambios (sigue siendo correcto).
- [x] `kb.routes.test.ts`: nuevo test "primer llenado de un preset vacío → 200 y versión 1".

## 4. Fix V3.1 — Barra de progreso sobre lista fusionada
- [x] `pages/KnowledgeBasePage.tsx`: importar `mergePresetsWithDocuments`; cambiar (ubicado por el
      texto `computeKbProgress(`) `computeKbProgress(documents)` →
      `computeKbProgress(mergePresetsWithDocuments(documents))`. `computeKbProgress` no se toca.
- [x] `apps/frontend/tests/kb-progress.test.ts` (nuevo): `node:assert` vía `tsx`, fuera de `src/`.
      Cubre eliminar todo → `0/2` + barra visible; siempre 5 categorías; `X/2` insensible a
      opcionales; numerador solo `indexado`; ambos obligatorios indexados → `2/2`.

## 4b. Fix V3.2 — Denominadores fijos (merge re-impone identidad de preset)
- [x] `lib/kb-presets.ts` · `mergePresetsWithDocuments`: en la rama "existe documento real", devolver
      `{ ...real, isPreset: true, obligatorio: meta.obligatorio, proposito: real.proposito ?? meta.proposito }`
      en vez de `return real`. Así los denominadores por categoría no dependen de los flags que traiga
      la DB (un preset creado por POST nace `isPreset:false`). `computeKbProgress` **no** se toca.
- [x] `apps/frontend/tests/kb-progress.test.ts`: ampliar con la reproducción exacta (docs
      `isPreset:false`): 0/5,0/2 → completar obligatorio → 1/5,1/2; opcional no mueve X/2; completar
      dos → 2/5,2/2; completar los cinco → 5/5,2/2; `missingObligatorios` correcto.

## 5. Verificación final
- [x] `pnpm --filter @sofiapp/api typecheck` ✅
- [x] `pnpm --filter @sofiapp/api test` ✅ (141 tests, 23 archivos)
- [x] `pnpm --filter @sofiapp/web build && pnpm --filter @sofiapp/web lint` ✅
- [x] `pnpm --filter @sofiapp/api exec tsx ../../apps/frontend/tests/kb-progress.test.ts` ✅ (9 tests)
- [x] Checklist PR de aislamiento (`docs/multi-tenancy.md` §9): sin `Model.find/create` directos en el
      código nuevo; `tenantId` del token; todo por el repositorio scoped (el fix de Bug 2 solo cambia
      si se incrementa `version`, no las queries scoped).

## Definición de "hecho"
Las 5 categorías de preset son visibles siempre en la barra (eliminar un documento las devuelve a
"vacío", con click que abre el formulario de creación); el primer llenado de un preset deja `version: 1`
y las ediciones posteriores incrementan normalmente; typecheck, tests y build/lint en verde. Listo para
`/sdd-release`.
