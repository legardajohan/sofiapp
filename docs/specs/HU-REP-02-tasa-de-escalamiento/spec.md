# HU-REP-02 — Porcentaje de conversaciones que llegan al asesor (spec)

> **Spec-Driven Development.** Este es el QUÉ y el porqué. El CÓMO va en `plan.md`;
> la ejecución en `tasks.md`. Segundo reporte **de tenant**: cuántas de las conversaciones que
> atendió Sofi (la IA) terminaron transferidas a una persona. Reutiliza el slice `reports/` y las
> piezas de dashboard de HU-REP-01.

**Estado:** implementado

## Historia

> Como **gerente** quiero conocer el porcentaje de conversaciones que llegan al asesor.
> Medir cuántas conversaciones escalan de la IA a un humano.

## Objetivo

Reportar la **tasa de escalamiento** IA → humano en un rango de fechas: conversaciones que atendió
la IA, cuántas de ellas se transfirieron a un asesor y el porcentaje, servido por
`GET /api/reports/handoff-rate` y pintado en un dashboard con KPIs y gráfico. **Definition of
Done:** el porcentaje coincide con los handoffs registrados en el periodo.

Es una ruta **tenant-scoped** estándar (`docs/multi-tenancy.md` §2–§4): el `tenantId` nace del
token y toda agregación pasa por el repositorio scoped. **No** es la excepción superadmin §5.3.

## Alcance

**Incluye:**
- Endpoint `GET /api/reports/handoff-rate?desde&hasta` (por defecto, últimos 30 días; mismas reglas
  de rango que HU-REP-01).
- Definiciones únicas de **conversación atendida por la IA**, **conversación transferida** y
  **tasa de escalamiento** (abajo), documentadas en `docs/domain.md`.
- Desglose informativo de transferidas por **motivo** de handoff (fuera del DoD).
- Mismo gate por subrol que HU-REP-01 (Director/Gerente; `admin` sin subrol conserva acceso) —
  **ADR 0011**, que se enmienda para nombrar este segundo reporte.
- Dashboard `/reports/handoff-rate`: filtro de periodo en la URL, KPIs, donut IA vs transferidas,
  barras por motivo.

**Fuera de alcance:**
- Escalados que **no** son handoff: la toma de control manual del asesor (`setIaHabilitada(false)`)
  y el aviso por fallo de la IA (`marcarParaAsesor`, que no apaga la IA ni deja evento).
- Tasa por asesor, por canal o serie temporal (tendencia diaria/semanal).
- Tiempo hasta el handoff, tiempo de primera respuesta humana, resolución posterior.
- Export, programación de reportes, tiempo real.

## Definiciones

### Fuente canónica: `audit_events`

Un **handoff** es un evento `audit_events` con `accion: 'conversation.handoff'`,
`entidad: 'cliente'`, `actorId: null` (el sistema), escrito por `handoffConversation`
(`conversation.service.ts`) cuando la IA transfiere el hilo (HU-IA-03/07). Su `createdAt` es el
momento de la transferencia.

**No** se usa `Cliente.handoffAt`: es solo el estado actual del hilo y `setIaHabilitada(true)` lo
borra (`$unset`) cuando el asesor devuelve el hilo a Sofi. Un hilo transferido el día 3 y devuelto
el día 5 dejaría de contar; con `audit_events` el historial queda intacto y la cifra cuadra con los
handoffs registrados (DoD).

### Conversación transferida (en el periodo) — numerador

Un `Cliente` cuenta como **transferido** si:

1. Tiene al menos un evento `conversation.handoff` con `createdAt` **dentro del rango**.
2. El `Cliente` existe en el tenant (un evento cuyo `entidadId` no resuelve a un cliente del
   tenant —borrado o foráneo— **no** cuenta).
3. `metaUserId` **no** empieza por `demo-` (HU-OMNI-05).

Se cuentan **conversaciones distintas**: si la IA se re-habilita y el hilo vuelve a transferirse,
cuenta **una** vez. Así la tasa sigue diciendo "qué fracción de conversaciones escala". El número de
eventos se informa aparte como `handoffsRegistrados`.

### Conversación atendida por la IA (en el periodo) — denominador

