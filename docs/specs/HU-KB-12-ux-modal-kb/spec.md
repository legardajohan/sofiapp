# HU-KB-12 — Pestañas, presets protegidos y editor semanal de horarios (spec)

> **Spec-Driven Development.** Este es el QUÉ y el porqué. El CÓMO va en `plan.md`; la ejecución en
> `tasks.md`. HU **casi enteramente frontend**: el único archivo de backend que toca es el **espejo
> de tipos** (`kb.types.ts`), y solo para añadir un campo opcional. Primera HU de la serie que
> **modifica la infraestructura de HU-KB-07** en vez de solo consumirla.

**Estado:** creado

## Historia

Como **admin** de un tenant, quiero que el modal de conocimiento guiado se navegue por **pestañas**
en vez de un acordeón que me obliga a hacer scroll, que las categorías que el sistema necesita **no
me ofrezcan borrarlas por error**, y que el horario de atención se edite en una **semana compacta**
donde pueda comparar los días, anotar para qué es cada tramo y copiar un horario a varios días sin
teclearlo cinco veces.

## Contexto: por qué las tres cosas van juntas

Son tres cambios independientes en producto, pero **convergen en los mismos archivos y en los mismos
tests**:

| | Qué cambia | Archivos núcleo |
|---|---|---|
| **A** | Acordeón → pestañas | `KnowledgeStructuredForm.tsx`, `KnowledgeSection.tsx` |
| **B** | Sin Eliminar en dos presets | `KnowledgeUploadEditor.tsx`, `kb-presets.ts` |
| **C** | Editor semanal de horarios | `ScheduleDayEditor.tsx` → nuevos, `kb-serialize.ts`, `domain.ts` |

A y C se pisan en `KnowledgeStructuredForm`; A y C se pisan en los mismos tests de
`KnowledgeBasePage.test.tsx` (los de la sección «Cuándo atienden», que con A dejan de estar montados
salvo que se active su pestaña). Planearlos por separado obligaría a reescribir dos veces las mismas
aserciones. B va incluido porque toca el mismo modal y su test vive en el mismo archivo, aunque no
comparte código con A ni con C.

**Esta HU supersede dos criterios ya liberados**, y conviene decirlo de frente:

- **HU-KB-10, criterio 16** («El botón Eliminar sigue estando en este modal, porque la categoría es
  opcional»).
- **HU-KB-11, criterio 17** (el mismo, para «Políticas y términos»).

Los dos se cumplieron y se probaron. La decisión de producto cambia; los tests correspondientes se
**invierten**, no se borran, y este spec queda como el registro de por qué.

## Objetivo técnico

Tres objetivos, sin dependencias entre sí salvo el orden de ejecución:

- **A.** Sustituir el `Accordion` por `Tabs` del kit, con un indicador de progreso por pestaña que
  distinga *faltan N obligatorios* de *x de y opcionales llenos*.
- **B.** Cerrar el camino de borrado de «Horarios y ubicación» y «Políticas y términos» desde la UI,
  conservándolo para «Información Complementaria» y para los documentos de título libre.
- **C.** Reemplazar las siete tarjetas por día por un **editor semanal compacto**, con descripción
  opcional **por intervalo**, validación de `inicio < fin` y copiado a varios días.

## Alcance

### Incluye

**Feature A**
- `components/KnowledgeStructuredForm.tsx` — `Accordion` → `Tabs`; el cálculo del indicador por
  sección.
- `components/fields/KnowledgeSection.tsx` — deja de ser un `AccordionItem` y pasa a ser el panel de
  una pestaña.

**Feature B**
- `lib/kb-presets.ts` — constante `PRESETS_NO_ELIMINABLES` + helper `esPresetProtegido`.
- `components/KnowledgeUploadEditor.tsx` — el gate `puedeEliminar` y la **corrección del copy
  engañoso** del `AlertDialog`.

**Feature C**
- `types/domain.ts` y `apps/backend/src/features/kb/kb.types.ts` — `descripcion?: string` en el
  intervalo, en lockstep.
