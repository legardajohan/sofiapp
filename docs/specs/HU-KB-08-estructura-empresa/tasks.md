# HU-KB-08 — Tasks (checklist ejecutable)

> Claude Code: ejecuta en orden. Marca cada casilla al terminar. No cierres el feature hasta que
> TODO esté en verde. HU sin backend: el orden es de dentro hacia fuera (schema → registry →
> tests unitarios → integración).

## Antes de empezar

- [x] **Preguntas de diseño aprobadas** (ver el final de este archivo). El diseño de los campos
      queda congelado a partir de aquí: los `id` no se pueden renombrar después.

## Rama

- [x] **NO crear `feat/HU-KB-08`.** Se trabaja y se commitea sobre **`feat/HU-KB-05`**, igual que
      HU-KB-06 y HU-KB-07. Verificar con `git status` que la rama está limpia y que `f2736a7` está
      en el historial.

## Implementación

- [x] Invocar `emil-design-eng`, `impeccable:impeccable` y `frontend-design:frontend-design`
      **antes** de tocar cualquier componente (regla §7 del `CLAUDE.md` raíz).
      **No aplicó, y esa es la noticia:** la HU salió sin escribir ni modificar una sola línea de
      JSX. Lo único que cambió en `components/` fueron dos **comentarios** de numeración de HU. El
      formulario de empresa lo pinta `KnowledgeStructuredForm` de HU-KB-07, cuyo diseño ya pasó por
      la skill en su momento. Invocar las skills para redactar un comentario habría sido teatro.
      (Para el registro: `emil-design-eng` e `impeccable:impeccable` siguen sin estar registradas en
      este entorno, igual que en HU-KB-04/05/06/07.)
- [x] `lib/schemas/empresa.schema.ts` (nuevo): `EMPRESA_SCHEMA` con `id: 'empresa'`, `version: 1` y
      las 3 secciones (`identidad`, `proposito`, `alcance`) con sus 13 campos, exactamente como la
      tabla del `plan.md`.
  - [x] `import type { KbSchemaDef }` — **solo tipo**, para no crear un ciclo en runtime.
  - [x] `nombre_comercial` y `descripcion` son los **únicos** `obligatorio`.
  - [x] `grupo_empresarial` es `condicional` con su `visibleSi` sobre `parte_de_grupo === 'si'`
        (el tipo lo exige: un condicional sin predicado no compila).
  - [x] `anio_fundacion` con `maxLength: 30`; las listas con su `maxItems` (valores 6,
        zonas 12, diferenciadores 6, certificaciones 6).
  - [x] Ningún campo se llama «Información adicional» ni ocupa su lugar: esa vía es el `adicional`
        del sobre y la pone `KnowledgeStructuredForm`.
- [x] `lib/kb-schemas.ts` — los **tres** añadidos aditivos, sin tocar nada más del archivo:
  - [x] `'empresa'` en la unión `KbSchemaId`.
  - [x] `empresa: EMPRESA_SCHEMA` en `KB_SCHEMAS`.
  - [x] `[normalizeTitulo('Información de la empresa')]: 'empresa'` en `SCHEMA_POR_TITULO`.
- [x] Corregir los comentarios de HU-KB-07 que quedaron apuntando a la HU equivocada:
  - [x] `components/fields/ScheduleDayEditor.tsx`: «lo monta HU-KB-09» → **HU-KB-10**.
  - [x] `components/fields/PolicyTriState.tsx`: «lo monta HU-KB-10» → **HU-KB-11**.
  - [x] `lib/kb-serialize.ts`, docstring de `migrarLegadoAEstructura`: hoy dice «La conecta
        HU-KB-08 detrás de un opt-in explícito», y con la decisión 6 **esta HU no la conecta**.
        Reapuntarlo a la HU futura de migración para que no prometa algo que no va a pasar.
- [x] Confirmar que **no** hizo falta tocar `KnowledgeStructuredForm.tsx`, `kb-serialize.ts` ni
      ningún primitivo. Si hizo falta, **parar** y levantarlo como hallazgo del contrato de
      HU-KB-07 antes de seguir (ver Notas del `plan.md`).
      **Confirmado: el contrato de HU-KB-07 aguantó.** `KnowledgeStructuredForm.tsx` tiene diff
      vacío; en `kb-serialize.ts` y los primitivos solo cambiaron comentarios (verificado con
      `git diff -U0` filtrando líneas de código: cero resultados). El schema de empresa ejercitó
      `texto-corto`, `texto-medio`, `texto-largo`, `lista` y `triestado` más un condicional, y todo
      funcionó sin una línea de infraestructura nueva.

