# HU-KB-12 — Tasks (checklist ejecutable)

> Claude Code: ejecuta en orden. Marca cada casilla al terminar. No cierres el feature hasta que
> TODO esté en verde. **Tres commits, uno por feature, en el orden B → A → C.**

## Antes de empezar

- [x] **Preguntas abiertas aprobadas, las 8.** Ver la tabla de decisiones al final del archivo. La
      **1 llegó con matiz** y cambió el diseño: bloquea **solo** el intervalo con las dos horas
      llenas y `desde >= hasta`; el de hora vacía **avisa sin bloquear** y se omite al serializar.
- [x] **R-4 confirmado fuera de alcance.** Esta HU cierra la puerta pero **no repone** lo ya borrado;
      la comprobación en producción queda como tarea de release (abajo).
- [x] **Corregir la tríada antes de tocar código** (el matiz de la 1 afectaba a **tres** archivos, no
      dos): `spec.md` criterio 21 —que decía que la hora vacía también bloquea—, la sección de
      validación y las firmas de `kb-horario.ts` en `plan.md`, y el mapa de tests de los dos.

## Rama

- [x] **NO crear `feat/HU-KB-12`** — instrucción explícita. Se trabaja y se commitea sobre
      **`feat/HU-KB-05`**, igual que HU-KB-06…11. Verificar con `git status` que la rama está limpia.

## Skills obligatorias (regla §7 del `CLAUDE.md` raíz)

- [x] Invocar `emil-design-eng`, `impeccable:impeccable` y `frontend-design:frontend-design`
      **antes** de escribir cada componente.
      **Parcial, y queda declarado:** `frontend-design:frontend-design` **sí** está registrada y se
      invocó antes de escribir una línea; su dirección está en la «Nota de diseño» del `plan.md` y de
      ahí salieron la rejilla semanal como único elemento con carácter, las tres formas del indicador
      de pestaña y el criterio de retirar el `Badge` de *Abierto*. `emil-design-eng` e
      `impeccable:impeccable` **siguen sin estar registradas en este entorno** (igual que en
      HU-KB-08…11), así que sus criterios se aplicaron de memoria y quedan **pendientes de
      verificación** cuando estén disponibles.
- [x] Aplicar `typescript-strict-mode` a todo `.ts`/`.tsx` nuevo o editado: cero `any`, tipos de
      retorno explícitos en lo exportado, y `schema.secciones[0]?.id` en vez de `!`.

---

## Paso 1 — Feature B (presets protegidos)

- [x] `lib/kb-presets.ts`: `PRESETS_NO_ELIMINABLES` (los dos títulos) y `esPresetProtegido(titulo)`,
      junto a `PRESET_META`.
  - [x] Compara con `normalizeTitulo`, **no** con igualdad exacta.
  - [x] El comentario explica la diferencia con `obligatorio` y por qué «Información Complementaria»
        **no** está en la lista.
- [x] `components/KnowledgeUploadEditor.tsx`: añadir `&& !esPresetProtegido(doc.titulo)` al gate
      `puedeEliminar` (línea 159), con el comentario actualizado.
- [x] `components/KnowledgeUploadEditor.tsx`: **corregir el copy del `AlertDialog`** (línea 277).
      Retirar «La categoría seguirá en la lista, vacía, por si la necesitas» —es falso: 
      `mergePresetsWithDocuments` descarta los `oculto`— y poner «La categoría también desaparecerá
      de tu base de conocimiento.»
  - [x] Sigue siendo el `AlertDialog` del kit. **Cero** `window.confirm`.
- [x] Tests de B:
  - [x] `lib/kb-presets.test.ts`: `esPresetProtegido` con los dos títulos (y variantes de
        mayúsculas/espacios), «Información Complementaria» → `false`, título libre → `false`.
  - [x] `pages/KnowledgeBasePage.test.tsx` (~781-806): **invertir** el test de HU-KB-10 → la
        categoría **no** ofrece Eliminar.
  - [x] `pages/KnowledgeBasePage.test.tsx` (~918-941): **invertir** el de HU-KB-11 → ídem.
  - [x] **NUEVO**: «Información Complementaria» SÍ conserva Eliminar. Blinda la excepción.
  - [x] Verificar que siguen pasando los de documento propio (~222), obligatorio (~240) y preset
        virtual (~251).
