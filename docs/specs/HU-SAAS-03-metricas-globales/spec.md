# HU-SAAS-03 — Métricas globales de todas las empresas (spec)

> **Spec-Driven Development.** Este es el QUÉ y el porqué. El CÓMO va en `plan.md`;
> la ejecución en `tasks.md`. Amplía HU-SAAS-01 / HU-SAAS-02 con el tablero global del
> superadmin: indicadores consolidados del SaaS y su desglose por empresa.

**Estado:** implementado

## Historia

> Como **superadministrador** quiero visualizar métricas globales de todas las empresas (empresas,
> plan, usuarios, conversaciones, leads, ventas y campañas).

## Objetivo

Dar al superadmin un **tablero global del SaaS** con **totales consolidados** y **desglose por
empresa** de los indicadores clave, alimentado por un único endpoint de agregación cross-tenant
`GET /api/admin/metrics/global`. Es la excepción superadmin ya documentada en
`docs/multi-tenancy.md` §5.3 y §6 ("ver métricas agregadas de todos los tenants"): el endpoint
expone **solo conteos**, nunca documentos ni datos personales de ningún tenant.

## Alcance

**Incluye:**
- Endpoint `GET /api/admin/metrics/global` (solo `superadmin`, sin `requireTenant`) con:
  - **consolidado** de los 7 indicadores (+ mensajes como dato de apoyo);
  - **serie mensual** de los últimos 6 meses (conversaciones, leads, ventas) para la gráfica de líneas;
  - **desglose por empresa** paginado, ordenable por cualquier indicador, con búsqueda por
    nombre/slug y filtro por estado de la empresa.
- Filtro temporal opcional `desde` / `hasta` (por `createdAt`). Sin filtro = histórico acumulado.
- Dashboard frontend `/admin/metrics` (habilita el ítem "Métricas globales" del menú Superadmin,
  hoy `disabled`) con tarjetas KPI, gráficas Recharts y tabla de desglose.
- Nueva dependencia frontend `recharts` y el componente shadcn `chart` (`components/ui/chart.tsx`).

**Fuera de alcance:**
- **Montos** de venta / ingresos: no existe modelo `Venta` ni campo de valor; "venta" es un conteo
  (ver tabla). Rentabilidad financiera → HU-SAAS-02 v2.
- Exportar a CSV/Excel, programar reportes por correo.
- Caché (Redis) o colecciones materializadas de métricas; actualización en tiempo real (socket).
- Métricas por asesor / por canal dentro de una empresa (eso es el dashboard del tenant, otra HU).

## Indicadores y fuente de dato

Todas las agregaciones agrupan por `tenantId`; el consolidado es la suma de las filas.

| # | Indicador | Fuente (colección / modelo) | Regla |
|---|---|---|---|
| 1 | **Empresas** | `tenants` (`Tenant`) | Total y desglose por `estado` (`activo` · `suspendido` · `prueba`). |
| 2 | **Plan** | `tenants.planId` → `plans` (`Plan`, global) | Nº de empresas por plan; las sin plan se agrupan como `"Sin plan"` (`planId: null`). |
| 3 | **Usuarios** | `users` (`User`) | `tenantId != null` (el superadmin **no** cuenta). `total` y `activos` (`activo: true`). |
| 4 | **Conversaciones** | `clientes` (`Cliente`) — el hilo de conversación es el contacto (no existe modelo `Conversation`) | `total` = contactos creados en el rango; `activas` = contactos con `ultimoMensajeAt` en el rango (sin rango: últimos 30 días). |
| — | Mensajes *(apoyo)* | `messages` (`Message`) | `inbound` / `outbound` por `direccion`, creados en el rango. |
| 5 | **Leads** | `leads` (`Lead`) | Leads creados en el rango. |
| 6 | **Ventas** | `leads` (`Lead`) con `estado === 'pagado'` | Etapa `pagado` del pipeline (HU-CRM-03 / HU-PIPE-01). Solo conteo. `tasaConversion = ventas / leads` (0 si `leads = 0`). |
| 7 | **Campañas** | `campaigns` (`Campaign`) | Total y desglose por `estado` (`ESTADOS_CAMPANA`). |

