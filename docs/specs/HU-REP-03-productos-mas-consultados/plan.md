# HU-REP-03 — Plan técnico (CÓMO)

## Árbol de archivos a crear / modificar

### Backend

```
apps/backend/src/
├── features/kb/kb-productos.reader.ts               ← CREAR: listarProductosKb(tenantId) → { productos, version }
├── features/kb/kb-productos.reader.test.ts          ← CREAR (contrato de ids congelados + aislamiento)
├── integrations/llm/llm-provider.types.ts           ← AMPLIAR: ClassifyTopicOutput + classifyTopic()
├── integrations/llm/gemini.provider.ts              ← AMPLIAR: classifyTopic (responseSchema con enum dinámico)
├── services/ai/ai-service.types.ts                  ← AMPLIAR: AiClassifyTopicParams, ClassifyTopicResult
├── services/ai/ai.service.ts                        ← AMPLIAR: classifyTopic() (plantilla 'topic', caché, usage log)
├── services/ai/prompt-template.model.ts             ← AMPLIAR: method + 'topic'
├── services/ai/ai-usage-log.model.ts                ← AMPLIAR: method + 'topic'
├── services/ai/ai-response-context.model.ts         ← AMPLIAR: method + 'topic'
├── features/ai/ai.types.ts, ai.validation.ts        ← AMPLIAR: 'topic' en las uniones/enum de método
├── seed/seed-prompt-templates.ts                    ← AMPLIAR: TOPIC_TEMPLATE_VERSION + TOPIC_SYSTEM_PROMPT + entrada
├── config/env.ts                                    ← AMPLIAR: TEMA_* (5 variables)
├── features/cliente/cliente.model.ts, cliente.types.ts ← AMPLIAR: subdoc temaIA
├── features/audit/audit.types.ts                    ← AMPLIAR: 'cliente.tema'
├── features/ai/ai-shared.ts                         ← AMPLIAR: construirHistorial (movido desde el processor)
├── features/ai/ai-topic.service.ts                  ← CREAR: clasificarTemaSiHaceFalta (freno, nunca lanza)
├── features/ai/ai-topic.service.test.ts             ← CREAR
├── features/ai/ai-topic.isolation.test.ts           ← CREAR
├── workers/ai-reply.processor.ts                    ← TOCAR: importar construirHistorial; enganchar el clasificador
├── workers/ai-reply.processor.test.ts               ← AMPLIAR
├── scripts/backfill-temas-conversacion.ts           ← CREAR (+ .test.ts)
├── features/reports/reports.types.ts                ← AMPLIAR: TOP_DEFAULT/MAX, ITopProductRow, ITopProductsResponse
├── features/reports/reports.validation.ts           ← AMPLIAR: topProductsQuerySchema (rango común + top)
├── features/reports/reports.service.ts              ← AMPLIAR: getTopProducts
├── features/reports/reports.controller.ts, reports.routes.ts ← AMPLIAR: GET /top-products
├── features/reports/reports.fixtures.ts             ← AMPLIAR: crearProductosKb, clasificarHilo
└── features/reports/reports.top-products.{service,routes,isolation}.test.ts ← CREAR
apps/backend/package.json                            ← AMPLIAR: "backfill:temas"
```

> Sin feature nuevo ni montaje nuevo en `app.ts`, sin colección nueva y sin índice nuevo. El
> reporte parte de `messages` igual que `contarAtendidas`. El lector de la KB usa
> `findOneScoped(KbDocument)` con el índice `{ tenantId, titulo }` existente, filtrando por
> `estructura.schemaId` en memoria: hay ~5 documentos por tenant.

### Frontend

```
apps/frontend/src/
├── api/reports.ts                                   ← AMPLIAR: getTopProducts
├── features/reports/
│   ├── types/{domain,api,index}.ts                  ← AMPLIAR: TopProducts, TopProductsParams (rango + top)
│   ├── hooks/useTopProducts.ts                      ← CREAR
│   ├── components/{TopProductsKpiStrip,TopProductsChart}.tsx ← CREAR
│   └── pages/{TopProductsPage.tsx, TopProductsPage.test.tsx}  ← CREAR
├── components/layout/nav-config.ts                  ← AMPLIAR: ítem "Productos más consultados" en Reportes
└── router.tsx                                       ← AMPLIAR: /reports/top-products (lazy + RequireRole + RequireReportes)
```

### Docs
- `docs/adr/0012-tema-por-conversacion.md` (+ índice): granularidad, vocabulario desde la KB y su
  acoplamiento, freno de coste, atribución al tema actual.
- `docs/domain.md`: sección "Productos más consultados" (consulta, tema, `otros`, `sinClasificar`).
- `docs/data-model.md`: `clientes.temaIA`, `audit_events` `cliente.tema`, método de plantilla
  `topic`, y nota en `kb_documents` (la estructura `productos` tiene un lector en backend).