Un `Cliente` cuenta como **atendido por la IA** si cumple 2 y 3 de arriba y además:

- tiene al menos un `Message` con `sender: 'bot'` y `createdAt` dentro del rango, **o**
- es una conversación transferida del periodo.

La segunda rama existe porque el handoff transfiere aunque el aviso de transición no se pueda enviar
(ventana de 24 h cerrada, cuota agotada — `ejecutarHandoff` en `workers/ai-reply.processor.ts`): ese
hilo lo procesó la IA aunque no quede mensaje `bot`. Sin ella, la tasa podría superar el 100 %.
Garantiza `transferidas ⊆ conversacionesIa`.

Una conversación que **solo** atendió un humano (nunca hubo bot ni handoff en el rango) **no**
pertenece al denominador: la historia mide escalamiento IA → humano, no la carga del equipo.

### Tasa de escalamiento

`tasaEscalamiento = transferidas / conversacionesIa` (4 decimales, `ratio` de
`utils/date-range.util.ts`; 0 si no hay conversaciones con IA). Complemento:
`resueltasPorIa = conversacionesIa − transferidas`.

Es un indicador del periodo, no una cohorte: un hilo con bot dentro del rango pudo transferirse
después, y entonces cuenta como "resuelto por IA" en este periodo.

### Motivo (desglose informativo)

Cada transferida se atribuye al `despues.motivo` de su **último** handoff del periodo
(`HandoffMotivo`: `explicit_request`, `keyword`, `custom`, `low_confidence`, `intent_purchase`).
Σ por motivo = `transferidas`. Las etiquetas visibles son `MOTIVO_LABEL` de la bandeja.

### Rango

Idéntico a HU-REP-01: por defecto **últimos 30 días**; `hasta` a medianoche UTC = fin de ese día;
máximo **366 días**; `hasta >= desde`.

## Contrato del endpoint

`GET /api/reports/handoff-rate`

| Query | Tipo | Default | Notas |
|---|---|---|---|
| `desde` | fecha ISO | hoy − 29 días | Inclusivo. |
| `hasta` | fecha ISO | hoy | Inclusivo (fin de día). |

**200:**

```jsonc
{
  "generadoAt": "2026-10-08T15:00:00.000Z",
  "rango": { "desde": "2026-09-09T00:00:00.000Z", "hasta": "2026-10-08T23:59:59.999Z" },
  "conversacionesIa": 240,      // denominador
  "transferidas": 54,           // numerador (conversaciones distintas)
  "resueltasPorIa": 186,        // conversacionesIa − transferidas
  "handoffsRegistrados": 61,    // eventos conversation.handoff contados (≥ transferidas)
  "tasaEscalamiento": 0.225,
  "transferidasPorMotivo": [    // siempre los 5 motivos, en el orden de MOTIVOS_HANDOFF
    { "motivo": "explicit_request", "conversaciones": 30 },
    { "motivo": "keyword", "conversaciones": 8 },
    { "motivo": "custom", "conversaciones": 4 },
    { "motivo": "low_confidence", "conversaciones": 7 },
    { "motivo": "intent_purchase", "conversaciones": 5 }
  ]
}
```

- Solo conteos: **sin** ids de clientes, teléfonos, nombres, correos, textos ni nombres de
  condiciones propias.

**Errores:** 401 sin JWT · 403 rol ≠ `admin` o subrol `coordinator`/`secretary` · superadmin
cortado por `requireTenant` (500, como toda ruta de tenant) · 400 query inválida
(`docs/api-contract.md`).

## Diseño de la UI

- **Quién ve qué:** igual que `/reports/advisors` (`admin` sin subrol, `director`, `manager`).
  Ítem "Tasa de escalamiento" en el grupo **Reportes** del menú, oculto para
  `coordinator`/`secretary` (la UI oculta, el backend decide).
