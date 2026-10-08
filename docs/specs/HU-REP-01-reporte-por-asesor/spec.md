# HU-REP-01 — Conversaciones atendidas y ventas cerradas por asesor (spec)

> **Spec-Driven Development.** Este es el QUÉ y el porqué. El CÓMO va en `plan.md`;
> la ejecución en `tasks.md`. Primer reporte **de tenant**: el gerente ve la productividad de los
> asesores de **su** empresa. Reutiliza las piezas de dashboard que dejó HU-SAAS-03.

**Estado:** creado

## Historia

> Como **gerente** quiero conocer cuántas conversaciones se atendieron y cuántas ventas se cerraron
> por asesor (dashboard tipo gráfico).

## Objetivo

Reportar la **productividad por asesor** dentro de un rango de fechas: conversaciones atendidas,
ventas cerradas y su tasa de cierre, servidas por `GET /api/reports/by-advisor` y pintadas en un
dashboard con gráfico de barras, KPIs y tabla de detalle. **Definition of Done:** las cifras por
asesor cuadran con los datos operativos del periodo (bandeja y pipeline).

Es una ruta **tenant-scoped** estándar (`docs/multi-tenancy.md` §2–§4): el `tenantId` nace del
token y toda agregación pasa por el repositorio scoped. **No** es la excepción superadmin §5.3.

## Alcance

**Incluye:**
- Endpoint `GET /api/reports/by-advisor?desde&hasta` (rango por defecto: últimos 30 días).
- Definiciones únicas de **conversación atendida** y **venta cerrada** (abajo), documentadas en
  `docs/domain.md`.
- Índice nuevo en `audit_events` para leer transiciones de etapa por rango.
- Restricción por subrol (Director/Gerente; `admin` sin subrol conserva acceso) — **ADR 0011**.
- Dashboard `/reports/advisors`: filtro de periodo, KPIs, barras por asesor, tabla ordenable.
- Extracción a piezas compartidas de lo que HU-SAAS-03 dejó dentro de `admin-metrics`
  (helpers de rango, `ChartCard`, formato, hook de periodo), sin cambiar su comportamiento.

**Fuera de alcance:**
- Autor por mensaje (`Message` no guarda qué usuario respondió) y reconstrucción histórica del
  asesor de cada momento desde `conversation.assign`.
- Montos de venta (no existe campo de valor), tiempos de respuesta, SLA, ranking histórico.
- Export CSV/Excel, programación de reportes, tiempo real (socket).

## Definiciones

### Conversación atendida (por asesor, en el periodo)

Un `Cliente` (la conversación vive en esa colección, `docs/data-model.md` § `clientes`) cuenta
como **atendida por X** si cumple las tres condiciones:

1. `asesorId = X` — el **asesor actual** del hilo (HU-OMNI-02).
2. `metaUserId` **no** empieza por `demo-` (clientes sembrados, HU-OMNI-05).
3. Existe al menos un `Message` del hilo con `sender: 'agent'` (respuesta **humana**, no bot) y
   `createdAt` dentro del rango.

Se reporta además, como contexto, **asignadas activas**: `asesorId = X` y `ultimoMensajeAt` en el
rango (hilos a su cargo con movimiento, haya respondido o no).

> **Limitación aceptada.** `Message` no registra qué usuario envió una respuesta humana. Si un hilo
> se reasigna dentro del periodo, sus respuestas se atribuyen al **asesor actual**. Reconstruir el
> asesor vigente desde `conversation.assign` queda fuera de alcance.

### Venta cerrada (por asesor, en el periodo)

Un `Lead` cuenta como **venta cerrada por X** si:

1. Tiene un evento de etapa en `audit_events` (`accion ∈ { 'lead.estado', 'lead.update' }`) con
   `despues.estado === 'pagado'` y `createdAt` **dentro del rango** (fecha de la transición, no de
   creación del lead); si hay varios, cuenta una sola vez.
2. **Hoy sigue** en `estado === 'pagado'` (una venta revertida no cuenta).
3. Se atribuye a `Lead.responsableId` (el dueño de la oportunidad), no a quien pulsó el cambio.