- `docs/api-contract.md`: `GET /api/reports/top-products`.
- `docs/integrations/llm-provider.md`: `classifyTopic`.

## Contratos

### Lector de productos — `features/kb/kb-productos.reader.ts`
```ts
export const KB_SCHEMA_PRODUCTOS = 'productos';   // ids congelados por HU-KB-09
export const KB_CAMPO_CATALOGO = 'catalogo';
export interface ProductoKb { clave: string; nombre: string; descripcion?: string }
export async function listarProductosKb(tenantId: string): Promise<{ productos: ProductoKb[]; version: string }>;
export function normalizarClave(nombre: string): string;   // minúsculas, sin acentos, espacios colapsados
```
- `findScoped(KbDocument, tenantId, { oculto: { $ne: true } })` y selección del documento con
  `estructura.schemaId === 'productos'`.
- Lee `campos.catalogo` solo si es `{ tipo: 'repetible', items }`, descarta filas sin `nombre` y
  deduplica por `clave`.
- `version` = hash corto (sha1, 12 car.) de `clave:descripcion` de los productos ordenados.
- Cualquier forma inesperada → `{ productos: [], version: '' }`. Nunca lanza por un dato mal formado.

### LLM
```ts
export interface ClassifyTopicOutput { tema: string; confianza: number }   // tema ∈ nombres ∪ {'otros'}
classifyTopic(input: {
  historial: ChatTurn[];
  instrucciones: string;                                        // systemPrompt de la plantilla 'topic'
  opciones: Array<{ nombre: string; descripcion?: string }>;
}): Promise<LlmCallResult<ClassifyTopicOutput>>;
```
- **Gemini:** `responseSchema` `{ tema: { type: STRING, enum: [...nombres, 'otros'] }, confianza: NUMBER }`.
  La lista con sus descripciones se anexa a `systemInstruction`.
- **`AIService.classifyTopic`:**
  - resuelve la plantilla `topic`;
  - cachea con `buildCacheKey(tenant, 'topic', { historial, version }, template.version)` y TTL
    `AI_CACHE_TTL_CLASSIFY_S`;
  - sanea `confianza` a [0,1];
  - registra uso con `method: 'topic'`.

### Clasificador — `features/ai/ai-topic.service.ts`
```ts
export type ResultadoTema = 'clasificada' | 'saltada' | 'fallida';
export async function clasificarTemaSiHaceFalta(
  tenantId: string, clienteId: string, historial?: ChatTurn[],
): Promise<ResultadoTema>;                                      // nunca lanza
export function debeClasificar(
  tema: ITemaIA | undefined, mensajesCliente: number, catalogoVersion: string,
): boolean;                                                     // pura: el freno, testeable aislado
```
1. `TEMA_AUTO === 'off'` → `saltada`.
2. `findByIdScoped(Cliente)`; inexistente o demo → `saltada`.
3. `listarProductosKb`; vacío → `saltada`.
4. `mensajesCliente = countScoped(Message, { clienteId, sender: 'user' })`;
   `< TEMA_MIN_TURNOS_CLIENTE` → `saltada`.
5. `debeClasificar` evalúa el freno:
   - sin `temaIA` → sí;
   - `catalogoVersion` distinta → sí;
   - `nuevos = mensajesCliente − temaIA.mensajesCliente`;
   - umbral = `repeticiones >= 2 ? TEMA_RECLASIFICAR_ESTABLE : TEMA_RECLASIFICAR_CADA`;
   - `nuevos >= umbral` → sí.
6. `historial ??= construirHistorial(...)` → `classifyTopic`. Se mapea por nombre exacto a un
   producto; si no hay coincidencia o `confianza < TEMA_MIN_CONFIANZA` → `clave: null`.
7. `repeticiones = misma clave que la anterior ? anterior + 1 : 1`.
   `findOneAndUpdateScoped(Cliente, { $set: { temaIA } })`.
8. Si la `clave` cambió → `recordAuditEvent` `cliente.tema`
   (`actorId: null`, `antes/despues: { clave, nombre }`, `confianza`).
9. `catch` → `logger.warn` y `fallida`.

Enganche: en `processAiReplyJob`, tras `extraerDatosSiHaceFalta`, llamar a
`clasificarTemaSiHaceFalta(tenantId, clienteId, historial)`. `construirHistorial` se mueve a
`ai-shared.ts` sin cambiar su comportamiento.

### Env (patrón `SEMAFORO_*`)
`TEMA_AUTO` (`on`/`off`, default `on`) · `TEMA_MIN_TURNOS_CLIENTE` (2) · `TEMA_MIN_CONFIANZA` (0,6) ·
`TEMA_RECLASIFICAR_CADA` (3) · `TEMA_RECLASIFICAR_ESTABLE` (15).

