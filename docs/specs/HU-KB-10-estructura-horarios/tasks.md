# HU-KB-10 — Tasks (checklist ejecutable)

> Claude Code: ejecuta en orden. Marca cada casilla al terminar. No cierres el feature hasta que
> TODO esté en verde. HU sin backend: el orden es de dentro hacia fuera (schema → registry → tests
> unitarios → integración).

## Antes de empezar

- [x] **Aprobar las preguntas abiertas del final de este archivo.** Los `id` de campo y de columna se
      congelan al implementar. La pregunta 4 (cero obligatorios) se aparta de la recomendación de
      partida y necesita decisión explícita.

## Rama

- [x] **NO crear `feat/HU-KB-10`.** Se trabaja y se commitea sobre **`feat/HU-KB-05`**, igual que
      HU-KB-06/07/08/09. Verificar con `git status` que la rama está limpia y que `d50c1d8` está en
      el historial.

## Implementación

- [x] Invocar `emil-design-eng`, `impeccable:impeccable` y `frontend-design:frontend-design` **antes**
      de tocar cualquier componente (regla §7 del `CLAUDE.md` raíz).
      **No aplicó:** la HU no escribió ni modificó una sola línea de JSX; el diff de `components/` es
      vacío, igual que en HU-KB-09. El formulario lo pintan `KnowledgeStructuredForm` y
      `ScheduleDayEditor`, ambos de HU-KB-07, cuyo diseño ya pasó por la skill.
      (`emil-design-eng` e `impeccable:impeccable` siguen sin estar registradas en este entorno.)
- [x] `lib/schemas/horarios.schema.ts` (nuevo): `HORARIOS_SCHEMA` con `id: 'horarios'`,
      `version: 1` y las 3 secciones (`ubicacion`, `contacto`, `horarios`) con sus 9 campos,
      exactamente como la tabla del `plan.md`.
  - [x] `import type { KbSchemaDef }` — **solo tipo**, para no crear un ciclo en runtime.
  - [x] **Ningún campo es `obligatorio`** (categoría opcional y eliminable; ver pregunta 4).
  - [x] `whatsapp`, `telefono` y `correo` son **campos dedicados** de texto, no una lista: en esta
        categoría la ambigüedad produce datos incorrectos.
  - [x] `otras_sedes`: `kind: 'repetible'`, `maxItems: 6`, subcampos `nombre` (60), `direccion` (120)
        y `telefono` (40), con los `id` en **español legible** (acaban dentro del texto de la IA).
  - [x] Su etiqueta es **«Otras sedes»** y su ayuda dice «Solo si atiendes en más de un punto», para
        que nadie duplique ahí la dirección principal.
  - [x] `horario_atencion`: `kind: 'horario'`, **el único**. No existe un horario de despacho ni de
        entrega — esa frontera es de HU-KB-09.
  - [x] `redes_sociales` como `lista` (maxItems 6, 80 por ítem), no un campo por red.
  - [x] Ningún campo usa `kind: 'triestado'` (su consumidor es HU-KB-11).
  - [x] **Ningún campo de zonas de cobertura, envíos, despacho, entrega ni políticas.** Son las tres
        fronteras declaradas en el `spec.md`.
  - [x] Ningún campo se llama «Información adicional» ni ocupa su lugar.
- [x] `lib/kb-schemas.ts` — las **tres** líneas aditivas, sin tocar nada más:
  - [x] `'horarios'` en la unión `KbSchemaId`.
  - [x] `horarios: HORARIOS_SCHEMA` en `KB_SCHEMAS`.
  - [x] `[normalizeTitulo('Horarios y ubicación')]: 'horarios'` en `SCHEMA_POR_TITULO` — el título
        **exacto** de `PRESET_META`.
- [x] **No editar el comentario de `ScheduleDayEditor`**: ya dice que su consumidor llega en
      HU-KB-10 y sigue siendo cierto. Tocarlo rompería el criterio 21 sin ganancia.
- [x] Confirmar que **no** hizo falta tocar `kb-serialize.ts`, `KnowledgeStructuredForm.tsx` ni
      `ScheduleDayEditor.tsx`. Si hizo falta, **parar** y levantarlo como hallazgo del contrato de
      HU-KB-07 antes de seguir.
      **Confirmado: el contrato aguantó su primer `horario` real**, igual que aguantó el primer
      `repetible` en HU-KB-09. `git diff` de `lib/kb-serialize.ts` y de toda `components/` es vacío.
      No apareció ningún hallazgo nuevo del contrato en esta HU.

## Desvío del plan

- [x] **Un test preexistente de HU-KB-07 tuvo que actualizarse.** «una categoría SIN schema
      registrado sigue en legado aunque esté vacía» usaba «Horarios y ubicación» como ejemplo de
      categoría sin schema — y esta HU se lo da. Pasó a usar «Políticas y términos», que es ahora la
      única sin schema hasta HU-KB-11. No es un desvío de diseño: es el test documentando el estado
      anterior y teniendo que describir el nuevo, igual que pasó en HU-KB-08 y HU-KB-09.

