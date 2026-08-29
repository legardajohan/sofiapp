# HU-CRM-04 — Tasks (checklist ejecutable)

## Preparación

- [x] Rama `feat/HU-CRM-04` creada.
      **Nota:** salió de `feat/HU-CRM-03`, no de `develop` a secas. `develop` **no tiene HU-CRM-03**
      (su PR sigue abierto), así que faltaban el feature `estado`, `listLeads`, `updateLeadEstado`,
      `LeadsTable` y `LeadDetailSheet` — todo lo que esta historia extiende. `feat/HU-CRM-03` es
      exactamente `origin/develop` + 1 commit, así que la base sí es el develop real.

## Implementación — Backend

- [x] `semaforo.types.ts` — `ISemaforo`, DTOs, `COLOR_SEMAFORO_DEFECTO`.
- [x] `semaforo.model.ts` — schema + `{ tenantId, key }` único y `{ tenantId, orden }`.
- [x] `semaforo.validation.ts` — `createSemaforoSchema`, `updateSemaforoSchema` (`.strict()` + refine
      contra el `PATCH` vacío, que respondería `200` sin haber hecho nada).
- [x] `semaforo.service.ts` — CRUD scoped, `existeSemaforo`, `findSemaforoByKey`, `mapaSemaforos`,
      `contarLeadsConSemaforo`; `409` al archivar uno de fábrica.
- [x] `semaforo.controller.ts` · `semaforo.routes.ts` — `GET`/`POST /` y `PATCH /:id`.
- [x] `seed/seed-semaforos.ts` — `SEMAFOROS_DEFECTO`, `seedSemaforos`, `backfillSemaforos`.
- [x] `tenant.{model,types,service}.ts` — `semaforosSeeded` + siembra al crear el tenant.
- [x] `app.ts` — montaje de `/api/semaforos` + `backfillSemaforos()` en el arranque.
- [x] `audit.types.ts` — acción `lead.semaforo`.
- [x] `audit.service.ts` — `accion?` opcional, con `buildAuditFilter` compartido por la página y el
      conteo. **Sin esto el historial mezclaría `lead.create` y `lead.delete`**, y filtrar después de
      paginar rompería el `total`.
- [x] `lead.types.ts` → `lead.model.ts` → `lead.validation.ts` → `lead.service.ts` →
      `lead.controller.ts` → `lead.routes.ts`.
- [x] Simplificar `listLeads`: borrado `aplicarFiltroSemaforo`, quitada la hidratación con
      `findTagsByIds` y `tagIds` de la proyección de `Cliente`.
- [x] `scripts/backfill-lead-semaforo.ts` con `--dry-run`.

## Implementación — Frontend

> Invocadas `emil-design-eng` y `frontend-design:frontend-design` **antes** de escribir los
> componentes (regla §7). `impeccable:impeccable` no está instalado en este entorno: queda anotado,
> no inventado.

- [x] `features/semaforos/{types.ts, api.ts, index.ts, hooks/useSemaforos.ts}`.
- [x] `leads/types.ts` — `SemaforoDTO`, `HistorialSemaforoDTO`; `semaforo` en lugar de `semaforos`.
- [x] `leads/api.ts` — `updateLeadSemaforo`, `fetchHistorialSemaforo`, sin prefijo `/api`.
- [x] `hooks/useUpdateLeadSemaforo.ts` — calcado de `useUpdateLeadEstado`, sin optimistic update.
- [x] `hooks/useHistorialSemaforo.ts` — `enabled` solo con la sección abierta.
- [x] `components/SemaforoSelect.tsx` — forma exacta de `EstadoSelect`; "Sin clasificar"; ofrece el
      archivado solo si es el que el lead lleva puesto.
- [x] `components/SemaforosDialog.tsx` — CRUD completo: listar, crear, renombrar, recolorear,
      archivar y reactivar. A los cuatro base no se les pinta el botón de archivar.
- [x] `components/LeadHistorialSemaforo.tsx` — `Accordion` cerrado, con sus cuatro estados.
- [x] `LeadDetailSheet.tsx` · `LeadsTable.tsx` · `LeadsFilters.tsx` · `LeadsPage.tsx` — montaje;
      retirado el `Popover` del `+N`, que ya no tiene sentido.

## Documentación

- [x] `docs/domain.md` §5 — los dos ejes de la semaforización, sus dos almacenamientos y el sentido
      de la sincronización.
- [x] `docs/data-model.md` — colección `semaforos`; campo e índice en `leads`; **corregida** la nota
      que afirmaba que `?semaforo=` no es un campo del lead.