### Backfill — `scripts/backfill-temas-conversacion.ts`
`pnpm --filter @sofiapp/api backfill:temas -- [--tenant <id>] [--desde YYYY-MM-DD] [--limite N] [--pausa-ms 1500] [--dry-run]`
- `--desde` por defecto = hoy − 90 días. Recorre en serie los clientes no demo con
  `ultimoMensajeAt >= desde`, por tenant, llamando a `clasificarTemaSiHaceFalta`. Es el mismo guard y
  el mismo freno, así que es idempotente.
- `--pausa-ms` va entre llamadas efectivas, para la cuota de Gemini.
- `--dry-run` solo cuenta los candidatos que superan el freno.
- Al terminar imprime `{ candidatos, clasificadas, saltadas, fallidas }`.
- `backfillTemas(opts)` se exporta para testearlo sin CLI.

### Reporte — `getTopProducts(tenantId, q, now)`
`topProductsQuerySchema` = rango común + `top: z.coerce.number().int().min(1).max(50).default(10)`.

| Paso | Pipeline |
|---|---|
| Consultas por tema | `aggregateScoped(Message)`: `$match { sender:'user', createdAt∈rango }` → `$group { _id:'$clienteId' }` → `lookupScoped(clientes, tenantOid, '$_id', { metaUserId:1, temaIA:1 }, 'c')` → `$unwind` → `$match` no demo → `$group { _id: { $cond: [ { $ifNull: ['$c.temaIA', false] }, { $ifNull: ['$c.temaIA.clave', '__otros'] }, '__sin' ] }, n:{$sum:1}, nombre:{$last:'$c.temaIA.nombre'} }` |
| Vocabulario vigente | `listarProductosKb(tenantId)`: nombre actual y `enCatalogo` |

Merge:
- `__sin` → `sinClasificar`; `__otros` → `otros`.
- Cada clave toma el nombre actual de la KB si existe (`enCatalogo: true`) o el guardado
  (`enCatalogo: false`).
- Orden desc + nombre; el corte en `top` va a `restantes`; `share = ratio(n, clasificadas)`.
- `catalogoDisponible = productos.length > 0`.

## Frontend
- `useTopProducts(params)`: queryKey `['reports','top-products', params]`, `keepPreviousData`,
  `staleTime: 60_000`. El `top` va en la URL con `useSearchParams`, junto al periodo.
- `TopProductsChart`: barras horizontales (precedente `AdvisorBarsChart`), `--chart-1`, `LabelList`
  "140 · 36,8 %". "Otros" y "Resto de productos" con `--muted-foreground`.
- Ruta lazy con `RequireRole` + `RequireReportes`; ítem de menú con `subroles: SUBROLES_REPORTES`.
- Antes de cada componente: `emil-design-eng`, `impeccable:impeccable`,
  `frontend-design:frontend-design` (+ `dataviz`). Las que no estén instaladas se anotan.

## Trazabilidad

| CA | Plan | Test |
|---|---|---|
| 1 | lector KB | `kb-productos.reader.test` |
| 2 | classifyTopic + clasificador | `ai-topic.service.test`, `ai.service.test`, `gemini.provider.test` |
| 3 | `debeClasificar` + guard | `ai-topic.service.test`, `backfill-temas-conversacion.test` |
| 4 | catch | `ai-topic.service.test`, `ai-reply.processor.test` |
| 5 | backfill | `backfill-temas-conversacion.test` |
| 6, 7 | getTopProducts | `reports.top-products.routes.test`, `.service.test` (DoD) |
| 8 | frontend | `TopProductsPage.test` + build |
| 9 | docs + ADR | revisión |
| 10 | scoped + `$expr tenantId` | `kb-productos.reader.test`, `ai-topic.isolation`, `reports.top-products.isolation` |

## Notas
- **Coste:**
  - ~800–1.400 tokens por clasificación. Con el freno, 1–2 por conversación típica.
  - El backfill cuesta lo mismo, una sola vez por conversación histórica.
  - `TEMA_AUTO=off` lo apaga sin desplegar.
- **Sin script de migración de plantilla:** `topic` es un método nuevo y el seed de arranque
  (`app.ts:148`, `$setOnInsert`) lo inserta. Hará falta `migrate-topic-template.ts` cuando cambie
  su versión.
- Las conversaciones que la IA no atiende solo se clasifican con el backfill. Hasta entonces cuentan
  como `sinClasificar`, y el dashboard lo muestra.
- **Commits:**
  - `feat(api): add conversation topic classification`
  - `feat(api): add top products report endpoint`
  - `feat(web): add top products dashboard`
  - `docs(docs): document top products report`

  HU-REP-02 debe estar commiteada antes.

## Verificación
- `pnpm --filter @sofiapp/api typecheck` · `pnpm --filter @sofiapp/api test`.
- `pnpm --filter @sofiapp/web build && pnpm --filter @sofiapp/web lint` · test de página.
- Manual:
  1. Llenar "Productos y servicios" en la KB.
  2. Conversar con la IA.
  3. Correr `backfill:temas -- --dry-run` y luego la corrida real.
  4. Ver el ranking en `/reports/top-products`, en light y dark.