`pagado` es la misma clave que usa HU-SAAS-03 (`KEY_ESTADO_VENTA`): las dos pantallas hablan de la
misma venta. El semáforo `verde` del lead ("Venta concretada") **no** es la venta para este reporte:
es una señal de intención del vocabulario transversal, y `docs/domain.md` ya acepta su solapamiento
con la etapa `pagado`. Usar la etapa garantiza el DoD: la cifra cuadra con la columna "Pagado" del
pipeline.

> `lead.update` es la acción legacy anterior a HU-PIPE-01 (ya no se escribe); se incluye para no
> perder ventas históricas.

### Tasa de cierre

`tasaCierre = ventas / conversacionesAtendidas` (0 si no hay atendidas). Es un indicador operativo,
no un embudo estricto: una venta puede venir de un hilo atendido en otro periodo.

### Rango

- Por defecto: **últimos 30 días** hasta hoy.
- `hasta` sin hora (medianoche UTC) = fin de ese día (misma semántica que `normalizeHasta` de HU-SAAS-03).
- Máximo **366 días**; `hasta >= desde`.

## Contrato del endpoint

`GET /api/reports/by-advisor`

| Query | Tipo | Default | Notas |
|---|---|---|---|
| `desde` | fecha ISO | hoy − 29 días | Inclusivo. |
| `hasta` | fecha ISO | hoy | Inclusivo (fin de día). |

**200:**

```jsonc
{
  "generadoAt": "2026-10-08T15:00:00.000Z",
  "rango": { "desde": "2026-09-09T00:00:00.000Z", "hasta": "2026-10-08T23:59:59.999Z" },
  "totales": {
    "asesores": 6,                  // filas de porAsesor
    "conversacionesAtendidas": 412,
    "asignadasActivas": 530,
    "ventas": 38,
    "tasaCierre": 0.0922
  },
  "porAsesor": [
    {
      "asesorId": "…", "nombre": "Laura Pérez", "activo": true,
      "conversacionesAtendidas": 120, "asignadasActivas": 140,
      "ventas": 14, "tasaCierre": 0.1167
    }
  ],
  "sinAsignar": { "conversacionesAtendidas": 9, "ventas": 1 }
}
```

- `porAsesor`: todos los usuarios **activos** del tenant (aunque tengan 0) + los **inactivos con
  cifras** > 0. Orden por `conversacionesAtendidas` desc, desempate `nombre`.
- `sinAsignar`: atendidas/ventas cuyo asesor/responsable es nulo o ya no existe en el tenant
  (para que Σ cuadre).
- `totales` = Σ `porAsesor` + `sinAsignar` (en atendidas y ventas).
- Solo nombre del asesor (dato del propio tenant) y conteos: **sin** teléfonos, correos, nombres de
  contacto ni textos de mensajes.

**Errores:** 401 sin JWT · 403 rol ≠ `admin`, subrol `coordinator`/`secretary`, o superadmin (sin
tenant, `requireTenant`) · 400 query inválida (formato `docs/api-contract.md`).

## Diseño de la UI

- **Quién ve qué:** `admin` sin subrol, `director` y `manager`. Ruta `/reports/advisors` con
  `RequireRole roles={['admin']}` + guard de subrol; ítem "Productividad por asesor" en el menú,
  oculto para `coordinator`/`secretary` (la UI oculta, el backend decide).
- **Layout** (1 columna en móvil):
  1. **Cabecera + periodo:** título, rango legible, `Select` con presets "Últimos 7 días",
     "Últimos 30 días" (default), "Este mes", "Personalizado" (dos `Input type="date"`). En la URL.
  2. **KPI strip** (patrón `KpiStrip` de HU-SAAS-03): Asesores, Conversaciones atendidas,
     Ventas (celda con acento + medidor de tasa de cierre), Asignadas activas.
  3. **Gráfico por asesor** (`ChartCard` + `chart.tsx`), con `Tabs`:
     - *Comparar*: **barras agrupadas** por asesor, Atendidas (`--chart-1`) y Ventas (`--chart-2`),
       un solo eje Y, leyenda, tooltip por barra. Horizontal si hay > 8 asesores.
     - *Tasa de cierre*: barras horizontales de `tasaCierre` por asesor, valor rotulado.
  4. **Tabla de detalle** (`Table`): Asesor (+ badge "Inactivo"), Atendidas, Asignadas activas,
     Ventas, Tasa de cierre; encabezados ordenables en cliente; fila "Sin asignar" al final si > 0.
