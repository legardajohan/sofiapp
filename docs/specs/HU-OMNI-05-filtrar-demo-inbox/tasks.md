# HU-OMNI-05 — Tasks

## Implementación

- [x] `conversation.service.ts`: en `buildFiltro`, agregar `f.metaUserId = { $not: /^demo-/ };`
      de forma incondicional, antes del `return f;`.
- [x] Confirmar que `listConversations` no necesita más cambios: ya reenvía el resultado de
      `buildFiltro` a `findScoped` y `countScoped` sin transformación adicional.

## Tests

- [x] `conversation.filters.test.ts`: nuevo caso — crear un cliente `metaUserId: 'demo-...'` y
      uno normal en el mismo tenant, llamar `listConversations` sin filtros adicionales y
      verificar que solo el normal aparece en `result.data`.
- [x] Caso de combinación: un cliente demo que también cumpliría otro filtro (p. ej.
      `filtro: 'mios'` con el mismo `asesorId`, o `estado`/`etiqueta` que coincidan) sigue
      excluido — la cláusula demo no se pisa con las demás.
- [x] Verificar que el total de paginación (`result.total` / lo que exponga la respuesta) también
      excluye los demo, no solo `result.data`.
- [x] Test de aislamiento: no hace falta uno nuevo específico (la exclusión no toca `tenantId`),
      pero confirmar que los tests de aislamiento existentes (`conversation.isolation.test.ts`)
      siguen en verde tras el cambio.

## Verificación final

- [x] `pnpm --filter @sofiapp/api typecheck` en verde.
- [x] `pnpm --filter @sofiapp/api test` en verde (suite completa: 59 archivos, 440 tests).
- [x] Checklist de aislamiento multi-tenant de `docs/multi-tenancy.md` §9 revisado: sigue sin
      haber `Cliente.find()`/`Cliente.countDocuments()` directos, `tenantId` sigue naciendo de
      `req.user!.tenantId`.

## Definición de "hecho"

- La bandeja omnicanal no muestra conversaciones demo bajo ningún filtro (`todos`, `mios`,
  `sin_asignar`, `sofi`) ni combinación con `asignadoA`/`estado`/`etiqueta`.
- Tests y typecheck en verde.
- El commit del feature no incluye los scripts `apps/backend/check-*.cjs` ni ninguna credencial
  (ya quedaron fuera vía `.gitignore` en un commit previo de higiene).
- `spec.md` pasa a `**Estado:** implementado` al cerrar con `/sdd-implement`.
