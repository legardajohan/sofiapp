# HU-KB-07 — Plan técnico (CÓMO)

> Infraestructura para conocimiento estructurado. Backend: un campo opcional y una regla de
> escritura. Frontend: dos módulos de `lib` con contrato para cuatro HUs futuras, siete componentes
> y la bifurcación de modos. El pipeline de indexación y la vista principal no se tocan.

## Archivos a crear / tocar

```
apps/backend/src/features/kb/
├── kb.types.ts                       # TOCAR   — KbEstructura, KbFieldValue, estructura? en I/DTOs
├── kb-document.model.ts              # TOCAR   — campo `estructura` (Mixed, opcional)
├── kb.validation.ts                  # TOCAR   — CONTENIDO_MAX 10.000 + sobre de `estructura`
├── kb.service.ts                     # TOCAR   — persistir `estructura` + tabla de escritura
├── kb.controller.ts                  # TOCAR   — pasa el DTO completo (sigue delgado)
├── kb.routes.ts                      # REUSAR  — misma cadena de middlewares, sin cambios
├── kb.service.test.ts                # TOCAR   — casos nuevos + aislamiento de `estructura`
└── kb.routes.test.ts                 # TOCAR   — límite nuevo, sobre inválido, retrocompatibilidad

apps/frontend/src/
├── api/knowledge-base.ts             # TOCAR   — envía `estructura` cuando existe
├── components/ui/accordion.tsx       # NUEVO   — pnpm dlx shadcn@3.8.5 add accordion
├── components/ui/radio-group.tsx     # NUEVO   — pnpm dlx shadcn@3.8.5 add radio-group
└── features/knowledge-base/
    ├── types/domain.ts               # TOCAR   — estructura? en IKbDocument + tipos de estructura
    ├── types/api.ts                  # TOCAR   — estructura? en ambos payloads
    ├── lib/kb-schemas.ts             # NUEVO   — sistema de campos + schema `generico` + registry
    ├── lib/kb-schemas.test.ts        # NUEVO
    ├── lib/kb-serialize.ts           # NUEVO   — serializeEstructura + migrarLegadoAEstructura
    ├── lib/kb-serialize.test.ts      # NUEVO
    ├── lib/kb-presets.ts             # TOCAR   — `hayCambios` para la leyenda de versión
    ├── components/fields/KnowledgeSection.tsx    # NUEVO
    ├── components/fields/KnowledgeField.tsx      # NUEVO
    ├── components/fields/RepeatableList.tsx      # NUEVO
    ├── components/fields/ConditionalReveal.tsx   # NUEVO
    ├── components/fields/PolicyTriState.tsx      # NUEVO  (sin consumidor — HU-KB-10)
    ├── components/fields/ScheduleDayEditor.tsx   # NUEVO  (sin consumidor — HU-KB-09)
    ├── components/KnowledgeStructuredForm.tsx    # NUEVO  — cuerpo del modo estructurado
    ├── components/KnowledgeStructuredForm.test.tsx # NUEVO
    ├── components/KnowledgeUploadEditor.tsx      # TOCAR  — bifurcación de modos
    └── components/KnowledgeDocumentDialog.tsx    # TOCAR  — estado elevado + contador serializado

docs/
└── data-model.md                     # TOCAR   — kb_documents: campo + semántica HU-KB-07
```

**No se tocan:** `kb.chunker.ts`, `kb.repository.ts`, `kb.retrieval.service.ts`,
`workers/kb-index.processor.ts`, `KnowledgeCard.tsx`, `KnowledgeGrid.tsx`, `KnowledgeToolbar.tsx`,
`KnowledgeBasePage.tsx`, `PresetProgress.tsx`, `RequiredPresetsBanner.tsx`, `IndexingStatusBadge.tsx`
ni nada de FAQs.

---

## Decisión 1 — Quién deriva el texto: **el frontend**

El cliente serializa `estructura → contenido` y envía **ambos** en el mismo `POST`/`PATCH`. El
backend guarda los dos y **nunca re-deriva**: para él `contenido` sigue siendo texto opaco.

> **Por qué.** El serializer depende de los schemas de campo, y esos schemas viven en el frontend y
> crecerán en cada HU 08–11. Derivar en el backend obligaría a portar schemas + serializer a Node y
> a mantener dos implementaciones **en lockstep** — exactamente el problema que ya arrastra
> `normalizeContenido` (duplicado en `kb.service.ts` y `kb-presets.ts` con un comentario de
> advertencia en ambos), multiplicado por cada campo nuevo de cada categoría.