- `lib/kb-serialize.ts` — `serializarDia` emite la descripción y omite intervalos sin horas.
- `lib/kb-horario.ts` **(nuevo)** — helpers puros de validación y copiado.
- `components/fields/ScheduleWeekEditor.tsx`, `ScheduleDayRow.tsx`, `ScheduleIntervalRow.tsx`,
  `CopiarHorarioMenu.tsx` **(nuevos)**; `ScheduleDayEditor.tsx` **se retira**.
- `components/KnowledgeStructuredForm.tsx` — el `case 'horario'` pasa de mapear 7 editores a montar
  uno solo.

Tests: los cuatro archivos del feature, con el mapa test por test del `plan.md`.

### Fuera de alcance

- **La lógica de negocio del backend.** No se toca `kb.service.ts`, ni rutas, ni validación, ni el
  worker de indexación. El único archivo de `apps/backend` que cambia es `kb.types.ts`, y solo para
  añadir una propiedad **opcional** a una interfaz que el servidor **no interpreta** (guarda la
  `estructura` opaca). No hay migración de datos.
- **La vista de tarjetas** (`KnowledgeBasePage`, `KnowledgeGrid`, `KnowledgeCard`, `KnowledgeToolbar`,
  `PresetProgress`): ni el diseño, ni los contadores, ni los filtros. C es «solo el bloque de
  horarios dentro del modal», y A y B solo cambian el cuerpo y el pie del modal.
- **Los cuatro schemas de categoría** (`empresa`, `productos`, `horarios`, `politicas`): no se
  añade, quita ni renombra ningún campo ni ningún `id`. `HORARIOS_SCHEMA` se queda en `version: 1`
  (criterio 19).
- **Recuperar un preset ya eliminado.** Si un tenant borró alguno de los dos presets protegidos
  **antes** de esta HU, su tarjeta seguirá sin aparecer: `mergePresetsWithDocuments` descarta los
  `oculto`. B cierra la puerta hacia adelante, no repone lo ya borrado — ver riesgo R-4.
- **El acordeón como componente.** `components/ui/accordion.tsx` se queda en el kit aunque este
  feature deje de usarlo; retirarlo del kit es otra decisión.

## Criterios de aceptación

### Bloque A — Pestañas (complejidad **media**)

1. El formulario guiado renderiza un `Tabs` del kit con **una pestaña por sección** del schema,
   rotulada con `seccion.titulo`, y **cero** rastros de `Accordion` en el feature.
2. Solo el contenido de la pestaña activa está en el DOM. Se apoya en el desmontaje por defecto de
   `Tabs.Content` de Radix — es el comportamiento deseado, no un efecto colateral.
3. La pestaña activa inicial es la **primera sección**, y el estado de pestaña es **interno al
   formulario**: reabrir el modal vuelve a empezar por la primera.
4. Cada pestaña lleva su indicador, calculado con `esVisible` + `valorVacio` + `requisito` y
   **actualizado mientras se escribe**:
   - con obligatorios visibles **sin llenar** → badge ámbar con el **número que falta** y un `title`
     en español con singular/plural correcto («Falta 1 campo obligatorio» / «Faltan 2 campos
     obligatorios»);
   - con obligatorios y **todos resueltos** → `Check` de lucide en `text-success`;
   - **sin** obligatorios → contador discreto `x de y` sobre los campos **visibles** llenos.
5. Un schema **sin secciones** (`generico`) no pinta barra de pestañas, y «Información adicional»
   sigue siendo su único contenido.
6. «Información adicional» y el contador «Texto que leerá la IA» quedan **fuera** del `Tabs`,
   siempre visibles, como hoy.
7. El `TabsList` desborda con **scroll horizontal**, sin romper el ancho del modal ni recortar el
   foco visible.
8. Accesibilidad: los triggers exponen `role="tab"`, se navegan con flechas, y el **nombre accesible
   incluye el título de la sección** aunque lleve badge — el indicador no puede convertir el nombre
   en «Identidad 2».

### Bloque B — Presets protegidos (complejidad **baja**)

9. «Horarios y ubicación» y «Políticas y términos» **no ofrecen el botón Eliminar**, ni con
   documento real ni con estructura guardada. **Supersede** HU-KB-10 §16 y HU-KB-11 §17.
