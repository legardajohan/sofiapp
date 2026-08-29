# HU-KB-11 — Formulario guiado de «Políticas y términos» (spec)

> **Spec-Driven Development.** Este es el QUÉ y el porqué. El CÓMO va en `plan.md`; la ejecución
> en `tasks.md`. HU **100 % frontend**. Cuarta y **última** categoría con forma propia: cierra la
> serie HU-KB-07 → HU-KB-11 y es el **primer uso pleno del `kind: 'triestado'`** y de su primitivo
> `PolicyTriState`, cuyo comentario ya apunta aquí.

**Estado:** implementado

## Historia

Como **admin** de un tenant, quiero que la tarjeta «Políticas y términos» me pregunte una por una las
**reglas que rigen mi relación con el cliente** —devoluciones, cambios, garantía, reservas, mascotas,
mínimos— con respuestas de **Sí / No / No aplica** y espacio para las condiciones, para que la IA
conteste «¿puedo devolverlo?» con la política real del negocio y **no diga que no hay política cuando
la verdad es que la pregunta no aplica**.

## Contexto: dónde estamos

| Categoría | Preset | Estado |
|---|---|---|
| Información de la empresa | obligatorio | hecha — HU-KB-08 (`8a62c2c`) |
| Productos y servicios | obligatorio | hecha — HU-KB-09 (`d50c1d8`) |
| Horarios y ubicación | opcional | hecha — HU-KB-10 (`b5cdd94`) |
| **Políticas y términos** | **opcional** | **HU-KB-11 (esta)** |
| Información Complementaria | opcional | hecha — HU-KB-07, schema `generico` |

Tres cosas distinguen a esta categoría de las tres anteriores:

1. **Es la categoría de las preguntas, no la de los datos.** Las otras tres describen al negocio
   (quién es, qué vende, dónde está). Esta responde interrogatorios: «¿aceptan devoluciones?»,
   «¿puedo llevar a mi perro?». Por eso su control natural es el tri-estado y no el campo de texto.
2. **Estrena de verdad el tercer estado.** `parte_de_grupo` (HU-KB-08) ya usa `triestado`, pero
   suelto. Aquí hay **seis en fila**, y el «No aplica» pasa de ser un detalle a ser el corazón del
   diseño (criterio 9).
3. **Cierra la serie.** Al registrar su título, **ninguna categoría del preset queda sin schema**.
   El camino «sin schema → legado» del `modoEditor` deja de tener un preset que lo ejercite y pasa a
   describir solo a los documentos de título libre (ver criterio 17 y el desvío anticipado en
   `tasks.md`).

## Objetivo técnico

Declarar el schema `politicas` y registrar su título. El cableado son **tres líneas aditivas** en
`kb-schemas.ts`, igual que en HU-KB-08, HU-KB-09 y HU-KB-10.

Esta categoría es dueña de una sola cosa: **las reglas que rigen la relación comercial**. Qué pasa
con lo que ya se vendió (devolución, cambio, garantía) y qué condiciones exige ser atendido (reserva,
mascotas, mínimos), más los términos formales que aplican a toda compra.

## Alcance

### Incluye

- `lib/schemas/politicas.schema.ts` **(nuevo)** — `POLITICAS_SCHEMA` (2 secciones, 8 campos: seis
  `triestado` y dos `texto-largo`).
- `lib/kb-schemas.ts` — tres añadidos **puramente aditivos**: `'politicas'` en la unión `KbSchemaId`,
  la entrada en `KB_SCHEMAS` y la entrada en `SCHEMA_POR_TITULO` con el título exacto de
  `PRESET_META`: `'Políticas y términos'`.
- Tests: unitarios del schema (ids congelados, presupuesto medido, forma del texto del `triestado` y
  la distinción «No» / «No aplica») e integración RTL de los dos modos, del tri-estado con su detalle
  condicional y del **borrado** sobre esta categoría.

### Fuera de alcance