| Opción | Riesgo | Coste por HU futura |
|---|---|---|
| **Frontend deriva (elegida)** | Un cliente puede enviar un par `(contenido, estructura)` incoherente | **Cero** backend |
| Backend deriva | Ninguno de coherencia | Portar schemas + serializer y sincronizar dos repos de reglas en cada HU |

**Riesgo asumido y su mitigación.** El par incoherente solo puede llegar de un cliente manipulado, y
su único efecto es degradar **el retrieval de ese mismo tenant**: no hay escalada de privilegios ni
fuga cross-tenant, porque `estructura` no participa de ninguna query ni de ninguna decisión de
autorización. Zod sigue validando la longitud de `contenido` y el sobre + tamaño de `estructura`.

**Consecuencia que hay que decir en voz alta.** Si el serializer cambia en una HU futura, el
`contenido` guardado queda «viejo» hasta que alguien abra y guarde ese documento; en ese momento
re-versiona y re-indexa por el camino normal. Es el comportamiento correcto, pero es un cambio de
versión que el admin no pidió, y conviene agrupar los cambios de serializer en una sola HU.

---

## Decisión 2 — `CONTENIDO_MAX`: 3.000 → **10.000**

| Tope | Fragmentos con `KB_CHUNK_SIZE=1000` / overlap 150 (paso 850) | Veredicto |
|---|---|---|
| 3.000 (hoy) | ~4 | Insuficiente para un formulario de 15 campos |
| 8.000 | ~10 | Justo |
| **10.000 (elegido)** | **~12** | Holgura de 3,3× sobre hoy; ~60 fragmentos por tenant con 5 presets |
| 12.000 | ~15 | Sin ganancia real; empeora el recall con `KB_RETRIEVAL_K=5` |

Con `KB_RETRIEVAL_K=5`, cuantos más fragmentos compiten por documento, más se diluye la
probabilidad de que el fragmento correcto entre en el top-5. 10.000 es el punto donde el formulario
cabe cómodo sin empezar a castigar la recuperación. Se actualiza el mensaje de error a
`'El contenido no puede superar los 10,000 caracteres.'`.

---

## Contratos — Backend

### `apps/backend/src/features/kb/kb.types.ts`

```ts
export type KbTriEstado = 'si' | 'no' | 'na';

export interface KbScheduleDay {
  dia: string;                       // 'lunes' … 'domingo'; el orden lo decide el schema
  cerrado: boolean;
  intervalos: Array<{ desde: string; hasta: string }>;  // 'HH:mm'
}

/** Valor de un campo. Auto-descriptivo: lleva su `tipo` para poder leerse sin el schema. */
export type KbFieldValue =
  | { tipo: 'texto'; valor: string }
  | { tipo: 'lista'; valores: string[] }
  | { tipo: 'triestado'; valor: KbTriEstado; detalle?: string }
  | { tipo: 'horario'; dias: KbScheduleDay[] }
  | { tipo: 'repetible'; items: Array<Record<string, string>> };

export interface KbEstructura {
  /** Versión del CONTRATO de esquema, no del documento. Empieza en 1. */
  schemaVersion: number;
  /** Qué formulario la produjo: 'generico' hoy; 'empresa', 'horarios'… en HU-08..11. */
  schemaId: string;
  campos: Record<string, KbFieldValue>;
  /** «Información adicional». Obligatorio en el contrato (puede ser ''), nunca opcional. */
  adicional: string;
}
```

> **Por qué los valores son auto-descriptivos.** Un `Record<string, string | string[] | …>` plano
> obligaría a mirar el schema vigente para saber cómo leer cada valor — y el schema puede haber
> cambiado desde que se guardó. Con el discriminante `tipo` dentro del dato, una HU futura puede
> leer una `estructura` vieja, renderizarla defensivamente y serializarla sin adivinar (criterio 13
> del spec).

> **Por qué `adicional` es obligatorio en el tipo.** La decisión 6 del encargo («siempre hay vía de
> texto libre») deja de depender de que nadie se olvide: si un schema futuro no lo renderiza, no
> compila.

Cambios en las interfaces existentes:

