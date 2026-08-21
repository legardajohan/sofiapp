# HU-KB-11 — Plan técnico (CÓMO)

> Un archivo nuevo con la declaración del schema y tres líneas aditivas en el registry, igual que
> HU-KB-08, HU-KB-09 y HU-KB-10. Lo específico aquí es que **seis tri-estados en fila** convierten al
> «No aplica» en la decisión de diseño central, y que la frontera con la entrega (HU-KB-09) es la más
> fina de las cinco que declara el `spec.md`.

## Archivos a crear / tocar

```
apps/frontend/src/features/knowledge-base/
├── lib/schemas/politicas.schema.ts         # NUEVO  — POLITICAS_SCHEMA (2 secciones, 8 campos)
├── lib/schemas/politicas.schema.test.ts    # NUEVO  — ids congelados, presupuesto, «No» vs «No aplica»
├── lib/kb-schemas.ts                       # TOCAR  — 3 líneas aditivas (unión + KB_SCHEMAS + registry)
├── lib/kb-schemas.test.ts                  # TOCAR  — registry + el desvío de «la única sin schema»
├── lib/schemas/empresa.schema.ts           # TOCAR  — 1 línea de COMENTARIO (deriva de doc, ver P7)
└── pages/KnowledgeBasePage.test.tsx        # TOCAR  — integración: modos, tri-estado, borrado, desvío
```

**No se tocan:** `apps/backend/**` (entero), `kb-serialize.ts`, `KnowledgeStructuredForm.tsx`,
`PolicyTriState.tsx` ni ningún otro primitivo —**ni siquiera en comentarios**—,
`KnowledgeUploadEditor.tsx`, `KnowledgeDocumentDialog.tsx`, `kb-presets.ts` ni la vista principal.

`empresa.schema.ts` es la única excepción y está **aprobada** (pregunta 7): su comentario de cabecera
atribuye los «envíos» a HU-KB-11, y son de HU-KB-09 desde que se planeó esa HU. Es una línea de
comentario, sin efecto en runtime, en un schema de categoría —**no** en infraestructura de HU-KB-07—,
así que no compromete el criterio 22. Precedente: HU-KB-08 ya corrigió comentarios ajenos.

---

## Contrato — `lib/schemas/politicas.schema.ts`

```ts
import type { KbSchemaDef } from '../kb-schemas.js';   // solo tipo: sin ciclo en runtime

export const POLITICAS_SCHEMA: KbSchemaDef = { id: 'politicas', version: 1, secciones: [ … ] };
```

### Los 8 campos

| # | Sección | `id` (congelado) | Etiqueta | `kind` | Requisito | Tope |
|---|---|---|---|---|---|---|
| 1 | `politicas` | `acepta_devoluciones` | ¿Aceptan devoluciones? | `triestado` | opcional | 300 (detalle) |
| 2 | `politicas` | `acepta_cambios` | ¿Hacen cambios? | `triestado` | opcional | 300 (detalle) |
| 3 | `politicas` | `ofrece_garantia` | ¿Ofrecen garantía? | `triestado` | opcional | 300 (detalle) |
| 4 | `politicas` | `requiere_reserva` | ¿Se atiende con reserva o cita previa? | `triestado` | opcional | 300 (detalle) |
| 5 | `politicas` | `admite_mascotas` | ¿Admiten mascotas? | `triestado` | opcional | 300 (detalle) |
| 6 | `politicas` | `consumo_minimo` | ¿Hay consumo o pedido mínimo? | `triestado` | opcional | 300 (detalle) |
| 7 | `terminos` | `otras_politicas` | Otras políticas | `texto-largo` | opcional | 800 |
| 8 | `terminos` | `terminos_generales` | Términos y condiciones | `texto-largo` | opcional | 1500 |

### Secciones

```ts
{ id: 'politicas', titulo: 'Políticas frecuentes',    descripcion: 'Lo que más preguntan los clientes' }
{ id: 'terminos',  titulo: 'Términos y condiciones',  descripcion: 'Lo que no cabe en un sí o un no' }
```

**Dos secciones, no tres.** La primera agrupa lo que se responde con un botón; la segunda, lo que hay
que escribir. Es la división que el admin percibe al abrir el modal (seis radios seguidos, luego dos
áreas de texto) y la que produce un texto legible para la IA: un bloque de hechos cortos y
auto-descritos, y un bloque de prosa. Partir las seis preguntas en «post-venta» y «atención» sería
una tercera sección que **no** ayuda a nadie: el admin de una tienda vería una sección entera en «No
aplica» y pensaría que se equivocó de formulario, cuando esa respuesta es justamente la correcta.

