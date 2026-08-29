# HU-KB-09 — Formulario guiado de «Productos y servicios» (spec)

> **Spec-Driven Development.** Este es el QUÉ y el porqué. El CÓMO va en `plan.md`; la ejecución
> en `tasks.md`. HU **100 % frontend**. Es la segunda categoría con forma propia y **el primer
> consumidor real del `kind: 'repetible'`** que HU-KB-07 dejó implementado y sin usar.

**Estado:** implementado

## Historia

Como **admin** de un tenant, quiero que la tarjeta «Productos y servicios» me deje **describir lo
relevante de cada cosa que ofrezco** en filas, en vez de amontonarlo todo en un párrafo suelto, para
que la IA sepa qué es cada producto, qué incluye y para quién es — y pueda hablar de ello con
criterio.

> **El precio no es una columna, y eso es una decisión, no un olvido.** El precio envejece igual que
> las existencias, que esta categoría ya excluye a propósito: una cifra vieja incrustada en el
> conocimiento indexado hace que la IA prometa un valor que ya no existe, y eso es **peor** que
> responder «eso se cotiza». Lo estable de un producto —qué es, qué incluye, para quién, qué lo
> diferencia— sí merece estar aquí. Los rangos y la forma de cotizar viven en `notas_precios`, donde
> se dicen como lo que son: orientativos.

## Contexto: dónde estamos

| Categoría | Preset | Estado |
|---|---|---|
| Información de la empresa | obligatorio | hecha — HU-KB-08 (`8a62c2c`) |
| **Productos y servicios** | **obligatorio** | **HU-KB-09 (esta)** |
| Horarios y ubicación | opcional | HU-KB-10 |
| Políticas y términos | opcional | HU-KB-11 |
| Información Complementaria | opcional | hecha — HU-KB-07, schema `generico` |

El `kind: 'repetible'` y su primitivo `RepeatableList` existen y están probados desde HU-KB-07, pero
**ningún schema real los usa todavía**. Esta HU es la que estrena el camino completo: filas en el
formulario → `KbFieldValue` de tipo `repetible` → texto serializado → indexación.

## Objetivo técnico

Declarar el schema `productos` y registrar su título. El cableado son **tres líneas aditivas** en
`kb-schemas.ts`, igual que en HU-KB-08. Toda la maquinaria ya existe.

Esta categoría responde una pregunta concreta: **qué ofrece el negocio y qué es relevante saber de
cada cosa**. Es **conocimiento estable para la IA, no un CRM**: nada de existencias, unidades
disponibles, códigos de barras, estados del producto, precios por cliente — ni precios por producto
como dato estructurado.

## Alcance

### Incluye

- `lib/schemas/productos.schema.ts` **(nuevo)** — `PRODUCTOS_SCHEMA` (3 secciones, 7 campos, uno de
  ellos `repetible` con 2 columnas).
- `lib/kb-schemas.ts` — tres añadidos **puramente aditivos**: `'productos'` en la unión
  `KbSchemaId`, la entrada en `KB_SCHEMAS` y la entrada en `SCHEMA_POR_TITULO` con el título exacto
  de `PRESET_META`: `'Productos y servicios'`.
- Tests: unitarios del schema (ids congelados, obligatorios, presupuesto medido, forma del texto del
  `repetible`) e integración RTL de los dos modos sobre esta categoría.

### Fuera de alcance

- **`apps/backend/**` por completo.** `estructura` es JSON opaco para el servidor; añadir campos no
  lo toca.
- **La infraestructura de HU-KB-07**: `KnowledgeStructuredForm.tsx`, `kb-serialize.ts` y los seis
  primitivos, **incluido `RepeatableList`**. Se consumen sin modificarlos. Si algo obligara a
  tocarlos, se levanta como hallazgo del contrato y se decide — no se parchea aquí (ver los dos
  hallazgos ya identificados en `plan.md`).
- **El catálogo real del producto** (la vista `/catalogo`, hoy `disabled` en `nav-config.ts`). Es un
  feature aparte, con su propio modelo y su propio CRUD. Lo que se captura aquí es la **chuleta que
  la IA necesita para conversar**, no el inventario. Si algún día el catálogo se alimenta de estos
  datos —o al revés—, se decide en su momento y en su propia HU.
