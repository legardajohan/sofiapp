# HU-KB-07 — Infraestructura de conocimiento estructurado (spec)

> **Spec-Driven Development.** Este es el QUÉ y el porqué. El CÓMO va en `plan.md`; la ejecución
> en `tasks.md`. HU **mixta** (backend + frontend) y **primera de una serie**: no entrega ningún
> formulario de negocio, sino los cimientos sobre los que HU-KB-08/09/10/11 los montarán.

**Estado:** implementado

## Historia

Como **admin** de un tenant, quiero que el modal de conocimiento me **guíe con campos** en vez de
darme un textarea en blanco, para saber qué información necesita mi IA y no tener que inventarme
un formato — y quiero que lo que ya escribí en texto libre **siga funcionando exactamente igual**.

Esta HU no entrega todavía esos formularios: entrega la **infraestructura** que los hace posibles.

## Contexto: qué está mal hoy

`apps/frontend/src/features/knowledge-base/components/KnowledgeUploadEditor.tsx` es, para las cinco
categorías y para cualquier documento libre, **un único `<Textarea>` de 3.000 caracteres** con un
contador `X / 3.000`. De ahí salen tres problemas encadenados:

| # | Problema | Consecuencia |
|---|---|---|
| A | El admin no sabe **qué** escribir ni con qué formato | «Información de la empresa» acaba con tres líneas sueltas o con un copy-paste de la web |
| B | No hay forma de saber si falta un dato **mínimo** | La IA responde «no tengo esa información» sobre cosas que el admin creía haber cargado |
| C | 3.000 caracteres es el tope de **un texto libre**, no de un formulario | Un formulario con 15 campos suma más que eso solo con lo obligatorio |
| D | El contenido es texto opaco: al reabrir el modal solo se puede re-editar el párrafo | Imposible editar «el horario del sábado» sin releer todo |

El backend, en cambio, está sano: `contenido` es texto plano que entra al chunker
(`KB_CHUNK_SIZE=1000`, overlap 150) y de ahí a los embeddings. **Ese pipeline no es el problema y
no se toca.**

## Objetivo técnico

Sentar cinco piezas de infraestructura, y **ninguna más**:

1. Un campo **`estructura`** opcional y persistido en `KbDocument` (JSON), junto al `contenido`
   textual que ya existe. `contenido` sigue siendo la fuente de verdad para indexación, versionado
   y retrieval; `estructura` es la fuente de verdad para la **edición guiada** del modal.
2. Una **serialización determinista** `estructura → contenido`, con su contrato y sus tests.
3. Un **modo legado** que garantice que ningún documento existente cambia de comportamiento.
4. **Límites nuevos**: tope global de contenido subido a 10.000 y límites por tipo de campo.
5. Los **componentes base reutilizables** y el mecanismo universal de **«Información adicional»**.

## Alcance

### Incluye

**Backend** (`apps/backend/src/features/kb/`)

- `kb.types.ts` — `KbEstructura`, `KbFieldValue`, `estructura?` en `IKbDocument`,
  `IKbDocumentResponse` y `CreateKbDocumentDTO`; `UpdateKbDocumentDTO` gana `estructura?`.
- `kb-document.model.ts` — campo `estructura` (`Schema.Types.Mixed`, opcional).
- `kb.validation.ts` — `CONTENIDO_MAX` 3.000 → 10.000 y validación del **sobre** de `estructura`.
- `kb.service.ts` — `createDocument`/`updateDocument` aceptan y guardan `estructura`; el *fast path*
  de no-op de HU-KB-06 se refina para no perder cambios estructurales.
- `kb.controller.ts` — expone `estructura` (sigue delgado).

**Frontend** (`apps/frontend/src/features/knowledge-base/`)

- `types/` — `estructura?` en `IKbDocument` y en ambos payloads; `src/api/knowledge-base.ts` la envía.
- `lib/kb-schemas.ts` **(nuevo)** — el sistema de campos (tipo, obligatorio/opcional/condicional,
  límite) que consumirán HU-08..11, con **un solo** schema de ejemplo: `generico`.
