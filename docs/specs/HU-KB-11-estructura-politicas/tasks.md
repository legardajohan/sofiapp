# HU-KB-11 — Tasks (checklist ejecutable)

> Claude Code: ejecuta en orden. Marca cada casilla al terminar. No cierres el feature hasta que
> TODO esté en verde. HU sin backend: el orden es de dentro hacia fuera (schema → registry → tests
> unitarios → integración).

## Antes de empezar

- [x] **Aprobar las preguntas abiertas del final de este archivo.** Aprobadas las 7, con una
      **corrección de premisa en la 6**: `formas_pago` ya tiene dueño (`productos.schema.ts`,
      HU-KB-09), no hay hueco que registrar y **no** se crea ninguna lista aquí. A partir de este
      punto los `id` de campo quedan **congelados**.

## Rama

- [x] **NO crear `feat/HU-KB-11`.** Se trabaja y se commitea sobre **`feat/HU-KB-05`**, igual que
      HU-KB-06/07/08/09/10. Verificar con `git status` que la rama está limpia y que `b5cdd94` está
      en el historial.

## Implementación

- [x] Invocar `emil-design-eng`, `impeccable:impeccable` y `frontend-design:frontend-design` **antes**
      de tocar cualquier componente (regla §7 del `CLAUDE.md` raíz).
      **No aplicó:** la HU no escribió ni modificó una sola línea de JSX; el diff de `components/` es
      vacío, igual que en HU-KB-09 y HU-KB-10. El formulario lo pintan `KnowledgeStructuredForm` y
      `PolicyTriState`, ambos de HU-KB-07, cuyo diseño ya pasó por la skill.
      (`emil-design-eng` e `impeccable:impeccable` siguen sin estar registradas en este entorno.)
- [x] `lib/schemas/politicas.schema.ts` (nuevo): `POLITICAS_SCHEMA` con `id: 'politicas'`,
      `version: 1` y las 2 secciones (`politicas`, `terminos`) con sus 8 campos, exactamente como la
      tabla del `plan.md`.
  - [x] `import type { KbSchemaDef }` — **solo tipo**, para no crear un ciclo en runtime.
  - [x] **Ningún campo es `obligatorio`** (categoría opcional y eliminable; ver pregunta 5).
  - [x] Los **seis** `triestado` en la sección `politicas`, en el orden de la tabla: post-venta
        (`acepta_devoluciones`, `acepta_cambios`, `ofrece_garantia`) y atención (`requiere_reserva`,
        `admite_mascotas`, `consumo_minimo`).
  - [x] Las **etiquetas son preguntas completas** («¿Aceptan devoluciones?»), no sustantivos: acaban
        dentro del texto que lee la IA y así el fragmento se auto-describe.
  - [x] Las `ayuda` de los ocho campos, tal como las fija la tabla de copy del `plan.md`. La de
        `admite_mascotas` y la de `otras_politicas` son la **mitigación de H2** y no son opcionales.
  - [x] La `ayuda` de `otras_politicas` **remite las formas de pago a «Productos y servicios»**: ahí
        vive `formas_pago` (HU-KB-09) y duplicarlas aquí dejaría a la IA con dos fuentes.
  - [x] **Ninguna lista de formas de pago, medios de pago ni pasarelas.** Es la quinta frontera.
  - [x] `otras_politicas`: `texto-largo`, `maxLength: 800`. `terminos_generales`: `texto-largo`,
        tope por defecto (1.500).
  - [x] **Ningún campo de envíos, entrega, despacho, logística ni costo de envío.** Es la frontera
        fina con HU-KB-09 (criterio 5). Dejar escrito en el comentario del schema el corte —«cómo
        llega lo que se vende» vs. «qué pasa con lo que ya se vendió»— y el caso límite del envío de
        una devolución.
  - [x] **Ningún campo de horario, agenda, dirección, precio ni identidad** (HU-KB-10, HU-KB-09,
        HU-KB-08).
  - [x] Ningún campo se llama «Información adicional» ni ocupa su lugar.
  - [x] Comentario de cabecera con: las **cinco** fronteras, el porqué de los cero obligatorios, el
        porqué del «No aplica» como valor propio y el aviso de `id` congelados — mismo estilo que
        `horarios.schema.ts`.