- [x] Anotar en `docs/specs/HU-KB-10-.../spec.md` y `HU-KB-11-.../spec.md` que sus criterios 16 y 17
      quedan **superseded por HU-KB-12** (una línea en cada uno; no reescribir el spec).
- [x] `pnpm --filter @sofiapp/web build && lint && test` en verde. **Commit de B.**

## Paso 2 — Feature A (pestañas)

- [x] `components/fields/KnowledgeSection.tsx`: reducir a `{ descripcion?, children }`. Quitar `id`,
      `llenos`, `total`, el import de `Check` y los tres de `accordion`. Actualizar el comentario de
      cabecera: ya no es un bloque colapsable, es el panel de una pestaña.
- [x] `components/KnowledgeStructuredForm.tsx`:
  - [x] Quitar el import de `Accordion` (línea 1) y el bloque 237-272.
  - [x] Añadir el tipo `ProgresoSeccion` y el helper `progresoDeSeccion(seccion, campos)`, usando
        `esVisible`, `valorVacio` y `requisito` — **sin duplicar** la lógica de `kb-schemas.ts`.
  - [x] Añadir el componente local `IndicadorSeccion`, con los tres casos y sus tokens (tabla del
        `plan.md`). El número del badge va `aria-hidden`; la información, en el `title`.
  - [x] Montar `Tabs` / `TabsList` / `TabsTrigger` / `TabsContent` con
        `defaultValue={schema.secciones[0]?.id}` (con `?.`, **nunca** `!`).
  - [x] `TabsList` con `h-auto w-full justify-start gap-1 overflow-x-auto` — si el anillo de foco se
        recorta, subir el padding, **no** quitar el anillo.
  - [x] «Información adicional» y el contador siguen **fuera** del `Tabs`, sin moverse.
  - [x] Un schema sin secciones no pinta `TabsList`.
- [x] Revisar en light **y** dark: badge ámbar, `text-success`, pestaña activa y desborde horizontal.
- [x] Tests de A:
  - [x] `components/KnowledgeStructuredForm.test.tsx`: renombrar el `describe` del acordeón y aplicar
        los nueve cambios del mapa del `plan.md`. En especial:
    - [x] «un schema SIN secciones no pinta acordeón» → `queryAllByRole('tab')` vacío.
    - [x] «el resumen de la sección…» se **parte en dos**: `x de y` sin obligatorios, badge ámbar con
          obligatorios verificado por su `title`.
    - [x] «los errores rojos…» ya **no** cuenta 2 errores simultáneos: solo la pestaña activa monta
          sus campos.
    - [x] «queda FUERA del acordeón» → cambiar de pestaña no esconde «Información adicional».
  - [x] `pages/KnowledgeBasePage.test.tsx`: `getByRole('button', …)` → `getByRole('tab', …)` en las
        líneas 546-548, 627-629, 729-731 y 840-842.
  - [x] Añadir el helper local `irASeccion(user, dialog, nombre)` y usarlo en **todos** los tests que
        tocan un campo fuera de la primera sección (tabla del `plan.md`).
  - [x] `components/fields/fields.test.tsx`: verificado que no referencia el acordeón; sin cambios
        por A.
- [x] `grep -rn "accordion" apps/frontend/src/features/knowledge-base` sin resultados.
- [x] `pnpm --filter @sofiapp/web build && lint && test` en verde. **Commit de A.**

## Paso 3 — Feature C (editor semanal)

### Tipos y espejo

- [x] `types/domain.ts`: extraer `KbScheduleInterval { desde; hasta; descripcion? }` y usarla en
      `KbScheduleDay`.
