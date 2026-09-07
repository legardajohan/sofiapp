# HU-PIPE-01 — Tasks (checklist ejecutable)

> Ejecuta en orden. Marca cada casilla al terminar. No cierres el feature hasta que TODO esté en
> verde. El QUÉ está en `spec.md`; el CÓMO, en `plan.md`.

## Preparación

- [x] Rama `feat/HU-PIPE-01` creada **desde `origin/develop`**.
      **Nota de rama:** `develop` está a la altura de **HU-CRM-03**. No existen `features/semaforo/`,
      `Lead.semaforo` ni el filtro `accion?` de `listAuditEvents` — todo eso es de HU-CRM-04, cuyo
      PR sigue abierto. Consecuencias: (a) la tarjeta del tablero pinta `semaforos: TagDTO[]`, la
      forma de esta base; (b) el filtro `accion?` hay que añadirlo aquí, **con la misma forma exacta
      que en `feat/HU-CRM-04`** (`buildAuditFilter` compartido por la página y el conteo), para que
      el merge posterior resuelva trivialmente en vez de pelearse.

## Implementación — Backend

Orden del patrón de 6 archivos: `types → model → validation → service → controller → routes`, y el
montaje en `app.ts` al final.

- [ ] `estado.types.ts` — `esSalida: boolean` en `IEstado` e `IEstadoResponse`, con el comentario de
      que es **descriptivo, no restrictivo** (no bloquea transiciones).
- [ ] `estado.model.ts` — `esSalida: { type: Boolean, required: true, default: false }`.
      **Sin índice nuevo:** nadie filtra por él; es un dato de pintado.
- [ ] `estado.service.ts` — `esSalida` en `toResponse` con `?? false` (documentos anteriores al
      feature no lo traen); `findEstadoByKey`; `existeEstadoActivo`. **Conservar `existeEstado`**
      tal cual: la usa el filtro `?estado=` del listado, que sí admite archivadas.
- [ ] `seed/seed-estados.ts` — `declinado` en `ESTADOS_DEFECTO`; `esSalida` en `perdido` y
      `declinado`; `backfillEstadoDeclinado()` idempotente (`upsert` + `$setOnInsert`, `orden` al
      final del pipeline de cada tenant, `esSalida` solo si el campo no está definido).
- [ ] `audit.types.ts` — acción `'lead.estado'`.
- [ ] `audit.service.ts` — `accion?` opcional + `buildAuditFilter` compartido por la consulta
      paginada y por `countScoped`. **Sin compartirlo el `total` contaría eventos que la página no
      devuelve**, y filtrar después de paginar rompería el conteo.
- [ ] `realtime/realtime.types.ts` — evento `lead:stage-changed` con `{ tenantId, leadId, de, a,
      lead }`. **No tocar `realtime.publisher.ts`**: el fan-out al room `tenant:<id>` ya es genérico.
- [ ] `lead.types.ts` — `IHistorialEstadoResponse`.
- [ ] `lead.validation.ts` — `updateLeadStageSchema` (`.strict()`), `historialEstadoSchema`.
- [ ] `lead.service.ts` — `updateLeadEstado`: `existeEstadoActivo` en vez de `existeEstado` (→ `400`),
      auditoría con `lead.estado`, `publishRealtime` **solo en el cambio efectivo**.
      Nueva `listHistorialEstado`, que comprueba antes que el lead es del tenant (`404`) y consulta
      **`lead.estado` y el `lead.update` histórico** — los cambios anteriores no se migran.
- [ ] `lead.service.ts` — **exportar** `buildLeadFilter` y `toLeadListItemResponse` si hoy son
      privadas: el pipeline las reutiliza y no puede tener una proyección paralela.
- [ ] `lead.controller.ts` — `updateLeadStageController`, `historialEstadoController`
      (`req.validatedQuery`, nunca `req.query`).
- [ ] `lead.routes.ts` — `PATCH /:id/stage` y `GET /:id/historial-etapa` **antes** de las rutas
      `/:id` genéricas. `PATCH /:id` **se conserva intacto**.
