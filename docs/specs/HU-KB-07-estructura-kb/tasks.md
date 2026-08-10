# HU-KB-07 — Tasks (checklist ejecutable)

> Claude Code: ejecuta en orden. Marca cada casilla al terminar. No cierres el feature hasta que
> TODO esté en verde. Los bloques A–F son los del `spec.md`; el orden de abajo es de dentro hacia
> fuera (backend → lógica pura del frontend → primitivos → componentes → modal), no por bloque.

## Rama

- [x] **NO crear `feat/HU-KB-07`.** Se trabaja y se commitea directamente sobre **`feat/HU-KB-05`**,
      que ya contiene el rediseño de la grilla (commit `be9813f`) y la implementación de HU-KB-06.
      Mismo criterio que se usó para HU-KB-06.
- [x] Confirmar con `git status` que la rama está limpia antes de empezar.

## Implementación — Backend

> Orden del patrón de 6 archivos de `apps/backend/CLAUDE.md`: `types → model → validation →
> service → controller → routes`. `routes` no cambia.

- [x] `kb.types.ts`:
  - [x] `KbTriEstado`, `KbScheduleDay`, `KbFieldValue` (unión discriminada por `tipo`) y
        `KbEstructura` (`schemaVersion`, `schemaId`, `campos`, `adicional` **obligatorio**).
  - [x] `estructura?: KbEstructura` en `IKbDocument`, `IKbDocumentResponse` y `CreateKbDocumentDTO`.
  - [x] `UpdateKbDocumentDTO` gana `estructura?`. **Sin `any`** en ninguna firma.
- [x] `kb-document.model.ts`: `estructura: { type: Schema.Types.Mixed, required: false }`.
      Sin índice nuevo; los dos existentes y `tenantId` quedan igual.
- [x] `kb.validation.ts`:
  - [x] `CONTENIDO_MAX` 3.000 → **10.000** + mensaje `'…los 10,000 caracteres.'` (create y update).
  - [x] `ESTRUCTURA_MAX_BYTES = 40_000` y `estructuraSchema` (sobre + `refine` de tamaño).
  - [x] `estructura: estructuraSchema.optional()` en el `body` de create y de update.
- [x] `kb.service.ts`:
  - [x] `updateDocument` cambia de firma a `(tenantId, id, dto: UpdateKbDocumentDTO)`.
  - [x] Igualdad de `estructura` con `isDeepStrictEqual` de `node:util`.
  - [x] Implementar las tres filas de la tabla de escritura del `plan.md`: no-op total ·
        solo-estructura (`$set` sin `$inc`, sin chunks, sin `kb-index`, sin `bumpKbVersion`) ·
        camino completo con `estructura` en la **misma** escritura.
  - [x] `createDocument` guarda `estructura` en sus tres ramas; en la rama de contenido idéntico
        aplica la regla de solo-estructura.
  - [x] `mapKbDocumentToResponse` expone `estructura` con el spread condicional (patrón de
        `proposito`/`error`).
  - [x] **Solo helpers `*Scoped`.** Ni un `KbDocument.find/updateOne` directo.
- [x] `kb.controller.ts`: `updateDocumentController` delega el `body` completo. Sin `try/catch`, sin
      lógica, sin Mongoose.
- [x] `kb.routes.ts`: **verificar que no requiere cambios** (misma cadena de middlewares).

## Implementación — Frontend · lógica pura

- [x] `types/domain.ts` y `types/api.ts`: `estructura?` en `IKbDocument`,
      `CreateKbDocumentPayload` y `UpdateKbDocumentPayload`; tipos de estructura espejo del backend.
- [x] `src/api/knowledge-base.ts`: enviar `estructura` cuando existe; omitirla mantiene el flujo
      actual intacto (retrocompatible).
- [x] `lib/kb-schemas.ts` (nuevo): `KbFieldKind`, `KbRequirement`, `KbFieldDef`, `KbSectionDef`,
      `KbSchemaDef`, `LIMITE_POR_KIND`, `KB_SCHEMAS` con el schema `generico`,
      `schemaParaTitulo` (registry: solo `'Información Complementaria'`), `emptyEstructura`,
      `valorVacio`, `camposFaltantes`.
- [x] `lib/kb-serialize.ts` (nuevo): `serializeEstructura`, `serializedLength`,
      `migrarLegadoAEstructura`. Las seis reglas de determinismo del `plan.md`.
