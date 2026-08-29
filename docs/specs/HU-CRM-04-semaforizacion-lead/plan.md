# HU-CRM-04 — Plan técnico (CÓMO)

> Actualizado durante la implementación: el semáforo del lead pasó de **enum cerrado** a **catálogo
> por tenant con CRUD**, a petición del usuario. Ver la nota "por qué un catálogo y no un enum" en
> `spec.md`. Lo que sigue describe lo realmente construido.

## Archivos creados

```
apps/backend/src/
├── features/semaforo/                  # feature nuevo, patrón de 6 archivos
│   ├── semaforo.types.ts               # ISemaforo, DTOs, COLOR_SEMAFORO_DEFECTO
│   ├── semaforo.model.ts               # schema + { tenantId, key } unique · { tenantId, orden }
│   ├── semaforo.validation.ts          # Zod create/update (`.strict()` + refine)
│   ├── semaforo.service.ts             # CRUD scoped + existeSemaforo / findSemaforoByKey / mapaSemaforos
│   ├── semaforo.controller.ts
│   ├── semaforo.routes.ts              # GET · POST /  ·  PATCH /:id
│   ├── semaforo.service.test.ts
│   └── semaforo.isolation.test.ts
├── seed/seed-semaforos.ts              # SEMAFOROS_DEFECTO + seedSemaforos + backfillSemaforos
├── scripts/backfill-lead-semaforo.ts   # Lead.semaforo ← etiqueta de su conversación, con --dry-run
└── features/lead/lead.semaforo.test.ts # cambio, historial y sincronización con la bandeja

apps/frontend/src/features/
├── semaforos/{types.ts, api.ts, index.ts, hooks/useSemaforos.ts}
└── leads/
    ├── hooks/{useUpdateLeadSemaforo.ts, useHistorialSemaforo.ts}
    └── components/{SemaforoSelect,SemaforosDialog,LeadHistorialSemaforo}.tsx (+ sus .test.tsx)
```

## Archivos modificados

| Archivo | Cambio |
|---|---|
| `features/lead/lead.types.ts` | `+ ILead.semaforo: string \| null`; `+ IHistorialSemaforoResponse`; `semaforo: ISemaforoResponse \| null` en `ILeadResponse` y `ILeadListItemResponse`, **sustituyendo** `semaforos: ITagResponse[]`; `ListLeadsQuery.semaforo` pasa a `string` |
| `features/lead/lead.model.ts` | `+ semaforo` (String, `default: null`, **sin `enum`**); `+ index { tenantId, semaforo, createdAt: -1 }` |
| `features/lead/lead.validation.ts` | `+ updateLeadSemaforoSchema` (`.strict()`, `nullable()`), `+ historialSemaforoSchema`; `semaforo` del listado deja de ser `z.enum` |
| `features/lead/lead.service.ts` | `+ updateLeadSemaforo`, `+ listHistorialSemaforo`, `+ sincronizarTagSemaforo`, `+ esSlugDeBandeja`; `− aplicarFiltroSemaforo`; `listLeads` simplificado |
| `features/lead/lead.controller.ts` · `.routes.ts` | `PATCH /:id/status` y `GET /:id/historial`, **antes** de las rutas `/:id` genéricas |
| `features/audit/audit.types.ts` | `'lead.semaforo'` en `AuditAccion` |
| `features/audit/audit.service.ts` | `accion?` opcional en `listAuditEvents`/`listAuditEventsQuery`, con `buildAuditFilter` compartido por página y conteo |
| `features/tenant/tenant.{model,types,service}.ts` | `semaforosSeeded` + llamada a `seedSemaforos` al crear el tenant |
| `app.ts` | `app.use('/api/semaforos', …)` + `backfillSemaforos()` en el arranque |
| `frontend/leads/{types,api}.ts` | `SemaforoDTO`, `HistorialSemaforoDTO`, `updateLeadSemaforo`, `fetchHistorialSemaforo` |
| `frontend/leads/components/{LeadDetailSheet,LeadsTable,LeadsFilters}.tsx` · `pages/LeadsPage.tsx` | Montaje de los componentes nuevos; `SemaforoCell` pasa a uno solo; filtros desde el catálogo |
| `docs/{domain,data-model,api-contract}.md` · `docs/specs/HU-CRM-03-listado-leads/spec.md` | Ver "Documentación" |

## Contratos

### `semaforo.types.ts` · `semaforo.model.ts`