```ts
export interface IKbDocument {
  // … campos actuales sin cambios …
  estructura?: KbEstructura;         // edición guiada; ausente = documento de texto libre
}

export interface CreateKbDocumentDTO {
  titulo: string;
  contenido: string;
  estructura?: KbEstructura;
}

export interface UpdateKbDocumentDTO {
  contenido: string;
  estructura?: KbEstructura;         // ausente = NO TOCAR (nunca borrar)
}

export interface IKbDocumentResponse {
  // … campos actuales sin cambios …
  estructura?: KbEstructura;         // se omite con el spread condicional, como `proposito`/`error`
}
```

### `apps/backend/src/features/kb/kb-document.model.ts`

```ts
estructura: { type: Schema.Types.Mixed, required: false },
```

Sin índice: `estructura` no participa de ninguna query. Los dos índices existentes
(`{tenantId, titulo}` único y `{tenantId, createdAt}`) quedan igual, y `tenantId` sigue
`required: true, index: true`.

### `apps/backend/src/features/kb/kb.validation.ts`

```ts
const CONTENIDO_MAX = 10_000;
const CONTENIDO_MAX_MSG = 'El contenido no puede superar los 10,000 caracteres.';
const ESTRUCTURA_MAX_BYTES = 40_000;
const ESTRUCTURA_MAX_MSG = 'La información estructurada es demasiado grande.';

const estructuraSchema = z
  .object({
    schemaVersion: z.number().int().min(1),
    schemaId: z.string().trim().min(1).max(60),
    campos: z.record(z.string(), z.unknown()),
    adicional: z.string().max(CONTENIDO_MAX),
  })
  .refine((e) => JSON.stringify(e).length <= ESTRUCTURA_MAX_BYTES, ESTRUCTURA_MAX_MSG);
```

Añadido como `estructura: estructuraSchema.optional()` en el `body` de `createDocumentSchema` y de
`updateDocumentSchema`.

> **Por qué el backend valida el sobre y no los campos.** Si Zod conociera los campos, cada HU de
> 08 a 11 tendría que tocar el backend para añadir los suyos, y un despliegue desacompasado
> rechazaría con 400 lo que el frontend ya sabe enviar. Validando solo la envoltura, HU-08..11 son
> **puramente frontend**. El riesgo que eso deja —un `campos` con basura— se acota con
> `ESTRUCTURA_MAX_BYTES`, que es el único guardarraíl que de verdad importa: impide que un documento
> crezca sin cota. `40_000` es ~4× el tope de texto, porque el JSON pesa más que su serialización
> (claves, discriminantes y comillas).

### `apps/backend/src/features/kb/kb.service.ts` — la tabla de escritura

`updateDocument` **cambia de firma** para no crecer en parámetros posicionales:

```ts
export async function updateDocument(
  tenantId: TenantId,
  id: string,
  dto: UpdateKbDocumentDTO,        // antes: contenido: string
): Promise<IKbDocumentResponse>
```

Igualdad de `estructura` con `isDeepStrictEqual` de `node:util` — independiente del orden de claves,
cero dependencias y cero helper propio que mantener.

| `contenido` (normalizado) | `estructura` | Qué ocurre |
|---|---|---|
| **igual** | igual, o **ausente** en el DTO | **NO-OP total.** Ninguna escritura: sin versión, sin borrar chunks, sin `kb-index`, sin `bumpKbVersion`, **sin tocar `updatedAt`**. Es la garantía de HU-KB-06, intacta |
| **igual** | **distinta** | `$set: { estructura }` **y nada más**. Sin `$inc: version`, sin `deleteManyScoped(KbChunk)`, sin encolar `kb-index`, sin `bumpKbVersion`. `updatedAt` sí avanza |
| **distinto** | cualquiera | Camino actual completo (`isFirstFill`, limpieza de chunks, `kb-index`, `bumpKbVersion`) **+** `$set: { estructura }` en la **misma** escritura |

> **Por qué la fila del medio es la más importante de esta HU.** El *fast path* que dejó HU-KB-06
> retorna sin escribir cuando `normalizeContenido` no detecta cambio. Con `estructura` en juego eso
> **perdería en silencio** trabajo real del admin: reordenar dos ítems de una lista, corregir un
> whitespace que el normalizador colapsa, o llenar un campo que todavía no llega al texto. Se
> persiste el dato, pero **nada aguas abajo se mueve**, porque el texto que ve la IA es idéntico:
> re-versionar o re-indexar ahí sería mentirle al admin sobre lo que cambió y quemar embeddings.
> `updatedAt` sí avanza, y eso es correcto: hubo una escritura.