> El rango `desde/hasta` aplica a `createdAt` de conversaciones, mensajes, leads, ventas y campañas.
> Empresas, plan y usuarios son **fotografía actual** (no dependen del rango).
> Ventas en rango = leads creados en el rango que hoy están en `pagado` (no hay historial de
> transiciones de etapa con fecha; limitación aceptada y documentada).

## Contrato del endpoint

`GET /api/admin/metrics/global`

| Query | Tipo | Default | Notas |
|---|---|---|---|
| `desde` | fecha ISO | — | Inclusivo. |
| `hasta` | fecha ISO | — | Inclusivo (fin del día). `hasta >= desde`, si no → 400. |
| `page` | int ≥ 1 | 1 | Página del desglose. |
| `limit` | int 1–100 | 20 | > 100 → 400. |
| `sort` | `nombre`·`usuarios`·`conversaciones`·`mensajes`·`leads`·`ventas`·`tasaConversion`·`campanas` | `leads` | Orden del desglose. |
| `order` | `asc`·`desc` | `desc` | Desempate estable por `nombre`. |
| `search` | string ≤ 80 | — | Coincidencia parcial, sin mayúsculas, en `nombre`/`slug`. |
| `estado` | `activo`·`suspendido`·`prueba` | — | Filtra el **desglose** (el consolidado siempre es global). |

**200** — forma de la respuesta:

```jsonc
{
  "generadoAt": "2026-10-08T15:00:00.000Z",
  "rango": { "desde": "2026-09-01T00:00:00.000Z", "hasta": "2026-09-30T23:59:59.999Z" }, // o null
  "consolidado": {
    "empresas": { "total": 12, "porEstado": { "activo": 9, "suspendido": 1, "prueba": 2 } },
    "planes": [ { "planId": "…", "nombre": "Pro", "empresas": 4 }, { "planId": null, "nombre": "Sin plan", "empresas": 1 } ],
    "usuarios": { "total": 58, "activos": 51 },
    "conversaciones": { "total": 4210, "activas": 980 },
    "mensajes": { "inbound": 31000, "outbound": 27500 },
    "leads": 1320,
    "ventas": 210,
    "tasaConversion": 0.159,
    "campanas": { "total": 40, "porEstado": { "borrador": 5, "programada": 2, "en_curso": 1, "…": 0 } }
  },
  "serieMensual": [ { "periodo": "2026-05", "conversaciones": 610, "leads": 190, "ventas": 31 } /* … 6 meses */ ],
  "porEmpresa": {
    "items": [
      {
        "tenantId": "…", "nombre": "Acme", "slug": "acme", "estado": "activo",
        "plan": { "_id": "…", "nombre": "Pro" },          // o null
        "usuarios": 6, "conversaciones": 420, "mensajes": 5100,
        "leads": 130, "ventas": 22, "tasaConversion": 0.169, "campanas": 4
      }
    ],
    "page": 1, "limit": 20, "total": 12
  }
}
```

**Errores:** 401 sin JWT · 403 rol ≠ `superadmin` · 400 query inválida (formato `docs/api-contract.md`).

## Diseño de la UI

- **Quién ve qué:** solo `superadmin`. Ruta `/admin/metrics` dentro de `AdminRoutes` (guard
  `rol === 'superadmin'`); el ítem "Métricas globales" del grupo Superadmin deja de estar `disabled`.
  Un `admin` que entre a la URL es redirigido (`<Navigate to="/" />`).
