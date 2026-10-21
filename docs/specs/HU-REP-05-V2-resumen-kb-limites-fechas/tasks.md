# HU-REP-05-V2 — Tasks (checklist ejecutable)

> Claude Code: ejecuta en orden y marca cada casilla al terminar. **Sin rama nueva:** se trabaja
> sobre `feat/HU-REP-05`. Ruta de tenant: `tenantId` solo del token y todas las lecturas por
> `findScoped`/`countScoped`. Antes de tocar componentes, invoca las skills de diseño disponibles
> (regla 7).

## 0. Rama

> Notas de implementación:
> - Solo está instalada `frontend-design`; `emil-design-eng` e `impeccable` no existen en el entorno.
> - `KnowledgeBasePage.test.tsx` se sigue colgando como en `develop` (desbordamiento de pila). Se actualizó su aserción de `maxlength`, pero se excluyó al correr la suite.
> - Se invirtió un test de `politicas.schema.test.ts`: con el detalle del tri-estado en 700, las seis preguntas pesan más que los dos textos largos.
> - El test de `estructura` demasiado grande (`kb.routes.test.ts`) pasó de 400 a 600 campos para superar el nuevo tope de 60.000.
> - El combo fechas + método se prueba en el servicio del backend; en el frontend, ambos viajan en la misma `queryKey`.
- [x] Confirmar que se está en `feat/HU-REP-05`. **No** crear rama nueva.

## Parte 1 — Bandeja: resumen único (frontend)
### 1. Quitar la franja
- [x] Borrar `inbox/components/ConversationSummaryStrip.tsx` y `ConversationSummaryStrip.test.tsx`.
- [x] `InboxPage.tsx`: quitar:
  - [x] el import de la franja y `useGenerateSummary`, dejando `useContactHistory`;
  - [x] `generarResumen`;
  - [x] los selectores `resumenExpandido`/`toggleResumen`;
  - [x] el bloque JSX.
- [x] Reescribir el comentario de `IntentStrip`: ya no va "bajo el resumen" ni se apoya en su
  esqueleto.
- [x] `useInboxStore.ts`: quitar `resumenExpandido` y `toggleResumen`, también de su interfaz.
- [x] `useContactHistory.ts` → `useGenerateSummary`:
  - [x] invalidar solo `['contact-history', clienteId]`;
  - [x] actualizar el JSDoc.
- [x] `MOTIVO_DATOS_SENSIBLES` y el resto de imports de `@/lib/roles`: se conservan si los usa otro
  archivo (`grep`).
- [x] **CA-3:** el `grep` de `ConversationSummaryStrip|resumenExpandido|toggleResumen` sobre
  `apps/frontend/src` sale vacío.

## Parte 2 — Topes de la KB
### 2. Backend
- [x] `kb/kb.validation.ts`:
  - [x] `TITULO_MAX = 400`;
  - [x] `CONTENIDO_MAX = 15_000`, con mensaje `15,000`;
  - [x] `ESTRUCTURA_MAX_BYTES = 60_000`;
  - [x] JSDoc: "HU-REP-05-V2: 10.000 → 15.000 (D3)".
- [x] `kb-faq/kb-faq.validation.ts`: pregunta `.max(700)` con su mensaje.
### 3. Frontend: schemas y campos (tabla D2)
- [x] `lib/kb-schemas.ts`:
  - [x] `LIMITE_POR_KIND` → texto-corto 240, texto-medio 700, lista 240, triestado 700,
    repetible 240 (texto-largo y horario sin cambio);
  - [x] comentario del tope global → 15.000.
- [x] `empresa.schema.ts`: `anio_fundacion` 60.
- [x] `productos.schema.ts`:
  - [x] `resumen_oferta` 900;
  - [x] `catalogo.nombre` 120 y `catalogo.descripcion` 240;
  - [x] `formas_pago` 120 y `modalidades_entrega` 120.