10. «Información Complementaria» **sí conserva Eliminar** — excepción deliberada, blindada con test
    propio para que nadie la «uniformice» después.
11. Los documentos de **título libre** (`isPreset: false`) siguen eliminables; los **obligatorios**
    (empresa, productos) y los **presets virtuales** siguen sin Eliminar, como hoy.
12. La lista de títulos protegidos vive en `lib/kb-presets.ts`, junto a `PRESET_META`, y compara con
    `normalizeTitulo` (insensible a mayúsculas y espacios) — no con igualdad exacta dispersa por los
    componentes.
13. **El copy del `AlertDialog` deja de mentir.** Hoy promete «La categoría seguirá en la lista,
    vacía, por si la necesitas» y es falso: `mergePresetsWithDocuments` descarta los `oculto`, así
    que la categoría **desaparece** de la grilla sin vía de retorno desde la UI. Tras esta HU esa
    frase solo podría alcanzar a «Información Complementaria», y para ella también es falsa: se
    retira y se sustituye por lo que de verdad pasa.
14. **Sin cambios de backend en el borrado.** El soft-delete (`oculto`) sigue existiendo en la API;
    lo que cambia es que la UI ya no lo alcanza para esos dos títulos.

### Bloque C — Editor semanal de horarios (complejidad **alta**)

15. El campo `horario` se edita en un **único editor semanal**: siete filas —una por día del orden
    canónico `DIAS_SEMANA`—, en vez de siete tarjetas con borde. Cabe una semana a la vista sin
    scroll interno en el ancho del modal.
16. Cada día distingue **Abierto / Cerrado** de forma inequívoca, admite hasta `MAX_INTERVALOS`
    tramos y puede quedar **cerrado sin intervalos**. Marcar «Cerrado» **conserva** los tramos, como
    hoy.
17. Cada intervalo tiene hora de inicio, hora de fin y una **descripción opcional propia** («Solo
    recepción de pedidos»). La descripción pertenece **al intervalo**, no al día.
18. Copiar el horario de un día **a varios días a la vez** con un control del kit, sin escribirlo
    cinco veces. Los días marcados **Cerrado no se sobrescriben** y el control lo hace evidente antes
    de aplicar, no después.
19. **`HORARIOS_SCHEMA` se queda en `version: 1`.** Añadir `descripcion?` es un cambio **aditivo y
    compatible**: una estructura guardada sin descripción se lee igual (`undefined`), el valor sigue
    siendo auto-descriptivo (`tipo: 'horario'`) y ningún campo cambia de `kind`, se retira ni se
    vuelve obligatorio. Subir a 2 no aportaría nada y rompería el test de versión sin motivo.
20. **Determinismo intacto para lo ya guardado.** Un documento cuyos intervalos no tienen
    descripción serializa **byte a byte igual que hoy** (`- lunes: 08:00–12:00, 14:00–18:00`), así
    que abrir y guardar sin tocar nada **no crea una versión nueva**. Con descripción, el texto
    cambia y re-indexa de forma natural. Se verifica con un test de igualdad exacta.
21. **Validación de intervalos, en dos niveles distintos** — lo que no se serializa y lo que bloquea
    **no** son lo mismo:
    - **`invertido`** — las dos horas están puestas y `desde >= hasta` (incluido `desde == hasta`:
      un tramo de duración cero no es información, es un descuido). En un día **abierto**, marca
      `aria-invalid`, muestra su error en tokens `destructive` y **bloquea el guardado**.
    - **`incompleto`** — falta alguna de las dos horas. **No bloquea**: muestra un aviso inline
      («Completa las dos horas.») sin `aria-invalid`, y el intervalo simplemente no llega al texto.
    La asimetría es deliberada: un campo de hora a medio llenar es un estado natural mientras se
    escribe y bloquear ahí sería hostil, mientras que un tramo que cierra antes de abrir es un dato
    que el admin cree haber guardado y no se guardaría.
