# HU-KB-10 — Plan técnico (CÓMO)

> Un archivo nuevo con la declaración del schema y tres líneas aditivas en el registry, igual que
> HU-KB-08 y HU-KB-09. Lo específico aquí es que estrena el `kind: 'horario'` y que la categoría es
> **opcional y eliminable**, lo que cambia la política de campos obligatorios.

## Archivos a crear / tocar

```
apps/frontend/src/features/knowledge-base/
├── lib/schemas/horarios.schema.ts         # NUEVO  — HORARIOS_SCHEMA (3 secciones, 9 campos)
├── lib/schemas/horarios.schema.test.ts    # NUEVO  — ids congelados, presupuesto, forma del horario
├── lib/kb-schemas.ts                      # TOCAR  — 3 líneas aditivas (unión + KB_SCHEMAS + registry)
├── lib/kb-schemas.test.ts                 # TOCAR  — el registry resuelve el título nuevo
└── pages/KnowledgeBasePage.test.tsx       # TOCAR  — integración: modos, editor de días y borrado
```

**No se tocan:** `apps/backend/**` (entero), `kb-serialize.ts`, `KnowledgeStructuredForm.tsx`,
`ScheduleDayEditor.tsx` ni ningún otro primitivo —**ni siquiera en comentarios**—,
`KnowledgeUploadEditor.tsx`, `KnowledgeDocumentDialog.tsx`, `kb-presets.ts` ni la vista principal.

---

## Contrato — `lib/schemas/horarios.schema.ts`

```ts
import type { KbSchemaDef } from '../kb-schemas.js';   // solo tipo: sin ciclo en runtime

export const HORARIOS_SCHEMA: KbSchemaDef = { id: 'horarios', version: 1, secciones: [ … ] };
```

### Los 9 campos

| # | Sección | `id` (congelado) | Etiqueta | `kind` | Requisito | Tope |
|---|---|---|---|---|---|---|
| 1 | `ubicacion` | `direccion` | Dirección | `texto-medio` | opcional | 200 |
| 2 | `ubicacion` | `indicaciones` | Cómo llegar | `texto-medio` | opcional | 300 |
| 3 | `ubicacion` | `otras_sedes` | Otras sedes | `repetible` | opcional | 6 filas × 3 col. |
| 4 | `contacto` | `whatsapp` | WhatsApp | `texto-corto` | opcional | 60 |
| 5 | `contacto` | `telefono` | Teléfono | `texto-corto` | opcional | 60 |
| 6 | `contacto` | `correo` | Correo electrónico | `texto-corto` | opcional | 80 |
| 7 | `contacto` | `redes_sociales` | Redes sociales | `lista` | opcional | 80 × 6 |
| 8 | `horarios` | `horario_atencion` | Horario de atención | `horario` | opcional | 7 días × 4 tramos |
| 9 | `horarios` | `excepciones_horario` | Días especiales | `texto-medio` | opcional | 300 |

### Secciones

```ts
{ id: 'ubicacion', titulo: 'Dónde están',        descripcion: 'La dirección y otras sedes' }
{ id: 'contacto',  titulo: 'Cómo contactarlos',  descripcion: 'Por dónde le escriben o llaman' }
{ id: 'horarios',  titulo: 'Cuándo atienden',    descripcion: 'Los días y las horas de atención' }
```

### Las columnas de `otras_sedes`

```ts
{
  id: 'otras_sedes',
  etiqueta: 'Otras sedes',
  kind: 'repetible',
  requisito: 'opcional',
  maxItems: 6,
  subcampos: [
    { id: 'nombre',    etiqueta: 'Nombre de la sede', maxLength: 60  },
    { id: 'direccion', etiqueta: 'Dirección',         maxLength: 120 },
    { id: 'telefono',  etiqueta: 'Teléfono',          maxLength: 40  },
  ],
}
```

Los `id` de subcampo van en español legible porque **acaban dentro del texto que lee la IA**: el
serializador emite la clave, no la etiqueta (hallazgo H1 registrado en HU-KB-09). Una fila sale como
`- nombre: Sede Norte · direccion: Calle 100 #15-20 · telefono: 6011234567`.

---

## Decisiones de diseño

### Por qué los canales de contacto son **campos dedicados** y no una lista

Es la decisión más importante de esta categoría. Un teléfono mal atribuido no da una respuesta
pobre: da una respuesta **incorrecta**, y manda al cliente a marcar a otro sitio.