- [x] `docs/api-contract.md` §6 — las cinco rutas nuevas y la fila actualizada de `GET /api/leads`.
- [x] `docs/specs/HU-CRM-03-listado-leads/spec.md` — nota de supersesión de sus criterios 2, 4 y 6.

## Tests

**Aislamiento** (criterio 14):

- [x] `lead.isolation.test.ts` — el tenantB no cambia el semáforo de un lead del tenantA (`404` **y
      el lead queda intacto**, releído desde el tenantA); no lee su historial; `?semaforo=` no
      arrastra **ni cuenta** leads ajenos, y el camino feliz del dueño sí devuelve, para probar que
      el vacío es aislamiento y no un filtro roto.
- [x] `semaforo.isolation.test.ts` — el catálogo del tenantB no incluye el semáforo propio del
      tenantA; editarlo desde B es `404` sin escribir; la misma clave coexiste en dos tenants;
      `createScoped` fuerza el tenant del argumento sobre el del payload.

**Servicio y feature:**

- [x] `semaforo.service.test.ts` (17) — siembra idempotente que no pisa el renombrado; alta con
      `key` derivada, desambiguación, color por defecto, nombre repetido → `409`, label sin
      alfanuméricos; renombrar sin tocar la `key`; archivar uno propio; `409` al archivar uno base;
      resolución de claves huérfanas.
- [x] `lead.semaforo.test.ts` (17) — los cuatro colores y uno propio; `null`; idempotencia sin
      entrada de historial; clave inválida → `400` sin grabar; historial ordenado, paginado, con el
      actor resuelto y **sin colar** `lead.create`; sincronización que deja una sola etiqueta, no
      toca las libres, y no falla con la etiqueta borrada ni con un semáforo propio.
- [x] `lead.service.test.ts` — actualizados los tests que asumían `semaforos: TagDTO[]`.
- [x] `lead.routes.test.ts` — contrato HTTP de las dos rutas nuevas (`200`/`400`/`404`, `.strict()`)
      con CSRF; `?semaforo=` desconocido pasa de `400` a **página vacía**, como `?estado=`.

**Frontend:**

- [x] `SemaforoSelect.test.tsx` (7) · `LeadHistorialSemaforo.test.tsx` (6) ·
      `SemaforosDialog.test.tsx` (8).
- [x] Actualizados `LeadsTable`, `LeadDetailSheet`, `LeadsFilters` y `LeadCard`.

## Verificación final

- [x] `pnpm --filter @sofiapp/api typecheck` en verde.
- [x] `pnpm --filter @sofiapp/api test` — **69 archivos · 618 tests**, verde.
- [x] `pnpm --filter @sofiapp/web lint` sin warnings.
- [x] `pnpm --filter @sofiapp/web build` (incluye `tsc --noEmit`) en verde.
- [x] Tests de `features/leads` — **9 archivos · 78 tests**, verde. La suite completa de `@sofiapp/web`
      sigue muriendo con `RangeError: Maximum call stack size exceeded` después de `PlanTable`, igual
      que en `origin/develop` limpio: deuda previa, no regresión de este feature.
- [x] Checklist de PR de `docs/multi-tenancy.md` §9 revisado: toda query por `*Scoped`, `tenantId`
      del token, modelo nuevo con `tenantId` requerido e indexado, rutas tras
      `authenticateJWT → requireTenant`, tests de aislamiento añadidos.
- [x] `git status` sin capturas `*.png` / `*.jpg` coladas.
- [ ] **Pendiente: arranque manual de `app.ts` / `worker.ts`.** El comando quedó denegado por
      permisos en la sesión. El montaje de las rutas sí está ejercitado por `lead.routes.test.ts`,
      que importa `app.ts` con `supertest`; lo que **no** se ha ejecutado en vivo es
      `backfillSemaforos()` del arranque (sí cubierto por `seedSemaforos` en los tests).
- [ ] **Pendiente: cierre manual (DoD).** Mover un lead por los cuatro colores, comprobar tabla,
      `Sheet`, historial y el chip de su conversación en la bandeja; crear un semáforo propio y
      clasificar con él; filtrar por color. Repetir en claro y en oscuro.
- [x] `spec.md` → `**Estado:** implementado`.

## Definición de "hecho"

El semáforo de una oportunidad se cambia entre los estados que la empresa define, cada cambio queda
registrado con su autor y su fecha en un historial consultable, y el color nuevo se propaga al
listado, al filtro y a la conversación que originó el lead — sin que borrar una etiqueta de la
bandeja rompa nada y sin que un tenant pueda tocar ni ver los leads ni el catálogo de otro.