22. El serializador **omite** los intervalos que no estén completos y bien ordenados —`incompleto` o
    `invertido`—: es la red de seguridad para datos ya guardados con un campo de hora en blanco, que
    hoy producirían una línea rota (`- lunes: –`). Un día abierto cuyos intervalos son todos
    inservibles se omite entero, como ya pasa con el día abierto sin tramos.
23. **Cero diálogos nativos.** Ni `window.confirm`, ni `prompt`, ni `alert` en todo el feature: cada
    overlay, menú y confirmación sale del kit (`Dialog`, `AlertDialog`, `DropdownMenu`, `Select`,
    `Tooltip`). Se verifica con un `grep` en la verificación final.

### Bloque D — Transversales

24. **Sin lógica nueva de servidor y sin superficie multi-tenant nueva.** El único archivo de
    `apps/backend` en el diff es `kb.types.ts`, con una propiedad opcional en una interfaz que el
    servidor guarda sin interpretar. El aislamiento lo siguen garantizando los endpoints existentes
    (`authenticateJWT → requireTenant → authorize(['admin'])` + repositorio `*Scoped`), que no se
    tocan; por eso esta HU **no lleva test de aislamiento propio**, pero **sí** exige el typecheck y
    la suite del backend en verde por haber tocado uno de sus archivos.
25. Se invocaron `emil-design-eng`, `impeccable:impeccable` y `frontend-design:frontend-design`
    **antes** de escribir cada componente nuevo o modificado (regla §7 del `CLAUDE.md` raíz). A
    diferencia de HU-KB-08…11, aquí **sí aplica**: esta HU escribe JSX.
26. Todo componente nuevo o tocado queda terminado en **light y dark** con tokens semánticos: cero
    `bg-[#…]`, cero color arbitrario.
27. `pnpm --filter @sofiapp/api typecheck` y `test` en verde; `pnpm --filter @sofiapp/web build`
    (incluye `tsc --noEmit`), `lint` (`--max-warnings 0`) y `test` en verde, con la única excepción
    declarada de `TagSelector.test.tsx` (9 fallos preexistentes y ajenos).

## Dependencias

Depende de:

- **HU-KB-07** (`f2736a7`): el contrato, `KnowledgeStructuredForm`, `KnowledgeSection`,
  `ScheduleDayEditor`, `RepeatableList`, `serializeEstructura` y `DIAS_SEMANA`. **Esta HU es la
  primera que lo modifica**, y por eso su lista de «no tocar» es mucho más corta que la de
  HU-KB-08…11.
- **HU-KB-10** (`b5cdd94`) y **HU-KB-11**: los schemas `horarios` y `politicas`, y los dos criterios
  de borrado que esta HU supersede.
- El kit: `components/ui/tabs.tsx`, `dropdown-menu.tsx`, `switch.tsx`, `input.tsx`, `badge.tsx`,
  `tooltip.tsx`, `alert-dialog.tsx` — **todos ya vendorizados**, ninguno hay que instalar.

Bloquea a: nada.

**Rama:** se trabaja y se commitea sobre **`feat/HU-KB-05`**, igual que HU-KB-06…11. **No** se crea
`feat/HU-KB-12` — instrucción explícita del usuario.

## Definición de "hecho"

El admin abre una categoría y ve una fila de pestañas en vez de un acordeón: cada una le dice de un
vistazo si le falta algo obligatorio o cuántos campos opcionales lleva, y al cambiar de pestaña solo
ve lo de esa sección. En «Horarios y ubicación» encuentra la semana entera en una sola pantalla,
marca el domingo como cerrado sin perder su horario, anota que el tramo de la tarde es «solo
recepción de pedidos» y copia el horario del lunes al resto de la semana con un menú, sin que los
días cerrados se le sobrescriban. Si escribe un tramo que termina antes de empezar, el campo se lo
dice y no puede guardar hasta arreglarlo. Y ya no encuentra el botón Eliminar en las dos categorías
que el sistema necesita, mientras que sus propios documentos y «Información Complementaria» siguen
borrándose como siempre —con un aviso que ahora dice la verdad sobre lo que pasa al borrar—. Todo
ello sin una línea de lógica nueva en el servidor y sin que un solo documento ya guardado cambie de
versión por abrirlo.