- [x] `lib/kb-schemas.ts` — las **tres** líneas aditivas, sin tocar nada más:
  - [x] `'politicas'` en la unión `KbSchemaId`.
  - [x] `politicas: POLITICAS_SCHEMA` en `KB_SCHEMAS`.
  - [x] `[normalizeTitulo('Políticas y términos')]: 'politicas'` en `SCHEMA_POR_TITULO` — el título
        **exacto** de `PRESET_META`.
- [x] **No editar el comentario de `PolicyTriState`**: ya dice que su consumidor principal llega en
      HU-KB-11 y sigue siendo cierto. Tocarlo rompería el criterio 22 sin ganancia.
- [x] Confirmar que **no** hizo falta tocar `kb-serialize.ts`, `KnowledgeStructuredForm.tsx` ni
      `PolicyTriState.tsx`.
      **Confirmado: el contrato aguantó su primer uso pleno del `triestado`**, igual que aguantó el
      primer `repetible` (HU-KB-09) y el primer `horario` (HU-KB-10). `git diff` de
      `lib/kb-serialize.ts` y de toda `components/` es vacío. H1 apareció con más filo del previsto
      (ver el desvío de abajo) y **aun así no se parcheó**: se documentó y se fijó por test.
- [x] `lib/schemas/empresa.schema.ts` — **una línea de comentario** (pregunta 7, aprobada): su
      cabecera atribuye los «envíos» a HU-KB-11 y son de HU-KB-09. Queda
      «devoluciones y garantías → HU-KB-11; envíos → HU-KB-09». **Solo el comentario**: ni un campo,
      ni un `id`, ni una etiqueta. No compromete el criterio 22 (no es infra de HU-KB-07).
- [x] Dejar registrado en esta casilla el resultado de **H1** y **H2** (`spec.md`): se documentan,
      **no** se arreglan aquí, igual que H1/H2 en HU-KB-09. H1 se mitiga con la `descripcion` de la
      sección y el contador; H2, con la `ayuda` de `admite_mascotas` y `otras_politicas`. El arreglo
      real toca `PolicyTriState` y afecta a HU-KB-08 → HU propia. Si al implementar aparece un tercer
      hallazgo, se añade al `spec.md` — no se arregla aquí.

## Desvío anticipado del plan

> Esta HU registra el **último preset sin schema**. Tres tests vigentes usan «Políticas y términos»
> precisamente como ejemplo de categoría sin schema y dejan de tener sujeto. Es el mismo tipo de
> desvío que tuvieron HU-KB-08, HU-KB-09 y HU-KB-10: el test documentaba el estado anterior y ahora
> describe el nuevo. **No** es un cambio de diseño.

- [x] `lib/kb-schemas.test.ts` — ««Políticas y términos» es la única categoría sin schema (llega en
      HU-KB-11)»: pasa a afirmar que **ningún preset queda sin schema** y que un **título libre**
      (p. ej. `'Convenios con empresas'`) sí devuelve `undefined`.
- [x] `lib/kb-schemas.test.ts` — «sin estructura y sin texto, sin schema → legado»: cambiar el
      documento de ejemplo de «Políticas y términos» a un título libre.
- [x] `pages/KnowledgeBasePage.test.tsx` — «una categoría SIN schema registrado sigue en legado aunque
      esté vacía»: ya no puede apoyarse en un preset virtual. Reescribir con un documento real de
      **título libre** y `contenido: ''`, que es el único caso que sigue cayendo en legado.
- [x] Revisar que no quede ninguna otra referencia a «Políticas y términos» como categoría sin
      schema: `grep -rn "HU-KB-11" apps/frontend/src`.