Espejo de `estado`, con **una diferencia que no es cosmética**: aquí `esDefecto` protege del
archivado en vez de ser informativo, porque las cuatro claves sembradas son el contrato compartido
con la bandeja, IA-05 y MARK-01.

```ts
SemaforoSchema.index({ tenantId: 1, key: 1 }, { unique: true });  // incluye archivados
SemaforoSchema.index({ tenantId: 1, orden: 1 });
```

### Endpoints

| Método | Ruta | Notas |
|---|---|---|
| GET | `/api/semaforos` | Catálogo en orden, archivados incluidos |
| POST | `/api/semaforos` | `{ label, color? }` → `201`; nombre repetido → `409` |
| PATCH | `/api/semaforos/:id` | `{ label?, color?, activo? }`; archivar un base → `409`; `key` → `400` |
| PATCH | `/api/leads/:id/status` | `{ semaforo: string \| null }`; clave fuera del catálogo → `400` |
| GET | `/api/leads/:id/historial` | Paginado, solo `lead.semaforo` |

Todas con la cadena fija de 5 middlewares y `authorize(['admin'])`. **No hay `DELETE`** de
semáforos: los leads llevan la `key` grabada y borrarla dejaría filas mostrando una clave cruda.

### `updateLeadSemaforo` — el orden es la garantía

```
1. findByIdScoped(Lead, tenantId, leadId)          → 404 si null
2. existeSemaforo(tenantId, semaforo)              → 400 si no está en el catálogo
3. lead.semaforo === semaforo ? return getLeadById(...)   // idempotente, sin escritura
4. findOneAndUpdateScoped(Lead, …, { $set: { semaforo } })
5. recordAuditEvent('lead.semaforo', antes/despues)
6. sincronizarTagSemaforo(...)                      // best-effort, try/catch propio
7. return getLeadById(tenantId, leadId)
```

El paso 4 escribe el **dato autoritativo** y ya no puede perderse; el 5 y el 6 son consecuencias que
no deben poder tumbarlo. `recordAuditEvent` ya traga sus errores, y el 6 va en su propio `try/catch`
por la misma razón: la etiqueta de la conversación es un **reflejo**, y que no se pueda actualizar no
invalida un cambio que el usuario ya dio por hecho.

### `sincronizarTagSemaforo` — un solo sentido, best-effort

Deja la conversación con **una sola** etiqueta de semáforo. El filtro `semaforo: { $exists: true }`
es lo que protege las etiquetas **libres** del tenant: solo se retiran las de semáforo.

No aplica cuando la clave del lead no es uno de los cuatro slugs de bandeja —un semáforo propio de la
empresa no tiene etiqueta equivalente— ni cuando el administrador borró la etiqueta. En ambos casos
la conversación se queda sin chip y **no es un error**: es lo que manda `docs/domain.md` §5.

Va del lead a la bandeja y no al revés: sincronizar en ambos sentidos exigiría un candado que hoy no
existe y abriría carreras entre dos pantallas que se usan a la vez.

### `listHistorialSemaforo` — el filtro va en la consulta

Réplica de `listAssignments`. El detalle load-bearing: la entidad `lead` acumula también
`lead.create`, `lead.update` y `lead.delete`, así que hizo falta añadir `accion?` a
`listAuditEvents`. Descartarlos **tras** paginar daría un `total` que no corresponde con las filas y
páginas de tamaño irregular.

### Simplificación de `listLeads` (esto quitó código)

- **Eliminado** `aplicarFiltroSemaforo` y sus dos consultas encadenadas → `filter.semaforo = key`.
- **Eliminada** la hidratación con `findTagsByIds` y `tagIds` de la proyección de `Cliente`.
- **Añadida** una única llamada a `mapaSemaforos(tenantId)`.

Neto por página: dos consultas menos y un índice más. El aislamiento del filtro deja de depender de
cómo estuviera escrito `aplicarFiltroSemaforo` y pasa a ser estructural.

## Frontend — decisiones de diseño (regla §7 del `CLAUDE.md` raíz)

Aplicadas **`emil-design-eng`** y **`frontend-design:frontend-design`** antes de escribir cada
componente. **`impeccable:impeccable` no está instalado** en este entorno —no aparece entre las
skills disponibles—, igual que ya registraron HU-OMNI-04 y HU-CRM-03: se aplicaron sus reglas
conocidas (contraste, estados vacíos, copy, accesibilidad) sin poder invocarla. Conviene instalarla.