`createDocument` guarda `estructura` en las tres ramas existentes (no-op de contenido idéntico,
re-subida con `$inc`, alta nueva). En la rama de no-op se aplica la misma regla de la fila del
medio: si la `estructura` entrante difiere, se persiste sin encolar indexación.

### `apps/backend/src/features/kb/kb.controller.ts`

`updateDocumentController` pasa a delegar el `body` completo (`req.body as UpdateKbDocumentDTO`) en
lugar de `req.body.contenido`. Sin `try/catch`, sin lógica, sin Mongoose — la regla de controllers
delgados no se relaja.

### `kb.routes.ts`

**Sin cambios.** Misma cadena `authenticateJWT → requireTenant → authorize(['admin']) → validate →
asyncHandler`. No hay endpoint nuevo: `estructura` viaja en el body de los dos que ya existen.

---

## Contratos — Frontend

### `lib/kb-schemas.ts` (nuevo) — el sistema de campos

```ts
export type KbSchemaId = 'generico';        // HU-08..11 la extienden con sus ids

export type KbFieldKind =
  | 'texto-corto' | 'texto-medio' | 'texto-largo'
  | 'lista' | 'triestado' | 'horario' | 'repetible';

export type KbRequirement = 'obligatorio' | 'opcional' | 'condicional';

export type KbVisibilityPredicate = (campos: Record<string, KbFieldValue>) => boolean;

interface KbFieldBase {
  /** Clave estable dentro de `campos`. NUNCA se renombra: renombrarla huérfana el dato guardado. */
  id: string;
  etiqueta: string;
  kind: KbFieldKind;
  maxLength?: number;    // default por `kind` (tabla de límites)
  maxItems?: number;     // 'lista' | 'repetible'; default 20
  ayuda?: string;
  /** Solo con kind 'repetible': columnas del ítem. */
  subcampos?: Array<{ id: string; etiqueta: string; maxLength?: number }>;
}

/**
 * `requisito` y `visibleSi` van ACOPLADOS en el tipo: `condicional` **exige** su predicado, porque
 * sin él se comportaría como un obligatorio permanente disfrazado y el despiste no se notaría hasta
 * toparse con un Guardar bloqueado sin nada que señalar.
 *
 * `visibleSi` se respeta con CUALQUIER requisito: un `opcional` con predicado aparece y desaparece
 * sin bloquear nunca; un `obligatorio` con predicado es exigible solo mientras está visible.
 */
export type KbFieldDef = KbFieldBase &
  (
    | { requisito: 'obligatorio' | 'opcional'; visibleSi?: KbVisibilityPredicate }
    | { requisito: 'condicional'; visibleSi: KbVisibilityPredicate }
  );

export interface KbSectionDef {
  id: string;
  titulo: string;
  descripcion?: string;
  campos: KbFieldDef[];
}

export interface KbSchemaDef {
  id: KbSchemaId;
  version: number;                 // va a `estructura.schemaVersion`
  secciones: KbSectionDef[];
}

export const LIMITE_POR_KIND: Readonly<Record<KbFieldKind, number>>;
export const KB_SCHEMAS: Readonly<Record<KbSchemaId, KbSchemaDef>>;

/** Registry por título de documento. En HU-07 solo mapea «Información Complementaria». */
export function schemaParaTitulo(titulo: string): KbSchemaDef | undefined;

export function emptyEstructura(schema: KbSchemaDef): KbEstructura;
export function valorVacio(valor: KbFieldValue | undefined): boolean;
/** Obligatorios (y condicionales visibles) sin llenar. Vacío ⇒ se puede guardar. */
export function camposFaltantes(schema: KbSchemaDef, estructura: KbEstructura): KbFieldDef[];
```

**Límites por tipo de campo** (`LIMITE_POR_KIND`, aplicados por `KnowledgeField`):

| Kind | Límite | Uso previsto |
|---|---|---|
| `texto-corto` | 120 | nombre, teléfono, dirección |
| `texto-medio` | 300 | una frase: misión, eslogan |
| `texto-largo` | 1.500 | párrafo, descripción, **Información adicional** |
| ítem de `lista` / subcampo de `repetible` | 120 | cada entrada |
| nº de ítems (`maxItems`) | 20 | tope de `RepeatableList` |
| **global, sobre el texto serializado** | **10.000** (ámbar desde 9.000) | contador del modal |