- [x] `horarios.schema.ts`:
  - [x] `direccion` 400;
  - [x] `otras_sedes`: nombre 120, dirección 240, teléfono 80;
  - [x] `whatsapp` 120, `telefono` 120, `correo` 160, `redes_sociales` 160.
- [x] `ScheduleIntervalRow.tsx`: `DESCRIPCION_MAX = 160`.
- [x] `PolicyTriState.tsx`: default `detalleMaxLength = 700`.
- [x] `KnowledgeStructuredForm.tsx`: pasar `detalleMaxLength={max}` en el caso `triestado`.
- [x] `KnowledgeUploadEditor.tsx`: `TITULO_MAX = 400` en el input de título y `CONTENIDO_MAX = 15_000`,
  más los comentarios.
- [x] `kb-presets.ts`: comentario de títulos → 400.
- [x] `FaqFormDialog.tsx`: `MAX_PREGUNTA = 700`, exportado. `FaqTester.tsx` lo reutiliza en lugar del
  `300` literal.
### 4. Docs
- [x] `docs/data-model.md`: tope de contenido 15.000, título 400 y pregunta de FAQ 700.
- [x] `docs/api-contract.md`: los topes que aparezcan en las filas de `/api/kb/*`.
- [x] `docs/specs/HU-KB-07-estructura-kb/plan.md`: nota bajo la Decisión 2 → "actualizado a 15.000
  en HU-REP-05-V2 (D3)".

## Parte 3 — Filtro por fechas en "Fuentes y contexto"
### 5. Backend (patrón: types → validation → service → controller; model y routes sin cambios)
- [x] `ai.types.ts`: `ListAiResponsesQuery` + `desde?: Date; hasta?: Date`.
- [x] `ai.validation.ts`:
  - [x] `desde`/`hasta` con `z.coerce.date().optional()`;
  - [x] `.refine(hasta > desde)` sobre el objeto `query`;
  - [x] `ListAiResponsesValidatedQuery` sigue derivándose con `z.infer`.
- [x] `ai.service.ts`: `createdAt: { $gte: desde, $lt: hasta }` según lo que venga, combinado con
  `method`, en `findScoped` **y** en `countScoped`.
- [x] `ai.controller.ts`: pasar `desde`/`hasta` de `req.validatedQuery`. `tenantId` desde
  `req.user!.tenantId`.
### 6. Frontend
- [x] `ai-context/lib/date-range.ts`: `diasLocalesAInstantes`, `rangoInvertido` y el tipo
  `RangoFechas`.
- [x] `components/filters/DateRangeFilter.tsx` (D5):
  - [x] inputs `type="date"` `h-8 text-xs`;
  - [x] `min`/`max` cruzados y `max = hoy`;
  - [x] error `role="alert"`;
  - [x] "Limpiar fechas" visible solo con alguna fecha;
  - [x] light y dark solo con tokens.
- [x] `ai-context/api.ts` y `hooks/useAiResponses.ts`: el rango entra en los params y en la
  `queryKey`.
- [x] `AiContextPage.tsx`: estado `fechas`; cambiar o limpiar → `setPage(1)`; rango efectivo vacío
  si está invertido.
- [x] `AiResponseTable.tsx`:
  - [x] `DateRangeFilter` a la izquierda del `Select` de método, en la misma fila con `flex-wrap`;
  - [x] con alguna fecha y 0 resultados, el vacío dice "Ninguna respuesta en esas fechas".
### 7. Docs
- [x] `docs/api-contract.md`: `GET /api/ai/responses` → `?method&desde&hasta`, con instantes ISO,
  `hasta` exclusivo y `400` si `hasta <= desde`.

## Tests
### 8. Backend
- [x] `kb.routes.test.ts`:
  - [x] contenido 15.000 → 200 y 15.001 → 400;
  - [x] título 400 → 201 y 401 → 400.
- [x] `kb-faq.routes.test.ts`: pregunta 700 → OK y 701 → 400, en create, update y `/test`.
- [x] `ai.routes.test.ts`:
  - [x] 200 con solo `desde`, solo `hasta` y ambos;
  - [x] 400 con `hasta == desde`, `hasta < desde` y `desde=no-es-fecha`.