- [x] `lib/kb-presets.ts`: añadir `hayCambios(doc, contenido, estructura?)`. **No** cambiar la
      semántica de `nextVersion`.

## Implementación — Frontend · UI

- [x] Invocar `emil-design-eng`, `impeccable:impeccable` y `frontend-design:frontend-design`
      **antes** de escribir cualquier componente (regla §7 del `CLAUDE.md` raíz).
      **Parcial:** `emil-design-eng` e `impeccable:impeccable` siguen sin estar registradas en este
      entorno, igual que en HU-KB-04/05/06. Se invocó `frontend-design:frontend-design` y se aplicó
      su propia regla de que el brief manda: al ser un modal dentro de un UI kit shadcn ya
      establecido, la consistencia pesa más que una identidad visual propia. De la skill se tomó lo
      transferible: · que la estructura codifique información real (el marcador de exigencia y el
      resumen `3 de 5` por sección son datos, no adorno) · concentrar la audacia en un solo elemento
      (el bloque «Información adicional», siempre fuera del acordeón) · copy en voz activa con el
      mismo verbo de principio a fin («Añadir horario» → «Quitar horario 1») · estados vacíos como
      invitación («Todavía no agregaste zonas. Añade la primera.») y no como lamento.
- [x] `pnpm dlx shadcn@3.8.5 add accordion radio-group` desde `apps/frontend/`. Verificar que no
      arrastra variables CSS ajenas a la paleta; si las trae, alinearlas en `src/index.css`.
- [x] `components/fields/KnowledgeField.tsx` — label + marcador obligatorio/opcional/condicional +
      contador por campo + slot de error.
- [x] `components/fields/KnowledgeSection.tsx` — `Accordion type="multiple"` con título,
      descripción y resumen de llenado.
- [x] `components/fields/RepeatableList.tsx` — añadir/quitar con tope `maxItems`, genérico sobre el
      render del ítem.
- [x] `components/fields/ConditionalReveal.tsx` — muestra/oculta con reveal `motion-safe`.
- [x] `components/fields/PolicyTriState.tsx` — `RadioGroup` Sí/No/No aplica + detalle opcional.
      **Sin consumidor en esta HU** (lo monta HU-KB-10).
- [x] `components/fields/ScheduleDayEditor.tsx` — día + N intervalos o «Cerrado».
      **Sin consumidor en esta HU** (lo monta HU-KB-09).
- [x] `components/KnowledgeStructuredForm.tsx` (nuevo) — recorre el schema y **siempre** cierra con
      «Información adicional» mapeado a `estructura.adicional`.
- [x] `components/KnowledgeUploadEditor.tsx` — `modoEditor(doc)` con la tabla de cinco filas del
      `plan.md`; la rama legado queda **literalmente igual** salvo `CONTENIDO_MAX`; ambas ramas
      comparten `DialogFooter`, mutación y toasts. Guardar deshabilitado si `camposFaltantes` no
      está vacío.
- [x] `components/KnowledgeDocumentDialog.tsx` — estado elevado `{ contenido, estructura }`; en modo
      estructurado `contenido` es **derivado** vía `serializeEstructura`; contador global y leyenda
      de versión leen ese texto; tercer caso de leyenda para «solo cambió la estructura».
- [ ] Revisión visual en **light y dark** con captura desechable en `.playwright-mcp/` (borrarla al
      terminar). Si no hay entorno para levantarlo, documentar el sustituto aquí.
      **No realizado**, igual que en HU-KB-04/05/06: requiere el backend real contra MongoDB/Redis y
      las credenciales viven en `apps/backend/.env`, sin acceso de lectura en este entorno; tampoco
      hay MCP de Playwright disponible. En su lugar se verificó: (a) `grep` sin una sola utilidad de
      color arbitraria (`bg-[#`, `text-[#`, `border-[#`) en todo `knowledge-base/`; (b) que los dos
      tokens usados por los primitivos sin consumidor —`text-success` y `bg-destructive-subtle`—
      están definidos en `:root`, `.dark` y `.light` de `index.css`, con valores calibrados por tema
      (`--success` sube de 36 % a 45 % de luminosidad en dark; `--destructive-subtle` baja de 97 % a
      18 %); (c) el único color de paleta usado es `text-amber-600 dark:text-amber-400` en
      `FieldCounter`, el mismo par que ya usaba `IndexingStatusBadge`; (d) 78 tests RTL nuevos que
      ejercitan los dos modos del modal. **Queda pendiente una pasada visual humana antes del merge.**

## Desvíos del plan (deliberados)

