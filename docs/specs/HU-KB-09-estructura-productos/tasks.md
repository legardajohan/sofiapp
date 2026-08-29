# HU-KB-09 — Tasks (checklist ejecutable)

> Claude Code: ejecuta en orden. Marca cada casilla al terminar. No cierres el feature hasta que
> TODO esté en verde. HU sin backend: el orden es de dentro hacia fuera (schema → registry → tests
> unitarios → integración).

## Antes de empezar

- [x] **Preguntas de diseño aprobadas** (ver el final de este archivo), con un cambio de fondo: el
      `catalogo` pasa a **2 columnas** y **el precio deja de ser dato estructurado**. A partir de
      aquí el diseño queda congelado: los `id` de campo y de columna no se pueden renombrar después.

## Rama

- [x] **NO crear `feat/HU-KB-09`.** Se trabaja y se commitea sobre **`feat/HU-KB-05`**, igual que
      HU-KB-06/07/08. Verificar con `git status` que la rama está limpia y que `8a62c2c` está en el
      historial.

## Implementación

- [x] Invocar `emil-design-eng`, `impeccable:impeccable` y `frontend-design:frontend-design` **antes**
      de tocar cualquier componente (regla §7 del `CLAUDE.md` raíz).
      **No aplicó:** la HU no escribió ni modificó una sola línea de JSX. A diferencia de HU-KB-08,
      esta vez **ni siquiera un comentario** en `components/` — el diff de esa carpeta es vacío. El
      formulario lo pinta `KnowledgeStructuredForm` de HU-KB-07 y las filas `RepeatableList`, cuyo
      diseño ya pasó por la skill en su momento. (`emil-design-eng` e `impeccable:impeccable` siguen
      sin estar registradas en este entorno.)
- [x] `lib/schemas/productos.schema.ts` (nuevo): `PRODUCTOS_SCHEMA` con `id: 'productos'`,
      `version: 1` y las 3 secciones (`oferta`, `precios`, `entrega`) con sus 7 campos, exactamente
      como la tabla del `plan.md`.
  - [x] `import type { KbSchemaDef }` — **solo tipo**, para no crear un ciclo en runtime.
  - [x] `resumen_oferta` y `catalogo` son los **únicos** `obligatorio`.
  - [x] `catalogo`: `kind: 'repetible'`, `maxItems: 12`, subcampos `nombre` (60) y `descripcion`
        (120) — **sin columna de precio**. Los `id` de los subcampos van en **español legible**:
        acaban dentro del texto que lee la IA (hallazgo H1 del `plan.md`).
  - [x] `resumen_oferta` con `maxLength: 600` (no los 1.500 del `kind`), y los ítems de las dos
        listas con `maxLength: 60`.
  - [x] **No existe un campo `categorias`**: se recortó por solaparse con los nombres del propio
        catálogo y con `resumen_oferta`.
  - [x] `notas_precios` es el único sitio donde se habla de dinero: su `etiqueta` y su `ayuda` deben
        invitar a un **rango** («los planes van de $10 a $50 según usuarios»), no a una tarifa
        cerrada.
  - [x] Ningún campo usa `horario`, `triestado` ni un `kind` inventado.
  - [x] Ningún campo se llama «Información adicional» ni ocupa su lugar.
- [x] `lib/kb-schemas.ts` — las **tres** líneas aditivas, sin tocar nada más:
  - [x] `'productos'` en la unión `KbSchemaId`.
  - [x] `productos: PRODUCTOS_SCHEMA` en `KB_SCHEMAS`.
  - [x] `[normalizeTitulo('Productos y servicios')]: 'productos'` en `SCHEMA_POR_TITULO` — el título
        **exacto** de `PRESET_META`.
- [x] Confirmar que **no** hizo falta tocar `kb-serialize.ts`, `KnowledgeStructuredForm.tsx` ni
      `RepeatableList.tsx`. Si hizo falta, **parar** y levantarlo como hallazgo del contrato de
      HU-KB-07 antes de seguir — los hallazgos H1 y H2 ya están documentados en `plan.md` y **no se
      arreglan en esta HU**.
      **Confirmado: el contrato aguantó su primer `repetible` real.** `git diff` de
      `lib/kb-serialize.ts` y de toda `components/` es **vacío**. H1 (el texto usa el `id` del
      subcampo) se mitigó nombrándolos en español legible, y H2 (no se puede exigir columna por fila)
      se aceptó y quedó fijado por test: una fila con solo nombre desbloquea el guardado.

## Tests — Unitarios (Vitest)