## Desvío descubierto al implementar — H1 tiene más filo del previsto

> **Dos tests de integración fallaron** y su diagnóstico cambió el enunciado de H1 en el `spec.md`.
> No se parcheó nada: se encodificó el comportamiento real y se documentó.

- [x] **El síntoma:** «basta una respuesta, aunque sea No aplica, para poder guardar» dejaba el botón
      Guardar deshabilitado, y el test de guardado no llegaba a llamar al backend.
- [x] **La causa:** el radio nace con «No aplica» marcado, y un `RadioGroup` **no emite cambio al
      pulsar la opción ya marcada**. El campo nunca entra en `campos`, así que no hay texto que
      guardar. Consecuencia práctica: **la respuesta más frecuente de esta categoría es la única que
      no se puede dar de un clic** — hay que pasar por «Sí» o «No» y volver.
- [x] **La decisión:** no tocar `PolicyTriState` (afecta también a `parte_de_grupo` en HU-KB-08 →
      HU propia). Se reescribió H1 en el `spec.md` con esta forma, se añadió el matiz al criterio 18
      y **dos tests dejan el comportamiento fijado por escrito** en vez de descubierto por sorpresa
      en producción.

## Tests — Unitarios (Vitest)

- [x] `lib/schemas/politicas.schema.test.ts` (nuevo), siguiendo el patrón de
      `horarios.schema.test.ts`:
  - [x] **Ids congelados:** el conjunto de `id` de `todosLosCampos(POLITICAS_SCHEMA)` es exactamente
        el de la tabla, en orden. Es el candado contra renombres.
  - [x] **Ningún campo es obligatorio**: `camposFaltantes` sobre la estructura vacía devuelve `[]`.
  - [x] Las 2 secciones están en orden y ningún `id` de campo se repite.
  - [x] Hay **exactamente seis** campos `triestado` y **dos** `texto-largo`; ninguno de otro `kind`.
  - [x] **«No aplica» ≠ «No» (criterio 9):** una estructura con `acepta_devoluciones` en `'na'`
        serializa `¿Aceptan devoluciones?: No aplica`, y con `'no'` serializa `…: No`. Los dos textos
        son distintos y **ninguno** de los dos se omite. Es el test que justifica el tercer estado.
  - [x] **Un tri-estado nunca respondido se omite (criterio 11):** si el campo no está en `campos`,
        su etiqueta no aparece en el texto. Deja constancia de H1: lo que se ve preseleccionado en
        pantalla no es lo que se guarda.
  - [x] **Forma del «Sí» (criterio 10):** con detalle sale
        `¿Aceptan devoluciones?: Sí — 30 días con factura`; sin detalle, `…: Sí`, sin guion suelto.
  - [x] **Presupuesto (criterio 12):** estructura con los 6 detalles a 300, los dos textos largos al
        tope y `adicional` a 1.500, y verificar `serializedLength(...) <= 10_000`. **Medido, no
        estimado.**
  - [x] Los dos `texto-largo` juntos cuestan **más** que las seis preguntas al tope: deja constancia
        de dónde está el peso real por si algún día hay que recortar.
  - [x] Las 2 secciones salen en orden canónico (`## Políticas frecuentes`, `## Términos y
        condiciones`) y «Información adicional» al final (criterio 13).
- [x] `lib/kb-schemas.test.ts` (ampliar, sin romper los casos actuales más allá del desvío):
  - [x] `schemaParaTitulo('Políticas y términos')` devuelve `POLITICAS_SCHEMA`, también con distinta
        capitalización y espacios sobrantes.
  - [x] `modoEditor` sobre esta categoría: vacía → `'estructurado'`; con texto libre → `'legado'`.
  - [x] **Los cinco títulos de `PRESET_META` resuelven a un schema.** Cierra la serie y protege el
        registry: si alguien añadiera un preset sin schema, este test lo delata.