- **Layout** (de arriba abajo, responsive; en móvil todo apila a 1 columna):
  1. **Cabecera + filtros:** título, `generadoAt` relativo, selector de rango (presets "Histórico",
     "Últimos 30 días", "Mes actual", "Personalizado" con dos `Input type="date"`). Estado en la URL.
  2. **Fila de KPI cards** (`Card`): Empresas (con badge activo/suspendido/prueba), Usuarios
     (activos/total), Conversaciones (activas), Leads, **Ventas** (con % de conversión), Campañas.
  3. **Grid 2 columnas:**
     - *Empresas por plan* → **donut** (`PieChart`), leyenda con conteo.
     - *Empresas por estado* → **barras** (`BarChart`).
  4. **Grid 2 columnas:**
     - *Tendencia mensual* (6 meses) → **líneas** (`LineChart`): conversaciones · leads · ventas.
     - *Top 10 empresas* → **barras horizontales**, con `Tabs` para alternar Leads / Ventas.
  5. **Tabla de desglose** (`Table`): Empresa (nombre + slug), Estado (`Badge`), Plan, Usuarios,
     Conversaciones, Mensajes, Leads, Ventas, % Conv., Campañas. Encabezados ordenables, búsqueda,
     filtro de estado (`Select`), paginación.
- **Estados:** carga con `Skeleton` en cada bloque; vacío ("Aún no hay empresas"); error con
  `Alert` + reintentar. Al cambiar filtros se conserva el dato anterior mientras carga.
- Colores de series con los tokens `--chart-1..5`; legible en **light y dark**.

## Criterios de aceptación

1. `GET /api/admin/metrics/global` sin JWT → **401**; con rol `admin` → **403**; con `superadmin` →
   **200** con la forma exacta del contrato. La ruta usa `authenticateJWT → authorize(['superadmin'])
   → validate → asyncHandler` **sin** `requireTenant`.
2. Query inválida (`hasta < desde`, fecha mal formada, `limit > 100`, `sort` desconocido) → **400**
   vía Zod en el borde.
3. El `consolidado` de usuarios, conversaciones, mensajes, leads, ventas y campañas es igual a la
   **suma de todas las filas** del desglose (sin paginar); `empresas.total` = nº de tenants.
4. **Ventas** = leads con `estado === 'pagado'`; `tasaConversion = ventas / leads` (0 si no hay leads).
5. Los usuarios superadmin (`tenantId: null`) **no** se cuentan; documentos cuyo `tenantId` no
   corresponde a un tenant existente **no** generan filas ni suman al consolidado.
6. Con `desde/hasta`, conversaciones/mensajes/leads/ventas/campañas solo cuentan documentos con
   `createdAt` en el rango; empresas/plan/usuarios no cambian.
7. `serieMensual` trae exactamente 6 periodos `YYYY-MM` consecutivos terminando en el mes actual
   (o en el mes de `hasta`), con ceros en los meses sin datos.
8. El desglose pagina (`page`, `limit`, `total`), ordena por `sort/order` y filtra por `search` y
   `estado` sin alterar el consolidado.
9. Frontend: `/admin/metrics` accesible solo a `superadmin`; muestra KPI cards, donut por plan,
   barras por estado, línea mensual, top 10 y tabla con orden/búsqueda/paginación, usando `recharts`
   (vía `components/ui/chart.tsx`) y componentes de `components/ui/*`; correcto en light y dark;
   datos vía `apiClient` + TanStack Query.
10. **Aislamiento multi-tenant:** cada fila del desglose cuenta **solo** documentos de su `tenantId`
    (test con dos tenants con volúmenes distintos); la respuesta contiene **solo conteos**, sin
    PII (ni teléfonos, nombres de contactos, textos de mensajes); ningún rol distinto de `superadmin`
    accede; ninguna ruta o consulta scoped existente cambia. Las agregaciones directas
    (`Model.aggregate`) se limitan a `admin-metrics.service.ts` y están documentadas como excepción
    §5.3. `tsc --noEmit` en verde, tests en verde y `pnpm --filter @sofiapp/web build` en verde.

## Dependencias

- `INF-02` (modelos `Tenant`/`User`, middlewares `authenticateJWT`/`authorize`) — completo.
- `HU-SAAS-01` (CRUD de empresas, `tenants.estado`) — completo.
- `HU-SAAS-02` (catálogo `plans`, `tenants.planId`) — completo.
- `HU-CRM-03` / `HU-PIPE-01` (colección `leads`, etapa `pagado` sembrada) — completo.
- `HU-MARK-01` (colección `campaigns`) — completo.
- `HT-WA-01` / `HU-OMNI-01` (`clientes`, `messages`) — completo.
