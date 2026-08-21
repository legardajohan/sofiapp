# HU-KB-10 — Formulario guiado de «Horarios y ubicación» (spec)

> **Spec-Driven Development.** Este es el QUÉ y el porqué. El CÓMO va en `plan.md`; la ejecución
> en `tasks.md`. HU **100 % frontend**. Tercera categoría con forma propia y **primer consumidor
> real del `kind: 'horario'`** y de su primitivo `ScheduleDayEditor`, que HU-KB-07 dejó listos y sin
> usar.

**Estado:** implementado

## Historia

Como **admin** de un tenant, quiero que la tarjeta «Horarios y ubicación» me pregunte **dónde estoy,
cómo me contactan y cuándo atiendo**, con un editor de días de verdad en vez de un párrafo, para que
la IA responda «¿cuál es su WhatsApp?» o «¿abren el sábado?» con el dato exacto y no con un
aproximado.

## Contexto: dónde estamos

| Categoría | Preset | Estado |
|---|---|---|
| Información de la empresa | obligatorio | hecha — HU-KB-08 (`8a62c2c`) |
| Productos y servicios | obligatorio | hecha — HU-KB-09 (`d50c1d8`) |
| **Horarios y ubicación** | **opcional** | **HU-KB-10 (esta)** |
| Políticas y términos | opcional | HU-KB-11 |
| Información Complementaria | opcional | hecha — HU-KB-07, schema `generico` |

Dos diferencias respecto de las dos anteriores, y las dos importan:

1. **Esta categoría es opcional y se puede eliminar.** Su modal lleva botón **Eliminar** —el primero
   de las categorías con formulario guiado— y borrarla es un *soft-delete* que hace desaparecer la
   tarjeta (HU-KB-06). El formulario guiado no puede romper ese camino.
2. **Es la categoría de los datos exactos.** Un teléfono mal recuperado no es una respuesta pobre:
   es una respuesta **incorrecta** que manda al cliente a otro número. Eso condiciona el diseño de
   los campos de contacto (ver criterio 4).

## Objetivo técnico

Declarar el schema `horarios` y registrar su título. El cableado son **tres líneas aditivas** en
`kb-schemas.ts`, igual que en HU-KB-08 y HU-KB-09.

Esta categoría es dueña de tres cosas y solo tres: **dónde está** el negocio, **cómo lo contactan** y
**cuándo atiende**.

## Alcance

### Incluye

- `lib/schemas/horarios.schema.ts` **(nuevo)** — `HORARIOS_SCHEMA` (3 secciones, 9 campos: uno
  `horario`, uno `repetible` de 3 columnas, uno `lista` y seis de texto).
- `lib/kb-schemas.ts` — tres añadidos **puramente aditivos**: `'horarios'` en la unión `KbSchemaId`,
  la entrada en `KB_SCHEMAS` y la entrada en `SCHEMA_POR_TITULO` con el título exacto de
  `PRESET_META`: `'Horarios y ubicación'`.
- Tests: unitarios del schema (ids congelados, presupuesto medido, forma del texto del `horario`) e
  integración RTL de los dos modos, del editor de días y del **borrado** sobre esta categoría.

### Fuera de alcance

- **`apps/backend/**` por completo.**
- **La infraestructura de HU-KB-07**: `KnowledgeStructuredForm.tsx`, `kb-serialize.ts` y los seis
  primitivos, **incluido `ScheduleDayEditor`**. Se consumen sin modificarlos. HU-KB-09 demostró que
  el contrato aguanta un `kind` nuevo sin tocar una línea; esta HU debe repetirlo con `horario`. Si
  algo obligara a tocarlos, se levanta como hallazgo y se decide — no se parchea aquí.

**Tres fronteras ya pactadas, que este spec declara explícitamente:**

- **Zonas de cobertura y despacho → HU-KB-08.** Viven en el schema `empresa` (`zonas_cobertura`):
  describen **dónde vende** el negocio, no dónde está físicamente. Este schema **no** declara
  ninguna zona.
- **Modalidades y tiempos de entrega → HU-KB-09.** Viven en el schema `productos`
  (`modalidades_entrega`, `tiempos_entrega`): describen **cómo llega lo que se vende**, que es parte
  de la oferta. Este schema **no** declara ningún campo de envíos, despacho ni logística — incluido
  el horario de despacho (ver criterio 6).