## Tests — Integración (Vitest + RTL)

- [x] `pages/KnowledgeBasePage.test.tsx` (ampliar):
  - [x] La tarjeta «Políticas y términos» **vacía** abre el formulario guiado: se ven las 2 secciones
        y «Información adicional», y **no** hay textarea «Contenido».
  - [x] La misma categoría **con texto libre** sigue abriendo el textarea de siempre (criterio 15).
  - [x] Las seis preguntas ofrecen **Sí / No / No aplica** como radios, y son excluyentes.
  - [x] **El detalle solo aparece al marcar «Sí»** (criterio 16): al cambiar a «No» o «No aplica» se
        repliega y **conserva** lo escrito si se vuelve a «Sí».
  - [x] **El botón Eliminar está presente** y su `AlertDialog` funciona dentro del formulario guiado
        (criterio 17).
  - [x] Con todos los campos vacíos, «Guardar e indexar» está deshabilitado; se habilita al responder
        **una sola** política, **incluso con «No aplica»** (criterio 18). Es el caso que distingue a
        esta categoría: en las otras tres hay que escribir algo.
        **Ajustado por H1:** el test comprueba además que pulsar «No aplica» sobre el radio ya
        marcado **no** habilita el guardado, y llega a «No aplica» pasando por «Sí». Encodifica el
        comportamiento real en vez de esconderlo.
  - [x] Guardar envía `contenido` **y** `estructura` con `schemaId: 'politicas'` y
        `schemaVersion: 1`.

## Verificación final

- [x] `pnpm --filter @sofiapp/web build` sin errores (incluye `tsc --noEmit`).
- [x] `pnpm --filter @sofiapp/web lint` en verde (`--max-warnings 0`).
- [x] `pnpm --filter @sofiapp/web test` en verde, **salvo** `src/features/tags/components/TagSelector.test.tsx`
      (9 fallos preexistentes y ajenos). Confirmar que el conteo no cambió.
      **409 pasan / 9 fallan**, los 9 de `TagSelector`; el conteo no cambió respecto de HU-KB-10.
      Los 12 archivos de `knowledge-base` pasan enteros: **321/321**.
- [x] `git diff --stat -- apps/backend` **vacío** (criterio 21).
- [x] `git diff --stat -- .../lib/kb-serialize.ts .../components` **vacío** (criterio 22).
- [x] `grep -rn "bg-\[#" apps/frontend/src/features/knowledge-base` sin resultados.
- [x] `git status` sin `*.png`/`*.jpg` colados.
- [x] Checklist de PR de `docs/multi-tenancy.md` §9: **no aplica** — esta HU no añade código de
      servidor ni queries a Mongo.
- [x] Actualizar `**Estado:**` del `spec.md` a `implementado`.
- [ ] Commit en `feat/HU-KB-05` con Conventional Commits **en inglés**. *(Pendiente: a la espera de
      luz verde, con todo lo demás en verde.)*

## Definición de "hecho"

El admin abre la tarjeta «Políticas y términos» y encuentra seis preguntas directas —devoluciones,
cambios, garantía, reserva, mascotas, mínimos— que responde con Sí, No o **No aplica**, y cada «Sí»
le abre un espacio para las condiciones. Lo que no cabe en esas seis lo escribe abajo, junto a sus
términos y condiciones. No le exige ningún campo, porque la tarjeta es opcional y puede eliminarla
cuando quiera: el botón sigue ahí y funciona. Al guardar, el backend recibe texto y estructura en la
misma petición —con «No aplica» escrito tal cual, para que la IA distinga «no lo hacemos» de «esa
pregunta no describe a este negocio»— sin haber cambiado una línea de servidor ni de la
infraestructura de HU-KB-07.

---

## Preguntas de diseño — RESUELTAS

> Aprobadas antes de implementar. A partir de aquí los `id` de campo quedan **congelados**: se
> congelan de verdad al primer guardado de un tenant.