### Las ayudas de cada campo (copy)

El `ayuda` no es decoración: es lo único que evita que el admin cruce una frontera o deje una
excepción sin escribir.

| Campo | `ayuda` |
|---|---|
| `acepta_devoluciones` | Si es «Sí», di el plazo y las condiciones: «30 días con factura y empaque original». |
| `acepta_cambios` | Un cambio no es una devolución: aquí va el cambio por talla, color o referencia. |
| `ofrece_garantia` | Si es «Sí», di cuánto dura y qué cubre. |
| `requiere_reserva` | Si es «Sí», di con cuánta anticipación y qué pasa si el cliente cancela. |
| `admite_mascotas` | Si hay excepciones a un «No» (perros guía, zonas al aire libre), escríbelas en «Otras políticas». |
| `consumo_minimo` | Si es «Sí», di de cuánto es y cuándo aplica. |
| `otras_politicas` | Reglas que no están arriba: edades mínimas, parqueadero, acompañantes… Las formas de pago van en «Productos y servicios». |
| `terminos_generales` | Las condiciones que aplican a toda compra. Un resumen en tus palabras funciona mejor que el texto legal completo. |

Las dos ayudas de la sección 2 hacen trabajo pesado:

- La de `otras_politicas` es la **mitigación declarada de H2** (el detalle solo se pide en «Sí»): es
  el sitio donde caben las excepciones sobre un «No».
- La de `terminos_generales` desalienta pegar 8.000 caracteres de texto legal. El tope de 1.500 lo
  impide de todos modos, pero el copy explica el porqué: lo que se pega ahí lo va a leer una IA para
  contestar por WhatsApp, y un párrafo claro recupera mejor que un contrato entero.

---

## Decisiones de diseño

### Por qué **seis** tri-estados y no una lista libre de políticas

Es la decisión de partida. La alternativa obvia era un `repetible` de (política, respuesta,
condiciones), que cubriría cualquier negocio sin adivinar.

| Opción | Qué acaba en el texto indexado | Problema |
|---|---|---|
| **6 `triestado` (elegida)** | `¿Aceptan devoluciones?: Sí — 30 días con factura` | Solo cubre seis preguntas… que son las seis que más se preguntan |
| `repetible` (política + respuesta) | `- politica: devoluciones · respuesta: sí, 30 días` | **Pierde el tri-estado**: no hay forma de decir «no aplica». Y el admin nombra la política a mano («devolución», «devoluciones», «cambios y devoluciones») → la IA recupera ruido |
| Un solo `texto-largo` de políticas | prosa | Un párrafo no responde «¿puedo devolverlo?» con la precisión de un Sí/No |

El `repetible` pierde justo lo que hace valiosa a esta categoría (criterio 9) y traslada al admin la
responsabilidad de nombrar bien —el mismo argumento con el que HU-KB-10 descartó una lista de
contactos—. Las seis preguntas fijas producen un texto **auto-descrito**: la etiqueta *es* la
pregunta que el cliente hará. Lo que no cabe en las seis lo recoge `otras_politicas`.

### Por qué estas seis, repartidas 3 + 3

Un solo schema atiende a dos familias de negocio que casi no se solapan:

| Familia | Preguntas | Negocio típico |
|---|---|---|
| **Post-venta** | devoluciones, cambios, garantía | tienda, distribuidor, e-commerce |
| **Atención** | reserva, mascotas, consumo/pedido mínimo | restaurante, bar, salón, consultorio |

**El 3 + 3 es una heurística de cobertura, no una simetría sagrada.** Sirve para que ningún tipo de
negocio abra el formulario y no encuentre nada suyo; no significa que cada admin deba llenar tres y
descartar tres. Un negocio puede responder «No aplica» a **las seis** y eso ya es dato: es lo que
impide que la IA invente una política de devoluciones donde no la hay. Nada en el schema fuerza el
reparto — las dos familias van en la **misma** sección precisamente para no sugerirlo.

