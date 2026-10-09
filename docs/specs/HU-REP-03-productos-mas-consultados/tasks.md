# HU-REP-03 — Tasks (checklist ejecutable)

> Claude Code: ejecuta en orden y marca cada casilla al terminarla. El `tenantId` sale solo del token
> (HTTP) o del job (worker/script), y todo acceso pasa por `*Scoped`. El clasificador **nunca lanza**
> y respeta el freno de costo.

## 0. Rama
- [x] Trabajar sobre `feat/HU-REP-01`, sin rama nueva, sin checkout y sin push. Verificar antes que
      HU-REP-02 ya está commiteada (si no, pedirlo) para que los commits queden separados.

## Backend — A. Vocabulario desde la KB
- [x] 1. `features/kb/kb-productos.reader.ts`:
  - `listarProductosKb` + `normalizarClave`;
  - constantes de ids congelados;
  - `version` = hash;
  - nunca lanza por datos mal formados.

## Backend — B. Clasificación de tema
- [x] 2. `env.ts`: `TEMA_AUTO`, `TEMA_MIN_TURNOS_CLIENTE`, `TEMA_MIN_CONFIANZA`,
      `TEMA_RECLASIFICAR_CADA`, `TEMA_RECLASIFICAR_ESTABLE`.
- [x] 3. Añadir el método `topic` en `prompt-template.model`, `ai-usage-log.model`,
      `ai-response-context.model`, `ai.types` y `ai.validation`.
- [x] 4. `seed-prompt-templates.ts`: `TOPIC_TEMPLATE_VERSION = '1.0.0'` y `TOPIC_SYSTEM_PROMPT`
      (elige UN producto de la lista o `otros`, sin inventar; confianza en [0,1]) con su entrada.
- [x] 5. `llm-provider.types.ts`: `ClassifyTopicOutput` + `classifyTopic`. `gemini.provider.ts`, con
      el `enum` dinámico.
- [x] 6. `ai-service.types.ts` + `AIService.classifyTopic` (plantilla, caché con versión de la
      lista, saneado, usage log).
- [x] 7. `cliente.model.ts`/`cliente.types.ts`: subdoc `temaIA`, sin índice.
      `audit.types.ts`: `'cliente.tema'`.
- [x] 8. Mover `construirHistorial` a `ai-shared.ts` (export), sin cambiar su comportamiento.
- [x] 9. `ai-topic.service.ts`: `debeClasificar` (pura) + `clasificarTemaSiHaceFalta`:
  - guard y freno;
  - mapeo, umbral y `repeticiones`;
  - escritura con `$set`;
  - auditoría solo si la clave cambia;
  - `catch`.
- [x] 10. `ai-reply.processor.ts`: llamarlo tras `extraerDatosSiHaceFalta`.

## Backend — C. Backfill
- [x] 11. `scripts/backfill-temas-conversacion.ts`:
  - `backfillTemas(opts)` exportado;
  - CLI con `--tenant`, `--desde`, `--limite`, `--pausa-ms` y `--dry-run`;
  - resumen final.
- [x] 12. `package.json`: `"backfill:temas"`.

## Backend — D. Reporte (`features/reports/`)
- [x] 13. `reports.types.ts`: `TOP_DEFAULT = 10`, `TOP_MAX = 50`, `ITopProductRow`, `ITopProductsResponse`.
- [x] 14. `reports.validation.ts`: `topProductsQuerySchema` (rango común + `top`).
- [x] 15. `reports.service.ts`: `getTopProducts`:
  - agregación;
  - vocabulario vigente;
  - merge de `otros` / `sinClasificar` / `restantes` / `enCatalogo`.
- [x] 16. Controller + `GET /top-products` con `authorizeSubrol(SUBROLES_REPORTES)`. No hace falta
      montaje nuevo.

## Tests (backend)
- [x] 17. `kb-productos.reader.test`:
  - lee las filas de la estructura `productos`;
  - ignora documentos ocultos, otros schemas, filas sin nombre y formas inesperadas;
  - deduplica por clave;
  - la `version` cambia al editar un producto;
  - no lee la KB de otro tenant.
- [x] 18. `ai-topic.service.test` (AI mockeado):
  - solo usa opciones de la KB; un nombre ajeno o confianza baja → `otros`;
  - guard: off, sin productos, demo o pocos mensajes → no llama al modelo;
  - freno: reclasifica a los 3 mensajes nuevos y a los 15 si es estable; un cambio en la lista
    reclasifica; dos jobs sin mensajes suficientes → una sola llamada;
  - `repeticiones` sube con la misma clave y vuelve a 1 al cambiar;
  - audita solo cuando la clave cambia;
  - 429 o error → `fallida`, sin lanzar.