- **Estados:** Skeleton, vacío ("Nadie atendió conversaciones en este periodo"), error con reintento.
  Light/dark con tokens semánticos y la paleta validada `--chart-1..5`.
- La página se carga con `lazy()` (recharts no entra al bundle inicial).

## Criterios de aceptación

1. `GET /api/reports/by-advisor` usa `authenticateJWT → requireTenant → authorize(['admin']) →
   authorizeSubrol(['director','manager']) → validate → asyncHandler`. Sin JWT → 401; admin
   `coordinator`/`secretary` → 403; superadmin → 403; admin sin subrol, `director` o `manager` → 200
   con la forma del contrato.
2. Query inválida (`hasta < desde`, fecha mal formada, rango > 366 días) → 400 vía Zod. Sin query,
   el rango es los últimos 30 días.
3. **Atendida:** un hilo asignado a X cuenta solo si tiene ≥1 respuesta `sender: 'agent'` en el
   rango; respuestas solo de bot, o fuera del rango, no cuentan; hilos `demo-` nunca cuentan; un
   hilo reasignado cuenta para su asesor actual.
4. **Venta:** un lead creado antes del rango que pasa a `pagado` dentro del rango **cuenta**; uno
   que pasó a `pagado` fuera del rango no; uno pagado en el rango y luego movido a otra etapa no;
   varias transiciones a `pagado` del mismo lead cuentan una vez; eventos legacy `lead.update`
   también cuentan. Se atribuye a `responsableId`.
5. **DoD:** `totales.conversacionesAtendidas` y `totales.ventas` = Σ `porAsesor` + `sinAsignar` y
   coinciden con los conteos operativos del periodo calculados por separado en el test.
6. Usuarios activos sin actividad aparecen con 0; inactivos solo si tienen cifras; ids huérfanos
   van a `sinAsignar`.
7. Existe el índice `audit_events { tenantId: 1, accion: 1, createdAt: -1 }`.
8. ADR 0011 registra la restricción por subrol; `docs/domain.md`, `docs/data-model.md` y
   `docs/api-contract.md` actualizados.
9. Frontend: `/reports/advisors` visible para admin sin subrol/director/manager (oculto para el
   resto), con KPIs, barras agrupadas y vista de tasa con `recharts` vía `components/ui/chart.tsx`,
   tabla ordenable, filtro de periodo en la URL, estados de carga/vacío/error, light y dark;
   página cargada con `lazy()`; datos vía `apiClient` + TanStack Query.
10. El refactor de piezas compartidas no cambia HU-SAAS-03: sus tests siguen en verde.
11. **Aislamiento multi-tenant:** el `tenantId` sale solo de `req.user!.tenantId`; todas las
    lecturas usan `aggregateScoped`/`findScoped`. Test con dos tenants: asesores, clientes, mensajes,
    leads y eventos de B **no** suman en el reporte de A (ni aunque compartan ids de usuario en
    `responsableId`/`asesorId`). La respuesta no contiene PII de contactos. `tsc --noEmit`, tests y
    `pnpm --filter @sofiapp/web build && lint` en verde.

## Dependencias

- `AUTH-02` (subroles) y ADR 0006 (precedente de autorización por subrol).
- `HU-OMNI-01/02/05` (`Cliente.asesorId`, asignación, exclusión demo).
- `HU-CRM-01/03`, `HU-PIPE-01` (`Lead.responsableId`, etapas, evento `lead.estado`).
- `HU-SAAS-03` (recharts v3, `chart.tsx`, `ChartCard`, `KpiStrip`, formato, hook de periodo).
