# HU-REP-03 — Productos más consultados (spec)

> **Spec-Driven Development.** Este es el QUÉ y el porqué. El CÓMO va en `plan.md`; la ejecución en
> `tasks.md`. Tercer reporte **de tenant**. A diferencia de HU-REP-01/02, el dato no existe todavía:
> la historia trae la clasificación con IA que lo produce y el backfill del histórico, además del
> reporte. Alcance reducido (opción **1A**): el vocabulario son los productos que la empresa ya
> cargó en su base de conocimiento, sin catálogo nuevo.

**Estado:** implementado

## Historia

> Como **gerente** quiero identificar los productos más consultados por los clientes (dashboard).
> Detectar los temas/productos más frecuentes en las conversaciones.

## Objetivo

Ranking de los productos/servicios de la empresa más consultados en un periodo, servido por
`GET /api/reports/top-products` y pintado en `/reports/top-products`. Cada conversación se clasifica
con IA contra la lista **cerrada** de productos de su base de conocimiento. **Definition of Done:** el
ranking refleja los temas realmente más consultados en el periodo: sus conteos coinciden con las
conversaciones con consultas del periodo agrupadas por su tema clasificado.

Ruta **tenant-scoped** estándar (`docs/multi-tenancy.md` §2–§4). La clasificación también: `tenantId`
del job o del script, nunca de un dato del cliente.

## Alcance

**Incluye:**
1. **Vocabulario desde la KB:** lector de backend de los productos de la tarjeta "Productos y
   servicios" (HU-KB-09): `KbDocument.estructura` con `schemaId: 'productos'`, campo `catalogo`
   (`repetible`, máx. 12 filas `{ nombre, descripcion }`).
2. **Clasificación de tema por conversación (IA):** método nuevo `topic` en `AIService` /
   `ILlmProvider`, plantilla `topic` versionada y clasificador `clasificarTemaSiHaceFalta`, que corre
   al final del job de auto-reply, **con freno de costo** y que **nunca lanza**. Escribe
   `Cliente.temaIA`; audita `cliente.tema` solo cuando el tema cambia.
3. **Backfill** idempotente (`scripts/backfill-temas-conversacion.ts`) para el histórico y las
   conversaciones que la IA no atiende.
4. **Reporte** `GET /api/reports/top-products?desde&hasta&top` y dashboard `/reports/top-products`,
   con el mismo gate que HU-REP-01/02 (ADR 0011).
5. ADR 0012 y docs (`domain`, `data-model`, `api-contract`, `integrations/llm-provider`).

**Fuera de alcance (recortado en la opción 1A):**
- El catálogo propio `CatalogItem` (M08), su CRUD, la página `/catalogo` y la escritura de
  `Cliente.interesItemId`. Siguen documentados como pendientes.
- Identidad estable de producto: las filas de la KB no tienen id (ver D2).
- Edición manual del tema por el asesor; varios temas por conversación; clasificación por mensaje.
- Agendar el backfill como cron; tendencia temporal; export; tiempo real.

## Decisiones

### D1 — Granularidad: por conversación
Se clasifica la **conversación** (el hilo `Cliente`), no cada mensaje. Tiene contexto completo,
cuesta una sola llamada y es coherente con `semaforoIA` (HU-IA-05). Clasificar por mensaje
multiplicaría el coste y metería ruido ("sí", "gracias", audios). El ranking cuenta
**conversaciones**, igual que HU-REP-01/02: una consulta = una conversación.

### D2 — Vocabulario: los productos de la base de conocimiento
- La IA elige **uno** de los productos de la tarjeta "Productos y servicios" del tenant, o `otros`.
- Es una lista cerrada que la empresa ya mantiene (es una categoría obligatoria de la KB). Su tope
  de 12 filas cabe holgado en el prompt, y no obliga a cargar los productos dos veces.
- **Clave del producto = nombre normalizado** (minúsculas, sin acentos ni espacios repetidos): las
  filas no tienen id. Si la empresa renombra un producto, lo ya clasificado queda bajo el nombre
  anterior y aparece marcado `enCatalogo: false`. Es una limitación aceptada.
- **Acoplamiento documentado:** el backend guarda `estructura` sin interpretarla (HU-KB-07). Este
  reporte la lee en un punto único, apoyado en ids que HU-KB-09 congeló (`productos`, `catalogo`,
  `nombre`, `descripcion`). Un test fija ese contrato.
- Sin la tarjeta llena no hay vocabulario: no se clasifica y el dashboard lo dice.
- `datosExtraidos.interes` (texto libre, HU-IA-06) **no** entra al ranking.

### D3 — Persistencia: en `Cliente`
`Cliente.temaIA = { clave, nombre, confianza, at, mensajesCliente, repeticiones, catalogoVersion, modelo }`.
`clave: null` significa `otros`. Sin colección nueva. Los cambios de tema quedan en `audit_events`
(`cliente.tema`).