- [x] `apps/backend/src/features/kb/kb.types.ts`: **el mismo** cambio, en lockstep, con su comentario
      de espejo. **Nada más** de backend.
- [x] Confirmar que **no** hace falta tocar `kb.service.ts`, `kb.model.ts`, `kb.validation.ts` ni el
      worker: el backend guarda la `estructura` opaca. Si hiciera falta, **parar** y levantarlo.

### Lógica pura

- [x] `lib/kb-horario.ts` (nuevo): `EstadoIntervalo`, `estadoIntervalo`, `intervaloValido`,
      `intervalosUtiles`, `hayIntervalosInvertidos`, `estructuraConHorarioInvertido`,
      `copiarHorario` — con las firmas del `plan.md`.
  - [x] Documentar que `'HH:mm'` se compara **lexicográficamente** y que no hace falta parsear.
  - [x] `desde === hasta` → `'invertido'`.
  - [x] **Solo `'invertido'` bloquea** (criterio 21). Un `'incompleto'` no cuenta nunca, ni aquí ni
        en el gate del editor. Los nombres dicen `Invertidos` y no `Invalidos` justo por eso.
  - [x] `copiarHorario` copia **por valor** (incluida `descripcion`) y **no** toca los días cerrados.
- [x] `lib/kb-serialize.ts`: `serializarDia` emite `08:00–12:00 (descripción)` solo con descripción
      no vacía, y omite los intervalos inválidos; el filtro de días usa `intervalosUtiles`.
  - [x] **Determinismo:** sin descripción, el texto es **byte a byte** el de hoy.
  - [x] Paréntesis, no guion `—`: el guion ya significa otra cosa en el tri-estado.

### Componentes

- [x] `components/fields/ScheduleIntervalRow.tsx` (nuevo): dos `Input type="time"` + `Input` de
      descripción (`maxLength={80}`) + botón quitar. **Conserva** los `aria-label` actuales
      (`Abre el ${dia}, horario ${n}`, `Cierra el …`) y añade `Descripción del horario ${n} del ${dia}`.
  - [x] `'invertido'` → `aria-invalid` en las dos horas + «La hora de cierre debe ser posterior a la
        de apertura.» en `text-destructive`.
  - [x] `'incompleto'` → «Completa las dos horas.» en `text-muted-foreground`, **sin**
        `aria-invalid` y **sin** bloquear. No es un error, es una tarea pendiente.
- [x] `components/fields/CopiarHorarioMenu.tsx` (nuevo): `DropdownMenu` con dos atajos
      («Lunes a viernes», «Toda la semana»), separador, los seis días como
      `DropdownMenuCheckboxItem` y un botón «Copiar (n)» al pie.
  - [x] Los días **cerrados** salen `disabled` con la leyenda «cerrado»: se ve **antes** de aplicar.
  - [x] **Prohibido** `window.prompt` o cualquier ventana nativa.
- [x] `components/fields/ScheduleDayRow.tsx` (nuevo): fila `grid grid-cols-[7.5rem_1fr]`, `Switch` de
      Cerrado, `Badge` solo en cerrado, lista de intervalos con tope `MAX_INTERVALOS`, «+ Añadir otro
      horario» y «Copiar a…».
  - [x] Marcar «Cerrado» **conserva** los intervalos (comportamiento actual, no se pierde).
- [x] `components/fields/ScheduleWeekEditor.tsx` (nuevo): las 7 filas en un solo contenedor
      `rounded-lg border divide-y`, dueño del array y del copiado.
- [x] `components/KnowledgeStructuredForm.tsx`: el `case 'horario'` (157-176) pasa de mapear 7
      `ScheduleDayEditor` a montar **un** `ScheduleWeekEditor`. `leerHorario` se mantiene igual.