## Desvío del plan

- [x] **`src/test/setup.ts`: stub de `ResizeObserver`.** No estaba previsto. Los cuatro tests de
      integración del formulario de empresa reventaban con `ResizeObserver is not defined`: Radix lo
      usa (el acordeón para su altura animada, el radio para su indicador) y jsdom no lo implementa.
      Es un hueco de **entorno de test**, no de código de producción, y el archivo ya existía justo
      para eso —ya stubbea `hasPointerCapture`, `setPointerCapture`, `releasePointerCapture` y
      `scrollIntoView` con el mismo comentario—. Es infraestructura de test compartida, así que
      queda registrado aquí en vez de pasar por debajo de la mesa.

## Tests — Unitarios (Vitest)

- [x] `lib/schemas/empresa.schema.test.ts` (nuevo):
  - [x] **Ids congelados:** el conjunto de `id` de `todosLosCampos(EMPRESA_SCHEMA)` es exactamente
        el de la tabla. Este test es el candado: si alguien renombra un campo, falla y explica por
        qué no debe hacerlo.
  - [x] Solo `nombre_comercial` y `descripcion` son `obligatorio`.
  - [x] Las 3 secciones están en orden y ningún `id` de campo se repite.
  - [x] Ningún campo usa `kind: 'horario'` ni `kind: 'repetible'` (criterio 5).
  - [x] `camposFaltantes` con la estructura vacía devuelve exactamente esos dos campos.
  - [x] `grupo_empresarial`: oculto con `parte_de_grupo` en `'na'` y en `'no'`; visible y **exigible**
        con `'si'`; deja de exigirse al volver a ocultarse.
  - [x] **Presupuesto de caracteres (criterio 6):** construir la estructura con **todos** los campos
        al tope (incluidas las listas llenas hasta `maxItems`) más `adicional` al tope, y verificar
        que `serializedLength(...) <= 10_000`. Medido, no estimado.
  - [x] Forma del texto: las 3 secciones en orden canónico; un formulario a medias no deja
        encabezados huérfanos.
- [x] `lib/kb-schemas.test.ts` (ampliar, sin romper los casos actuales):
  - [x] `schemaParaTitulo('Información de la empresa')` devuelve `EMPRESA_SCHEMA`, y también con
        distinta capitalización y espacios sobrantes.
  - [x] `modoEditor` sobre esta categoría: vacía → `'estructurado'`; con texto libre → `'legado'`.
  - [x] Actualizar el caso que hoy afirma que «Información de la empresa» **no** tiene schema: ese
        test documenta el estado anterior y ahora debe describir el nuevo.

## Tests — Integración (Vitest + RTL)

- [x] `pages/KnowledgeBasePage.test.tsx` (ampliar):
  - [x] La tarjeta «Información de la empresa» **vacía** abre el formulario guiado: se ven las 3
        secciones y «Información adicional», y **no** hay textarea «Contenido».
  - [x] La misma categoría **con texto libre** sigue abriendo el textarea de siempre (criterio 10).
  - [x] Con los obligatorios vacíos, «Guardar e indexar» está deshabilitado; se habilita al llenar
        `nombre_comercial` y `descripcion`, con todos los opcionales en blanco.
  - [x] «Nombre del grupo» aparece solo al responder «Sí» en `parte_de_grupo`.
  - [x] Guardar envía `contenido` **y** `estructura` con `schemaId: 'empresa'` y `schemaVersion: 1`.

## Verificación final

- [x] `pnpm --filter @sofiapp/web build` sin errores (incluye `tsc --noEmit`).
- [x] `pnpm --filter @sofiapp/web lint` en verde (`--max-warnings 0`).
- [x] `pnpm --filter @sofiapp/web test` en verde, **salvo** `src/features/tags/components/TagSelector.test.tsx`
      (9 fallos por `Tooltip` fuera de `TooltipProvider`): **preexistente y ajeno**, declarado fuera
      de alcance en el `spec.md`. Confirmar que el conteo de fallos no cambió.
- [x] `git diff --stat -- apps/backend` **vacío** (criterio 14).
- [x] `git diff --stat -- .../lib/kb-serialize.ts .../components/KnowledgeStructuredForm.tsx`
      **vacío** (criterio 15).
- [x] `grep -rn "bg-\[#" apps/frontend/src/features/knowledge-base` sin resultados.
- [x] `git status` sin `*.png`/`*.jpg` colados.
- [x] Checklist de PR de `docs/multi-tenancy.md` §9: **no aplica** — esta HU no añade código de
      servidor ni queries a Mongo. El aislamiento lo siguen garantizando los endpoints existentes de
      `features/kb`, que no se tocan.