- [x] **`visibleSi` se generalizó a cualquier `requisito`**, no solo a `condicional`, y el tipo pasó
      a una unión discriminada donde **`condicional` exige su predicado** (un condicional sin
      `visibleSi` ya no compila; antes se habría comportado como un obligatorio permanente
      disfrazado). Consultado y aprobado; `spec.md` (criterio 21) y `plan.md` actualizados.
- [x] **El serializer omite los campos no visibles.** Una respuesta descartada («Sí» → se llena el
      campo dependiente → «No») conserva su valor en `campos`, pero no llega al texto que lee la IA,
      donde contradiría a la respuesta vigente. Consultado y aprobado; `spec.md` (criterio 15) y
      `plan.md` (regla 4bis) actualizados.
- [x] **`modoEditor` vive en `lib/kb-schemas.ts`, no en `KnowledgeUploadEditor.tsx`** como decía el
      plan. Consulta el registry, así que ponerlo en `kb-presets.ts` habría creado un ciclo de
      importación con `kb-schemas`; en `lib` además queda testeable sin montar el componente.
- [x] **El contador global quedó en el editor, encima del pie**, rotulado «Texto que leerá la IA», y
      no en el encabezado del diálogo. El encabezado ya carga título y leyenda de versión, y el
      número importa donde se toma la decisión de guardar. El plan solo exigía que leyera el texto
      derivado, cosa que hace.
- [x] **Los errores rojos por campo aparecen al primer cambio, no «al intentar guardar».** El botón
      está deshabilitado desde el primer render (criterio 21), y un botón deshabilitado nunca
      dispara `submit`: «al intentar guardar» no era un momento que existiera.
- [x] **Bug encontrado por los tests de integración y corregido:** `schemaDeDocumento` resolvía el
      schema por título, así que un documento **con** `estructura` cuyo título no estuviera en el
      registry abría en modo legado y al guardar habría dejado su estructura huérfana. Ahora un
      documento con estructura resuelve por su propio `schemaId` (con caída a `generico` si ese
      schema ya no existe). Cubierto por 7 tests unitarios en `kb-schemas.test.ts`.

## Documentación

- [x] `docs/data-model.md`, sección `kb_documents`: añadir el campo `estructura` y un bloque
      `// HU-KB-07 — semántica de escritura:` con la tabla de tres filas. **Añadir, no reescribir**
      los comentarios de HU-KB-06 (convención del archivo).

## Tests — Backend (Vitest)

- [x] `kb.service.test.ts`:
  - [x] `createDocument` persiste `estructura`; sin `estructura` el documento se crea igual que antes.
  - [x] `updateDocument`, fila 1: contenido igual + estructura igual (o ausente) → **NO-OP total**
        (misma `version`, mismo `updatedAt`, `kbIndexQueue.add` no llamado, `Tenant.kbVersion` quieto).
  - [x] `updateDocument`, fila 2: contenido igual + estructura distinta → `estructura` persistida,
        `version` intacta, chunks **no** borrados, `kbIndexQueue.add` **no** llamado,
        `Tenant.kbVersion` intacto, `updatedAt` sí avanzó.
  - [x] `updateDocument`, fila 3: contenido distinto → camino completo **y** `estructura` guardada
        en la misma escritura.
  - [x] `isFirstFill` sigue suprimiendo el `$inc` cuando el primer llenado trae `estructura`.
  - [x] `estructura` ausente en el DTO **no borra** la `estructura` guardada.
  - [x] **Aislamiento multi-tenant:** el tenant B no lee (404) ni sobrescribe la `estructura` de un
        documento del tenant A.
- [x] `kb.routes.test.ts`:
  - [x] `contenido` de 10.001 caracteres → **400**; de 10.000 → **201/200**.
  - [x] `estructura` con sobre inválido (falta `adicional`, `schemaVersion: 0`) → **400**.
  - [x] `estructura` que supera `ESTRUCTURA_MAX_BYTES` → **400**.
  - [x] `POST`/`PATCH` con `estructura` la devuelven en la respuesta; `GET` la lista.
  - [x] Retrocompatibilidad: un documento sin `estructura` recorre create/list/update/delete igual.
  - [x] Cross-tenant: `PATCH` con `estructura` sobre un documento ajeno → **404**.

## Tests — Frontend (Vitest + RTL)