| Opción | Qué acaba en el texto indexado | Riesgo |
|---|---|---|
| **Campos dedicados (elegida)** | `WhatsApp: 3001234567` | Ninguno: la etiqueta *es* la semántica |
| `lista` libre | `- 3001234567` | La IA no sabe si es WhatsApp, fijo o de otra sede |
| `repetible` (tipo + valor) | `- tipo: WhatsApp · valor: 3001234567` | Funciona, pero el admin puede escribir «cel», «celular», «Whatsapp» y la IA recupera ruido |

Con tres campos dedicados el dato queda **auto-descrito** y cuesta 3 líneas de schema. El `repetible`
sería más flexible, pero traslada al admin la responsabilidad de nombrar bien el tipo — justo donde
un error se convierte en un dato equivocado.

### Por qué `direccion` **y** `otras_sedes`, y no solo un `repetible`

El caso común es **una sola ubicación**, y obligar a ese admin a pulsar «Añadir» para escribir su
única dirección es fricción sin ganancia. Con un campo simple para la principal y un `repetible`
opcional para las demás, cada caso paga lo que usa.

El riesgo evidente es la duplicación (que alguien meta la sede principal también como fila). Se
mitiga donde toca: la etiqueta dice **«Otras sedes»** y su ayuda, «Solo si atiendes en más de un
punto». No se resuelve con validación porque no hay forma fiable de detectarlo, y bloquear por
sospecha sería peor que el problema.

### Por qué **un solo** campo `horario`

Un segundo horario de despacho o entrega cruzaría a HU-KB-09, que ya es dueña de `tiempos_entrega`.
La línea queda así, y conviene escribirla porque las tres HUs se rozan aquí:

- **«¿Cuándo atienden?»** → `horario_atencion`, en esta categoría.
- **«¿Cuánto tarda en llegarme?»** → `tiempos_entrega`, en `productos` (HU-KB-09).
- **«¿A dónde despachan?»** → `zonas_cobertura`, en `empresa` (HU-KB-08).

`excepciones_horario` cubre lo que el editor de días no puede expresar —festivos, Semana Santa,
horario de temporada— sin inventar un `kind` nuevo.

### Por qué **cero** campos obligatorios

Es una desviación consciente de la recomendación de partida (un obligatorio), y esta es la razón:

**Todos los candidatos fallan para algún tipo de negocio.** Un negocio solo-online no tiene
dirección. Uno que solo atiende por correo no tiene WhatsApp. Uno 24/7 —o una tienda dentro de un
centro comercial que sigue el horario del centro— no tiene un horario propio que declarar. Elegir
cualquiera de ellos como obligatorio convierte una categoría **opcional y eliminable** en una que
algunos tenants no pueden completar.

**Y no hace falta.** El editor ya impide guardar un formulario vacío: al crear exige contenido no
vacío (`contenidoListo` en `KnowledgeUploadEditor`), y con todos los campos en blanco el texto
serializado es la cadena vacía. Ese piso existe sin coerción adicional.

**Alternativa considerada:** `whatsapp` como único obligatorio, por ser el canal del producto
(SofiApp es un CRM de WhatsApp, así que casi todos los tenants tendrán uno). Se descarta porque
«casi todos» no es «todos», y el coste de equivocarse es un admin que no puede guardar su tarjeta.
Queda como pregunta abierta 4 por si se prefiere.

### Campos deliberadamente NO incluidos

| Campo | Por qué no | Dónde va |
|---|---|---|
| Zonas de cobertura, ciudades donde vende | Es alcance del negocio, no ubicación física | `empresa` (HU-KB-08) |
| Modalidades de entrega, tiempos de envío | Es cómo llega lo que se vende, parte de la oferta | `productos` (HU-KB-09) |
| Horario de despacho | Misma frontera: el «cuándo sale» pertenece a la entrega | `productos` (HU-KB-09) |
| Garantías, devoluciones, términos | Son políticas | HU-KB-11 |
| Un campo por red social (Instagram, TikTok…) | Sería adivinar cuáles usa cada negocio y quedarse corto igual | `redes_sociales` como `lista` |
| Coordenadas, enlace a mapa | Una URL larga que no aporta a una respuesta hablada | `indicaciones` o `adicional` |

---

## Contrato — `lib/kb-schemas.ts` (tres líneas aditivas)