Descartadas del set fijo, a propósito: **restricción de edad** (muy útil pero para pocos rubros),
**política de cancelación** (cabe en el detalle de `requiere_reserva`) y **tratamiento de datos**
(cabe en `terminos_generales`, y ningún cliente se lo pregunta a un bot de WhatsApp). Las tres caben
en `otras_politicas`, que para eso está.

### Dónde se corta con **la entrega** (HU-KB-09) — la frontera fina

Es la única frontera donde un tri-estado plausible («¿hacen envíos?») estaría **mal** aquí. La regla:

- **Cómo llega lo que se vende** → HU-KB-09. `modalidades_entrega` (domicilio, recoger en tienda,
  envío nacional) y `tiempos_entrega`. También el costo del envío y a dónde llega
  (`zonas_cobertura`, HU-KB-08).
- **Qué pasa con lo que ya se vendió** → HU-KB-11. Devolver, cambiar, reclamar garantía.

Un `¿hacen envíos?: Sí` sería **peor** que lo que ya existe: `modalidades_entrega` es una `lista` que
dice *cuáles*; el tri-estado solo diría *sí*, duplicando el hecho con menos resolución y dejando a la
IA con dos fuentes que pueden contradecirse.

Caso límite, resuelto y escrito en el schema: **«¿quién paga el envío de una devolución?»** es una
condición de la devolución → va en el detalle de `acepta_devoluciones`. El envío aparece en la frase,
pero lo que se está describiendo es la política de devolución, no la modalidad de entrega.

Las otras dos fronteras finas, con la misma prueba:

| Pregunta | Aquí | Allá |
|---|---|---|
| «¿Se atiende con reserva?» | Condición para ser atendido → `requiere_reserva` | «¿A qué hora abren?» → `horario_atencion` (HU-KB-10) |
| «¿Hay pedido mínimo?» | Condición para comprar → `consumo_minimo` | «¿Cuánto cuesta X?» → `precios` (HU-KB-09) |

### Por qué **cero** campos obligatorios

Misma vara que HU-KB-10 y con un argumento aún más limpio: **el tri-estado ya tiene una respuesta
para «esto no me describe»**. Si «No aplica» es siempre una respuesta legítima, marcar el campo como
obligatorio no aporta ningún dato — solo obliga a pulsar un botón. Y la categoría es **opcional y
eliminable**: exigir para guardar contradice que el admin pueda borrar la tarjeta entera.

El piso ya existe sin coerción: `contenidoListo` en `KnowledgeUploadEditor` impide crear con el texto
serializado vacío, y con todos los campos sin tocar el texto es la cadena vacía. Basta **una**
respuesta —aunque sea «No aplica»— para poder guardar, porque un `triestado` presente nunca está
vacío (`valorVacio`).

### Campos deliberadamente NO incluidos

| Campo | Por qué no | Dónde va |
|---|---|---|
| «¿Hacen envíos?», costo de envío | Describe cómo llega lo que se vende | `modalidades_entrega` / `tiempos_entrega` (HU-KB-09) |
| Zonas a las que despachan | Es alcance del negocio | `zonas_cobertura` (HU-KB-08) |
| Horario de reservas, agenda | Es cuándo atienden | `horario_atencion` (HU-KB-10) |
| Precios, valor del mínimo como campo propio | Es cuánto cuesta lo que se vende | `precios` (HU-KB-09) |
| Política de cancelación como campo propio | Es la condición de la reserva | detalle de `requiere_reserva` |
| Edad mínima, parqueadero, acompañantes | Muy específicos de un rubro; un campo por cada uno sería un formulario infinito | `otras_politicas` |
| Formas de pago | **Ya tienen dueño**: `formas_pago` (`lista`, 8 ítems) existe en `productos.schema.ts`, sección «Precios y condiciones». Declararla aquí sería duplicar conocimiento en dos categorías y dejar a la IA con dos fuentes que pueden contradecirse | `formas_pago` (HU-KB-09); la `ayuda` de `otras_politicas` remite ahí |
| Tratamiento de datos / habeas data | Nadie se lo pregunta a un bot de ventas | `terminos_generales` |

---

## Contrato — `lib/kb-schemas.ts` (tres líneas aditivas)

```ts
export type KbSchemaId = 'generico' | 'empresa' | 'productos' | 'horarios' | 'politicas';

export const KB_SCHEMAS = { …, politicas: POLITICAS_SCHEMA };

const SCHEMA_POR_TITULO = {
  …,
  [normalizeTitulo('Políticas y términos')]: 'politicas',   // título exacto de PRESET_META
};
```