- [x] `lib/schemas/productos.schema.test.ts` (nuevo), copiando el patrón de `empresa.schema.test.ts`:
  - [x] **Ids congelados:** el conjunto de `id` de `todosLosCampos(PRODUCTOS_SCHEMA)` es exactamente
        el de la tabla. Es el candado contra renombres.
  - [x] **Ids de las columnas congelados:** los `subcampos` de `catalogo` son exactamente
        `nombre` y `descripcion`, en ese orden. **Ninguna columna se llama `precio`** — el test lo
        afirma explícitamente, para que reintroducirla exija una decisión consciente.
  - [x] Solo `resumen_oferta` y `catalogo` son `obligatorio`; `camposFaltantes` sobre la estructura
        vacía devuelve exactamente esos dos.
  - [x] Las 3 secciones están en orden y ningún `id` de campo se repite.
  - [x] Ningún campo usa `kind: 'horario'` ni `kind: 'triestado'` (criterio 6).
  - [x] `catalogo` con **una** fila que solo tiene `nombre` **cuenta como lleno** y desbloquea el
        guardado (hallazgo H2: no se puede exigir columna por fila, y se acepta a propósito).
  - [x] `catalogo` con filas todas en blanco cuenta como **vacío** y sigue bloqueando.
  - [x] **Presupuesto (criterio 7):** construir la estructura con todos los campos al tope —las 12
        filas con sus 2 columnas llenas, las listas hasta su `maxItems`— más `adicional` al tope, y
        verificar `serializedLength(...) <= 10_000`. **Medido, no estimado.**
  - [x] Forma del texto del `repetible`: una fila completa sale como
        `- nombre: X · descripcion: Y`; una fila con solo nombre sale como `- nombre: X`
        **sin separadores huérfanos** (criterio 8); un `catalogo` sin filas útiles no deja
        encabezado (criterio 9).
  - [x] Las 3 secciones salen en orden canónico y «Información adicional» al final (criterio 10).
- [x] `lib/kb-schemas.test.ts` (ampliar, sin romper los casos actuales):
  - [x] `schemaParaTitulo('Productos y servicios')` devuelve `PRODUCTOS_SCHEMA`, y también con
        distinta capitalización y espacios sobrantes.
  - [x] `modoEditor` sobre esta categoría: vacía → `'estructurado'`; con texto libre → `'legado'`.
  - [x] Actualizar el caso que hoy afirma que «Productos y servicios» **no** tiene schema: describe
        el estado anterior y debe pasar a describir el nuevo. Deja solo `Horarios y ubicación` y
        `Políticas y términos` como categorías sin schema.

## Tests — Integración (Vitest + RTL)

- [x] `pages/KnowledgeBasePage.test.tsx` (ampliar):
  - [x] La tarjeta «Productos y servicios» **vacía** abre el formulario guiado: se ven las 3
        secciones y «Información adicional», y **no** hay textarea «Contenido».
  - [x] La misma categoría **con texto libre** sigue abriendo el textarea de siempre (criterio 12).
  - [x] Con los obligatorios vacíos, «Guardar e indexar» está deshabilitado; se habilita al llenar
        `resumen_oferta` y añadir una fila con su nombre (sin descripción).
  - [x] Cada fila del `catalogo` muestra **dos** campos, y **ninguno** pide un precio.
  - [x] Añadir y quitar filas del `catalogo` funciona por posición, y al llegar a 12 el botón queda
        deshabilitado con su aviso (criterio 14).
  - [x] Guardar envía `contenido` **y** `estructura` con `schemaId: 'productos'` y
        `schemaVersion: 1`, con las filas en el orden en que se ingresaron.

## Verificación final

- [x] `pnpm --filter @sofiapp/web build` sin errores (incluye `tsc --noEmit`).
- [x] `pnpm --filter @sofiapp/web lint` en verde (`--max-warnings 0`).
- [x] `pnpm --filter @sofiapp/web test` en verde, **salvo** `src/features/tags/components/TagSelector.test.tsx`
      (9 fallos preexistentes y ajenos, declarados fuera de alcance). Confirmar que el conteo no
      cambió.
- [x] `git diff --stat -- apps/backend` **vacío** (criterio 17).
- [x] `git diff --stat -- .../lib/kb-serialize.ts .../components` **vacío** (criterio 18) — esta vez
      sin la excepción de comentarios que sí tuvo HU-KB-08.
- [x] `grep -rn "bg-\[#" apps/frontend/src/features/knowledge-base` sin resultados.
- [x] `git status` sin `*.png`/`*.jpg` colados.
- [x] Checklist de PR de `docs/multi-tenancy.md` §9: **no aplica** — esta HU no añade código de
      servidor ni queries a Mongo. El aislamiento lo siguen garantizando los endpoints existentes de
      `features/kb`, que no se tocan.
- [x] Actualizar `**Estado:**` del `spec.md` a `implementado`.
- [x] Commit en `feat/HU-KB-05` con Conventional Commits **en inglés**.

## Definición de "hecho"

El admin abre la tarjeta «Productos y servicios» y ve un formulario con una tabla de filas donde
describe lo relevante de cada cosa que ofrece —qué es y qué incluye— más una frase de resumen, cómo
se cotiza, las formas de pago y cómo entrega. Añade y quita filas hasta 12, y no puede guardar hasta
tener el resumen y al menos un producto. El formulario no le pide una cifra por producto: el dinero
se dice en «Cómo se cotiza», como rango orientativo que no caduca a la primera. Al guardar, el
backend recibe texto y estructura en la misma petición sin haber cambiado una línea, y quien ya
tenía su catálogo escrito a mano conserva su textarea intacto. El diff no toca ni `apps/backend/**`
ni la infraestructura de HU-KB-07.

