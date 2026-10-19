# HU-REP-05-V2 — Plan técnico (CÓMO)

## Árbol de archivos a crear / modificar

### Parte 1 — Bandeja (solo frontend)

```
apps/frontend/src/features/inbox/
├── components/ConversationSummaryStrip.tsx       ← BORRAR (strip + skeleton)
├── components/ConversationSummaryStrip.test.tsx  ← BORRAR
├── pages/InboxPage.tsx                           ← TOCAR: quitar imports, generarResumen, selectores
│                                                   del store y el bloque JSX; ajustar comentario de IntentStrip
├── useInboxStore.ts                              ← TOCAR: quitar resumenExpandido + toggleResumen
└── hooks/useContactHistory.ts                    ← TOCAR: useGenerateSummary solo invalida 'contact-history'
```

### Parte 2 — Topes de la KB

```
apps/frontend/src/features/knowledge-base/
├── lib/kb-schemas.ts                             ← LIMITE_POR_KIND (D2) + comentario del tope global (15.000)
├── lib/schemas/empresa.schema.ts                 ← anio_fundacion 30 → 60
├── lib/schemas/productos.schema.ts               ← resumen_oferta 600→900, catalogo.{nombre 60→120, descripcion 120→240},
│                                                   formas_pago 60→120, modalidades_entrega 60→120
├── lib/schemas/horarios.schema.ts                ← direccion 200→400, otras_sedes.{60→120, 120→240, 40→80},
│                                                   whatsapp 60→120, telefono 60→120, correo 80→160, redes 80→160
├── lib/kb-presets.ts                             ← comentario: títulos topan en 400
├── components/fields/ScheduleIntervalRow.tsx     ← DESCRIPCION_MAX 80 → 160
├── components/fields/PolicyTriState.tsx          ← default detalleMaxLength 300 → 700
├── components/KnowledgeStructuredForm.tsx        ← pasar detalleMaxLength={max} al PolicyTriState
├── components/KnowledgeUploadEditor.tsx          ← título maxLength 200 → 400 (constante TITULO_MAX); CONTENIDO_MAX 15_000
├── components/FaqFormDialog.tsx                  ← MAX_PREGUNTA 300 → 700
├── components/FaqTester.tsx                      ← maxLength 300 → 700 (importar la misma constante)
└── tests: lib/schemas/*.schema.test.ts (CONTENIDO_MAX 15_000, anio 60, DESCRIPCION_MAX 160),
           pages/KnowledgeBasePage.test.tsx (maxlength 15000), los que fijen LIMITE_POR_KIND

apps/backend/src/features/
├── kb/kb.validation.ts                           ← titulo .max(400), CONTENIDO_MAX 15_000 (+ msg), ESTRUCTURA_MAX_BYTES 60_000
├── kb/kb.routes.test.ts                          ← 15.000 / 15.001; título 400 / 401
├── kb-faq/kb-faq.validation.ts                   ← pregunta .max(700) (+ msg)
└── kb-faq/kb-faq.routes.test.ts                  ← 700 / 701 en create, update y /test

docs/data-model.md, docs/api-contract.md          ← topes nuevos (y nota en HU-KB-07 Decisión 2 → ver esta HU)
```

### Parte 3 — Filtro por fechas

```
apps/backend/src/features/ai/
├── ai.types.ts                                   ← ListAiResponsesQuery + desde?: Date; hasta?: Date
├── ai.validation.ts                              ← listAiResponsesSchema: desde/hasta + refine hasta > desde
├── ai.service.ts                                 ← filtro createdAt { $gte, $lt } combinado con method
├── ai.controller.ts                              ← pasar desde/hasta de req.validatedQuery
├── ai.routes.test.ts                             ← 400 invertido / inválido; 200 con solo desde / solo hasta
├── ai.service.test.ts                            ← límites inclusivo/exclusivo, combinación con method, total
└── ai.isolation.test.ts                          ← rango con datos de otro tenant dentro

apps/frontend/src/
├── components/filters/DateRangeFilter.tsx        ← CREAR (D5)
├── components/filters/DateRangeFilter.test.tsx   ← CREAR
└── features/ai-context/
    ├── lib/date-range.ts                         ← CREAR: diasLocalesAInstantes(desde, hasta)
    ├── lib/date-range.test.ts                    ← CREAR
    ├── api.ts                                    ← fetchAiResponses params + desde/hasta (ISO)
    ├── hooks/useAiResponses.ts                   ← recibe rango; queryKey lo incluye
    ├── pages/AiContextPage.tsx                   ← estado { desde, hasta } ('' = vacío); cambios → setPage(1)
    ├── components/AiResponseTable.tsx            ← DateRangeFilter junto al Select; vacío "Ninguna respuesta en esas fechas"
    └── components/AiResponseTable.test.tsx       ← CREAR o AMPLIAR

docs/api-contract.md                               ← fila GET /api/ai/responses: ?desde&hasta (instantes, hasta exclusivo)
```