| # | Decisión |
|---|---|
| 1 | **Las seis, repartidas 3 + 3.** El reparto es **heurística de cobertura, no simetría sagrada**: cualquier negocio puede responder «No aplica» a las seis y eso ya es dato. `requiere_reserva` (condición, no horario) y `consumo_minimo` (condición, no precio) quedan del lado correcto de sus fronteras. |
| 2 | **Dos secciones**: `politicas` (los seis tri-estados) y `terminos` (`otras_politicas` 800 + `terminos_generales` 1.500). |
| 3 | **`detalleEn=['si']` se acepta tal cual**, y se documenta como **H2**, hallazgo del contrato para una HU propia. La `ayuda` que manda las excepciones de un «No» a `otras_politicas` es la mitigación. |
| 4 | **«No aplica» documentado + test dedicado.** Es la clave de la categoría: la IA debe distinguir «no tienen devoluciones» de «no venden productos físicos». |
| 5 | **Cero obligatorios.** El tri-estado ya tiene «No aplica»; exigirlo no añade dato. El piso es «basta una respuesta, aunque sea No aplica». |
| 6 | **CORRECCIÓN DE PREMISA: `formas_pago` ya tiene dueño** — vive en `productos.schema.ts` (HU-KB-09, `kind: 'lista'`). No hay hueco que registrar. Se declara «formas de pago → HU-KB-09» como quinta frontera del *fuera de alcance* y la `ayuda` de `otras_politicas` apunta a esa categoría. **No** se crea ninguna `lista` aquí. |
| 7 | **Se corrige el comentario de `empresa.schema.ts`**: «devoluciones y garantías → HU-KB-11; envíos → HU-KB-09». Comentario de un schema de categoría, no infra de HU-KB-07 — no compromete el criterio 22. Precedente: HU-KB-08 ya corrigió comentarios. |

Además queda escrito, por decisión explícita: **H1** como hallazgo de contrato para una HU propia
(mitigación aquí, arreglo allá), la **sentencia de la frontera de entrega** con su caso límite, y el
**desvío anticipado** de los tres tests que pierden a «Políticas y términos» como sujeto.

El planteamiento original de cada pregunta queda abajo, tal como se formuló.

---

1. **El set de tri-estados: ¿estas seis?** Propuesta: **sí, seis en simetría 3 + 3** —post-venta
   (`acepta_devoluciones`, `acepta_cambios`, `ofrece_garantia`) y atención (`requiere_reserva`,
   `admite_mascotas`, `consumo_minimo`)— más `otras_politicas` para todo lo demás. La simetría
   garantiza que ningún tipo de negocio abra el formulario y no encuentre nada suyo; el precio es que
   cada admin verá tres que no le describen, y para eso está el «No aplica». **Ninguna cruza la
   frontera de entrega**: las tres de post-venta hablan de lo que ya se vendió, no de cómo llegó.
   Descartadas del set fijo: edad mínima (pocos rubros), cancelación (cabe en el detalle de
   `requiere_reserva`) y tratamiento de datos (cabe en `terminos_generales`). ¿Se confirman las seis,
   o se prefiere recortar a cinco (quitando `acepta_cambios`, que solapa parcialmente con
   devoluciones) o ampliar a siete (añadiendo edad mínima)?

2. **Secciones: ¿dos?** Propuesta: **dos** — `politicas` («Políticas frecuentes», los seis radios) y
   `terminos` («Términos y condiciones», los dos textos). Es la división que el admin percibe al
   abrir y la que produce un texto legible: hechos cortos auto-descritos, luego prosa. **Se descarta
   una tercera sección** que parta las seis preguntas en post-venta y atención: dejaría a media
   plantilla de negocios viendo una sección entera en «No aplica» y pareciendo que se equivocaron de
   formulario, cuando esa respuesta es la correcta. ¿Se confirma?