### D4 — Cuándo se clasifica, con freno de costo
- **En línea:** al final de `processAiReplyJob`, tras el semáforo y la extracción.
- **Backfill:** script por tenant/periodo.
- Los dos pasan por el **mismo guard** (`clasificarTemaSiHaceFalta`), que **no** llama al modelo si:
  - `TEMA_AUTO=off`;
  - el tenant no tiene productos en la KB;
  - la conversación es demo o no existe;
  - el cliente lleva menos de `TEMA_MIN_TURNOS_CLIENTE` mensajes;
  - **o el freno lo frena:** sin `temaIA`, clasifica; con la lista de productos cambiada
    (`catalogoVersion`), reclasifica; en otro caso reclasifica solo cuando el cliente escribió
    `TEMA_RECLASIFICAR_CADA` (3) mensajes nuevos desde la última vez, o `TEMA_RECLASIFICAR_ESTABLE`
    (15) si el tema salió igual 2 veces seguidas (`repeticiones >= 2`).
- **Coste esperado:** 1–2 llamadas de ~1.000 tokens por conversación, no una por ráfaga.
- **Idempotencia:** backfill y clasificador en línea no duplican, porque el segundo en llegar no
  supera el freno. La escritura es `$set` y el evento se audita solo si la `clave` cambió.
- **Fallo del LLM / 429:** se captura, se registra `warn` y se sigue. No marca el job como fallido
  (mismo criterio que `clasificarYAplicarSemaforo`). El backfill cuenta los fallos y una
  re-ejecución los recoge.
- Si la confianza queda por debajo de `TEMA_MIN_CONFIANZA` (0,6), se guarda como `otros`.

### D5 — Unidad del ranking
- **Consulta del periodo:** conversación (no demo, cliente existente en el tenant) con ≥1 `Message`
  `sender: 'user'` y `createdAt` en el rango.
- Se agrupa por su **tema actual** (`temaIA.clave`). Limitación aceptada, igual que el "asesor
  actual" de HU-REP-01: si el tema de un hilo cambió, el periodo anterior se atribuye al tema nuevo.
- Grupos:
  - cada producto (`clave`);
  - `otros`: clasificada, pero ningún producto encaja;
  - `sinClasificar`: sin `temaIA`.
- Una `clave` que ya no está en la KB sigue apareciendo con el `nombre` guardado y `enCatalogo: false`.
- `share = conversaciones / clasificadas` (4 decimales, `ratio`), con
  `clasificadas = totalConsultas − sinClasificar`.
- `top` (1..50, default 10) recorta el ranking; el resto se suma en `restantes`.
  Σ `ranking` + `restantes` + `otros` = `clasificadas`.

### D6 — Dashboard: página propia
`/reports/top-products` ("Productos más consultados") en el grupo **Reportes**.

## Contrato del endpoint

`GET /api/reports/top-products`

| Query | Tipo | Default | Notas |
|---|---|---|---|
| `desde` | fecha ISO | hoy − 29 días | Inclusivo. |
| `hasta` | fecha ISO | hoy | Inclusivo (fin de día). Máx. 366 días. |
| `top` | entero 1..50 | 10 | Tamaño del ranking. |

**200:**

```jsonc
{
  "generadoAt": "2026-10-08T15:00:00.000Z",
  "rango": { "desde": "2026-09-09T00:00:00.000Z", "hasta": "2026-10-08T23:59:59.999Z" },
  "catalogoDisponible": true,          // la KB del tenant tiene productos
  "totalConsultas": 412,
  "clasificadas": 380,
  "sinClasificar": 32,
  "ranking": [
    { "clave": "curso pre-icfes intensivo", "nombre": "Curso Pre-ICFES intensivo", "enCatalogo": true, "conversaciones": 140, "share": 0.3684 }
  ],
  "otros": { "conversaciones": 41, "share": 0.1079 },
  "restantes": { "productos": 3, "conversaciones": 12, "share": 0.0316 }
}
```

Orden por `conversaciones` desc, desempate `nombre`. Solo nombres de producto (dato de la empresa) y
conteos: **sin** teléfonos, nombres de contacto, textos ni `motivo` del modelo.

**Errores:** 401 · 403 (`coordinator`/`secretary`) · superadmin cortado por `requireTenant` (500) ·
400 (rango inválido, `top` fuera de 1..50).

## Diseño de la UI

`/reports/top-products` (admin sin subrol, director, manager):
1. Cabecera + `PeriodFilter` + selector de tamaño (Top 5/10/20), todo en la URL.
2. KPI strip: Consultas · Producto más consultado (celda con acento) · Clasificadas (% del total) ·
   Sin clasificar.