- **Layout** (1 columna en móvil):
  1. **Cabecera + periodo:** título, rango legible, `PeriodFilter` (7 d / 30 d default / este mes /
     personalizado) sincronizado con la URL.
  2. **KPI strip:** Tasa de escalamiento (celda protagonista con medidor `Progress`), Conversaciones
     con IA, Transferidas a asesor, Resueltas por IA.
  3. **Donut IA vs transferidas** (`ChartCard` + `chart.tsx` + recharts `Pie`): dos porciones
     (Resueltas por IA, Transferidas), un solo tipo de dato (conversaciones), % de escalamiento al
     centro, leyenda y tooltip con conteo y %.
  4. **Barras por motivo** (`ChartCard`): barras horizontales, un solo eje (conversaciones), etiqueta
     `MOTIVO_LABEL`, valor rotulado; motivos en 0 se muestran atenuados para que la lista sea estable.
- **Estados:** Skeleton, vacío ("Sofi no atendió conversaciones en este periodo"), error con
  reintento. Light/dark con tokens semánticos y la paleta `--chart-1..5`.
- Página con `lazy()` (recharts no entra al bundle inicial).

## Criterios de aceptación

1. `GET /api/reports/handoff-rate` usa `authenticateJWT → requireTenant → authorize(['admin']) →
   authorizeSubrol(SUBROLES_REPORTES) → validate → asyncHandler`. Sin JWT → 401; `coordinator` /
   `secretary` → 403; superadmin → cortado por `requireTenant` (500); admin sin subrol, `director` o
   `manager` → 200 con la forma del contrato.
2. Query inválida (`hasta < desde`, fecha mal formada, rango > 366 días) → 400 vía Zod. Sin query,
   el rango es los últimos 30 días.
3. **Numerador:** usa solo eventos `audit_events` `conversation.handoff` del tenant con `createdAt`
   en el rango. Fuera del rango no cuenta; dos handoffs del mismo hilo cuentan una conversación (y
   dos en `handoffsRegistrados`); un hilo devuelto a la IA (sin `handoffAt`) sigue contando; una
   toma de control manual sin evento no cuenta.
4. **Denominador:** hilos (no `demo-`) con ≥1 mensaje `bot` en el rango ∪ hilos transferidos en el
   rango. Un hilo solo con respuestas `agent` no cuenta; un handoff sin mensaje bot en el rango sí
   (y la tasa nunca supera 1).
5. **DoD:** `transferidas` = nº de `entidadId` distintos de los handoffs del periodo (tenant, no demo,
   cliente existente) calculado aparte en el test; `tasaEscalamiento = ratio(transferidas,
   conversacionesIa)`; `resueltasPorIa = conversacionesIa − transferidas`; Σ
   `transferidasPorMotivo` = `transferidas` y el motivo es el del último handoff del periodo.
6. Sin datos → todos los conteos en 0 y `tasaEscalamiento: 0`; los 5 motivos siempre presentes.
7. ADR 0011 enmendado (segundo reporte con el mismo gate); `docs/domain.md` y `docs/api-contract.md`
   actualizados.
8. Frontend: `/reports/handoff-rate` visible para admin sin subrol/director/manager (oculto y
   redirigido para el resto), con KPIs, donut y barras por motivo con datos del endpoint, filtro de
   periodo en la URL, estados de carga/vacío/error, light y dark; página con `lazy()`; datos vía
   `apiClient` + TanStack Query.
9. HU-REP-01 no cambia: sus suites siguen en verde tras compartir el schema de rango.
10. **Aislamiento multi-tenant:** el `tenantId` sale solo de `req.user!.tenantId`; todas las lecturas
    usan `aggregateScoped` y los `$lookup`/`$unionWith` repiten `tenantId`. Test con dos tenants:
    mensajes y handoffs de B no suman en A; un handoff de B con `entidadId` de un cliente de A no
    cuenta en ninguno; `?tenantId=` se ignora; la respuesta no contiene PII. `tsc --noEmit`, tests y
    `pnpm --filter @sofiapp/web build && lint` en verde.

## Dependencias

- `HU-REP-01` (slice `reports/`, `resolverRango`, `lookupScoped`, `SUBROLES_REPORTES`,
  `RequireReportes`, `PeriodFilter`, `use-period-params`, `ChartCard`, `lib/format.ts`) y ADR 0011.
- `HU-IA-03` / `HU-IA-07` (handoff automático, evento `conversation.handoff`, `HandoffMotivo`).
- `HU-OMNI-05` (exclusión `demo-`). `HU-SAAS-03` (recharts v3, `chart.tsx`).