- [ ] `pipeline.types.ts` → `pipeline.validation.ts` → `pipeline.service.ts` →
      `pipeline.controller.ts` → `pipeline.routes.ts`. **Sin `.model.ts`: no estrena colección.**
      En el service: solo etapas activas, `Promise.all` por columna, `countScoped` para el `total`,
      resolución de responsables **en lote para todo el tablero** (una consulta, no una por columna),
      y **cero `aggregate`** (no hay `aggregateScoped`; el `$match: { tenantId }` a mano es
      justo lo que las reglas del proyecto no permiten).
- [ ] `app.ts` — `app.use('/api/pipeline', pipelineRoutes)` + `backfillEstadoDeclinado()` en la
      cadena de arranque, junto a `backfillEstados()`.

## Implementación — Frontend

> **Regla §7 (obligatoria):** invocar `emil-design-eng`, `impeccable:impeccable` y
> `frontend-design:frontend-design` **antes** de escribir cada componente, no como revisión
> posterior. Anotar aquí cuáles se aplicaron de verdad.

- [ ] `pnpm --filter @sofiapp/web add @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities`.
- [ ] `features/estados/types.ts` — `esSalida` en `EstadoDTO`.
- [ ] `features/leads/lib/errors.ts` — mover ahí el helper `motivo(error, fallback)` que hoy está
      duplicado en los hooks de mutación, y hacer que los existentes lo importen.
- [ ] `features/pipeline/{types,api,index}.ts` — DTOs y las dos llamadas. **Rutas sin `/api`**
      (`baseURL` ya lo aporta): `/pipeline` y `/leads/:id/stage`.
- [ ] `hooks/usePipeline.ts` — `['pipeline', filtros]`, `placeholderData: keepPreviousData` como
      hace `useLeads` (evita el parpadeo del esqueleto al cambiar un filtro).
- [ ] `hooks/useMoveLeadStage.ts` — **optimista**: `cancelQueries` → snapshot → `setQueryData`
      moviendo la tarjeta **y ajustando los dos `total`** → rollback en `onError` con el toast del
      mensaje del backend → `invalidateQueries` en `onSettled`.
- [ ] `hooks/usePipelineRealtime.ts` — `socket.on('lead:stage-changed')` → invalidar `['pipeline']`
      y `['leads']`; `off` en el cleanup. **No** llamar a `disconnectSocket()`: alternar entre las
      pestañas Tabla y Embudo reconectaría el socket en cada clic.
- [ ] `components/PipelineColumn.tsx` — `useDroppable`; cabecera con `label`, color por
      `tagColors(...)` y conteo; `ScrollArea`; estado vacío propio; marca visual discreta si
      `esSalida`; si `total > leads.length`, el «20 de 137» + «Ver en tabla» con el filtro aplicado.
- [ ] `components/PipelineCard.tsx` — `useDraggable`; nombre, teléfono, responsable, chip de semáforo
      y fecha. Es un `button` con `aria-roledescription`, **no** un `div` con handlers.
- [ ] `components/PipelineSkeleton.tsx` — esqueleto de columnas con `Skeleton`.
- [ ] `components/PipelineBoard.tsx` — `DndContext` con `PointerSensor` **y** `KeyboardSensor`,
      `DragOverlay`, y `announcements` en español para las cuatro fases (inicio, cambio de columna,
      soltado, cancelación). Estados de carga, vacío y error del tablero entero.
- [ ] `features/leads/pages/LeadsPage.tsx` — `Tabs` `Tabla | Embudo` con `?vista=` en la URL,
      conservando los filtros activos al cambiar de vista. El filtro de estado se oculta en la
      vista Embudo (el tablero ya agrupa por etapa).

## Documentación

- [ ] `docs/adr/0007-tablero-kanban-pipeline.md` — **nuevo**, con la plantilla de
      `docs/adr/README.md` (Estado · Fecha · Contexto · Decisión · Alternativas · Consecuencias).
      El contexto tiene que explicar **por qué se excluyó el Kanban en su día** (M02 original,
      proteger el MVP) y **qué cambió** para revertirlo, no limitarse a anunciar la decisión nueva.