- **`apps/backend/**` por completo.**
- **La infraestructura de HU-KB-07**: `KnowledgeStructuredForm.tsx`, `kb-serialize.ts` y los seis
  primitivos, **incluido `PolicyTriState`**. Se consumen sin modificarlos. HU-KB-09 estrenó el
  `repetible` y HU-KB-10 el `horario` sin tocar una línea; el listón para el `triestado` es el mismo.
  Si algo obligara a tocarlos, **se para y se levanta como hallazgo** del contrato — no se parchea
  aquí. Esta HU ya llega con **dos hallazgos identificados (H1 y H2)** y **ninguno de los dos se
  parchea** (ver «Hallazgos del contrato de HU-KB-07»).

**Cinco fronteras ya pactadas, que este spec declara explícitamente:**

- **Entrega y despacho → HU-KB-09.** `modalidades_entrega` y `tiempos_entrega` describen **cómo llega
  lo que se vende**. La sentencia, que es la frontera más fina de las cinco: **cómo llega lo que se
  vende → HU-KB-09; HU-KB-11 solo entra cuando la pregunta es qué pasa con lo ya vendido.** Este
  schema **no** declara ningún campo de envíos: ni «¿hacen envíos?» como tri-estado, ni costo de
  envío, ni cobertura. Caso límite resuelto: **«¿quién paga el envío de una devolución?» → detalle de
  `acepta_devoluciones`**, porque lo que se describe ahí es la política de devolución, no la
  modalidad de entrega. Ver criterio 5.
- **Dirección, canales de contacto y horarios → HU-KB-10.** Ningún campo de ubicación ni de agenda.
  «¿Se atiende con reserva?» **no** es un horario: no dice cuándo abren, dice qué condición hay que
  cumplir para ser atendido (criterio 6).
- **Identidad, misión y zonas de cobertura → HU-KB-08.** Ningún campo de la empresa.
- **Catálogo y precios → HU-KB-09.** Ningún campo de producto. «¿Hay consumo o pedido mínimo?» **no**
  es un precio: no dice cuánto cuesta algo, dice qué condición hay que cumplir para comprarlo
  (criterio 7).
- **Formas de pago → HU-KB-09.** Ya tienen dueño: `formas_pago` (`kind: 'lista'`, 8 ítems) vive en el
  schema `productos`, sección «Precios y condiciones». Este schema **no** declara ninguna lista de
  medios de pago; su `ayuda` de `otras_politicas` remite a esa categoría para que nadie la duplique
  aquí.

Además quedan fuera: el tono de voz de la IA, que es configuración del prompt (`HT-AI-01`) y no
conocimiento recuperable, y cualquier migración de texto libre a estructura
(`migrarLegadoAEstructura` sigue sin consumidor de UI, tal como decidió HU-KB-08).

- **La vista principal** y el resto del modal: encabezado, leyenda de versión, contador global,
  borrado y flujo de guardado no se tocan. La vista de tarjetas **no cambia**.

## Criterios de aceptación

### Bloque A — El schema (complejidad **media**)

1. Existe `POLITICAS_SCHEMA` con `id: 'politicas'`, `version: 1` y **2 secciones**: `politicas` y
   `terminos`.
2. Los **8 campos** son exactamente los de la tabla de `plan.md`, con sus `id`, `kind`, `requisito` y
   topes. Los `id` quedan **congelados**.
3. **Cero campos obligatorios**, con la misma vara que HU-KB-10 y una razón aún más fuerte:
   **cualquier** política es «No aplica» para algún negocio (una asesoría no acepta devoluciones, una
   tienda online no admite mascotas), y exigir una respuesta en una categoría **opcional y
   eliminable** sería contradictorio. El piso lo pone `contenidoListo` del editor —con todos los
   campos en blanco el texto serializado es la cadena vacía y no se puede guardar—, no la coerción.