**El schema `generico`** tiene `secciones: []`. Su único contenido es «Información adicional», que
**no es un `KbFieldDef`**: es el campo `adicional` del sobre, y `KnowledgeStructuredForm` lo
renderiza siempre al final, haya o no secciones. Por eso no se puede olvidar en ningún schema
futuro.

**El registry en HU-07** mapea una sola entrada:

```ts
'Información Complementaria' → KB_SCHEMAS.generico
```

> **Por qué justo esa categoría.** Es la única de las cinco cuyo formulario guiado **es** literalmente
> «Información adicional» — no le pertenece a ninguna HU 08–11. Así el modo estructurado queda
> verificable de punta a punta en la app real (render → serializar → guardar → indexar → reabrir)
> sin invadir el alcance de las HUs siguientes, que registrarán sus propios títulos. Las otras
> cuatro categorías no tienen schema en esta HU, así que siguen abriendo en legado.

### `lib/kb-serialize.ts` (nuevo) — determinismo

```ts
export function serializeEstructura(estructura: KbEstructura, schema?: KbSchemaDef): string;
export function serializedLength(estructura: KbEstructura, schema?: KbSchemaDef): number;
/** Vuelca texto libre íntegro en `adicional`. Sin consumidor de UI en esta HU (ver Decisión 3). */
export function migrarLegadoAEstructura(contenido: string, schemaId: KbSchemaId): KbEstructura;
```

Reglas de determinismo (cada una con su test):

1. **Orden canónico por schema.** Se recorre `schema.secciones` → `seccion.campos`, **no**
   `Object.keys(campos)`. El orden de claves de un objeto que ha ido y vuelto de Mongo no es una
   garantía sobre la que se pueda construir.
2. **Campos huérfanos preservados.** Los `campos` presentes en la estructura pero ausentes del
   schema (dato de una versión anterior) se serializan al final, ordenados por `id` alfabético,
   bajo el encabezado `## Otros datos`. Nunca se descartan.
3. **Arrays en el orden ingresado.** `valores`, `items` e `intervalos` se emiten tal cual están
   persistidos. Jamás se ordenan.
4. **Vacíos omitidos por completo.** Un campo sin valor no deja etiqueta, y una sección con todos
   sus campos vacíos no deja encabezado.
4bis. **Los campos no visibles también se omiten.** Un campo cuyo `visibleSi` es falso conserva su
   valor en `campos` —el admin no pierde lo que escribió si vuelve a activarlo— pero **no llega al
   texto**. Sin esto, responder «Sí», llenar el campo dependiente y luego cambiar a «No» dejaría en
   el conocimiento de la IA una afirmación que contradice la respuesta vigente. Requiere el `schema`;
   sin él (ruta de campos huérfanos) se serializa todo, que es el comportamiento seguro.
5. **`adicional` siempre al final**, bajo `## Información adicional`, si no está vacío.
6. **Sin fecha, sin aleatoriedad, sin `Intl`.** Nada dependiente de locale, zona horaria ni reloj.

Formato de salida (estable, legible para el chunker):

```
## Sección
Etiqueta: valor
Etiqueta de lista:
- ítem 1
- ítem 2
Política: Sí — detalle
Horarios:
- lunes: 08:00–12:00, 14:00–18:00
- domingo: cerrado

## Información adicional
<texto libre>
```

Separador `\n`, sin espacios finales, sin línea en blanco al final. `serialize(x) === serialize(x)`
byte a byte, que es lo que HU-KB-06 necesita para comparar «¿cambió?».

### `lib/kb-presets.ts` — el único retoque

`leyendaVersion` (en `KnowledgeDocumentDialog`) hoy dice «Sin cambios por guardar» cuando el texto
no cambió. Con la fila del medio de la tabla de escritura eso sería falso si cambió la `estructura`.
Se añade:

```ts
export function hayCambios(doc: IKbDocument, contenido: string, estructura?: KbEstructura): boolean;
```

y la leyenda gana un tercer caso: **texto igual + estructura distinta** →
`Versión v{n}. Se guardarán tus cambios sin crear una versión nueva.`
`nextVersion` no cambia de semántica.

