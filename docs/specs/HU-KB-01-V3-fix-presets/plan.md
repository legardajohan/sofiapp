# HU-KB-01-V3 — Plan técnico (CÓMO)

> Cómo se corrigen los dos bugs definidos en `spec.md`. Cambios quirúrgicos: se respeta el patrón de
> capas del backend (`tenantId` del token, acceso a Mongo solo por el repositorio scoped) y la
> organización por feature del frontend. **No** se tocan create/delete/list del backend, ni el worker,
> ni se agregan endpoints.

## Archivos a tocar

```
apps/backend/src/features/kb/
  kb.service.ts          # (TOCA) updateDocument(): versión condicional (Bug 2)
  kb.service.test.ts     # (TOCA) tests de primer llenado / secuencia de versiones
  kb.routes.test.ts      # (TOCA) test PATCH primer llenado → v1

apps/frontend/src/features/knowledge-base/
  lib/kb-presets.ts                     # (TOCA) PRESET_META + ids virtuales + mergePresetsWithDocuments
  components/PresetKnowledgeBar.tsx      # (TOCA) usa mergePresetsWithDocuments (Bug 1)
  components/KnowledgeUploadEditor.tsx   # (TOCA) preset virtual → modo creación (POST)
  pages/KnowledgeBasePage.tsx           # (TOCA) comentarios de intención; sin cambio de lógica
```

No se crean archivos nuevos: ambos fixes viven en la slice `kb` existente.

---

## Bug 2 — Versión condicional en `updateDocument`

### Causa
`updateDocument` hacía `$inc: { version: 1 }` **incondicional**. Un preset seedeado nace con
`contenido: ''` y `version: 1`; al llenarlo por primera vez subía a `version: 2`.

### Solución
Antes de actualizar, se detecta si el contenido previo estaba vacío (primer llenado) y en ese caso
**no** se incrementa la versión. El borrado de chunks y el re-encolado del job `kb-index` no cambian.

```ts
const existing = await findByIdScoped(KbDocument, tenantId, id)
  .lean<(IKbDocument & { _id: Types.ObjectId }) | null>()
  .exec();
if (!existing) throw new AppError('No se encontró el documento.', 404);

const isFirstFill = !existing.contenido || existing.contenido.trim().length === 0;

const updated = await findOneAndUpdateScoped(
  KbDocument, tenantId, { _id: id },
  {
    $set: { contenido, estadoIndexacion: 'pendiente' as const, chunkCount: 0 },
    ...(isFirstFill ? {} : { $inc: { version: 1 } }),
    $unset: { error: 1 },
  },
  { new: true },
);
```

- **Primer llenado** (`'' → texto`): `version` se queda en 1.
- **Edición posterior** (contenido ya real): `$inc` normal → 2, 3, …
- **Vaciar** (`texto → ''`): sigue el camino de siempre (no se encola el job).

---

## Bug 1 — Las 5 tarjetas de preset siempre visibles

### Causa
`PresetKnowledgeBar` armaba las tarjetas filtrando `documents.filter(doc => doc.isPreset)`. Al
eliminar un preset deja de venir en `GET /api/kb/documents`, así que su tarjeta desaparecía.

### Solución — merge de presets fijos con documentos reales

`lib/kb-presets.ts` gana la fuente de verdad del frontend (`PRESET_META`, espejo liviano de
`PRESET_DOCUMENTS` del backend) y un merge que garantiza las 5 categorías:

```
mergePresetsWithDocuments(documents):
  para cada PRESET_META[i] (orden fijo):
    real = documents.find(d => d.titulo === meta.titulo)
    ├─ existe  → devuelve el documento real (tal cual la DB)
    └─ no existe → devuelve un documento VIRTUAL:
         { id: `__preset_${i}`, contenido:'', estadoIndexacion:'pendiente',
           version:1, chunkCount:0, isPreset:true, obligatorio: meta.obligatorio,
           proposito: meta.proposito }
```

El `id` virtual (`__preset_<i>`) es **determinista** (por índice, no aleatorio): sobrevive a los
re-render/refetch, así el resaltado activo de la card y el `key` de React se mantienen estables.
`isVirtualPresetId(id)` lo distingue de un ObjectId real de Mongo.

`PresetKnowledgeBar` pasa a:
```ts
const presets = mergePresetsWithDocuments(documents); // ya viene ordenado; siempre 5
```

### Flujo de click en un preset virtual (crear en vez de editar)

```
[Card preset virtual]
      │ onEdit(virtualDoc)
      ▼
KnowledgeBasePage.setEditingDocument(virtualDoc)
      │ document={editingDocument}
      ▼
KnowledgeUploadEditor
  isVirtualPreset = isVirtualPresetId(document.id)   // id __preset_*
  isEdit          = document && !isVirtualPreset
      │
      ├─ isVirtualPreset → modo CREACIÓN: título fijado (disabled) + prefill,
      │                    proposito como placeholder, submit → createKbDocument (POST)
      │                    onSuccess → toast + onDone() (vuelve a modo creación)
      └─ isEdit          → modo EDICIÓN: submit → updateKbDocument (PATCH)
```

