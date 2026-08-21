# HU-KB-09 — Plan técnico (CÓMO)

> Un archivo nuevo con la declaración del schema y tres líneas aditivas en el registry, igual que
> HU-KB-08. La diferencia está en el presupuesto: el `repetible` se come el 40 % del texto y hay que
> dimensionarlo con la calculadora, no con el ojo.

## Archivos a crear / tocar

```
apps/frontend/src/features/knowledge-base/
├── lib/schemas/productos.schema.ts        # NUEVO  — PRODUCTOS_SCHEMA (3 secciones, 8 campos)
├── lib/schemas/productos.schema.test.ts   # NUEVO  — ids congelados, obligatorios, presupuesto
├── lib/kb-schemas.ts                      # TOCAR  — 3 líneas aditivas (unión + KB_SCHEMAS + registry)
├── lib/kb-schemas.test.ts                 # TOCAR  — el registry resuelve el título nuevo
└── pages/KnowledgeBasePage.test.tsx       # TOCAR  — integración de los dos modos en esta categoría
```

**No se tocan:** `apps/backend/**` (entero), `kb-serialize.ts`, `KnowledgeStructuredForm.tsx`,
`RepeatableList.tsx` ni ningún otro primitivo —**ni siquiera en comentarios**—,
`KnowledgeUploadEditor.tsx`, `KnowledgeDocumentDialog.tsx`, `kb-presets.ts`, `KnowledgeCard.tsx`,
`KnowledgeGrid.tsx`, `KnowledgeToolbar.tsx` ni `KnowledgeBasePage.tsx`.

---

## Contrato — `lib/schemas/productos.schema.ts`

```ts
import type { KbSchemaDef } from '../kb-schemas.js';   // solo tipo: sin ciclo en runtime

export const PRODUCTOS_SCHEMA: KbSchemaDef = { id: 'productos', version: 1, secciones: [ … ] };
```

### Los 7 campos

| # | Sección | `id` (congelado) | Etiqueta | `kind` | Requisito | Tope |
|---|---|---|---|---|---|---|
| 1 | `oferta` | `resumen_oferta` | ¿Qué vende o qué servicios presta? | `texto-largo` | **obligatorio** | 600 |
| 2 | `oferta` | `catalogo` | Productos y servicios | `repetible` | **obligatorio** | 12 filas × 2 col. |
| 3 | `precios` | `notas_precios` | Cómo se cotiza | `texto-medio` | opcional | 300 |
| 4 | `precios` | `formas_pago` | Formas de pago | `lista` | opcional | 60 × 8 |
| 5 | `precios` | `promociones` | Promociones o descuentos | `texto-medio` | opcional | 300 |
| 6 | `entrega` | `modalidades_entrega` | Cómo se entrega | `lista` | opcional | 60 × 6 |
| 7 | `entrega` | `tiempos_entrega` | Tiempos de entrega | `texto-medio` | opcional | 300 |

### Las columnas del `repetible`

```ts
{
  id: 'catalogo',
  etiqueta: 'Productos y servicios',
  kind: 'repetible',
  requisito: 'obligatorio',
  maxItems: 12,
  subcampos: [
    { id: 'nombre',      etiqueta: 'Nombre',      maxLength: 60  },
    { id: 'descripcion', etiqueta: 'Descripción', maxLength: 120 },
  ],
}
```

> **Por qué no hay columna de precio.** Es la decisión de fondo de esta HU. El precio **envejece
> igual que las existencias**, que esta categoría ya excluye por eso mismo; la diferencia es que el
> precio parece estable y no lo es. Incrustado en el texto indexado, sobrevive a cada cambio de
> tarifa hasta que alguien se acuerde de reabrir el modal — y mientras tanto la IA promete cifras
> que ya no existen, lo que es **peor** que responder «eso se cotiza».
>
> Lo que sí es estable de un producto es qué es, qué incluye, para quién y qué lo diferencia: eso va
> en `descripcion`. Y el dinero se dice donde se puede decir con matices, en `notas_precios`: «los
> planes van de $10 a $50 según usuarios» envejece mucho mejor que `precio: $10/mes` repetido en
> doce filas. Si un admin quiere una cifra junto a un producto, puede escribirla dentro de su
> descripción — pero entonces es una elección suya, no algo que el formulario le pida.
>
> **Por qué 2 columnas y no más.** Cada columna extra se multiplica por 12 filas: una tercera de 120
> caracteres cuesta ~1.600 del presupuesto.
>
> **Por qué `descripcion` se queda en 120** y no sube: es el tope por defecto de `repetible` en
> `LIMITE_POR_KIND`. Subirlo es legal (el subcampo admite su propio `maxLength`) pero sentaría
> precedente de saltarse el default justo en el campo que más se multiplica.

### Justificación de los dos obligatorios