- `lib/kb-serialize.ts` **(nuevo)** — `serializeEstructura` + `migrarLegadoAEstructura`.
- `KnowledgeUploadEditor.tsx` — bifurcación legado / estructurado.
- `KnowledgeStructuredForm.tsx` **(nuevo)** — cuerpo del modo estructurado.
- `KnowledgeDocumentDialog.tsx` — contador global sobre el texto serializado.
- `components/fields/` **(nuevo)** — `KnowledgeSection`, `KnowledgeField`, `RepeatableList`,
  `ConditionalReveal`, `PolicyTriState`, `ScheduleDayEditor`.
- `components/ui/accordion.tsx` y `radio-group.tsx` — vendorizados con la CLI de shadcn.

**Documentación**

- `docs/data-model.md` — campo `estructura` en `kb_documents` + semántica de escritura de HU-KB-07.

### Fuera de alcance

- **Los formularios de negocio: empresa, horarios y ubicación, políticas y términos, productos y
  servicios.** Son HU-KB-08 a HU-KB-11. Esta HU deja sus primitivas listas, no sus campos.
- **El conteo de versiones y el soft-delete con `oculto`**: los trajo HU-KB-06 y ya están en la
  rama. Aquí solo se garantiza **no romperlos** (criterios del bloque E).
- La validación backend de obligatorios al eliminar y la carrera del worker de indexación
  (HU-KB-06, ya cerradas).
- **La vista principal**: grilla, tarjetas, badges, buscador, filtros, estado, versión, fragmentos
  y fecha quedan **exactamente** como están. Todo el trabajo vive dentro del modal.
- El pipeline de indexación: `kb.chunker.ts`, `kb.repository.ts` y
  `workers/kb-index.processor.ts` **no se tocan** — el texto derivado entra por ellos tal cual.
- El *drift* de `proposito` entre `PRESET_DOCUMENTS` (backend) y `PRESET_META` (frontend), deuda ya
  registrada en HU-KB-05.
- La suite roja preexistente `src/features/tags/components/TagSelector.test.tsx` (9 fallos por
  `Tooltip` fuera de `TooltipProvider`), **ajena** a esta HU.

## Criterios de aceptación

### Bloque A — Persistencia de `estructura` (backend · complejidad **media**)

1. `KbDocument` tiene un campo **`estructura` opcional** (`Schema.Types.Mixed`). No lleva índice
   propio: nunca se consulta por él. `tenantId` sigue siendo `required` + indexado.
2. La forma de `estructura` es **auto-descriptiva y versionada**:
   `{ schemaVersion: number; schemaId: string; campos: Record<string, KbFieldValue>; adicional: string }`,
   donde cada `KbFieldValue` lleva su propio discriminante `tipo`. Esto permite que HU-08..11 añadan
   `schemaId` nuevos sin romper documentos ya guardados.
3. `POST /api/kb/documents` y `PATCH /api/kb/documents/:id` **aceptan y persisten** `estructura`, y
   `GET /api/kb/documents` la devuelve cuando existe.
4. **Retrocompatibilidad total**: un documento sin `estructura` se crea, se lista, se edita y se
   elimina exactamente como antes de esta HU. `estructura` nunca es obligatoria.
5. **`estructura` ausente en el payload significa «no tocar»**, nunca «borrar». Un guardado desde
   modo legado no puede destruir una `estructura` previamente guardada. En esta HU no existe camino
   de borrado de `estructura`.
6. El backend **no interpreta** `estructura`: Zod valida solo el **sobre** (las cuatro claves, sus
   tipos primitivos) y un tope de tamaño del JSON serializado. Añadir un campo nuevo en HU-08..11
   **no requiere tocar el backend**. Sin `any` en ninguna firma.

### Bloque B — Límites (backend + frontend · complejidad **baja**)

7. `CONTENIDO_MAX` pasa de **3.000 a 10.000** en `kb.validation.ts` (create y update) y en el
   frontend, con el mensaje de error actualizado. Un `contenido` de 10.001 caracteres → **400**.
8. El JSON de `estructura` está acotado por `ESTRUCTURA_MAX_BYTES`; excederlo → **400** con mensaje
   propio. Es el guardarraíl que impide documentos sin cota sin acoplar el backend a los schemas.
9. Cada tipo de campo tiene su **límite por defecto** (`texto-corto` 120, `texto-medio` 300,
   `texto-largo` 1.500, ítem de lista/repetible 120, máximo 20 ítems), declarado en
   `kb-schemas.ts` y aplicado por `KnowledgeField` sobre el control.