Puntos clave:
- El editor **auto-detecta** el preset virtual por su `id`; la página no necesita ramas nuevas
  (solo pasa el documento como siempre).
- El título se bloquea también en modo preset virtual (su título ya está definido por `PRESET_META`).
- La **tabla** se alimenta de la lista cruda (`belongsInTable` sobre `documents`), no del merge, así
  que los presets virtuales nunca se cuelan en ella.

### Consistencia con progreso/banner (`RequiredPresetsBanner` fuera de alcance)
`RequiredPresetsBanner` se sigue alimentando de la lista cruda (solo señala obligatorios que existen
y están vacíos). No se amplía el alcance a ese componente ni al backend de creación.

---

## Fix V3.1 — Barra de progreso sobre la lista fusionada

### Causa
`KnowledgeBasePage` pasaba a `computeKbProgress(documents)` la lista **cruda** del API.
`computeKbProgress` deriva el denominador de obligatorios de `documents.filter(d => d.obligatorio)`,
y `PresetProgress` se oculta cuando `totalPresets === 0`. Así, al eliminar los documentos:
- el contador `X/2` de obligatorios encogía o desaparecía (menos obligatorios en la lista), y
- al borrar todo, `totalPresets` caía a 0 y la barra entera se ocultaba.

### Solución
Alimentar el progreso con la **misma lista fusionada** que la barra de cards:

```ts
// KnowledgeBasePage.tsx (ubicado por el texto `computeKbProgress(`)
const progress = computeKbProgress(mergePresetsWithDocuments(documents));
```

Como `mergePresetsWithDocuments` garantiza las 5 categorías (con sus 2 obligatorios de `PRESET_META`),
el denominador queda fijo: `totalPresets = 5` (barra siempre visible) y `obligatorios.length = 2`
(contador siempre `X/2`). El numerador no cambia de semántica: `completedObligatorios` sigue contando
solo `estadoIndexacion === 'indexado'`. `computeKbProgress` **no** se modifica; solo su entrada.

### Test (sin runner nuevo)
`apps/frontend/tests/kb-progress.test.ts`: `node:assert` vía `tsx` (ya en el repo), fuera de `src/`
para no entrar en `build`/`lint` ni en `turbo run test`. Cubre: eliminar todo → `0/2` con barra
visible; siempre 5 categorías; `X/2` insensible a opcionales; numerador solo `indexado`.
Ejecutar: `pnpm --filter @sofiapp/api exec tsx ../../apps/frontend/tests/kb-progress.test.ts`.

---

## Fix V3.2 — Denominadores fijos (merge re-impone identidad de preset)

### Causa
`computeKbProgress` deriva ambos denominadores filtrando por `doc.isPreset` y `doc.obligatorio`.
`mergePresetsWithDocuments` devolvía el documento real **tal cual la DB** (`if (real) return real;`).
Un preset completado que nació por **POST** (`createKbDocument`, flujo de un preset virtual) tiene
`isPreset:false`/`obligatorio:false` porque el backend de creación no setea esos flags. Ese documento
**fallaba los dos filtros** → salía de `presets` (5→4) y de `obligatorios` (2→1) y tampoco contaba
como completado → el observado "0/4, 0/1". (No pasa con presets **seedeados**, que se editan por PATCH
y conservan `isPreset:true`.) La hipótesis de un cálculo "en términos de pendientes" quedó
**descartada**: `computeKbProgress` ya usa "total fijo + completados".

### Solución
Como el merge empareja por el **título canónico** de `PRESET_META`, re-impone la identidad de preset
sobre el documento real emparejado (no se toca `computeKbProgress` ni el backend):

```ts
// mergePresetsWithDocuments — rama "existe documento real":
if (real) {
  return {
    ...real,
    isPreset: true,
    obligatorio: meta.obligatorio,        // 2 obligatorios fijos por PRESET_META
    proposito: real.proposito ?? meta.proposito,
  };
}
```

Con esto `presets.length === 5` y `obligatorios.length === 2` **siempre**; el numerador
(`filter(isCompleted)`, solo `indexado`) es lo único que se mueve. Beneficio colateral: el badge
"Requerido" de la barra también queda correcto para presets creados por POST.

### Test
Se amplía `apps/frontend/tests/kb-progress.test.ts` con la reproducción exacta (documentos con
`isPreset:false`): 0/5,0/2 → completar un obligatorio → 1/5,1/2 (no 0/4,0/1); opcional mueve X/5 pero
no X/2; completar dos → 2/5,2/2; completar los cinco → 5/5,2/2; `missingObligatorios` lista solo lo
pendiente sin tocar denominadores.

## Verificación
- `pnpm --filter @sofiapp/api typecheck`
- `pnpm --filter @sofiapp/api test`
- `pnpm --filter @sofiapp/web build && pnpm --filter @sofiapp/web lint`
- `pnpm --filter @sofiapp/api exec tsx ../../apps/frontend/tests/kb-progress.test.ts` (progreso)