## Tests — Unitarios (Vitest)

- [x] `lib/schemas/horarios.schema.test.ts` (nuevo), siguiendo el patrón de
      `productos.schema.test.ts`:
  - [x] **Ids congelados:** el conjunto de `id` de `todosLosCampos(HORARIOS_SCHEMA)` es exactamente
        el de la tabla. Es el candado contra renombres.
  - [x] **Ids de las columnas congelados:** los `subcampos` de `otras_sedes` son exactamente
        `nombre`, `direccion`, `telefono`, en ese orden.
  - [x] **Ningún campo es obligatorio**: `camposFaltantes` sobre la estructura vacía devuelve `[]`.
  - [x] Las 3 secciones están en orden y ningún `id` de campo se repite.
  - [x] Hay **exactamente un** campo `horario` y **ninguno** `triestado`.
  - [x] Los canales de contacto son campos de texto dedicados, no una `lista`.
  - [x] **Forma del horario (criterios 10 y 11):** días en orden canónico desde lunes; un día con
        varios tramos sale como `- lunes: 08:00–12:00, 14:00–18:00`; un día **cerrado aparece**
        (`- domingo: cerrado`); un día abierto **sin tramos se omite**; un horario sin días útiles no
        deja encabezado.
  - [x] **Presupuesto (criterio 9):** estructura con todo al tope —7 días × 4 tramos, 6 sedes × 3
        columnas, listas hasta su `maxItems`— más `adicional`, y verificar
        `serializedLength(...) <= 10_000`. **Medido, no estimado.**
  - [x] El bloque `otras_sedes` cuesta **más** que el `horario_atencion` completo: deja constancia
        de dónde está el peso real por si algún día hay que recortar.
  - [x] Las 3 secciones salen en orden canónico y «Información adicional» al final (criterio 12).
- [x] `lib/kb-schemas.test.ts` (ampliar, sin romper los casos actuales):
  - [x] `schemaParaTitulo('Horarios y ubicación')` devuelve `HORARIOS_SCHEMA`, también con distinta
        capitalización y espacios sobrantes.
  - [x] `modoEditor` sobre esta categoría: vacía → `'estructurado'`; con texto libre → `'legado'`.
  - [x] Actualizar el caso que hoy afirma que «Horarios y ubicación» **no** tiene schema: debe
        quedar solo `Políticas y términos` como categoría sin schema.

## Tests — Integración (Vitest + RTL)

- [x] `pages/KnowledgeBasePage.test.tsx` (ampliar):
  - [x] La tarjeta «Horarios y ubicación» **vacía** abre el formulario guiado: se ven las 3 secciones
        y «Información adicional», y **no** hay textarea «Contenido».
  - [x] La misma categoría **con texto libre** sigue abriendo el textarea de siempre (criterio 14).
  - [x] El editor de días muestra **los siete días**; marcar «Cerrado» esconde los tramos sin
        borrarlos y volver a abrir los recupera (criterio 15).
  - [x] **El botón Eliminar está presente** en este modal y su `AlertDialog` funciona dentro del
        formulario guiado (criterio 16). Es el primer modal estructurado con borrado: las categorías
        anteriores son obligatorias y lo ocultan.
  - [x] Con todos los campos vacíos, «Guardar e indexar» está deshabilitado; se habilita al llenar
        **cualquier** campo, p. ej. solo el WhatsApp (criterio 17).
  - [x] Guardar envía `contenido` **y** `estructura` con `schemaId: 'horarios'` y `schemaVersion: 1`.

## Verificación final

- [x] `pnpm --filter @sofiapp/web build` sin errores (incluye `tsc --noEmit`).
- [x] `pnpm --filter @sofiapp/web lint` en verde (`--max-warnings 0`).
- [x] `pnpm --filter @sofiapp/web test` en verde, **salvo** `src/features/tags/components/TagSelector.test.tsx`
      (9 fallos preexistentes y ajenos). Confirmar que el conteo no cambió.
- [x] `git diff --stat -- apps/backend` **vacío** (criterio 20).
- [x] `git diff --stat -- .../lib/kb-serialize.ts .../components` **vacío** (criterio 21).
- [x] `grep -rn "bg-\[#" apps/frontend/src/features/knowledge-base` sin resultados.
- [x] `git status` sin `*.png`/`*.jpg` colados.
- [x] Checklist de PR de `docs/multi-tenancy.md` §9: **no aplica** — esta HU no añade código de
      servidor ni queries a Mongo.
- [x] Actualizar `**Estado:**` del `spec.md` a `implementado`.
- [x] Commit en `feat/HU-KB-05` con Conventional Commits **en inglés**.