---

## Preguntas de diseño — RESUELTAS

> Aprobadas antes de implementar. A partir de aquí los `id` de campo y de columna quedan
> **congelados**: se congelan de verdad al primer guardado de un tenant, y desde ahí renombrarlos
> deja datos huérfanos.

| # | Decisión |
|---|---|
| 1 | **Tres secciones confirmadas:** `oferta`, `precios`, `entrega`. |
| 2 | **CAMBIO DE FONDO — el `repetible` pasa a 2 columnas:** `nombre` (60) + `descripcion` (120). **Se elimina la columna `precio`**: envejece como el stock, y una cifra caducada en el texto indexado es peor que «se cotiza». El dinero pasa a `notas_precios` como rango. |
| 3 | **`maxItems: 12` confirmado**, ahora por **dilución del retrieval**, no por presupuesto (con 15 cabría): más filas = más fragmentos compitiendo por los 5 huecos de `KB_RETRIEVAL_K`. |
| 4 | **`descripcion` en 120 confirmado.** No se salta el default de `LIMITE_POR_KIND`. |
| 5 | **Dos obligatorios confirmados:** `resumen_oferta` + `catalogo`. |
| 6 | **`categorias` RECORTADO** (se solapa con los nombres del catálogo y con `resumen_oferta`). Quedan `formas_pago` y `modalidades_entrega`. El formulario baja a **7 campos**. |
| 7 | **Frontera con HU-KB-10 confirmada**, con la cláusula escrita en el `spec.md`. |
| 8 | **H1 y H2 documentados y diferidos**, no se arreglan aquí. |

Consecuencia en el presupuesto: por fila **207** (antes 258), `catalogo` ≈ 2.506, **total ≈ 6.612**,
margen **≈ 3.388** (antes ≈ 2.282). Sigue midiéndose por test.

El planteamiento original de cada pregunta queda abajo, tal como se formuló.

---

1. **¿Tres secciones o dos?** Propuesta: **tres** (`oferta`, `precios`, `entrega`). La alternativa
   es fundir precios y entrega en una sola «Condiciones comerciales», dejando el formulario más
   corto pero mezclando dos preguntas distintas («¿cuánto cuesta?» y «¿cómo me llega?»).
   ¿Se confirman las tres?

2. **¿Qué columnas lleva el `repetible`?** Propuesta: **`nombre` + `precio` + `descripcion`**. Cada
   columna extra cuesta ~1.600 caracteres del presupuesto (se multiplica por 12 filas), así que la
   pregunta real es si falta alguna imprescindible o si sobra `descripcion`. Con solo
   `nombre` + `precio` el presupuesto se relajaría en ~1.630. ¿Se confirman las tres columnas?

3. **¿`maxItems: 12` es el número correcto?** Propuesta: **12**. Esta lista es la **chuleta de la
   IA**, no el inventario (para eso está `/catalogo`). Con 15 el presupuesto sigue cabiendo (~8.492,
   margen ~1.508); con 20 ya no. ¿12, o se prefiere 15?

4. **¿`descripcion` se queda en 120 o sube a 160?** Propuesta: **120**, que es el tope por defecto de
   `repetible` en `LIMITE_POR_KIND`. Subirlo es legal (el subcampo admite su `maxLength`) y costaría
   ~480 del presupuesto, pero sentaría precedente de saltarse el default justo en el campo que más
   se multiplica. ¿Se queda en 120?

5. **¿Dos obligatorios, o solo uno?** Propuesta: **dos** (`resumen_oferta` + `catalogo`), igual que
   la otra categoría obligatoria. Con solo `catalogo` el formulario se cierra más rápido pero la IA
   pierde el marco general; con solo `resumen_oferta` se pierde el dato concreto, que es la razón de
   ser de esta categoría. ¿Se confirman los dos?

6. **¿Qué campos merecen `kind: 'lista'` y cuáles sobran?** Propuesta: `categorias` (8),
   `formas_pago` (8) y `modalidades_entrega` (6). El candidato a recortar es `categorias`, que en un
   negocio pequeño se solapa con los nombres del propio catálogo. ¿Se mantienen las tres?

7. **Frontera con HU-KB-10.** `modalidades_entrega` y `tiempos_entrega` se quedan aquí porque
   describen cómo llega lo que se vende, no dónde está el negocio. Requiere que el spec de HU-KB-10
   los declare fuera de su alcance, igual que ya hace con `zonas_cobertura` respecto de HU-KB-08.
   ¿Se acepta esa frontera?

8. **Los dos hallazgos del contrato (H1 y H2 del `plan.md`).** Propuesta: **documentarlos y no
   arreglarlos aquí** — el texto sale legible nombrando bien los subcampos, y una fila sin precio
   sigue siendo conocimiento útil. ¿Se confirma que quedan para HUs propias, o alguno bloquea?