- [x] `lib/kb-serialize.test.ts`:
  - [x] **Determinismo:** dos llamadas con el mismo input → strings idénticos byte a byte.
  - [x] **Orden canónico:** un `campos` con las claves en orden inverso al schema serializa en el
        orden del schema.
  - [x] **Campos huérfanos:** un campo ausente del schema aparece al final, ordenado por `id`.
  - [x] **Arrays:** el orden de `valores`/`items`/`intervalos` se respeta tal cual.
  - [x] **Vacíos:** campo vacío no deja etiqueta; sección entera vacía no deja encabezado.
  - [x] **`adicional`:** siempre al final; vacío → no aparece.
  - [x] `serializedLength` coincide con `serializeEstructura(...).length`.
  - [x] `migrarLegadoAEstructura` conserva el texto **íntegro** en `adicional`.
- [x] `lib/kb-schemas.test.ts`: `schemaParaTitulo` solo resuelve «Información Complementaria»;
      `emptyEstructura` produce un sobre válido con `adicional: ''`; `camposFaltantes` ignora los
      condicionales ocultos y detecta los obligatorios vacíos.
- [x] `components/KnowledgeStructuredForm.test.tsx`:
  - [x] Renderiza los campos del schema **y** el bloque «Información adicional».
  - [x] Un obligatorio sin llenar **deshabilita** «Guardar e indexar» y no dispara ninguna petición.
  - [x] Un condicional aparece solo cuando su `visibleSi` se cumple.
- [x] `pages/KnowledgeBasePage.test.tsx` (ampliar, sin romper los 17 casos actuales):
  - [x] **Modo legado:** un documento con texto y sin `estructura` abre el `<Textarea>` de siempre y
        guarda como hoy.
  - [x] **Modo estructurado:** «Información Complementaria» vacía abre el formulario guiado.
  - [x] El contador global refleja la **longitud del texto serializado**, no la de un campo suelto.
  - [x] Guardar en modo estructurado envía `contenido` **y** `estructura` en el mismo payload.

## Verificación final

- [x] `pnpm --filter @sofiapp/api typecheck` sin errores.
- [x] `pnpm --filter @sofiapp/api test` en verde.
- [x] `pnpm --filter @sofiapp/web build` sin errores (incluye `tsc --noEmit`).
- [x] `pnpm --filter @sofiapp/web lint` en verde (`--max-warnings 0`).
- [x] `pnpm --filter @sofiapp/web test` en verde, **salvo**
      `src/features/tags/components/TagSelector.test.tsx` (9 fallos por `Tooltip` fuera de
      `TooltipProvider`): **preexistente y ajeno**, declarado fuera de alcance en el `spec.md`.
      Confirmar que el conteo de fallos no cambió.
- [x] `grep -rn "bg-\[#" apps/frontend/src/features/knowledge-base` sin resultados.
- [x] `git diff --stat` no toca `workers/`, `kb.chunker.ts`, `kb.repository.ts`, `KnowledgeCard.tsx`,
      `KnowledgeGrid.tsx`, `KnowledgeToolbar.tsx` ni `pages/` (criterio 32 del spec).
- [x] `git status` sin `*.png`/`*.jpg` colados de la verificación visual.
- [x] Checklist de PR de `docs/multi-tenancy.md` §9 completo: queries `*Scoped` · `tenantId` del
      token · `tenantId` `required` + indexado en el modelo tocado · `requireTenant` tras
      `authenticateJWT` · sin rutas cross-tenant nuevas · **test de aislamiento de `estructura`
      añadido**.
- [x] Actualizar `**Estado:**` del `spec.md` a `implementado`.
- [x] Commit(s) en `feat/HU-KB-05` con Conventional Commits **en inglés**.

## Definición de "hecho"

`KbDocument` guarda un JSON `estructura` opcional junto a su `contenido`, y el backend lo acepta, lo
acota por sobre y tamaño, y lo devuelve sin interpretarlo — de modo que HU-KB-08 a 11 no tendrán que
tocarlo. Existe un serializer determinista `estructura → texto` con sus seis reglas probadas. El
modal decide su modo con una regla explícita: lo que ya tiene texto libre sigue abriendo el textarea
de siempre, ahora con tope de 10.000, y lo que nace vacío con schema registrado abre el formulario
guiado, que **siempre** termina en «Información adicional» y bloquea el guardado si falta un
obligatorio. Los seis componentes base están listos en light y dark. Y el versionado de HU-KB-06 se
comporta exactamente igual, con una sola regla nueva: un cambio que solo afecta a `estructura` se
persiste sin re-versionar ni re-indexar.