- [x] 19. `ai-topic.isolation.test`: solo se ofrecen los productos del tenant del job, y nunca se
      escribe en un cliente de otro tenant.
- [x] 20. `ai.service.test` (`classifyTopic`: plantilla, caché, saneado) y `gemini.provider.test`
      (`enum` en `responseSchema`).
- [x] 21. `ai-reply.processor.test`: el clasificador se invoca tras responder; si falla, el job no falla.
- [x] 22. `backfill-temas-conversacion.test`:
  - clasifica los candidatos;
  - respeta `--desde`, demo y `--tenant`;
  - `--dry-run` no escribe;
  - una segunda corrida da 0 clasificadas;
  - un fallo cuenta como `fallida` sin cortar la corrida.
- [x] 23. `reports.top-products.routes.test`:
  - 401 · 500 superadmin · 403 coordinator/secretary · 200 admin/director/manager;
  - 400 con rango inválido y con `top` 0 y 51;
  - valores por defecto.
- [x] 24. `reports.top-products.service.test`:
  - **DoD**: conteos iguales a los calculados aparte;
  - fuera de rango, demo y huérfanos no cuentan;
  - `otros`, `sinClasificar` y `restantes`;
  - un producto retirado sale con `enCatalogo: false`;
  - `catalogoDisponible`;
  - Σ y `share`.
- [x] 25. `reports.top-products.isolation.test`:
  - los datos de B no suman en A;
  - `?tenantId=` se ignora;
  - sin PII.
- [x] 26. Regresión: suites de `reports` (REP-01/02), `ai-semaforo`, `ai-extract`,
      `ai-reply.processor`, `kb` y `cliente`.

## Docs
- [x] 27. ADR 0012 + índice; `domain.md`; `data-model.md`; `api-contract.md`; `integrations/llm-provider.md`.

## Frontend
> Antes de cada componente: `emil-design-eng`, `impeccable:impeccable` y
> `frontend-design:frontend-design` (+ `dataviz`). shadcn/ui; light y dark.
- [x] 28. `api/reports.ts` `getTopProducts`; tipos; `useTopProducts`.
- [x] 29. `TopProductsKpiStrip`, `TopProductsChart` y `TopProductsPage`:
  - periodo y `top` en la URL;
  - vacío sin consultas y vacío sin productos en la KB, con enlace a `/settings/knowledge`;
  - error con reintento.
- [x] 30. Ruta lazy `/reports/top-products` (`RequireRole` + `RequireReportes`) e ítem en "Reportes".
- [x] 31. `TopProductsPage.test`:
  - pinta el ranking y los KPIs con la API mockeada;
  - `top` y rango de la URL llegan al endpoint;
  - los dos vacíos;
  - error → reintentar.

## Verificación final
- [x] `pnpm --filter @sofiapp/api typecheck`
- [x] `pnpm --filter @sofiapp/api test` (nuevos + regresión + aislamiento)
- [x] `pnpm --filter @sofiapp/web build && pnpm --filter @sofiapp/web lint` + test de página
- [ ] Manual: *(pendiente: requiere datos reales y navegador; ver nota de implementación)*
  - KB con productos → conversación con la IA → `backfill:temas -- --dry-run` y luego la corrida real;
  - ranking en light y dark;
  - coordinator no ve el reporte;
  - capturas en `.playwright-mcp/`, borradas al terminar.
- [x] Checklist PR de `docs/multi-tenancy.md` §9:
  - todo por `*Scoped`;
  - `tenantId` del token o del job;
  - `$lookup` con `tenantId`;
  - tests de aislamiento presentes.
- [ ] `git status` sin `*.png`; commits separados según `plan.md`. *(sin commits todavía: a la espera de tu visto bueno)*

## Definición de "hecho"
- Criterios 1–10 de `spec.md` verificados, con el DoD cubierto por test.
- Freno de costo probado; backfill ejecutable e idempotente; clasificador en línea sin fallos de job.
- `spec.md` → `**Estado:** implementado` (lo hace `/sdd-implement`).

## Nota de implementación
- Skills de diseño: `frontend-design:frontend-design` y `dataviz` invocadas antes de los componentes.
  `emil-design-eng` e `impeccable:impeccable` **no están instaladas** en el entorno; se anota según
  el plan.
- Verificación manual (KB con productos → conversación → `backfill:temas` → ranking en light/dark,
  capturas) **no ejecutada**: necesita la base de datos y Gemini reales. Queda para la revisión de
  `/sdd-release`.
- `.env.example` no se actualizó con las variables `TEMA_*` (todas tienen default en `env.ts`).