3. Ranking en barras horizontales (una serie, `--chart-1`), con rótulo de conteo y share. Al final,
   atenuadas, las filas "Otros" y "Resto de productos". Badge "Ya no está en tu base de
   conocimiento" cuando `enCatalogo: false`.
4. Estados:
   - Skeleton mientras carga.
   - Vacío sin consultas.
   - **Vacío sin productos en la KB** (`catalogoDisponible: false`), con enlace a
     `/settings/knowledge`.
   - Error con reintento.

Light/dark. Página con `lazy()`.

## Criterios de aceptación

1. **Lector de la KB:** devuelve las filas `{ nombre, descripcion }` no vacías de la estructura
   `productos` del tenant (documento no oculto), deduplicadas por clave normalizada, junto con su
   `version`. Sin tarjeta, sin estructura o con un schema distinto → lista vacía. Un test fija los
   ids congelados.
2. **Clasificador restringido:** con proveedor mockeado, `clasificarTemaSiHaceFalta` solo escribe
   claves de productos de la KB **del tenant** o `otros`. Un nombre fuera de la lista o una confianza
   bajo el umbral → `otros`. El `responseSchema` lleva el `enum` de nombres + `otros`.
3. **Guard y freno de costo:** no llama al modelo con `TEMA_AUTO=off`, sin productos, en demo o con
   pocos mensajes del cliente. Con `temaIA` vigente:
   - solo reclasifica tras `TEMA_RECLASIFICAR_CADA` mensajes nuevos del cliente,
     o `TEMA_RECLASIFICAR_ESTABLE` si el tema ya es estable;
   - si cambia la lista de productos, reclasifica en la siguiente ráfaga;
   - dos jobs seguidos sin mensajes suficientes → **una** llamada.

   Backfill y clasificador en línea no duplican la clasificación ni el evento `cliente.tema`.
4. **Nunca lanza:** un error del proveedor (incluido 429) se registra y el job de auto-reply termina
   bien. Lo cubre `ai-reply.processor.test`.
5. **Backfill:**
   - clasifica las conversaciones no demo con actividad desde `--desde`, de un tenant o de todos;
   - admite `--dry-run` y pausa entre llamadas, y termina con un resumen
     (candidatos/clasificadas/saltadas/fallidas);
   - re-ejecutarlo no reclasifica lo que ya está al día.
6. **Reporte:** `GET /api/reports/top-products` usa la cadena `authenticateJWT → requireTenant →
   authorize(['admin']) → authorizeSubrol(SUBROLES_REPORTES) → validate → asyncHandler`. Responde
   401/403/500/200/400 según el contrato; sin query, rango de 30 días y `top=10`.
7. **DoD:**
   - Con datos sembrados, cada fila de `ranking` = nº de conversaciones con mensaje del cliente en el
     rango y ese tema, calculado aparte en el test.
   - Σ `ranking` + `restantes` + `otros` = `clasificadas`, y `clasificadas + sinClasificar = totalConsultas`.
   - No cuentan los mensajes fuera de rango, los hilos demo ni los huérfanos.
   - Un producto retirado de la KB aparece con `enCatalogo: false`.
8. **Frontend:**
   - `/reports/top-products` es visible para admin sin subrol, director y manager; para el resto,
     el ítem está oculto y la URL redirige.
   - Periodo y `top` sincronizados con la URL.
   - Estados de carga, vacío (sin consultas / sin productos) y error.
   - Light y dark, con shadcn/ui y las skills de diseño invocadas antes de cada componente.
9. ADR 0012, `domain.md`, `data-model.md`, `api-contract.md` e `integrations/llm-provider.md`
   actualizados.
10. **Aislamiento multi-tenant:** todo acceso por `*Scoped` con `tenantId` del token o del job, y los
    `$lookup` repiten `tenantId`. Tests:
    - el clasificador solo ofrece productos de la KB del tenant del job;
    - el ranking de A no incluye mensajes ni clientes de B;
    - `?tenantId=` se ignora;
    - la respuesta no lleva PII.

    `tsc --noEmit`, tests y `pnpm --filter @sofiapp/web build && lint` en verde.

## Dependencias

- HU-REP-01/02: slice `reports/`, `rangoReporteQuerySchema`, `resolverRango`, `lookupScoped`,
  `PREFIJO_CLIENTE_DEMO`, `SUBROLES_REPORTES`, piezas de dashboard y ADR 0011.
- HU-KB-07/09: `KbDocument.estructura` y el schema `productos` con ids congelados.
- HU-IA-05 (patrón del clasificador, `turnosDelCliente`) · HU-IA-06 (techo de coste de la
  extracción) · HT-AI-01 (`AIService`, plantillas, caché, `ILlmProvider`) · HU-OMNI-05 (exclusión demo).