- [x] **Retirar** `components/fields/ScheduleDayEditor.tsx`.
- [x] `components/KnowledgeUploadEditor.tsx`: sumar `!horarioInvertido` a `puedeGuardar`, con
      `estructuraConHorarioInvertido`. **Solo el invertido**: un intervalo a medio teclear no puede
      apagar el botón Guardar.
- [x] Revisar en light **y** dark: filas, alineación de la columna de día, menú de copiado abierto,
      estado de error.

### Tests de C

- [x] `lib/kb-horario.test.ts` (nuevo): `estadoIntervalo` en sus tres salidas (`ok`; `incompleto` con
      una y con las dos horas vacías; `invertido` con `hasta < desde` y con `desde === hasta`);
      `hayIntervalosInvertidos` — un día **cerrado** con intervalo invertido **no** cuenta, y un
      `incompleto` **tampoco** cuenta nunca; `copiarHorario` (copia con descripción, no pisa
      cerrados, no reordena los días).
- [x] `lib/kb-serialize.test.ts`:
  - [x] El test de horario existente (~136) **no se toca**: es el candado del determinismo.
  - [x] **NUEVO**: intervalo con descripción → `08:00–12:00 (Atención presencial)`.
  - [x] **NUEVO**: descripción en blanco o solo espacios → texto **idéntico** al de sin descripción.
  - [x] **NUEVO**: intervalo con una hora vacía → se omite; día con todos inválidos → sin encabezado.
- [x] `lib/schemas/horarios.schema.test.ts`:
  - [x] «se identifica como `horarios` en su versión 1» (~56) **no se toca** (criterio 19).
  - [x] El test de presupuesto (~292-361) pasa a llenar **también** las descripciones al tope
        (7 días × 4 tramos × 80). Volver a **medir** contra `CONTENIDO_MAX`.
- [x] `components/fields/fields.test.tsx`: reescribir `describe('ScheduleDayEditor')` como
      `describe('ScheduleWeekEditor')`, conservando los cuatro casos y sus `aria-label`. Añadir:
      descripción por intervalo, error de intervalo inválido, y el menú de copiado.
- [x] `pages/KnowledgeBasePage.test.tsx`:
  - [x] Los tres tests de horarios (~719, ~750, ~808) activan primero la pestaña «Cuándo atienden».
  - [x] **NUEVO**: copiar el lunes a martes y miércoles; los tres coinciden y un día cerrado no se
        sobrescribe.
  - [x] **NUEVO**: una descripción llega al `contenido` guardado.
  - [x] **NUEVO**: un intervalo con `hasta < desde` deshabilita «Guardar e indexar».
  - [x] **NUEVO**: un intervalo con una hora **vacía** avisa pero **NO** deshabilita el guardado. Es
        el par del anterior y el que fija por test la asimetría del criterio 21.
- [x] `pnpm --filter @sofiapp/api typecheck && test` en verde.
- [x] `pnpm --filter @sofiapp/web build && lint && test` en verde. **Commit de C.**

---

## Verificación final

- [x] `pnpm --filter @sofiapp/api typecheck` y `test` en verde (la HU toca `kb.types.ts`).
- [x] `pnpm --filter @sofiapp/web build` sin errores (incluye `tsc --noEmit`).
- [x] `pnpm --filter @sofiapp/web lint` en verde (`--max-warnings 0`).
- [x] `pnpm --filter @sofiapp/web test` en verde, **salvo** `TagSelector.test.tsx` (9 fallos
      preexistentes y ajenos). Confirmar que el conteo no cambió.
- [x] `git diff --stat -- apps/backend` → **solo** `kb.types.ts` (criterio 24).
- [x] `grep -rn "window\.\(alert\|confirm\|prompt\)" apps/frontend/src` sin resultados (criterio 23).
- [x] `grep -rn "accordion" apps/frontend/src/features/knowledge-base` sin resultados (criterio 1).
- [x] `grep -rn "bg-\[#" apps/frontend/src/features/knowledge-base` sin resultados (criterio 26).
- [x] `git status` sin `*.png`/`*.jpg` colados (capturas de verificación borradas).
- [x] Checklist de PR de `docs/multi-tenancy.md` §9: **no aplica** — esta HU no añade queries a Mongo
      ni código de servidor; el único archivo de backend es una interfaz de tipos.