10. El **contador global** del modal se calcula sobre el **texto serializado**, no sobre lo tecleado
    en un campo suelto, y conserva el degradado de color actual (neutro → ámbar al 90 % → rojo en
    el tope).

### Bloque C — Serialización determinista (frontend · complejidad **media**)

11. `serializeEstructura(estructura, schema?)` es **determinista**: el mismo input produce el mismo
    output byte a byte, sin fecha, sin aleatoriedad y sin formato dependiente de locale.
12. **Orden canónico por schema**: las secciones y los campos salen en el orden declarado en
    `KbSchemaDef`, **no** en el orden de claves del objeto `campos`.
13. Un campo presente en `campos` pero **ausente del schema** (dato guardado por una versión
    anterior) **no se pierde**: se serializa al final, ordenado por `id`.
14. Los **arrays conservan el orden en que el usuario los ingresó** — está persistido y jamás se
    reordena.
15. Los campos **vacíos se omiten por completo**: no dejan etiqueta ni encabezado huérfano en el
    texto que va a la IA. Se omiten también los campos **no visibles** (`visibleSi` falso): una
    respuesta descartada —el admin marca «Sí», llena el campo dependiente y luego cambia a «No»—
    conserva su valor en `campos` para no perderlo, pero **no puede llegar al texto que entrena a la
    IA**, donde contradiría a la respuesta vigente. Sin schema (campos huérfanos) se serializa todo.
16. El texto de **«Información adicional»** siempre se serializa **al final**, bajo su propio
    encabezado, si no está vacío.

### Bloque D — Modos legado y estructurado (frontend · complejidad **alta**)

17. El modo del modal se resuelve así, y solo así:
    - `doc.estructura` presente → **estructurado**;
    - sin `estructura` y **con** contenido → **legado**;
    - sin `estructura`, **sin** contenido (o preset virtual) y **con schema registrado** para su
      título → **estructurado** («nace estructurado»);
    - en cualquier otro caso → **legado**.
18. **El modo legado abre exactamente como hoy**: el mismo `<Textarea>`, el mismo contador, el mismo
    placeholder por `proposito`, el mismo botón «Guardar e indexar». La única diferencia visible es
    el tope, ahora 10.000.
19. **Cero migración automática y cero pérdida**: un documento legado con texto guarda como legado,
    siempre. Existe `migrarLegadoAEstructura` (vuelca el texto libre íntegro en `adicional`) con sus
    tests, pero **sin consumidor de UI** en esta HU: la conectará HU-KB-08 tras un opt-in explícito.
20. El modo estructurado **siempre** incluye el bloque de texto libre **«Información adicional»**,
    exista o no schema y tenga los campos que tenga. Está garantizado por el **tipo**
    (`adicional: string` es obligatorio en el contrato de `KbEstructura`), no por disciplina.
21. Un campo **obligatorio** sin llenar **deshabilita** «Guardar e indexar» y se señala en el propio
    campo. No se envía ninguna petición al backend. Un campo **opcional nunca bloquea**, y un campo
    **no visible tampoco**: exigir algo que el admin no puede ver dejaría el botón muerto sin nada
    que señalar. `visibleSi` se respeta con **cualquier** `requisito`, y el tipo **exige** el
    predicado cuando el requisito es `condicional` — un condicional sin `visibleSi` no compila,
    porque en ejecución sería un obligatorio permanente disfrazado.
22. En modo estructurado **no hay escotilla de texto libre** sobre el contenido derivado: editarlo a
    mano rompería la coherencia `estructura ↔ contenido`. La vía libre es «Información adicional».
23. Los seis componentes base (`KnowledgeSection`, `KnowledgeField`, `RepeatableList`,
    `ConditionalReveal`, `PolicyTriState`, `ScheduleDayEditor`) existen, usan el UI kit shadcn y
    quedan correctos en **light y dark** con tokens semánticos (cero `bg-[#...]`). `PolicyTriState`
    y `ScheduleDayEditor` se entregan **sin consumidor**: son para HU-KB-09/10.

### Bloque E — El versionado actual no se rompe (backend · complejidad **alta**)

24. La mecánica de versionado **no se modifica**: `isFirstFill` sigue suprimiendo el `$inc` del
    primer llenado y `bumpKbVersion` sigue disparándose con los mismos criterios que dejó HU-KB-06.