Misma vara que HU-KB-08, la otra categoría `obligatorio: true`. `resumen_oferta` da el marco («somos
una panadería mayorista», no una lista de SKUs sueltos) y `catalogo` da lo concreto: sin al menos
una fila, la IA no puede nombrar ni describir un producto, que es exactamente para lo que existe
esta categoría. Todo lo demás afina la respuesta pero no la habilita.

`resumen_oferta` se acota a **600** en vez de los 1.500 del `kind`: es un resumen, y el detalle vive
en las filas. Ese recorte es lo que le deja aire al `repetible` en el presupuesto.

### Campos deliberadamente NO incluidos

| Campo | Por qué no | Dónde va |
|---|---|---|
| Existencias, unidades, SKU, código de barras | Datos de operación: cambian a diario y re-indexar la KB en cada cambio sería absurdo | `/catalogo` (feature aparte) |
| Estado del producto (activo/agotado) | Igual: es estado vivo, no conocimiento estable | `/catalogo` |
| **Precio por producto** (como columna) | Envejece como las existencias; una cifra caducada es peor que «se cotiza» | `notas_precios`, como rango |
| Precios por cliente o por lista | Es CRM/comercial, no conocimiento público | fuera del KB |
| Categorías o líneas de producto | Se solapa con los nombres del propio catálogo y con `resumen_oferta` | — (recortado) |
| Garantías, devoluciones, cambios | Son políticas | HU-KB-11 |
| Dirección, teléfono, horario de atención | Son contacto y agenda | HU-KB-10 |
| Nombre, misión, zonas de cobertura | Son identidad de la empresa | HU-KB-08 |

> **Frontera pactada con HU-KB-10.** `modalidades_entrega` y `tiempos_entrega` se quedan aquí:
> describen **cómo llega lo que se vende**, que es parte de la oferta, no dónde está el negocio ni
> cuándo abre. El spec de HU-KB-10 deberá declarar «modalidades y tiempos de entrega → HU-KB-09» en
> su *fuera de alcance*, igual que ya hace con `zonas_cobertura` respecto de HU-KB-08. Moverlo
> después es caro: el `id` queda congelado en cuanto un tenant guarda.

---

## Contrato — `lib/kb-schemas.ts` (tres líneas aditivas)

```ts
export type KbSchemaId = 'generico' | 'empresa' | 'productos';

export const KB_SCHEMAS = { generico: GENERICO, empresa: EMPRESA_SCHEMA, productos: PRODUCTOS_SCHEMA };

const SCHEMA_POR_TITULO = {
  [normalizeTitulo('Información Complementaria')]: 'generico',
  [normalizeTitulo('Información de la empresa')]: 'empresa',
  [normalizeTitulo('Productos y servicios')]: 'productos',   // título exacto de PRESET_META
};
```

---

## Presupuesto de caracteres (criterio 7)

`serializeEstructura` emite cada fila del `repetible` como
`- <clave>: <valor> · <clave>: <valor> · …`. Con las columnas al tope:

```
"- nombre: "        2 + 8  + 60  =  70
" · descripcion: "  3 + 13 + 120 = 136
salto de línea                    =   1
                                  ─────
                            por fila 207
```

| Bloque | Cálculo | Caracteres |
|---|---|---|
| `## Qué ofrece` + `resumen_oferta` | 15 + (35 + 600 + 1) | 651 |
| `catalogo` | 22 + (12 filas × 207) | 2.506 |
| `## Precios y condiciones` + 3 campos | 25 + 317 + 520 + 327 | 1.189 |
| `## Cómo se entrega` + 2 campos | 19 + 395 + 321 | 735 |
| Separadores entre secciones | `\n\n` × 3 | 6 |
| `## Información adicional` + texto | 25 + 1.500 | 1.525 |
| **Total** | | **≈ 6.612** |

Margen sobre `CONTENIDO_MAX` (10.000): **≈ 3.388**.

Aun sin la columna de precio y sin `categorias`, **el `catalogo` sigue siendo el 38 % del
presupuesto**: es el bloque que hay que vigilar en cualquier ampliación futura. Por eso el criterio
7 exige un test que **mida**, no que confíe en esta tabla. Si algún día no cupiera, se recortan
topes o filas; **nunca** se sube `CONTENIDO_MAX`.

### Por qué `maxItems: 12` y no 15, teniendo margen de sobra

El presupuesto ya no es la razón: con 15 filas el total sería ~7.325, y cabría. La razón es de
**recuperación**, y es la que hay que recordar en HU-KB-10/11:

Con `KB_CHUNK_SIZE = 1000` y overlap 150, cada ~850 caracteres nacen un fragmento más. Doce filas de
catálogo ya reparten esta categoría en varios fragmentos que compiten **entre sí** en la búsqueda
vectorial, y `KB_RETRIEVAL_K = 5` solo deja pasar cinco al prompt. Cuantas más filas, más se diluye
la probabilidad de que el fragmento con el producto preguntado entre en ese top-5 — y el síntoma no
es un error, es una IA que «no encuentra» algo que sí está cargado.