| Decisión | Motivo |
|---|---|
| `SemaforoSelect` replica la forma exacta de `EstadoSelect` | Van **pegados** en la misma fila del `Sheet`. Dos decisiones del mismo tipo sobre el mismo lead con dos formas distintas es inconsistencia, no jerarquía |
| Punto de color **+ etiqueta**, nunca el color solo | El color solo no es accesible: quien no distingue rojo de verde se queda sin el dato. El nombre informa; el color acompaña |
| "Sin clasificar" es una opción de verdad, no un placeholder | Retirar la clasificación es una acción legítima, y un lead nace así |
| Sin animación al cambiar; solo `transition-colors` 150 ms `ease-out` | Es un cambio de color, no de posición. Animar el movimiento de una fila que se refiltra solo la haría sentir lenta |
| Sin actualización optimista: se invalida `['leads']` | Con `?semaforo=` activo, un lead que deja de cumplirlo tiene que **desaparecer** y el `total` bajar, no quedarse mintiendo. Es el razonamiento que ya estaba escrito en `useUpdateLeadEstado` |
| `disabled` mientras `isPending`, sin spinner | El roundtrip ronda los 150 ms; un spinner que parpadea es peor que ninguno |
| Historial en un `Accordion` cerrado, query `enabled` al abrirlo | No se paga la consulta a quien no la abre. Es información de consulta puntual, no lectura principal |
| Sin stagger ni animación de entrada en el historial | Es una lista de datos; el stagger aquí es decoración que no sirve al contenido |
| El CRUD en un `Dialog`, no en una pantalla del menú | Son cuatro filas más las que añada la empresa, y se configuran justo donde se usan. Una entrada de menú para esto sería más estructura que contenido |
| Edición **en sitio** en la fila, no un segundo diálogo | Anidar modales para cambiar un nombre obliga a un viaje de ida y vuelta que la tarea no justifica |
| A los cuatro base **no se les pinta** botón de archivar | Un botón que siempre respondería `409` es peor que ningún botón. Se explica en una línea bajo la lista |
| El color del dato va en `style`, pasando por el helper ya existente | El hex es **dato del tenant**: la excepción a INF-03 que HU-OMNI-04 ya acotó. Cero `bg-[#...]` |
| Se retira el `+N` y su `Popover` de la tabla | Existía porque la conversación podía llevar varias etiquetas. Con el campo del lead hay exactamente una, y mantenerlo prometería una complejidad que ya no existe |

**Copy.** Verbos activos y el mismo vocabulario de principio a fin: el control se llama "Semáforo",
el toast dice "Semáforo actualizado", el error repite el mensaje del backend antes que un genérico.
Sin semáforo se lee "Sin clasificar", que es un estado legítimo y no un hueco. El historial vacío
dice "Todavía no se ha cambiado el semáforo de este lead" y añade que los cambios quedan registrados
con su autor: una explicación de para qué sirve la sección, no un encogimiento de hombros.

## Migración — `backfill-lead-semaforo.ts`

Traslada a `Lead.semaforo` lo que los usuarios ya habían clasificado desde la bandeja. Sin él la
columna Semáforo se vaciaría de golpe para todos al desplegar.

- **Idempotente:** solo escribe donde `semaforo` es `null` o no existe.
- Si la conversación lleva varias etiquetas, gana la última de `tagIds` — mismo criterio que usaba el
  listado ("la aplicada más recientemente primero").
- `--dry-run` imprime el recuento por semáforo sin escribir.
- Correr **antes** de desplegar el frontend, que ya no lee `semaforos`.

## Verificación

```bash
pnpm --filter @sofiapp/api typecheck   # verde
pnpm --filter @sofiapp/api test        # 69 archivos · 618 tests, verde
pnpm --filter @sofiapp/web lint        # sin warnings
pnpm --filter @sofiapp/web build       # incluye tsc --noEmit, verde
npx vitest run src/features/leads      # 9 archivos · 78 tests, verde
```

> El filtro correcto del workspace es `@sofiapp/api` / `@sofiapp/web`. Los `CLAUDE.md` dicen
> `pnpm --filter backend` / `frontend`, que falla con `No projects matched the filters`. Deuda del
> doc, ya anotada por HU-OMNI-04 y HU-CRM-03.

> **Deuda previa, no regresión.** La suite completa de `@sofiapp/web` muere con
> `RangeError: Maximum call stack size exceeded` después de `PlanTable`, y falla igual en
> `origin/develop` limpio. Por eso los tests del frontend se verifican por feature.