25. Si **ni el contenido ni la `estructura`** cambiaron, el guardado sigue siendo un **NO-OP total**:
    sin versión nueva, sin borrar chunks, sin encolar `kb-index`, sin `bumpKbVersion` y **sin tocar
    `updatedAt`** — la garantía que introdujo HU-KB-06.
26. Si el **contenido no cambió pero la `estructura` sí**, se persiste **solo** `estructura`: sin
    `$inc: version`, sin borrar chunks, sin encolar `kb-index` y sin `bumpKbVersion`. El texto que
    ve la IA no cambió, así que nada aguas abajo debe moverse. `updatedAt` sí avanza, porque hubo
    una escritura real.
27. Si el **contenido cambió**, se ejecuta el camino actual completo (versión, limpieza de chunks,
    `kb-index`, `bumpKbVersion`) y `estructura` se guarda **en la misma escritura**, sin un update
    extra.

### Bloque F — Transversales

28. **Aislamiento multi-tenant.** Toda lectura y escritura de `estructura` pasa por el repositorio
    `*Scoped` con el `tenantId` del token; se añade un test que prueba que un tenant **no puede
    leer ni escribir** la `estructura` de un documento de otro tenant (404, no 200 con datos
    ajenos). Checklist de PR de `docs/multi-tenancy.md` §9 completo.
29. `pnpm --filter @sofiapp/api typecheck` (`tsc --noEmit`) y `pnpm --filter @sofiapp/api test` en
    verde, sin `any` en el código nuevo.
30. `pnpm --filter @sofiapp/web build` (incluye `tsc --noEmit`), `lint` (`--max-warnings 0`) y
    `test` en verde, con la única excepción declarada de `TagSelector.test.tsx`.
31. Se invocaron `emil-design-eng`, `impeccable:impeccable` y `frontend-design:frontend-design`
    **antes** de escribir cualquier componente (regla §7 del `CLAUDE.md` raíz). Las que no estén
    registradas en el entorno quedan documentadas en `tasks.md`.
32. `git diff` no toca `KnowledgeCard.tsx`, `KnowledgeGrid.tsx`, `KnowledgeToolbar.tsx`,
    `KnowledgeBasePage.tsx`, `kb.chunker.ts`, `kb.repository.ts` ni
    `workers/kb-index.processor.ts`. La vista principal y el pipeline de indexación quedan intactos.

## Dependencias

Depende de:

- Rama **`feat/HU-KB-05`**, que ya contiene el rediseño a grilla única (commit `be9813f`) **y** la
  implementación de HU-KB-06 (no-op de guardado, soft-delete de presets, buscador y filtros).
  **No se crea `feat/HU-KB-07`**: esta HU se desarrolla y se commitea sobre esa misma rama.
- `features/knowledge-base/lib/kb-presets.ts` — `PRESET_META`, `isVirtualPresetId`, `nextVersion`,
  `normalizeContenido`.
- `src/components/ui/` — `dialog`, `alert-dialog`, `button`, `input`, `textarea`, `label`, `switch`,
  `select`, `card`, `separator` (vendorizados) + `accordion` y `radio-group` (**a vendorizar aquí**).
- El pipeline de indexación existente, que se consume sin modificarlo.

Bloquea a: **HU-KB-08, HU-KB-09, HU-KB-10 y HU-KB-11**, que construyen sus formularios sobre
`kb-schemas.ts`, `kb-serialize.ts` y los seis componentes base de esta HU.

## Definición de "hecho"

`KbDocument` guarda un JSON `estructura` opcional junto a su `contenido`, y el backend lo acepta,
lo acota y lo devuelve sin interpretarlo. Existe un serializer determinista `estructura → texto`
con su contrato documentado y sus tests. El modal decide su modo con una regla explícita: los
documentos con texto libre siguen abriendo el textarea de siempre —ahora con tope de 10.000— y los
que nacen vacíos con schema registrado abren el formulario guiado, que **siempre** termina en
«Información adicional» y bloquea el guardado si falta un obligatorio. Los seis componentes base
están listos en light y dark para que HU-KB-08 a 11 solo tengan que declarar sus campos. Y el
versionado de HU-KB-06 sigue comportándose exactamente igual, con una única regla nueva: un cambio
que solo afecta a `estructura` se persiste sin re-versionar ni re-indexar.