## Contratos

### Parte 2 — Backend

```ts
// kb.validation.ts
const TITULO_MAX = 400;
const CONTENIDO_MAX = 15_000;
const CONTENIDO_MAX_MSG = 'El contenido no puede superar los 15,000 caracteres.';
const ESTRUCTURA_MAX_BYTES = 60_000;
titulo: z.string().trim().min(1, …).max(TITULO_MAX, 'El título no puede tener más de 400 caracteres.'),

// kb-faq.validation.ts
.max(700, 'La pregunta no puede superar los 700 caracteres.');
```

### Parte 3 — Backend

```ts
// ai.validation.ts
query: z
  .object({
    page: …, limit: …, method: aiMethod.optional(),
    /** Instante ISO inclusivo. El navegador lo calcula desde su medianoche local (D4). */
    desde: z.coerce.date().optional(),
    /** Instante ISO EXCLUSIVO: la medianoche local del día siguiente al elegido. */
    hasta: z.coerce.date().optional(),
  })
  .refine((q) => !q.desde || !q.hasta || q.hasta > q.desde, {
    message: '`hasta` debe ser posterior a `desde`.',
    path: ['hasta'],
  }),
```

> `z.coerce.date()` convierte una cadena inválida en `Invalid Date` y Zod la rechaza: es `400`, como
> en `reports.validation.ts`.

```ts
// ai.service.ts
const filter: FilterQuery<IAiUsageLog> = {
  ...(query.method ? { method: query.method } : {}),
  ...(query.desde || query.hasta
    ? { createdAt: { ...(query.desde ? { $gte: query.desde } : {}), ...(query.hasta ? { $lt: query.hasta } : {}) } }
    : {}),
};
// findScoped(AiUsageLogModel, tenantId, filter) / countScoped(...) — el tenantId lo pone el repositorio.
```

- Ruta y middlewares sin cambios: `authenticateJWT, requireTenant, authorize(['admin']),
  validate(listAiResponsesSchema), asyncHandler(listAiResponsesController)`.
- Índice: ya existe `{ tenantId: 1, createdAt: -1 }`, y no hace falta otro.

### Parte 3 — Frontend

```ts
// features/ai-context/lib/date-range.ts
/** `YYYY-MM-DD` del input → instantes ISO de la zona del navegador (D4). '' = sin límite. */
export function diasLocalesAInstantes(desde: string, hasta: string): { desde?: string; hasta?: string };
// desde → new Date(y, m - 1, d).toISOString()
// hasta → new Date(y, m - 1, d + 1).toISOString()   // exclusivo: incluye el día completo

export interface RangoFechas { desde: string; hasta: string } // '' = vacío
export function rangoInvertido(r: RangoFechas): boolean;      // ambos puestos y desde > hasta
```

```ts
// components/filters/DateRangeFilter.tsx
interface Props {
  idPrefix: string;
  desde: string;            // 'YYYY-MM-DD' | ''
  hasta: string;
  onChange: (campo: 'desde' | 'hasta', valor: string) => void;
  onClear: () => void;
  /** Qué se muestra mientras el rango está invertido (el texto del aviso). */
  mientrasInvertido: string;
}
```