Doce productos bien descritos se recuperan mejor que veinte a medias. Esta lista es la **chuleta de
la IA**, no el inventario: para el inventario está `/catalogo`, que es otro feature con su propio
modelo.

---

## Hallazgos del contrato de HU-KB-07 (se documentan, **no** se arreglan aquí)

Al ser el primer consumidor real del `repetible`, esta HU destapa dos límites. Ninguno bloquea, pero
los dos deben quedar registrados en vez de parcheados — que es justo la disciplina que pide el
encargo.

**H1 · El texto usa el `id` del subcampo, no su etiqueta.** `serializarValor` recibe el valor pero
no la definición del campo, así que emite `- nombre: Plan Básico · descripcion: Incluye 5 usuarios`,
con la clave cruda. *Mitigación en esta HU:* nombrar los subcampos con palabras en español legibles
(`nombre`, `descripcion`), de modo que el texto que lee la IA salga correcto igual. *Arreglo real:*
pasarle el `KbFieldDef` al serializador para que use `etiqueta` — cambia la firma de
`kb-serialize.ts` y afecta a todos los schemas, así que es una HU aparte.

**H2 · No se puede exigir un subcampo por fila.** El tipo `subcampos` es
`{ id, etiqueta, maxLength? }`: no tiene `requisito`. Una fila con solo el nombre y sin descripción
cuenta como llena (`valorVacio` de un `repetible` solo mira si **todas** las columnas están en
blanco). *Mitigación en esta HU:* aceptarlo. Un producto listado solo por su nombre ya es
conocimiento útil —la IA puede al menos confirmar que existe— y forzar la descripción empujaría al
admin a rellenar por rellenar. *Arreglo real:* añadir `requisito` a `subcampos` y enseñarle a
`camposFaltantes` a mirar dentro de las filas; toca contrato y `RepeatableList`, así que es otra HU.

---

## Notas

- **Esta HU no debería tocar ningún componente**, ni siquiera un comentario. Es el listón que puso
  HU-KB-08 y aquí es más exigente, porque estrena un `kind`. Si aparece la tentación de retocar
  `RepeatableList`, es señal de H1/H2 pidiendo su propia HU.
- **`repetible` vs `lista`.** La regla que fija esta HU para las siguientes: `repetible` es para
  filas con **columnas** (un producto tiene nombre *y* descripción); `lista` es para enumeraciones de
  una sola dimensión (formas de pago, modalidades de entrega). Usar `repetible` donde basta `lista`
  duplica o triplica el costo en caracteres sin añadir información.
- **Cómo se ve una fila en pantalla.** `KnowledgeStructuredForm` renderiza los subcampos en un
  `grid sm:grid-cols-2` con la `etiqueta` como *placeholder* y como `aria-label`, no como label
  visible. Con 2 columnas la fila queda exactamente en esa rejilla, sin huérfanas — otra ventaja
  incidental de haber quitado el precio. Es el comportamiento actual del primitivo y esta HU no lo
  cambia; si se quisiera cabecera de tabla, sería otro hallazgo.
- **`notas_precios` es donde vive el dinero.** Al no haber columna de precio, este campo deja de ser
  un accesorio: es el único sitio donde el admin habla de cuánto cuesta. Su etiqueta y su ayuda deben
  invitar a un **rango** («los planes van de $10 a $50 según usuarios», «desde $500 el metro»), no a
  una tarifa cerrada, para que envejezca bien.
- **Los `id` son para siempre.** `catalogo` no puede pasar a `productos` ni `resumen_oferta` a
  `resumen`. Para cambiar lo que se lee en pantalla está `etiqueta`.
- **`version: 1` y cuándo subirla.** La suben los cambios incompatibles: cambiar el `kind` de un
  campo, retirar uno, convertir un opcional en obligatorio, o **quitar o renombrar una columna del
  `repetible`** (eso último es específico de esta categoría y conviene tenerlo escrito). Añadir más
  adelante una columna `precio` **sí** sería un cambio de versión — y una decisión de producto que
  habría que volver a discutir, no un retoque.
- **Complejidad: media.** El código es pequeño y aditivo. Lo que cuesta es el diseño de las columnas,
  que queda congelado para siempre, y vigilar el presupuesto del `repetible`.

## Verificación

- `pnpm --filter @sofiapp/web build` (incluye `tsc --noEmit`).
- `pnpm --filter @sofiapp/web lint` (`--max-warnings 0`).
- `pnpm --filter @sofiapp/web test`.
- `git diff --stat -- apps/backend` → vacío (criterio 17).
- `git diff --stat -- apps/frontend/src/features/knowledge-base/lib/kb-serialize.ts apps/frontend/src/features/knowledge-base/components` → **vacío** (criterio 18).
- `grep -rn "bg-\[#" apps/frontend/src/features/knowledge-base` → sin resultados.

> **Filtros de pnpm.** Los paquetes son `@sofiapp/web` y `@sofiapp/api`, no `frontend`/`backend`.
> Esta HU no ejecuta los del backend porque no lo toca.