- **Garantías, devoluciones y términos → HU-KB-11.** Ningún campo de políticas aquí.

Además quedan fuera: el catálogo y los precios (HU-KB-09), la identidad y la misión (HU-KB-08), y el
tono de voz de la IA, que es configuración del prompt (`HT-AI-01`) y no conocimiento recuperable.

- **La vista principal** y el resto del modal: encabezado, leyenda de versión, contador global,
  borrado y flujo de guardado no se tocan.

## Criterios de aceptación

### Bloque A — El schema (complejidad **media**)

1. Existe `HORARIOS_SCHEMA` con `id: 'horarios'`, `version: 1` y **3 secciones**: `ubicacion`,
   `contacto` y `horarios`.
2. Los **9 campos** son exactamente los de la tabla de `plan.md`, con sus `id`, `kind`, `requisito`
   y topes. Los `id` quedan **congelados**, los de campo y los de columna de `otras_sedes`.
3. **Cero campos obligatorios.** Es una categoría opcional y eliminable: exigir un dato para poder
   guardar contradice esa naturaleza, y **cualquier** candidato falla para algún tipo de negocio (un
   negocio solo-online no tiene dirección; uno que solo usa correo no tiene WhatsApp; uno 24/7 no
   tiene horario). El formulario vacío tampoco se puede guardar: el editor ya exige contenido no
   vacío para crear, así que no hace falta coerción adicional. Ver la justificación completa y la
   alternativa en `plan.md`.
4. **Los canales de contacto son campos dedicados** (`whatsapp`, `telefono`, `correo`), no una lista
   libre. En esta categoría la ambigüedad es un error de datos: si la IA recupera `3001234567` sin
   saber si es WhatsApp o fijo, da una respuesta **incorrecta**. Con campos dedicados, el fragmento
   indexado dice literalmente `WhatsApp: 3001234567` y no hay nada que adivinar.
5. `otras_sedes` es el único `repetible`, con **3 columnas** (`nombre`, `direccion`, `telefono`) y
   `maxItems: 6`. Existe **junto a** `direccion`, no en su lugar: el caso común es una sola
   ubicación y no debe costar una fila.
6. **Hay un solo campo `horario`**: `horario_atencion`. No existe un horario de despacho ni de
   entrega — esa frontera es de HU-KB-09. La línea es: esta categoría responde **cuándo atiende el
   negocio**; cuánto tarda en llegar un pedido lo responde `tiempos_entrega` en `productos`.
7. Ningún campo usa `kind: 'triestado'` — su consumidor es HU-KB-11.
8. **Las redes sociales van como `lista`**, no como campos dedicados: la lista de redes es abierta y
   cambiante (Instagram, TikTok, X, LinkedIn…), y declarar un campo por red sería adivinar cuáles
   usa cada negocio y quedarse corto igual.

### Bloque B — El texto que llega a la IA (complejidad **media**)

9. Con **todos** los campos al tope —los 7 días con sus 4 tramos, las 6 sedes con sus 3 columnas,
   las listas llenas— y `adicional` lleno, el texto serializado **cabe en `CONTENIDO_MAX` (10.000)**
   con margen. Se verifica **midiendo** con un test.
10. El `horario_atencion` se serializa **un día por línea**, en el orden canónico desde lunes, con
    sus tramos separados por `, `. Un día marcado **«cerrado» aparece en el texto** («domingo:
    cerrado»): saber que no abren es tan útil como saber cuándo abren, y es la regla que ya fijó
    HU-KB-07.
11. Un día **abierto pero sin tramos** no dice nada y **se omite**; un `horario_atencion` sin ningún
    día útil no deja encabezado.
12. Las tres secciones salen en orden canónico (`## Dónde están`, `## Cómo contactarlos`,
    `## Cuándo atienden`) y «Información adicional» al final.

### Bloque C — El modal (complejidad **baja**)

13. La tarjeta «Horarios y ubicación» **vacía** abre en modo **estructurado**, solo por figurar su
    título en `SCHEMA_POR_TITULO`. Aplica también al preset virtual.
14. La misma tarjeta **con texto libre ya escrito** sigue abriendo en modo **legado** (regla de
    retrocompatibilidad de HU-KB-07).