- **Existencias, disponibilidad, SKU, códigos de barras, estados del producto y precios por
  cliente.** Son datos de operación, cambian a diario y re-indexar la KB en cada cambio sería un
  despropósito.
- **El precio como dato estructurado por producto.** Por la misma razón: envejece. Lo que sí entra
  es la **política de precios** —rangos, cómo se cotiza, de qué depende— en `notas_precios`, y lo que
  el admin quiera escribir dentro de la descripción de una fila.
- **Las otras tres categorías.** Este schema **no declara** datos de la empresa (HU-KB-08), canales
  de contacto, dirección ni horarios (HU-KB-10), ni garantías, devoluciones o términos (HU-KB-11).

> **Cláusula para HU-KB-10.** `modalidades_entrega` y `tiempos_entrega` pertenecen a **esta**
> categoría: describen cómo llega lo que se vende, que es parte de la oferta, no dónde está el
> negocio ni cuándo abre. El spec de HU-KB-10 deberá declarar **«modalidades y tiempos de entrega →
> HU-KB-09»** dentro de su *fuera de alcance*, igual que ya declara «zonas de cobertura → HU-KB-08».
> Moverlo después es caro: el `id` queda congelado en cuanto un tenant guarda.
- **La vista principal** y el resto del modal: encabezado, leyenda de versión, contador global,
  borrado y flujo de guardado no se tocan.

## Criterios de aceptación

### Bloque A — El schema (complejidad **media**)

1. Existe `PRODUCTOS_SCHEMA` con `id: 'productos'`, `version: 1` y **3 secciones**: `oferta`,
   `precios` y `entrega`.
2. Los **7 campos** son exactamente los de la tabla de `plan.md`, con sus `id`, `kind`, `requisito`
   y topes. Los `id` quedan **congelados**: renombrar uno deja huérfano el dato ya guardado.
3. **Exactamente dos campos son `obligatorio`**: `resumen_oferta` y `catalogo`. Sin el primero la IA
   no puede decir a qué se dedica la oferta; sin al menos una fila del segundo no puede nombrar ni
   describir nada concreto. Es el mismo mínimo de dos que fijó HU-KB-08 para la otra categoría
   obligatoria.
4. `catalogo` es el único `repetible`, con **2 columnas** — `nombre` y `descripcion` — y
   `maxItems: 12`. **No hay columna de precio**: ver criterio 5.
5. **Ningún campo captura el precio como dato estructurado.** El precio envejece igual que las
   existencias, ya excluidas: incrustarlo en el texto indexado haría que la IA cite cifras
   caducadas, lo que es peor que decir «se cotiza». La política de precios —rangos, de qué depende,
   cómo se cotiza— vive en `notas_precios` como **texto libre** (p. ej. «los planes van de $10 a $50
   según usuarios»), donde se lee como orientación y no como tarifa. El contrato tampoco tiene
   `kind` numérico y esta HU **no inventa uno**, igual que se decidió en HU-KB-08 para
   `anio_fundacion`.
6. Ningún campo usa `kind: 'horario'` ni `kind: 'triestado'`. Lo que es una enumeración simple
   (formas de pago, modalidades de entrega) usa `kind: 'lista'`, no `repetible`: `repetible` es para
   filas con columnas, y usarlo para ítems de una sola dimensión encarece el texto sin aportar nada.

### Bloque B — El texto que llega a la IA (complejidad **alta**)

7. Con **todos** los campos al tope —incluidas las 12 filas del `repetible` con sus 2 columnas
   llenas— y `adicional` lleno, el texto serializado **cabe en `CONTENIDO_MAX` (10.000)** con
   margen. Se verifica **midiendo** con un test, nunca estimando.
8. Cada fila del `catalogo` se serializa en una línea con sus columnas separadas por ` · ` —
   `- nombre: X · descripcion: Y`— y las columnas vacías de una fila **no dejan rastro**: una fila
   con solo nombre sale como `- nombre: X`, sin separadores huérfanos.
9. Un `catalogo` sin ninguna fila con contenido **no deja encabezado** en el texto.
10. Las tres secciones salen en orden canónico (`## Qué ofrece`, `## Precios y condiciones`,
    `## Cómo se entrega`) y «Información adicional» al final.

### Bloque C — El modal (complejidad **baja**)