4. **Seis campos `triestado`**, repartidos 3 + 3 entre las dos familias de negocio que conviven en un
   mismo schema: **post-venta** (`acepta_devoluciones`, `acepta_cambios`, `ofrece_garantia`) y
   **atención** (`requiere_reserva`, `admite_mascotas`, `consumo_minimo`). El 3 + 3 es una
   **heurística de cobertura, no una simetría que haya que respetar al llenar**: sirve para que
   ningún tipo de negocio abra el formulario y no encuentre nada suyo. Un negocio puede responder
   «No aplica» a **las seis** y eso ya es dato (criterio 9). Las dos familias van en la **misma**
   sección precisamente para no sugerir un reparto obligatorio.
5. **Ningún campo de envíos, entrega, despacho ni logística.** El corte con HU-KB-09 se declara así y
   queda escrito en el propio schema: *describir cómo llega lo que se vende es HU-KB-09; HU-KB-11
   entra solo cuando la pregunta es qué pasa con lo que ya se vendió*. Un tri-estado «¿hacen envíos?»
   duplicaría `modalidades_entrega` con **peor** resolución (la lista dice *cuáles*; el tri-estado
   solo diría *sí*). Caso límite resuelto: **«¿quién paga el envío de una devolución?» es una
   condición de la devolución**, y por tanto va en el detalle de `acepta_devoluciones`, no en
   `productos`.
6. `requiere_reserva` **no cruza a HU-KB-10**: no declara días ni horas. Su detalle recoge la
   condición («Sí — con 24 h de anticipación; después se cobra el 50 %»), que es también donde vive
   la política de cancelación.
7. `consumo_minimo` **no cruza a HU-KB-09**: no declara importes de catálogo. Responde si existe un
   mínimo y bajo qué condición, no cuánto vale cada producto.
8. Ningún campo se llama «Información adicional» ni ocupa su lugar: sigue siendo el `adicional` del
   sobre, fuera del acordeón y fuera del schema.

### Bloque B — El texto que llega a la IA (complejidad **media**)

9. **«No aplica» se serializa como una respuesta con valor propio, distinta de «No».** El texto dice
   `¿Aceptan devoluciones?: No aplica` y **nunca** omite el campo. Es la razón de ser del tercer
   estado y se verifica con un test explícito: sin él, «no tenemos política de devoluciones» y «no
   vendemos productos físicos» quedarían indistinguibles y la IA respondería lo mismo en dos
   situaciones opuestas. La regla ya está implementada —`valorVacio` devuelve `false` para todo
   `triestado` presente—; el criterio verifica que este schema la aprovecha y que no se rompe.
10. Un `triestado` respondido «Sí» **con** detalle se serializa como
    `¿Aceptan devoluciones?: Sí — 30 días con factura`; sin detalle, como `…: Sí`. Sin encabezado
    huérfano ni guion suelto.
11. Un `triestado` que el admin **nunca respondió** (ausente de `campos`) **no aparece** en el texto.
    No se pre-llena la estructura con «No aplica» implícitos: la IA no debe leer como respuesta algo
    que nadie contestó (ver observación **H1**).
12. Con **todos** los campos al tope —los 6 detalles a 300 caracteres, los dos textos largos llenos—
    y `adicional` lleno, el texto serializado **cabe en `CONTENIDO_MAX` (10.000)** con margen. Se
    verifica **midiendo** con un test, no estimando.
13. Las dos secciones salen en orden canónico (`## Políticas frecuentes`, `## Términos y
    condiciones`) y «Información adicional» al final.

### Bloque C — El modal (complejidad **baja**)

14. La tarjeta «Políticas y términos» **vacía** abre en modo **estructurado**, solo por figurar su
    título en `SCHEMA_POR_TITULO`. Aplica también al preset virtual.
15. La misma tarjeta **con texto libre ya escrito** sigue abriendo en modo **legado** (regla de
    retrocompatibilidad de HU-KB-07).
16. El detalle de cada política **solo se pide al responder «Sí»** (`detalleEn=['si']`, el
    comportamiento fijo de `PolicyTriState`): aparece al marcar «Sí» y se repliega al cambiar a «No»
    o «No aplica», **conservando** lo escrito por si el admin vuelve. Se acepta tal cual y se
    documenta su límite en **H2**.