- [x] `ai.service.test.ts`:
  - [x] el registro en `desde` exacto entra y el que está en `hasta` exacto no (exclusivo);
  - [x] combinado con `method`;
  - [x] `total` cuenta solo el filtrado.
- [x] `ai.isolation.test.ts` (**CA-13**):
  - [x] el tenant B tiene registros dentro del rango y el listado de A con ese rango no los
    incluye, ni en `data` ni en `total`;
  - [x] `?tenantId=<B>` se ignora.
### 9. Frontend
- [x] Parte 1: los tests de `ContactPanel` pasan sin cambios (**CA-2**). Si existe, `InboxPage.test`
  ya no muestra "Generar resumen" en el hilo (**CA-1**).
- [x] Schemas: en los 4 `*.schema.test.ts`, `CONTENIDO_MAX = 15_000` y el peor caso cabe.
  - [x] Empresa: `anio_fundacion` 60.
  - [x] Horarios: `DESCRIPCION_MAX = 160` y el comentario del presupuesto.
  - [x] Nuevo: JSON al tope ≤ 60.000 (**CA-7**).
- [x] `kb-schemas.test.ts`: aserción de `LIMITE_POR_KIND` con los valores nuevos (**CA-5, CA-8**).
- [x] `KnowledgeStructuredForm.test.tsx`: el detalle de un triestado lleva `maxlength=700` y el
  contador `n / 700`.
- [x] `KnowledgeBasePage.test.tsx`: `maxlength` del contenido `15000` y del título `400`.
- [x] FAQ: el `maxlength` de la pregunta es 700 en el formulario y en el probador.
- [x] `date-range.test.ts` (**CA-10**):
  - [x] solo desde, solo hasta, ambos y vacío;
  - [x] `hasta` = medianoche local del día siguiente;
  - [x] `rangoInvertido`.
- [x] `DateRangeFilter.test.tsx`:
  - [x] "Limpiar fechas" aparece con una fecha y llama `onClear`;
  - [x] invertido → `role="alert"` y `aria-invalid`.
- [x] `AiResponseTable`/`AiContextPage` (**CA-9, CA-11, CA-12**):
  - [x] elegir una fecha pide la página 1 con `desde` ISO;
  - [x] combinado con método;
  - [x] invertido → no se envía el rango;
  - [x] limpiar → vuelve a pedir sin rango.

## Verificación final
- [x] `pnpm --filter @sofiapp/api typecheck` + `pnpm --filter @sofiapp/api test`.
- [x] `pnpm --filter @sofiapp/web build && pnpm --filter @sofiapp/web lint` + `pnpm --filter @sofiapp/web test`.
  - Si `KnowledgeBasePage.test.tsx` sigue colgándose, se documenta, y el resto de la suite tiene
    que pasar.
- [x] Checklist de PR de `docs/multi-tenancy.md` §9.
- [ ] **CA-4:** revisión visual, light y dark (PENDIENTE: requiere la app levantada):
  - [ ] la bandeja, con y sin etiquetas y con y sin franja de intención;
  - [ ] el modal de documentos con los contadores nuevos;
  - [ ] "Fuentes y contexto" con el filtro y el error.

  Las capturas van en `.playwright-mcp/` y se borran al terminar.
- [x] `git status` sin `*.png`/`*.jpg` sueltos.
- [x] Entregar al usuario la **tabla de campos modificados** (campo, antes y nuevo) de D2/D3, más el
  resumen de archivos.
- [x] `spec.md` → `**Estado:** implementado`.

## Definición de "hecho"
- [ ] CA-1 … CA-14 verificados (pendiente solo la parte visual de CA-4).
- [x] Frontend y backend coherentes en cada tope: el input, la validación Zod y los docs dicen el
  mismo número.
- [x] Sin código muerto del resumen superior y sin cambios de permisos.