## Definición de "hecho"

El admin abre la tarjeta «Horarios y ubicación» y ve tres bloques: dónde está —con sitio para más
sedes si tiene—, cómo lo contactan —WhatsApp, teléfono y correo en campos separados— y cuándo
atiende, con los siete días y sus tramos, pudiendo marcar el domingo como cerrado sin perder el
horario. No le exige ningún campo, porque la tarjeta es opcional y puede eliminarla cuando quiera:
el botón sigue ahí y funciona. Al guardar, el backend recibe texto y estructura en la misma
petición, sin haber cambiado una línea de servidor ni de la infraestructura de HU-KB-07.

---

## Preguntas de diseño — RESUELTAS

> Aprobadas antes de implementar. A partir de aquí los `id` de campo y de columna quedan
> **congelados**: se congelan de verdad al primer guardado de un tenant.

| # | Decisión |
|---|---|
| 1 | **Campos dedicados** para WhatsApp, teléfono y correo. Aquí la ambigüedad produce datos incorrectos. |
| 2 | **`direccion` + `otras_sedes`**: el caso de una sola ubicación no cuesta una fila. |
| 3 | **Un solo campo `horario`.** El despacho es de HU-KB-09; los festivos caben en `excepciones_horario`. |
| 4 | **Cero obligatorios** — consultado explícitamente y confirmado, apartándose de la recomendación de partida de 1. Todo candidato falla para algún negocio, y `contenidoListo` ya impide guardar el formulario vacío. |
| 5 | **`redes_sociales` como `lista`.** El conjunto de redes es abierto. |
| 6 | **`indicaciones` se queda.** El presupuesto va sobrado (margen ≈ 4.785). |

El planteamiento original de cada pregunta queda abajo, tal como se formuló.

---

1. **Canales de contacto: ¿campos dedicados, `lista` o `repetible`?** Propuesta: **campos dedicados**
   (`whatsapp`, `telefono`, `correo`). Aquí la ambigüedad no es una respuesta pobre sino una
   **incorrecta**: un `3001234567` suelto en una lista no le dice a la IA si es WhatsApp o fijo, y
   mandará al cliente al número equivocado. Con campos dedicados el fragmento indexado dice
   literalmente `WhatsApp: 3001234567`. El `repetible` (tipo + valor) sería más flexible pero
   traslada al admin nombrar bien el tipo («cel», «celular», «Whatsapp»), justo donde el error se
   vuelve dato malo. ¿Se confirman los tres campos dedicados?

2. **Sedes: ¿`direccion` + `otras_sedes`, o solo un `repetible`?** Propuesta: **las dos cosas**. El
   caso común es una única ubicación y obligar a pulsar «Añadir» para escribirla es fricción sin
   ganancia; el `repetible` queda para quien de verdad tiene varias. El riesgo es que alguien
   duplique la principal como fila, y se mitiga con la etiqueta («Otras sedes») y su ayuda, no con
   validación. ¿Se acepta, o se prefiere un único `repetible` uniforme?

3. **Horarios: ¿uno o dos campos `horario`?** Propuesta: **uno solo**, `horario_atencion`. Un
   horario de despacho cruzaría a HU-KB-09, dueña de `tiempos_entrega`. La línea propuesta:
   «¿cuándo atienden?» aquí · «¿cuánto tarda en llegarme?» en `productos` · «¿a dónde despachan?» en
   `empresa`. Los festivos y horarios de temporada caben en `excepciones_horario` (`texto-medio`).
   ¿Se confirma la línea?

4. **Obligatorios: ¿cero o uno?** Propuesta: **cero**, apartándome de la recomendación de partida.
   Todos los candidatos fallan para algún negocio: solo-online no tiene dirección, solo-correo no
   tiene WhatsApp, 24/7 no tiene horario. Y no hace falta coerción: el editor ya impide guardar un
   formulario vacío al crear. La alternativa es `whatsapp` obligatorio —defendible, siendo SofiApp
   un CRM de WhatsApp— pero «casi todos los tenants» no es «todos», y el precio de equivocarse es un
   admin que no puede guardar. **Esta es la pregunta que más conviene decidir explícitamente.**

5. **Redes sociales: ¿campo dedicado por red o `lista`?** Propuesta: **`lista`** (6 ítems, 80
   caracteres). Declarar un campo por red obliga a adivinar cuáles usa cada negocio —Instagram,
   TikTok, X, LinkedIn, Facebook— y a quedarse corto igual. Con la lista, el admin escribe
   «Instagram: @acme» y controla qué incluye. ¿Se confirma?

6. **`indicaciones` («Cómo llegar»): ¿se queda?** Propuesta: **sí**. Es de lo más útil para una
   respuesta hablada («frente al parque, segundo piso») y cuesta 314 caracteres del presupuesto, que
   va sobrado. El candidato a recortar si se quiere el formulario más corto.