- [x] Actualizar `**Estado:**` del `spec.md` a `implementado`.
- [x] Los tres commits en `feat/HU-KB-05`, Conventional Commits **en inglés**.

## Desvíos y hallazgos al implementar

- [x] **El peso del presupuesto de `horarios` se invirtió.** HU-KB-10 dejó fijado por test que
      `otras_sedes` costaba **más del triple** que el horario completo (1.560 contra 468) y que, si
      algún día había que recortar, el candidato eran las sedes. La descripción por tramo cambia el
      reparto: 7 días × 4 tramos × 80 caracteres pesan **más** que las 6 sedes. El test se invirtió
      con su porqué escrito. **El presupuesto sigue cabiendo** en `CONTENIDO_MAX` —se volvió a medir,
      no a estimar—, pero la palanca de recorte es ahora `DESCRIPCION_MAX`, no las sedes.
- [x] **Dos tests dieron por buena una asimetría que no habían probado.** Al escribir el de
      «un tramo a medio llenar no bloquea» apareció que, con el formulario por lo demás vacío, el
      botón Guardar **sí** se apaga — pero por `contenidoListo` (no hay texto que guardar), no por la
      validación. El test se corrigió para llenar otro campo primero y medir de verdad lo que dice
      medir. La distinción importa: son dos gates distintos y confundirlos habría hecho pasar el test
      por la razón equivocada.
- [x] **`ScheduleDayRow` ganó `role="group"` con el nombre del día.** No estaba en el plan: apareció
      al escribir los tests y es una mejora real de accesibilidad, no una comodidad de test. Con los
      siete días en el mismo árbol, siete switches rotulados «Cerrado» son indistinguibles para quien
      navega con lector de pantalla.

## Para la fase de release (`/sdd-release`)

- [x] **R-4 · comprobar el estado real en producción.** Verificar si algún tenant tiene «Horarios y
      ubicación» o «Políticas y términos» con `oculto: true`. Si existe alguno, su tarjeta **no
      vuelve** por sí sola: esta HU cierra la puerta hacia adelante pero no repone lo ya borrado. Ese
      caso se trata **por separado**, como candidato a una HU de «restaurar categoría» (necesitaría
      un `PATCH /:id { oculto: false }` y UI propia). **No** se implementa aquí.

## Definición de "hecho"

El admin abre una categoría y ve una fila de pestañas: cada una le dice si le falta algo obligatorio
o cuántos opcionales lleva, y al cambiar de pestaña solo ve lo de esa sección. En «Horarios y
ubicación» tiene la semana entera en una pantalla, marca el domingo como cerrado sin perder su
horario, anota que el tramo de la tarde es «solo recepción de pedidos» y copia el horario del lunes
al resto de la semana con un menú que no le pisa los días cerrados. Si escribe un tramo que termina
antes de empezar, el campo se lo dice y no puede guardar hasta arreglarlo. Ya no encuentra Eliminar
en las dos categorías protegidas, mientras sus propios documentos y «Información Complementaria»
siguen borrándose —con un aviso que ahora dice la verdad—. Nada de esto añadió lógica al servidor, y
ningún documento ya guardado cambió de versión por abrirlo.

---

## Preguntas de diseño — RESUELTAS

> Aprobadas antes de implementar. La 1 llegó **con matiz** y cambió el diseño; las otras siete se
> confirmaron tal como se propusieron.

