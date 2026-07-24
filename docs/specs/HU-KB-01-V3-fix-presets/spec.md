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
6. `pnpm --filter @sofiapp/api typecheck` ✅
7. `pnpm --filter @sofiapp/api test` ✅
8. `pnpm --filter @sofiapp/web build && pnpm --filter @sofiapp/web lint` ✅

## Dependencias
- **Depende de:** HU-KB-01-V2 (editor dual, presets con `obligatorio`, `PresetKnowledgeBar` en cards,
  `computeKbProgress`, `belongsInTable`), HU-KB-01 (modelos, job `kb-index`).
- **Bloqueante de:** —

## Notas de diseño (limitaciones aceptadas)
- Re-cargar un preset eliminado usa `createKbDocument` (POST). Como el backend de creación queda
  **fuera de alcance**, el documento re-creado nace como documento normal (`isPreset:false`,
  `obligatorio:false`). La barra lo sigue mostrando en su categoría porque el merge empareja **por
  título**; la etiqueta "Requerido" y el conteo de progreso, que leen los flags reales, no se
  re-derivan en ese caso. Es una limitación conocida y consistente con el alcance del fix.