17. > ⚠️ **SUPERSEDED por HU-KB-12.** Este criterio se cumplió y se probó, pero la decisión de
    > producto cambió: «Políticas y términos» pasó a ser una categoría **protegida** y su modal ya
    > **no** ofrece Eliminar. El test correspondiente se invirtió.

    **El botón Eliminar sigue estando** en este modal —la categoría es opcional— y el borrado
    funciona igual que antes del formulario guiado, como ya se comprobó en HU-KB-10.
18. Con todos los campos vacíos no se puede guardar; basta responder **una** política —incluso con
    «No aplica»— para poder hacerlo, porque un `triestado` respondido nunca está vacío. **Matiz
    descubierto al implementar (H1):** pulsar «No aplica» sobre el radio que ya nace marcado **no**
    cuenta como respuesta —el `RadioGroup` no emite cambio—, así que llegar a «No aplica» exige pasar
    por otra opción y volver. El criterio se verifica con ese camino y el comportamiento queda
    fijado por test; **no** se parchea el primitivo.
19. Guardar envía `contenido` **y** `estructura` en el mismo payload, con `schemaId: 'politicas'` y
    `schemaVersion: 1`.
20. **«Información adicional» sigue presente**, al final y fuera del acordeón.

### Bloque D — Transversales

21. **Sin cambios de backend.** `git diff` no toca `apps/backend/**`. Al no haber código de servidor,
    esta HU **no introduce superficie multi-tenant nueva**: el aislamiento lo siguen garantizando los
    endpoints existentes (`authenticateJWT → requireTenant → authorize(['admin'])` + repositorio
    `*Scoped`), que no se modifican. Por eso no lleva test de aislamiento propio.
22. **Sin cambios en la infraestructura de HU-KB-07.** `git diff` de `kb-serialize.ts` y de
    `components/` es **vacío**, ni siquiera comentarios — el mismo listón que cumplieron HU-KB-09 y
    HU-KB-10. Las dos observaciones del contrato se **documentan**, no se parchean.
23. Se invocaron `emil-design-eng`, `impeccable:impeccable` y `frontend-design:frontend-design`
    **antes** de escribir o modificar cualquier componente (regla §7 del `CLAUDE.md` raíz). Si la HU
    termina sin tocar ni un componente —que es el objetivo—, se deja constancia de eso mismo.
24. `pnpm --filter @sofiapp/web build` (incluye `tsc --noEmit`), `lint` (`--max-warnings 0`) y `test`
    en verde, con la única excepción declarada de `TagSelector.test.tsx` (9 fallos preexistentes y
    ajenos).

## Hallazgos del contrato de HU-KB-07 (se documentan, **no** se arreglan aquí)

Mismo tratamiento que H1 y H2 en HU-KB-09: se registran, se mitigan con lo que esta HU sí controla y
**el arreglo real queda para una HU propia**. Los dos aparecen por primera vez con seis tri-estados
en fila; ninguno bloquea esta HU y **ninguno justifica tocar la infraestructura**.