### `components/KnowledgeDocumentDialog.tsx`

El estado elevado pasa de `contenido: string` a `{ contenido, estructura }`. En modo estructurado
**`contenido` es derivado**: se recalcula con `serializeEstructura` cada vez que cambia
`estructura`, y **nunca** se teclea. El contador global y la leyenda de versión leen ese mismo texto
derivado, así que la promesa de versión sigue siendo cierta **antes** de guardar. Se conserva el
remontaje por `key` (cada apertura arranca limpia, sin `useEffect` de reset).

### `components/KnowledgeUploadEditor.tsx` — la bifurcación

```ts
export type KbEditorMode = 'legado' | 'estructurado';

export function modoEditor(doc: IKbDocument | undefined): KbEditorMode;
```

| `doc.estructura` | `doc.contenido` | `schemaParaTitulo(titulo)` | Modo |
|---|---|---|---|
| presente | — | — | **estructurado** |
| ausente | con texto | — | **legado** |
| ausente | vacío / preset virtual | existe | **estructurado** («nace estructurado») |
| ausente | vacío / preset virtual | no existe | **legado** |
| — | — | — (creación libre, sin `doc`) | **legado** |

> **Por qué la tercera fila no contradice la decisión de retrocompatibilidad.** Un documento sin
> `estructura` **y sin texto** no tiene nada que preservar: no hay retrocompatibilidad que romper
> donde no hay contenido. Es además el mecanismo de despliegue de HU-08..11 — según cada HU registra
> el schema de su categoría, los presets vacíos de esa categoría empiezan a nacer estructurados,
> mientras los que ya tienen texto libre conservan su textarea **para siempre**.

La rama legado del `<form>` queda **literalmente igual** que hoy salvo `CONTENIDO_MAX`. La rama
estructurada delega en `KnowledgeStructuredForm` y comparte el mismo `DialogFooter` (Eliminar +
Cancelar + «Guardar e indexar»), la misma mutación y los mismos toasts.

### `components/KnowledgeStructuredForm.tsx` (nuevo)

Recorre `schema.secciones` renderizando un `KnowledgeSection` por sección y un `KnowledgeField` por
campo, y **siempre** cierra con el bloque «Información adicional» (`texto-largo`, 1.500) mapeado a
`estructura.adicional`. Un campo `condicional` se envuelve en `ConditionalReveal` con su `visibleSi`.
Existe como componente aparte para que `KnowledgeUploadEditor` no acumule dos formularios en un
archivo.

### Componentes base — `components/fields/`

| Componente | Responsabilidad | Primitivo shadcn |
|---|---|---|
| `KnowledgeSection` | Bloque colapsable con título, descripción y resumen de llenado (`3 de 5`) | `Accordion type="multiple"` |
| `KnowledgeField` | `Label` + marcador obligatorio/opcional/condicional + contador por campo + slot de error; envuelve el control | `Label` |
| `RepeatableList` | Añadir/quitar ítems con tope `maxItems`, genérico sobre el render del ítem | `Button` + `Card` |
| `ConditionalReveal` | Muestra/oculta según predicado, con reveal `motion-safe` | — |
| `PolicyTriState` | Sí / No / No aplica (+ detalle opcional al elegir «Sí») | `RadioGroup` |
| `ScheduleDayEditor` | Un día con N intervalos horarios, o «Cerrado» | `Input[type=time]` + `Switch` |

`PolicyTriState` y `ScheduleDayEditor` se entregan **sin consumidor**: son las primitivas que
montarán HU-KB-10 (políticas) y HU-KB-09 (horarios). Se escriben y se testean aquí para que esas
HUs sean declarativas.

**Dos primitivos a vendorizar:** `pnpm dlx shadcn@3.8.5 add accordion radio-group` desde
`apps/frontend/` (añade `@radix-ui/react-accordion` y `@radix-ui/react-radio-group`). La versión
`3.8.5` está fijada por `apps/frontend/CLAUDE.md`: las `4.x` asumen Tailwind v4 y rompen el setup
HSL de este proyecto. Escribir un acordeón o un tri-estado a mano teniendo el primitivo disponible
contradice la regla «shadcn no es opcional cuando aplica».

---

## Decisión 3 — Modo legado: cero migración, cero pérdida

