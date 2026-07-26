# HU-KB-01-V3 — Fix Presets (spec)

> **Spec-Driven Development.** Este es el QUÉ y el porqué. El CÓMO va en `plan.md`; la ejecución en `tasks.md`.

**Estado:** implementado

## Historia
> Como **Administrador** quiero que los 5 documentos predefinidos siempre sean visibles en la barra de conocimiento y que la versión se maneje correctamente, para que pueda gestionar la KB sin perder acceso a categorías ni ver versiones incorrectas.

## Objetivo
Corregir dos bugs en el módulo KB: (1) las tarjetas de preset no deben desaparecer al eliminar el documento subyacente, y (2) el primer llenado de un preset vacío no debe incrementar la versión.

## Alcance
### Incluye
- Frontend: lista fija de 5 presets con merge de documentos reales, ids virtuales para presets no creados, adaptación del editor para crear en vez de editar presets virtuales
- Frontend (V3.1): la barra de progreso (`computeKbProgress`) se alimenta de la lista fusionada, no de la cruda, para que el contador "X/2" no encoja ni desaparezca al eliminar documentos
- Backend: versión condicional en updateDocument (solo incrementar si ya tenía contenido)
- Tests actualizados y nuevos para ambos fixes

### Fuera de alcance
- Cambios al backend de creación/eliminación/listado de documentos
- Cambios al worker de indexación
- Nuevos endpoints

## Criterios de aceptación
1. Las 5 tarjetas de preset siempre son visibles en la barra, incluso después de eliminar un documento preset
2. Un preset eliminado muestra estado "vacío" y click abre el formulario de creación
3. Primer llenado de un preset vacío → versión 1
4. Segunda edición (contenido ya real) → versión 2
5. El re-indexado y borrado de chunks funciona igual en todos los casos
6. **(V3.1)** La barra de progreso se calcula sobre la lista fusionada: al eliminar todos los documentos el contador se mantiene en "0/2" (no desaparece, no cambia el denominador) y la barra global sigue visible (5 categorías)
7. **(V3.1)** El contador "X/2" refleja solo los 2 presets obligatorios, sin importar cuántos opcionales existan; el numerador cuenta solo `estadoIndexacion === 'indexado'`
8. **(V3.2)** Denominadores **fijos**: completar un preset obligatorio (aunque el documento haya nacido por POST, `isPreset:false`) lleva de "0/5, 0/2" a "1/5, 1/2" — nunca a "0/4, 0/1". Completar/eliminar un preset opcional mueve "X/5" pero deja "X/2" intacto. El merge re-impone `isPreset`/`obligatorio` desde `PRESET_META`
9. `pnpm --filter @sofiapp/api typecheck` ✅
10. `pnpm --filter @sofiapp/api test` ✅
11. `pnpm --filter @sofiapp/web build && pnpm --filter @sofiapp/web lint` ✅

## Dependencias
- **Depende de:** HU-KB-01-V2 (editor dual, presets con `obligatorio`, `PresetKnowledgeBar` en cards,
  `computeKbProgress`, `belongsInTable`), HU-KB-01 (modelos, job `kb-index`).
- **Bloqueante de:** —

## Notas de diseño
- Re-cargar un preset (nunca creado o eliminado) usa `createKbDocument` (POST). Como el backend de
  creación queda **fuera de alcance**, el documento nace como documento normal (`isPreset:false`,
  `obligatorio:false`). Para que esto **no** rompa la identidad de preset en la UI, el merge empareja
  por **título canónico** de `PRESET_META` y **re-impone** `isPreset:true` + `obligatorio`/`proposito`
  de la meta sobre el documento real (ver fix V3.2). Así la barra, el badge "Requerido" y los
  denominadores de progreso son estables sin tocar el backend de creación.