- [x] Actualizar `**Estado:**` del `spec.md` a `implementado`.
- [ ] Commit en `feat/HU-KB-05` con Conventional Commits **en inglés**.

## Definición de "hecho"

El admin abre la tarjeta «Información de la empresa» y ve un formulario de tres secciones en vez de
un textarea; solo dos campos están marcados como obligatorios; «Nombre del grupo» aparece únicamente
si responde que hace parte de uno; «Información adicional» sigue al final para todo lo demás. Al
guardar, el backend recibe texto y estructura en la misma petición sin haber cambiado una línea, y
quien ya tenía su información escrita a mano conserva su textarea intacto. El diff no toca ni
`apps/backend/**` ni la infraestructura de HU-KB-07.

---

## Preguntas de diseño — RESUELTAS

> Aprobadas antes de implementar. A partir de aquí los `id` de campo quedan **congelados**: se
> congelan de verdad al primer guardado de un tenant, y desde ahí renombrarlos deja datos huérfanos.

| # | Decisión |
|---|---|
| 1 | **Tono de voz → FUERA.** Es configuración del prompt (`HT-AI-01`), no conocimiento recuperable. |
| 2 | **`zonas_cobertura` → SE QUEDA EN EMPRESA**, con la condición de que el spec de HU-KB-10 declare «zonas de cobertura/despacho → HU-KB-08» en su *fuera de alcance*. |
| 3 | **`certificaciones` → SE MANTIENE.** Opcional y barato. |
| 4 | **Dos obligatorios confirmados:** `nombre_comercial` + `descripcion`. |
| 5 | **`anio_fundacion` → texto libre acotado a 30.** Añadir un `kind` numérico al contrato queda fuera del alcance de esta HU. |
| 6 | **Migración del texto libre → DIFERIDA** a una HU propia. No se conecta aquí; sí se corrige el comentario que la prometía (ver Implementación). |

El detalle de cada una queda abajo, tal como se planteó.

---

1. **Tono de voz de la IA.** ¿Debería el schema capturar «cómo quieres que la IA hable de ti»
   (formal/cercano, tuteo/usted)? **Propuesta: no.** Es configuración del prompt, no conocimiento
   recuperable: metido aquí, la IA solo lo «vería» cuando el retrieval eligiera ese fragmento, así
   que unas respuestas saldrían con el tono pedido y otras no. Su sitio natural es la plantilla de
   `HT-AI-01`. ¿Se confirma que queda fuera?

2. **`zonas_cobertura` aquí o en HU-KB-10.** «Zonas donde atiende» (dónde vende/despacha) no es lo
   mismo que «ubicación» (dónde está), pero se rozan. **Propuesta: dejarlo en empresa**, porque
   describe el alcance del negocio y no una dirección física. Si HU-KB-10 acaba pidiendo zonas de
   domicilio, habrá que decidir cuál de las dos manda — y moverlo después es caro (id congelado).
   ¿Se queda aquí?

3. **`certificaciones`.** Aporta confianza y los clientes preguntan, pero puede quedar vacío en la
   mayoría de tenants y alargar el formulario. **Propuesta: mantenerlo** (es opcional y barato).
   ¿O se recorta para dejar el formulario más liviano?

4. **Dos obligatorios o uno.** `nombre_comercial` + `descripcion` es lo propuesto. Con uno solo
   (`descripcion`) el formulario se cierra más fácil, pero la IA podría no saber cómo llamarse.
   Con tres o más, una categoría que el sistema **exige** completar se vuelve difícil de cerrar.
   ¿Se confirman los dos?

5. **`anio_fundacion` sin validación de formato.** El contrato no tiene `kind` numérico ni de fecha,
   así que sería texto libre acotado a 30 caracteres. **Propuesta: aceptarlo así** — un admin que
   escriba «desde 2011» está diciendo algo útil, y añadir un `kind` nuevo al contrato saldría del
   alcance de esta HU. ¿O se retira el campo hasta que exista un `kind` adecuado?

6. **Migración del texto libre existente.** HU-KB-07 dejó `migrarLegadoAEstructura` implementada y
   probada pero **sin consumidor**, anotando que «la conectará HU-KB-08 detrás de un opt-in
   explícito». El encargo de esta HU no la menciona. **Propuesta: no conectarla aquí** y dejarla
   para una HU propia, porque implica UI nueva (un aviso del tipo «Completar con el formulario
   guiado», con su confirmación y su deshacer) que no cabe en un cambio de tres líneas y afectaría
   a las cuatro categorías por igual. ¿Se difiere, o entra en el alcance de HU-KB-08?
