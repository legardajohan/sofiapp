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

### Consistencia con progreso/banner (fuera de alcance)
`computeKbProgress` y `RequiredPresetsBanner` se siguen alimentando de la lista cruda. Tras eliminar
un obligatorio, el progreso deja de contarlo hasta que se re-cree. Se documenta como limitación
aceptada en `spec.md`; no se amplía el alcance a esos componentes ni al backend de creación.

## Verificación
- `pnpm --filter @sofiapp/api typecheck`
- `pnpm --filter @sofiapp/api test`
- `pnpm --filter @sofiapp/web build && pnpm --filter @sofiapp/web lint`