3. **Detalle solo en «Sí» (`detalleEn=['si']`): ¿se acepta como está?** Propuesta: **sí, se acepta y
   además se documenta** como observación **H2** del contrato. Para las seis políticas elegidas
   funciona: el detalle útil está casi siempre en el «Sí» («Sí — 30 días con factura»). El límite
   real es la excepción sobre un «No» («No admitimos mascotas, salvo perros guía»), y se mitiga
   dentro de esta HU con `otras_politicas` y con la `ayuda` de `admite_mascotas`, que manda ahí
   explícitamente. Hacerlo configurable exige añadir `detalleEn` a `KbFieldDef` y pasarlo a
   `PolicyTriState`: es aditivo y compatible, pero toca contrato **y** componente, y afecta también a
   HU-KB-08 → **HU propia**. Recomendación: aceptar ahora, arreglar después con el caso delante.

4. **El «No aplica» como valor propio: ¿el spec lo documenta?** Propuesta: **sí, y con test**. Es el
   criterio 9 del `spec.md` y una casilla de test dedicada: `'na'` serializa `No aplica`, `'no'`
   serializa `No`, y ninguno de los dos se omite. Es lo que impide que la IA conteste «no aceptan
   devoluciones» a un negocio que simplemente no vende productos físicos. Ya está garantizado por
   `valorVacio` (HU-KB-07); esta HU verifica que su schema lo aprovecha y **fija el comportamiento
   con un test propio** para que nadie lo rompa por «optimizar» la serialización. ¿Se confirma?

5. **Obligatorios: ¿cero?** Propuesta: **cero**, misma vara que HU-KB-10 y con un argumento más
   limpio: el tri-estado **ya tiene** una respuesta para «esto no me describe», así que marcarlo
   obligatorio no aporta ningún dato, solo obliga a pulsar un botón. Y la categoría es opcional y
   eliminable. El piso ya existe: `contenidoListo` impide guardar con el texto serializado vacío, y
   basta **una** respuesta —aunque sea «No aplica»— para superarlo. ¿Se confirma?

6. ⚠️ **Premisa equivocada, corregida al aprobar** (ver tabla): `formas_pago` **sí** tiene dueño desde
   HU-KB-09 — `productos.schema.ts`, sección «Precios y condiciones». No hay hueco sin dueño. La
   conclusión práctica no cambia (no se crea nada aquí), pero la razón sí: no es que nadie la
   reclame, es que **ya está reclamada**. Texto original abajo.

   **Formas de pago: ¿campo propio o `otras_politicas`?** Propuesta: **`otras_politicas`**, sin campo
   dedicado en v1. Es una pregunta frecuentísima («¿aceptan tarjeta?», «¿reciben Nequi?») y hoy
   **ninguna categoría la reclama**: no es identidad (HU-KB-08), no es catálogo ni precio (HU-KB-09),
   no es contacto (HU-KB-10) y no es exactamente una *regla* (esta). Abrir una `lista` `formas_pago`
   aquí resolvería el hueco pero crearía una quinta frontera sin dueño claro. Recomendación: dejarla
   nombrada en la `ayuda` de `otras_politicas` para que el conocimiento no se pierda, y **registrar
   el hueco** como candidato a una HU futura que decida su dueño. ¿Se acepta, o se prefiere abrir
   `formas_pago` como `lista` en esta HU?

7. **Deriva de documentación en `empresa.schema.ts`.** Su comentario de cabecera dice que
   «devoluciones, garantías y **envíos**» son de HU-KB-11. Los envíos son de HU-KB-09 desde que se
   planeó esa HU, y este spec lo vuelve a sellar. Propuesta: **corregir esa palabra** —una línea de
   comentario, sin efecto en runtime, en un archivo que **no** es infraestructura de HU-KB-07, así
   que no compromete el criterio 22—. La alternativa es dejarlo y que el `spec.md` sea la autoridad,
   a costa de que quien lea el schema de empresa se lleve la frontera equivocada. ¿Se corrige?