- Un documento legado **con texto** guarda como legado, **siempre**. No hay migración automática, ni
  silenciosa ni ofrecida, en esta HU.
- `migrarLegadoAEstructura(contenido, schemaId)` existe y está testeada: vuelca el texto libre
  **íntegro** en `adicional` (sin pérdida, sin trocear, sin intentar adivinar campos). **No tiene
  consumidor de UI aquí.** La conectará HU-KB-08 detrás de un opt-in explícito («Completar con el
  formulario guiado»), cuando ya existan schemas reales a los que migrar.

> **Por qué no se ofrece la migración ya.** Con un solo schema registrado —y siendo ese schema
> `generico`, que es un textarea con encabezado— ofrecer «migrar» a todos los documentos sería ruido
> sin ganancia: el admin cambiaría de caja para escribir lo mismo. La pieza queda lista; el momento
> de usarla es cuando haya campos de verdad al otro lado.

**Alternativa rechazada: escotilla de texto libre en modo estructurado.** Un enlace «editar como
texto» dejaría al usuario modificar el `contenido` derivado mientras `estructura` sigue diciendo
otra cosa: a la siguiente apertura el formulario re-serializaría y borraría esa edición sin avisar.
La coherencia `estructura → contenido` es unidireccional a propósito. La vía libre es «Información
adicional».

---

## Notas

- **El pipeline de indexación no se entera de nada.** El worker sigue recibiendo `contenido` como
  texto plano; `chunkText`, los embeddings y `$vectorSearch` no cambian ni una línea. Por eso el
  formato de serialización se eligió legible (encabezados `##`, `Etiqueta: valor`): un fragmento de
  1.000 caracteres cortado de ese texto sigue teniendo sentido para el modelo.
- **`estructura` no altera la superficie multi-tenant.** No entra en ninguna query, ningún índice ni
  ninguna decisión de autorización: es una columna más de un documento que ya está aislado. Aun así
  se revisa el checklist §9 completo y se añade el test de aislamiento del campo (criterio 28), como
  exige la regla al tocar un modelo.
- **`normalizeContenido` sigue duplicado** entre `kb.service.ts` y `kb-presets.ts` y **debe seguir
  en lockstep**. Esta HU no lo toca, pero añade una segunda pieza con la misma propiedad: el
  serializer, que ahora es la única fuente del texto indexable. Si algún día hay que unificar,
  `packages/shared` es el sitio — fuera del alcance de aquí.
- **Deuda que esta HU no corrige:** el *drift* de `proposito` de «Información Complementaria» entre
  `PRESET_DOCUMENTS` (backend) y `PRESET_META` (frontend), ya registrado en HU-KB-05.
- **Complejidad: alta.** Backend medio-bajo (cinco archivos, cambio quirúrgico, el riesgo entero
  concentrado en la tabla de escritura). Frontend alto: dos módulos de `lib` cuyo contrato tiene que
  aguantar cuatro HUs, siete componentes nuevos, dos primitivos a vendorizar y una bifurcación de
  modos que no puede provocar **ninguna** regresión en el camino legado.

## Verificación

- `pnpm --filter @sofiapp/api typecheck` (`tsc --noEmit`).
- `pnpm --filter @sofiapp/api test`.
- `pnpm --filter @sofiapp/web build` (incluye `tsc --noEmit`).
- `pnpm --filter @sofiapp/web lint` (`--max-warnings 0`).
- `pnpm --filter @sofiapp/web test`.
- `grep -rn "bg-\[#" apps/frontend/src/features/knowledge-base` → sin resultados.
- `git diff --stat -- apps/backend/src/workers apps/backend/src/features/kb/kb.chunker.ts apps/backend/src/features/kb/kb.repository.ts` → vacío (criterio 32).
- `git diff --stat -- apps/frontend/src/features/knowledge-base/components/KnowledgeCard.tsx apps/frontend/src/features/knowledge-base/components/KnowledgeGrid.tsx apps/frontend/src/features/knowledge-base/pages` → vacío (criterio 32).

> **Corrección de los filtros de pnpm.** El paquete del backend se llama **`@sofiapp/api`**, no
> `backend`: `pnpm --filter backend …` responde `No projects matched the filters`. El del frontend
> es `@sofiapp/web`. El `CLAUDE.md` raíz conserva los nombres viejos (ver la misma nota en
> `docs/specs/HU-KB-06-mejoras-kb/tasks.md`).