- **H1 — «No aplica» no se puede responder pulsándolo.** Registrado al planear como «sin responder y
  “No aplica” se ven igual», y **confirmado al implementar en una forma bastante más aguda**, con dos
  tests de integración que fallaron hasta encodificar el comportamiento real.

  `PolicyTriState` nace con el radio «No aplica» marcado (`leerTriestado` devuelve `'na'` cuando el
  campo está ausente), pero el campo **no** entra en `campos` hasta que el `RadioGroup` emite un
  cambio. Y un `RadioGroup` **no emite nada al pulsar la opción que ya está marcada**. De ahí que:
  1. no respondido y respondido «No aplica» se vean idénticos en pantalla y se **serialicen distinto**
     (el primero se omite, el segundo se escribe); y
  2. **el camino directo para responder «No aplica» no exista**: hay que pasar por «Sí» o «No» y
     volver. Justo la respuesta más frecuente de esta categoría —tres de las seis preguntas no
     describen a un negocio cualquiera— es la única que no se puede dar de un clic.

  El coste real no es la molestia: es que el admin cree haber contestado «No aplica» a las seis, no
  haya nada en `campos` y la IA se quede sin la información que evita responder «no aceptan
  devoluciones» a quien simplemente no vende productos físicos. En HU-KB-08, con un solo tri-estado
  opcional entre campos de texto, era invisible.

  **Mitigación dentro de esta HU, sin tocar código ajeno:** la `descripcion` de la sección, el
  contador de la sección (`0 de 6`, que sí distingue ausente de respondido porque
  `camposFaltantes`/`valorVacio` lo distinguen) y **dos tests que dejan el comportamiento fijado por
  escrito** en vez de descubierto por sorpresa.
  **Para una HU futura:** que el radio nazca sin selección, o que el contrato gane un estado «sin
  responder» explícito. Las dos tocan `PolicyTriState` y **afectan también a HU-KB-08**
  (`parte_de_grupo`), así que el arreglo es transversal → HU propia, nunca un parche de esta.
- **H2 — `detalleEn` no es configurable por campo.** El contrato (`KbFieldDef`) no expone
  `detalleEn`; el valor por defecto de `PolicyTriState` (`['si']`) es el único vigente. Para las seis
  políticas elegidas funciona bien: el detalle útil está casi siempre en el «Sí» («Sí — 30 días con
  factura»). El límite real es la **excepción sobre un «No»** («No admitimos mascotas, salvo perros
  guía»), que hoy no cabe en el campo.
  **Mitigación dentro de esta HU:** `otras_politicas` existe justamente para eso, y su `ayuda` lo
  dice. **Para una HU futura:** añadir `detalleEn` opcional a `KbFieldDef` y pasarlo a
  `PolicyTriState`. Es aditivo y compatible, pero toca contrato + componente → HU propia.

## Dependencias

Depende de:

- **HU-KB-07** (`f2736a7`): el contrato, `PolicyTriState`, `LIMITE_POR_KIND.triestado` (300),
  `valorVacio` con su excepción del tri-estado, `serializeEstructura` con `ETIQUETA_TRIESTADO` y el
  registry.
- **HU-KB-08** (`8a62c2c`), **HU-KB-09** (`d50c1d8`) y **HU-KB-10** (`b5cdd94`): el patrón de archivo
  por categoría, el cableado de tres líneas, el test candado de ids y el test de presupuesto medido.
  Esta HU copia ese estilo. De HU-KB-08 hereda además el precedente de `parte_de_grupo` como primer
  `triestado`, y de HU-KB-10 la vara de los **cero obligatorios** en una categoría opcional.
- `PRESET_META` de `lib/kb-presets.ts` para el título exacto: `'Políticas y términos'`.

Bloquea a: nada. Cierra la serie 07–11.

**Rama:** se trabaja y se commitea sobre **`feat/HU-KB-05`**, igual que HU-KB-06/07/08/09/10. **No**
se crea `feat/HU-KB-11`.

## Definición de "hecho"

El admin abre la tarjeta «Políticas y términos» y encuentra seis preguntas directas —devoluciones,
cambios, garantía, reserva, mascotas, mínimos— que responde con Sí, No o **No aplica**, y cada «Sí»
le abre un espacio para las condiciones («30 días con factura»). Lo que no cabe en una de esas seis
lo escribe abajo, junto a sus términos y condiciones. No le exige ningún campo, porque la tarjeta es
opcional y puede eliminarla cuando quiera: el botón sigue ahí. Al guardar, el backend recibe el texto
serializado y la estructura en la misma petición —con «No aplica» escrito tal cual, para que la IA
sepa distinguir «no lo hacemos» de «esa pregunta no describe a este negocio»— sin haber cambiado una
línea de servidor ni de la infraestructura de HU-KB-07.