15. El editor de días permite marcar un día como **Cerrado** —conservando sus tramos por si vuelve a
    abrirse— y añadir hasta **4 tramos** por día. Todo esto ya lo hace `ScheduleDayEditor`: el
    criterio verifica que el schema lo cablea bien, no que el primitivo funcione.
16. > ⚠️ **SUPERSEDED por HU-KB-12.** Este criterio se cumplió y se probó, pero la decisión de
    > producto cambió: «Horarios y ubicación» pasó a ser una categoría **protegida** y su modal ya
    > **no** ofrece Eliminar (borrarla no tiene vuelta atrás). El test correspondiente se invirtió.

    **El botón Eliminar sigue estando** en este modal, porque la categoría es opcional, y el borrado
    funciona igual que antes del formulario guiado. Es el primer modal estructurado con borrado y
    hay que comprobar que el modo estructurado no lo rompe.
17. Con todos los campos vacíos no se puede guardar (el texto serializado sería vacío); basta llenar
    **cualquier** campo para poder hacerlo.
18. Guardar envía `contenido` **y** `estructura` en el mismo payload, con `schemaId: 'horarios'` y
    `schemaVersion: 1`.
19. **«Información adicional» sigue presente**, al final y fuera del acordeón, y no es un campo del
    schema.

### Bloque D — Transversales

20. **Sin cambios de backend.** `git diff` no toca `apps/backend/**`. Al no haber código de
    servidor, esta HU **no introduce superficie multi-tenant nueva**: el aislamiento lo siguen
    garantizando los endpoints existentes (`authenticateJWT → requireTenant → authorize(['admin'])`
    + repositorio `*Scoped`), que no se modifican. Por eso no lleva test de aislamiento propio.
21. **Sin cambios en la infraestructura de HU-KB-07.** `git diff` de `kb-serialize.ts` y de
    `components/` es **vacío**, ni siquiera comentarios — el mismo listón que cumplió HU-KB-09.
22. Se invocaron `emil-design-eng`, `impeccable:impeccable` y `frontend-design:frontend-design`
    **antes** de escribir o modificar cualquier componente (regla §7 del `CLAUDE.md` raíz). Si la HU
    termina sin tocar ni un componente —que es el objetivo—, se deja constancia de eso mismo.
23. `pnpm --filter @sofiapp/web build` (incluye `tsc --noEmit`), `lint` (`--max-warnings 0`) y
    `test` en verde, con la única excepción declarada de `TagSelector.test.tsx` (9 fallos
    preexistentes y ajenos).

## Dependencias

Depende de:

- **HU-KB-07** (`f2736a7`): el contrato, `DIAS_SEMANA`, `ScheduleDayEditor`, `serializeEstructura` y
  el registry.
- **HU-KB-08** (`8a62c2c`) y **HU-KB-09** (`d50c1d8`): el patrón de archivo por categoría, el
  cableado de tres líneas, el test candado de ids y el test de presupuesto medido. Esta HU copia ese
  estilo. De HU-KB-09 hereda además la disciplina de nombrar los `id` de subcampo en español
  legible, porque acaban dentro del texto que lee la IA.
- `PRESET_META` de `lib/kb-presets.ts` para el título exacto: `'Horarios y ubicación'`.

Bloquea a: nada. HU-KB-11 es independiente.

**Rama:** se trabaja y se commitea sobre **`feat/HU-KB-05`**, igual que HU-KB-06/07/08/09. **No** se
crea `feat/HU-KB-10`.

## Definición de "hecho"

El admin abre la tarjeta «Horarios y ubicación» y ve tres bloques: dónde está —con sitio para más
sedes si tiene—, cómo lo contactan —WhatsApp, teléfono y correo en campos separados, para que la IA
no confunda un número con otro— y cuándo atiende, con los siete días de la semana y sus tramos,
pudiendo marcar el domingo como cerrado sin perder el horario por si algún día vuelve a abrir. No le
exige ningún campo, porque la tarjeta es opcional y puede eliminarla cuando quiera; el botón para
hacerlo sigue ahí. Al guardar, el backend recibe el texto serializado y la estructura en la misma
petición, sin haber cambiado una línea de servidor ni de la infraestructura de HU-KB-07.