Marcado: el mismo que los campos personalizados de `PeriodFilter`.
- `Label text-xs text-muted-foreground` + `Input type="date" className="w-40"`.
- `max={hasta || hoy}` en "Desde"; `min={desde}` y `max={hoy}` en "Hasta".
- `aria-invalid` y `aria-describedby` cuando está invertido.
- `Button variant="ghost" size="sm"` "Limpiar fechas" con `X`, solo si hay alguna fecha.
- En la cabecera de la tabla, los controles existentes son `h-8`/`text-xs`, así que los inputs usan
  `h-8 text-xs` para quedar a ras del `Select` de método.

```ts
// api.ts
fetchAiResponses(params: { page; limit?; method?; desde?: string; hasta?: string })
// hooks/useAiResponses.ts
useAiResponses(page, method, rango: { desde?: string; hasta?: string })
  queryKey: ['ai-responses', page, method, rango.desde ?? null, rango.hasta ?? null]
```

`AiContextPage` es la dueña del estado `fechas: RangoFechas`:
- `setFecha` hace `setFechas` y `setPage(1)`; `limpiar` hace lo mismo con los dos campos vacíos.
- Pasa a la tabla `fechas`, `onFechaChange`, `onLimpiarFechas` y el `rango` efectivo: vacío si está
  invertido, `diasLocalesAInstantes` si no.

### Parte 1 — Sin contratos nuevos

`useGenerateSummary` queda así:

```ts
onSuccess: () => void qc.invalidateQueries({ queryKey: ['contact-history', clienteId] }),
```

## Notas

- **Multi-tenancy:**
  - La parte 3 solo añade condiciones al `filter` que ya recibe `findScoped`/`countScoped`; el
    `tenantId` sigue saliendo de `req.user!.tenantId` en el controller.
  - Las partes 1 y 2 no tocan consultas.
  - Checklist de PR de `docs/multi-tenancy.md` §9.
- **La regla de "Información adicional" (HU-KB-07)** no cambia: sigue siendo `texto-largo` (1.500)
  y fuera de la regla.
- **Tests que fijan topes:** antes de cambiarlos, `grep` de `120`, `300`, `600`, `10_000`, `10000`,
  `maxlength` en `knowledge-base/**/*.test.*` y `kb*/**/*.test.ts`. Se actualizan los que fijan
  un tope de D2/D3 y se dejan los que usan esos números como dato de prueba (`'30 días'`, etc.).
- **Prueba de `ESTRUCTURA_MAX_BYTES`:** se añade a los tests de presupuesto de cada schema
  `JSON.stringify(estructuraAlTope()).length <= 60_000`. Hoy no hay ninguno que lo mida.
- **Fechas en tests:** fijar la zona con `process.env.TZ` no es fiable en Vitest/jsdom una vez
  arrancado. Por eso `diasLocalesAInstantes` se prueba comparando con
  `new Date(y, m, d).toISOString()` construido en el propio test, que usa la misma zona que la
  función.
- **Skills de diseño (regla 7):** solo está disponible `frontend-design:frontend-design`. Verificación
  visual en light y dark de la bandeja y de "Fuentes y contexto", con capturas en `.playwright-mcp/`
  que se borran al terminar.

## Verificación

```
pnpm --filter @sofiapp/api typecheck
pnpm --filter @sofiapp/api test
pnpm --filter @sofiapp/web build && pnpm --filter @sofiapp/web lint
pnpm --filter @sofiapp/web test
grep -rn "ConversationSummaryStrip\|resumenExpandido\|toggleResumen" apps/frontend/src   # vacío (CA-3)
```

| CA | Dónde se cubre |
|---|---|
| CA-1 a CA-4 | Parte 1: `InboxPage`, `useInboxStore`, `useContactHistory`, el test de `ContactPanel` sin cambios y la verificación visual |
| CA-5, CA-8 | Schemas y componentes de campos; tests de schemas y de `KnowledgeStructuredForm` (contador) |
| CA-6 | `kb.validation.ts`, `kb-faq.validation.ts` y sus tests de rutas |
| CA-7 | Tests de presupuesto con 15.000 y con el JSON ≤ 60.000 |
| CA-9 a CA-12 | `DateRangeFilter`, `date-range.ts`, `AiContextPage`/`AiResponseTable`; `ai.validation`/`ai.service` y sus tests |
| CA-13 | `ai.isolation.test.ts` |
| CA-14 | Comandos de arriba |