- [ ] `docs/adr/README.md` — fila de 0007 y, **de paso, las de 0004 y 0005**, que existen como
      archivo pero faltan en el índice.
- [ ] `docs/product.md` §5 (M02) y «Módulos eliminados» — quitar «Sin tablero Kanban / sin
      drag&drop» y apuntar al ADR 0007.
- [ ] `docs/data-model.md` — `estados.esSalida`, la etapa `declinado`, la acción `lead.estado`, y
      **quitar** la nota «Kanban sigue descartado por `product.md` §5» (≈línea 324).
- [ ] `docs/domain.md` — la etapa de salida y qué distingue `perdido` de `declinado`.
- [ ] `docs/api-contract.md` §6 — `GET /api/pipeline`, `PATCH /api/leads/:id/stage`,
      `GET /api/leads/:id/historial-etapa`.
- [ ] `README.md` — la línea «pipeline comercial basado en `estadoComercial` (sin Kanban)» (≈64).
- [ ] `apps/frontend/CLAUDE.md` §Vistas núcleo — reemplazar «NO tablero Kanban, NO drag&drop», y
      **corregir de paso el endpoint obsoleto** que documenta ahí: dice
      `PATCH /api/clientes/:id/estado`, que no existe; es `PATCH /api/leads/:id` (y ahora `/stage`).
- [ ] `docs/specs/HU-CRM-01-*/spec.md` y `docs/specs/HU-CRM-03-listado-leads/spec.md` — nota de
      supersesión donde excluyen Kanban, igual que HU-CRM-04 la puso sobre HU-CRM-03.
- [ ] `lead.types.ts` — actualizar el comentario que dice «el lead NO introduce un pipeline propio
      (`docs/product.md` §5 descarta Kanban)». Sigue sin introducir pipeline propio, pero la razón
      ya no es válida.

## Tests

**Aislamiento (criterio 16):**

- [ ] `pipeline.isolation.test.ts` — el pipeline del tenant B **no trae ni cuenta** leads del A
      (`leads` vacío **y** `total: 0` en cada columna); el camino feliz del tenant A **sí** devuelve
      sus leads, para probar que el vacío es aislamiento y no un filtro roto; las etapas propias del
      A no aparecen en las columnas del B.
- [ ] `lead.isolation.test.ts` — el tenant B no mueve un lead del A por `/stage` (`404` **y el lead
      queda intacto**, releído desde el tenant A); no lee su historial de etapa.

**Servicio y feature:**

- [ ] `pipeline.service.test.ts` — agrupado correcto; orden por `orden`; `total` por columna
      distinto de `leads.length` cuando hay más de `limit`; columna sin leads presente con
      `total: 0`; etapa archivada **excluida**; filtros combinados (`asesor` + rango de fechas);
      `?semaforo=` desconocido → columnas vacías, no `400`; tope por columna respetado.
- [ ] `lead.estado.test.ts` — transición libre entre activas, **incluido retroceder**; a etapa
      archivada → `400` **sin grabar**; clave inexistente → `400`; idempotencia con `200`, sin
      escritura, **sin entrada de historial y sin evento**; historial ordenado descendente, paginado,
      con el actor resuelto y **sin colar** `lead.create` ni `lead.delete`; historial que **sí**
      incluye los `lead.update` antiguos; `publishRealtime` llamado **una sola vez** por cambio
      efectivo (mockeado con `vi.mock('../../realtime/realtime.publisher.js')`).
- [ ] `estado.service.test.ts` — `existeEstadoActivo` distingue activa de archivada;
      `toResponse` devuelve `esSalida: false` para un documento anterior al feature.
- [ ] `seed-estados` — `backfillEstadoDeclinado` es idempotente (dos corridas seguidas, una sola
      etapa) y **no pisa** el `label` ni el `color` de un `declinado` ya renombrado.
- [ ] `lead.routes.test.ts` — contrato HTTP con CSRF de `PATCH /:id/stage` (`200`, llave de más →
      `400`, etapa archivada → `400`, lead ajeno → `404`, sin CSRF → `403`, `superadmin` → `403`) y
      de `GET /:id/historial-etapa`. **Y que `PATCH /:id` sigue en verde.**