```ts
export type KbSchemaId = 'generico' | 'empresa' | 'productos' | 'horarios';

export const KB_SCHEMAS = { …, horarios: HORARIOS_SCHEMA };

const SCHEMA_POR_TITULO = {
  …,
  [normalizeTitulo('Horarios y ubicación')]: 'horarios',   // título exacto de PRESET_META
};
```

---

## Presupuesto de caracteres (criterio 9)

El `horario` asusta —7 días × 4 tramos— pero es el bloque **más barato** de la categoría:

```
"- miércoles: "         2 + 9 + 2      =  13   (el nombre de día más largo)
4 tramos "08:00–12:00"  4×11 + 3×", "  =  50
salto de línea                          =   1
                                        ─────
                              por día     64
7 días + etiqueta                       = 468
```

| Bloque | Cálculo | Caracteres |
|---|---|---|
| `## Dónde están` + `direccion` + `indicaciones` | 15 + 212 + 314 | 541 |
| `otras_sedes` | 12 + (6 filas × 258) | 1.560 |
| `## Cómo contactarlos` + 3 campos + `redes_sociales` | 21 + 71 + 71 + 101 + 514 | 778 |
| `## Cuándo atienden` + `horario_atencion` + `excepciones` | 19 + 468 + 318 | 805 |
| Separadores entre secciones | `\n\n` × 3 | 6 |
| `## Información adicional` + texto | 25 + 1.500 | 1.525 |
| **Total** | | **≈ 5.215** |

Margen sobre `CONTENIDO_MAX` (10.000): **≈ 4.785** — el más holgado de las cuatro categorías.

El dato que conviene recordar: **`otras_sedes` cuesta más del triple que el horario completo**
(1.560 contra 468). Si algún día hay que recortar aquí, el candidato es el número de sedes o sus
columnas, no los días ni los tramos. Aun así el criterio 9 exige un test que **mida**.

---

## Notas

- **Esta HU no debería tocar ningún componente.** HU-KB-09 estrenó el `repetible` sin tocar una
  línea de infraestructura; el listón para `horario` es el mismo. Si aparece la tentación de retocar
  `ScheduleDayEditor` —por ejemplo para copiar el horario de un día a otro, o para un botón
  «lunes a viernes»—, es una mejora legítima **de otra HU**, no un parche de esta.
- **El comentario de `ScheduleDayEditor` ya apunta aquí.** HU-KB-08 corrigió su numeración a
  HU-KB-10; al implementar, ese comentario deja de describir trabajo futuro y pasa a ser cierto. **No
  hay que editarlo** — dice «su consumidor llega en HU-KB-10», y así sigue siendo verdad.
- **Primer modal estructurado con borrado.** Las dos categorías anteriores son `obligatorio: true` y
  su modal oculta Eliminar. Esta no, así que hay que comprobar explícitamente que el botón sigue ahí
  y que el `AlertDialog` de confirmación funciona dentro del formulario guiado (criterio 16). Es el
  único camino que las HUs anteriores no pudieron ejercitar.
- **Los `id` son para siempre**, los de campo y los de columna. `whatsapp` no puede pasar a `wa` ni
  `otras_sedes` a `sedes`. Para cambiar lo que se lee en pantalla está `etiqueta`.
- **`version: 1` y cuándo subirla.** La suben los cambios incompatibles: cambiar el `kind` de un
  campo, retirar uno, convertirlo en obligatorio, o quitar/renombrar una columna de `otras_sedes`.
- **Complejidad: media-baja.** Es la categoría con el presupuesto más holgado y sin decisiones tan
  cargadas como el precio de HU-KB-09. Lo que hay que cuidar son las tres fronteras y no dejar que
  se cuele un campo de envíos.

## Verificación

- `pnpm --filter @sofiapp/web build` (incluye `tsc --noEmit`).
- `pnpm --filter @sofiapp/web lint` (`--max-warnings 0`).
- `pnpm --filter @sofiapp/web test`.
- `git diff --stat -- apps/backend` → vacío (criterio 20).
- `git diff --stat -- apps/frontend/src/features/knowledge-base/lib/kb-serialize.ts apps/frontend/src/features/knowledge-base/components` → **vacío** (criterio 21).
- `grep -rn "bg-\[#" apps/frontend/src/features/knowledge-base` → sin resultados.

> **Filtros de pnpm.** Los paquetes son `@sofiapp/web` y `@sofiapp/api`. Esta HU no ejecuta los del
> backend porque no lo toca.