11. La tarjeta «Productos y servicios» **vacía** abre en modo **estructurado**, solo por figurar su
    título en `SCHEMA_POR_TITULO`. Aplica a los documentos vacíos que ya existen y al preset
    virtual.
12. La misma tarjeta **con texto libre ya escrito** sigue abriendo en modo **legado**, con su
    textarea intacto (regla de retrocompatibilidad de HU-KB-07).
13. Con los dos obligatorios sin llenar, «Guardar e indexar» está **deshabilitado**. Una fila del
    `catalogo` con **cualquiera** de sus dos columnas con texto ya cuenta como llena — no se puede
    exigir columna por fila (hallazgo H2 del `plan.md`), y se acepta a propósito.
14. El `RepeatableList` del `catalogo` permite añadir hasta 12 filas, quitarlas por posición, y al
    llegar al tope deshabilita el botón y dice por qué. Todo esto ya lo hace el primitivo: el
    criterio verifica que el schema lo cablea bien, no que el primitivo funcione.
15. Guardar envía `contenido` **y** `estructura` en el mismo payload, con `schemaId: 'productos'` y
    `schemaVersion: 1`.
16. **«Información adicional» sigue presente**, al final y fuera del acordeón, y **no** es un campo
    del schema: es el `adicional` del sobre.

### Bloque D — Transversales

17. **Sin cambios de backend.** `git diff` no toca `apps/backend/**`. Al no haber código de
    servidor, esta HU **no introduce superficie multi-tenant nueva**: el aislamiento lo siguen
    garantizando los endpoints existentes (`authenticateJWT → requireTenant → authorize(['admin'])`
    + repositorio `*Scoped`), que no se modifican. Por eso no lleva test de aislamiento propio.
18. **Sin cambios en la infraestructura de HU-KB-07.** `git diff` no toca `kb-serialize.ts`,
    `KnowledgeStructuredForm.tsx` ni `components/fields/*`, **ni siquiera en comentarios**. Los dos
    hallazgos del contrato registrados en `plan.md` se documentan, no se arreglan aquí.
19. Se invocaron `emil-design-eng`, `impeccable:impeccable` y `frontend-design:frontend-design`
    **antes** de escribir o modificar cualquier componente (regla §7 del `CLAUDE.md` raíz). Si la HU
    termina sin tocar ni un componente —que es el objetivo—, se deja constancia de eso mismo, como
    en HU-KB-08.
20. `pnpm --filter @sofiapp/web build` (incluye `tsc --noEmit`), `lint` (`--max-warnings 0`) y
    `test` en verde, con la única excepción declarada de `TagSelector.test.tsx` (9 fallos
    preexistentes y ajenos).

## Dependencias

Depende de:

- **HU-KB-07** (`f2736a7`): el contrato, `LIMITE_POR_KIND`, `RepeatableList`, `serializeEstructura`
  y el registry.
- **HU-KB-08** (`8a62c2c`): el patrón de archivo por categoría (`lib/schemas/<x>.schema.ts` con
  `import type`), el cableado de tres líneas, el test candado de ids y el test de presupuesto
  medido. Esta HU **copia ese estilo**.
- `PRESET_META` de `lib/kb-presets.ts` para el título exacto: `'Productos y servicios'`.

Bloquea a: nada. HU-KB-10 y HU-KB-11 son independientes.

**Rama:** se trabaja y se commitea sobre **`feat/HU-KB-05`**, igual que HU-KB-06/07/08. **No** se
crea `feat/HU-KB-09`.

## Definición de "hecho"

El admin abre la tarjeta «Productos y servicios» y, en vez del textarea de siempre, ve un formulario
con una **tabla de filas** donde describe lo relevante de cada cosa que ofrece —qué es y qué
incluye— más una frase de resumen, cómo se cotiza, las formas de pago y cómo entrega. Añade y quita
filas hasta 12, y no puede guardar hasta tener el resumen y al menos un producto. El precio no le
pide una cifra por producto: donde habla de dinero es en «Cómo se cotiza», y ahí lo dice como lo que
es, un rango orientativo que no caduca a la primera. Al guardar, el backend recibe el texto
serializado y la estructura en la misma petición, sin haber cambiado una línea de servidor ni de la
infraestructura de HU-KB-07. Y quien ya tenía su catálogo escrito a mano conserva su textarea
intacto.