Con esta tercera línea **ningún preset queda sin schema**. Es un cambio de estado del sistema, no
solo una entrada más: los tests que usaban «Políticas y términos» como ejemplo de categoría sin
schema dejan de tener sujeto (ver el desvío anticipado en `tasks.md`).

---

## Presupuesto de caracteres (criterio 12)

El tri-estado es el `kind` más barato del contrato: etiqueta + respuesta + un detalle de 300.

```
"¿Aceptan devoluciones?"   22
": " + "Sí" + " — "         7
detalle al tope           300
                          ───
              por pregunta 329   (varía solo por el largo de la etiqueta)
```

| Bloque | Cálculo | Caracteres |
|---|---|---|
| `## Políticas frecuentes` | 23 + salto | 24 |
| 6 tri-estados al tope | 140 (etiquetas) + 6 × 307 + 5 saltos | 1.987 |
| `## Términos y condiciones` | 25 + salto | 26 |
| `otras_politicas` | 15 + 2 + 800 + salto | 818 |
| `terminos_generales` | 22 + 2 + 1.500 | 1.524 |
| Separadores entre bloques | `\n\n` × 2 | 4 |
| `## Información adicional` + texto | 25 + 1.500 | 1.525 |
| **Total** | | **≈ 5.908** |

Margen sobre `CONTENIDO_MAX` (10.000): **≈ 4.092**, comparable al de HU-KB-10.

El dato que conviene recordar: **los dos textos largos cuestan más que las seis preguntas juntas**
(2.342 contra 1.987). Si algún día hay que recortar aquí, el candidato es `terminos_generales`, no el
número de políticas. Aun así el criterio 12 exige un test que **mida**.

---

## Notas

- **Esta HU no debería tocar ningún componente.** HU-KB-09 estrenó el `repetible` y HU-KB-10 el
  `horario` sin tocar una línea de infraestructura; el listón para el `triestado` es el mismo. Los
  dos hallazgos del contrato (**H1** y **H2** en `spec.md`) se documentan y **no se arreglan aquí**:
  los dos afectan también a HU-KB-08 (`parte_de_grupo`), así que arreglarlos es una HU propia, no un
  parche de esta. Mismo tratamiento que H1/H2 en HU-KB-09.
- **El comentario de `PolicyTriState` ya apunta aquí.** Dice que su consumidor principal llega en
  HU-KB-11; al implementar deja de describir trabajo futuro y pasa a ser cierto. **No hay que
  editarlo** — sigue siendo verdad, y tocarlo rompería el criterio 22 sin ganancia.
- **Segundo modal estructurado con borrado**, después de HU-KB-10. El camino ya está probado, pero se
  vuelve a verificar aquí porque es barato y porque es la única categoría opcional que queda.
- **Los `id` son para siempre.** `acepta_devoluciones` no puede pasar a `devoluciones` ni
  `consumo_minimo` a `minimo`. Para cambiar lo que se lee en pantalla está `etiqueta` — y en este
  schema las etiquetas son preguntas completas justamente porque acaban en el texto que lee la IA.
- **`version: 1` y cuándo subirla.** La suben los cambios incompatibles: cambiar el `kind` de un
  campo, retirar uno o convertirlo en obligatorio. Añadir una séptima política **no** la sube.
- **Complejidad: media-baja.** Sin `kind` nuevo que estrenar y con el presupuesto holgado. Lo que hay
  que cuidar es que no se cuele un campo de envíos y que el «No aplica» quede documentado y probado.

## Verificación

- `pnpm --filter @sofiapp/web build` (incluye `tsc --noEmit`).
- `pnpm --filter @sofiapp/web lint` (`--max-warnings 0`).
- `pnpm --filter @sofiapp/web test`.
- `git diff --stat -- apps/backend` → vacío (criterio 21).
- `git diff --stat -- apps/frontend/src/features/knowledge-base/lib/kb-serialize.ts apps/frontend/src/features/knowledge-base/components` → **vacío** (criterio 22).
- `grep -rn "bg-\[#" apps/frontend/src/features/knowledge-base` → sin resultados.

> **Filtros de pnpm.** Los paquetes son `@sofiapp/web` y `@sofiapp/api`. Esta HU no ejecuta los del
> backend porque no lo toca.