- [ ] `pipeline.routes.test.ts` — `GET /api/pipeline` `200`; `?estado=` → `400` por `.strict()`;
      `?limit=99` → `400`; sin JWT → `401`.

**Frontend:**

- [ ] `PipelineBoard.test.tsx` — columnas pintadas, estado vacío, estado de error con reintento.
- [ ] `PipelineColumn.test.tsx` — cabecera con conteo; el «N de M» solo cuando `total > leads.length`.
- [ ] `PipelineCard.test.tsx` — datos del lead; el elemento arrastrable es accesible por teclado.
- [ ] `useMoveLeadStage.test.ts` — la tarjeta se mueve **antes** de que responda el servidor; en
      error vuelve a su columna y sale el **mensaje del backend**, no el genérico; los `total` de
      ambas columnas se ajustan.
- [ ] `LeadsPage.test.tsx` — el toggle cambia de vista, escribe `?vista=embudo` y **conserva los
      filtros** activos.

## Verificación final

- [ ] `pnpm --filter @sofiapp/api typecheck` en verde.
- [ ] `pnpm --filter @sofiapp/api test` en verde (anotar archivos · tests).
- [ ] `pnpm --filter @sofiapp/web lint` sin warnings.
- [ ] `pnpm --filter @sofiapp/web build` (incluye `tsc --noEmit`) en verde.
- [ ] `pnpm --filter @sofiapp/web test` — anotar el resultado y, si algo falla, **distinguir deuda
      previa de regresión** comparando contra `origin/develop` limpio.
- [ ] Checklist de PR de `docs/multi-tenancy.md` §9: toda query por `*Scoped`, `tenantId` del token,
      rutas tras `authenticateJWT → requireTenant`, tests de aislamiento añadidos. (No hay modelo
      nuevo: el feature `pipeline` no estrena colección.)
- [ ] **Arranque manual de `app.ts` y `worker.ts`** contra la base de desarrollo, comprobando en el
      log que `backfillEstadoDeclinado` corre y siembra los tenants existentes. Para ejercitarlo de
      verdad: renombrar «Declinado» en un tenant, volver a arrancar y confirmar que el renombrado
      **queda intacto** (criterio 8 comprobado en vivo, no solo en memoria).
- [ ] **Criterios 1–11 y 16 ejercidos por HTTP** contra la API real (`curl` con cookie de sesión y
      CSRF): pipeline con y sin filtros, `?estado=` → `400`, `?limit=99` → `400`, columna vacía con
      `total: 0`; `/stage` feliz, idempotente, a etapa archivada → `400`, con llave de más → `400`,
      lead ajeno → `404`; historial paginado, descendente, sin `lead.create`; y el tenant B
      recibiendo `404` en `/stage` y `/historial-etapa` con el lead **intacto** al releerlo desde A.
- [ ] **Tiempo real (criterio 11) con dos pestañas** abiertas en el tablero: mover una tarjeta en
      una y ver que la otra se actualiza sola. Comprobar además que un cambio **idempotente** no
      emite nada.
- [ ] **Cierre manual (DoD):** mover oportunidades por todas las etapas con el ratón **y con el
      teclado**, comprobar el rollback desconectando la red a mitad de un arrastre, y repetir todo
      en **claro y en oscuro**.
- [ ] `git status` sin capturas `*.png` / `*.jpg` coladas.
- [ ] `spec.md` → `**Estado:** implementado`.

## Definición de "hecho"

Las oportunidades se ven agrupadas por etapa en un tablero, se mueven de una etapa a otra
arrastrándolas —o con el teclado—, el cambio persiste, queda registrado con su autor y su fecha en
un historial consultable, y aparece **en vivo** en el tablero de los demás administradores de la
empresa. Existe la etapa de salida «Declinado» en todos los tenants. Nada de esto permite a una
empresa ver ni mover los leads de otra, y la documentación del repositorio ya no afirma que el
Kanban esté descartado.