| # | Decisión |
|---|---|
| 1 | **Bloquea SOLO el intervalo con las dos horas llenas y `desde >= hasta`.** Una hora vacía **no** bloquea: avisa inline («Completa las dos horas.») y se omite al serializar. De ahí los tres estados (`ok` / `incompleto` / `invertido`) en vez de un booleano, y los nombres `…Invertidos` en vez de `…Invalidos`. |
| 2 | `inicio == fin` → **invertido** (bloquea). |
| 3 | **`DropdownMenu`** con atajos «Lunes a viernes» / «Toda la semana», separador, seis `DropdownMenuCheckboxItem`, días **cerrados `disabled`** con la leyenda visible antes de aplicar, y botón «Copiar (n)» al pie. |
| 4 | `ScheduleDayEditor` **se retira**; sus tests se reescriben como `ScheduleWeekEditor`. |
| 5 | Descripción: **`maxLength={80}`**. |
| 6 | **`schemaVersion` sigue en 1** — aditivo. No se toca el test de versión. |
| 7 | Copy del `AlertDialog` aprobado tal cual, con la frase del preset condicionada a `doc.isPreset`. |
| 8 | **R-4 fuera de alcance**, con tarea de release para comprobar el estado real en producción. |

El planteamiento original de cada pregunta queda abajo, tal como se formuló.

---

1. **¿Un intervalo inválido bloquea el guardado, o solo avisa?** Propuesta: **bloquea**. El modal
   promete que lo que se ve es lo que leerá la IA; como el serializador omite los intervalos
   inválidos, dejar guardar tiraría en silencio un tramo recién tecleado. Bloquear con el error a la
   vista es la única opción donde la pantalla y el texto indexado dicen lo mismo. La alternativa
   —avisar y guardar igual— es más permisiva pero rompe esa promesa. ¿Se confirma bloquear?

2. **`inicio == fin`: ¿inválido o tolerado?** Propuesta: **inválido**. Un tramo de duración cero no
   describe una franja de atención; casi siempre es un descuido al teclear. ¿Se confirma?

3. **Control de copiado: ¿`DropdownMenu` con checkboxes?** Propuesta: **sí**, con dos atajos dentro
   («Lunes a viernes», «Toda la semana»). Un `Select` es para elegir un valor, no para ejecutar una
   acción multi-destino; una lista de `Checkbox` siempre visible serían 42 controles en una UI cuyo
   objetivo es ser compacta; y un botón «Aplicar a toda la semana» a secas no cubre el caso más común
   del comercio, que es «lunes a viernes». ¿Se confirma el menú, con los días cerrados `disabled` en
   vez de saltados en silencio?

4. **¿`ScheduleDayEditor` se retira o se conserva?** Propuesta: **se retira**. Con el editor semanal
   no le queda consumidor, y dejarlo sería código muerto que el próximo lector creerá vigente. Sus
   tests se reescriben, no se borran. ¿Se confirma?

5. **Tope de la descripción: ¿80 caracteres?** Propuesta: **80**. Es una etiqueta («Solo recepción de
   pedidos»), no un párrafo, y multiplica por hasta 28 intervalos en el presupuesto de la categoría.
   Si se quisiera más largo, la palanca es este número y hay que volver a medir el presupuesto.

6. **`schemaVersion`: ¿sigue en 1?** Propuesta: **sí**. `descripcion?` es aditivo y compatible: lo ya
   guardado se lee igual, ningún campo cambia de `kind`, se retira ni se vuelve obligatorio. Subir a
   2 rompería el test de versión sin dar nada a cambio. ¿Se confirma?

7. **El copy corregido del `AlertDialog`.** Propuesta: «La IA dejará de usar este contenido y se
   borrarán sus fragmentos indexados. No se puede deshacer. **La categoría también desaparecerá de tu
   base de conocimiento.**» La frase actual promete lo contrario de lo que hace el código. ¿Se
   aprueba el texto, o se prefiere otro?

8. **R-4 · los presets ya eliminados.** Si algún tenant borró antes una de las dos categorías
   protegidas, esta HU **no** se la devuelve. Propuesta: dejarlo fuera de alcance y anotarlo como
   candidato a una HU de «restaurar categoría». ¿Se acepta, o hay que comprobar el estado real de los
   tenants antes de liberar?
