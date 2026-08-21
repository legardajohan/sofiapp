# HU-KB-12 — Plan técnico (CÓMO)

> Tres features en un modal. El orden importa porque **A cambia cómo se consultan los tests de todas
> las secciones** y **C vive dentro de una de ellas**.

## Orden de trabajo: **B → A → C**

| Paso | Por qué en este puesto |
|---|---|
| **1. B** | Es el más pequeño y el **único independiente**: toca `kb-presets.ts`, el gate de `KnowledgeUploadEditor` y tres tests que **no** consultan secciones. Hacerlo primero saca del camino un cambio de producto sin acoplarlo al ruido de A. |
| **2. A** | Reescribe la forma de consultar cualquier sección (`role="button"` → `role="tab"`) y desmonta lo que no está activo. Si fuera después de C, los tests nuevos de C nacerían contra el acordeón y habría que reescribirlos enteros. |
| **3. C** | Vive **dentro** de la pestaña «Cuándo atienden». Con A ya hecho, sus tests se escriben una sola vez y ya contra la estructura final: activar la pestaña, luego operar el editor semanal. |

Hacer C antes que A significaría escribir dos veces los tests de horarios. Hacer A antes que B no
rompe nada, pero mezcla en el mismo commit un cambio de producto con uno de navegación.

**Un commit por feature**, en ese orden, todos sobre `feat/HU-KB-05`.

---

## Diagnóstico — verificado contra el código, con líneas

Confirmo el diagnóstico del brief salvo dos correcciones:

| Afirmación del brief | Verificado |
|---|---|
| Acordeón en `KnowledgeStructuredForm.tsx` ~237-272, `Accordion` importado en la línea 1 | ✅ exacto (237-272; import línea 1) |
| «Información adicional» fuera, ~274+ | ✅ 274-291 |
| `case 'horario'` en ~157-176 | ✅ 157-176, mapea `DIAS_SEMANA` a 7 `ScheduleDayEditor` |
| `KnowledgeSection` es `AccordionItem/Trigger/Content` con contador y `Check` | ✅ y **el `Check` ya existe** (línea 51, `text-success`): A no lo inventa, lo reubica |
| `puedeEliminar` en ~158-159 | ✅ línea 159: `doc !== undefined && !isVirtualPreset && !doc.obligatorio` |
| Copy engañoso del `AlertDialog` en ~277 | ✅ línea 277 |
| `mergePresetsWithDocuments` descarta los `oculto` | ✅ `kb-presets.ts:189` (`if (real?.oculto) return []`), y su propio comentario lo documenta |
| `ScheduleDayEditor`: tarjeta `rounded-lg border p-3`, `MAX_INTERVALOS = 4`, sin validar inicio < fin | ✅ exacto |
| Intervalo por defecto `{ desde: '08:00', hasta: '18:00' }` | ✅ línea 8 |
| Espejo de tipos front/back idéntico | ✅ `domain.ts:7-11` y `kb.types.ts:9-13`, campo a campo |
| **Corrección 1** | El brief dice «`<input type="time">`». Son `Input` **del kit** con `type="time"` (`ScheduleDayEditor.tsx:65,75`) — ya cumplen la regla del kit; lo que falta es la validación, no el componente. |
| **Corrección 2** | El brief dice que `components/ui/` tiene `tabs`. ✅ existe — pero **no** hay `form` ni `popover`: si el diseño pidiera un `Popover` para el copiado, habría que instalarlo. La propuesta de abajo **evita** esa dependencia usando `DropdownMenu`, que sí está. |

---

## Archivos a crear / tocar

```
apps/frontend/src/features/knowledge-base/
├── lib/kb-presets.ts                              # B  TOCAR  — PRESETS_NO_ELIMINABLES + esPresetProtegido
├── lib/kb-presets.test.ts                         # B  TOCAR  — casos del helper
├── components/KnowledgeUploadEditor.tsx           # B  TOCAR  — gate puedeEliminar + copy del AlertDialog
│                                                  # C  TOCAR  — puedeGuardar suma la validez del horario
├── components/KnowledgeStructuredForm.tsx         # A  TOCAR  — Accordion → Tabs + indicador
│                                                  # C  TOCAR  — case 'horario': 7 editores → 1 semanal
├── components/KnowledgeStructuredForm.test.tsx    # A  TOCAR  — el describe del acordeón pasa a pestañas
├── components/fields/KnowledgeSection.tsx         # A  TOCAR  — AccordionItem → panel de pestaña
├── components/fields/ScheduleWeekEditor.tsx       # C  NUEVO  — la semana entera, dueña del copiado
├── components/fields/ScheduleDayRow.tsx           # C  NUEVO  — una fila = un día
├── components/fields/ScheduleIntervalRow.tsx      # C  NUEVO  — una fila = un intervalo
├── components/fields/CopiarHorarioMenu.tsx        # C  NUEVO  — DropdownMenu de días destino
├── components/fields/ScheduleDayEditor.tsx        # C  RETIRAR — lo reemplazan los cuatro de arriba
├── components/fields/fields.test.tsx              # C  TOCAR  — su describe de ScheduleDayEditor se reescribe
├── lib/kb-horario.ts                              # C  NUEVO  — helpers puros (validación y copiado)
├── lib/kb-horario.test.ts                         # C  NUEVO
├── lib/kb-serialize.ts                            # C  TOCAR  — serializarDia: descripción + omitir inválidos
├── lib/kb-serialize.test.ts                       # C  TOCAR  — determinismo y descripción
├── lib/schemas/horarios.schema.test.ts            # C  TOCAR  — serialización con descripción; version SIGUE en 1
├── types/domain.ts                                # C  TOCAR  — descripcion?: string
└── pages/KnowledgeBasePage.test.tsx               # A+B+C TOCAR — el grueso del mapa de tests

apps/backend/src/features/kb/
└── kb.types.ts                                    # C  TOCAR  — espejo: descripcion?: string (1 línea)
```

**No se tocan:** ni un archivo más de `apps/backend`, los cuatro `lib/schemas/*.schema.ts`,
`KnowledgeDocumentDialog.tsx`, `KnowledgeGrid/Card/Toolbar`, `PresetProgress`, `kb-schemas.ts`
(**ningún** cambio: `valorVacio`, `esVisible` y `camposFaltantes` sirven tal cual) ni
`components/ui/**` (todo lo que hace falta ya está vendorizado).

---

# Feature B — Presets protegidos

## `lib/kb-presets.ts`

Junto a `PRESET_META`, después de `PRESET_ORDER`:

```ts
/**
 * Categorías que la UI **no** deja eliminar, aunque no sean obligatorias.
 *
 * No es lo mismo que `obligatorio`: esas dos ya bloquean el guardado hasta llenarse. Estas se pueden
 * dejar vacías —simplemente no indexan nada— pero borrarlas es un camino sin retorno que no aporta:
 * `mergePresetsWithDocuments` descarta los `oculto`, así que la tarjeta desaparece de la grilla y no
 * hay forma de reponerla desde la UI.
 *
 * «Información Complementaria» NO está aquí a propósito: es la vía de escape del admin y él decide
 * si la quiere en su grilla.
 */
export const PRESETS_NO_ELIMINABLES: readonly string[] = [
  'Horarios y ubicación',
  'Políticas y términos',
];

/** `true` si el título es una categoría protegida. Compara normalizado, como el resto del módulo. */
export function esPresetProtegido(titulo: string): boolean;
```

Implementación: un `Set` de los títulos ya normalizados, construido una vez a nivel de módulo, y
`esPresetProtegido` consulta con `normalizeTitulo(titulo)`. Nunca igualdad exacta — el resto del
archivo ya normaliza (`isTitleTaken`, `SCHEMA_POR_TITULO`), y una comparación cruda aquí sería el
único sitio sensible a un espacio de más.

## `components/KnowledgeUploadEditor.tsx`

**Gate** (línea 159), con el comentario ampliado:

```ts
// Un preset virtual no tiene nada que borrar; un obligatorio no se puede quedar sin su categoría; y
// dos presets opcionales están protegidos porque borrarlos no tiene vuelta atrás (HU-KB-12).
const puedeEliminar =
  doc !== undefined && !isVirtualPreset && !doc.obligatorio && !esPresetProtegido(doc.titulo);
```

**Copy del `AlertDialog`** (línea 277). Se **retira** la frase condicional y se sustituye:

```tsx
<AlertDialogDescription>
  La IA dejará de usar este contenido y se borrarán sus fragmentos indexados. No se puede deshacer.
  {doc.isPreset && ' La categoría también desaparecerá de tu base de conocimiento.'}
</AlertDialogDescription>
```

Por qué: la frase actual («seguirá en la lista, vacía, por si la necesitas») describe un
comportamiento que **no existe** — `mergePresetsWithDocuments` devuelve `[]` para un preset `oculto`
y no lo repone como virtual. Tras B, la única categoría que puede llegar a ese diálogo es
«Información Complementaria», y para ella la frase sigue siendo falsa. Se dice lo que pasa de verdad.
El diálogo sigue siendo el `AlertDialog` del kit; **nada nativo**.

---

# Feature A — Pestañas

## `components/fields/KnowledgeSection.tsx` — pasa a ser el panel

**Decisión: el indicador vive en el trigger, en `KnowledgeStructuredForm`; `KnowledgeSection` se
queda solo con el panel.** Razón: un `TabsTrigger` es un `<button>` cuyo **nombre accesible** es todo
su contenido de texto. Si el indicador viviera dentro del componente de sección, tendría que
inyectarse en el trigger desde fuera igual, y el componente quedaría partido entre dos padres. Con el
indicador en el trigger, `KnowledgeSection` no tiene ya ninguna razón para conocer `llenos`/`total`.

```ts
interface KnowledgeSectionProps {
  descripcion?: string;
  children: React.ReactNode;
}
export function KnowledgeSection({ descripcion, children }: KnowledgeSectionProps): React.ReactElement;
```

Se van: `id`, `llenos`, `total`, el import de `Check` y los tres de `accordion`. Queda un panel con
la descripción como `<p className="text-xs text-muted-foreground">` y los campos en
`className="space-y-4"`. El `id` deja de hacer falta porque el `value` del `TabsContent` lo pone el
formulario.

> Alternativa descartada: mantener `KnowledgeSection` como envoltorio de `TabsContent`. Obligaría a
> pasarle el `value` y a que el componente supiera que vive en un `Tabs` — más acoplamiento por cero
> ganancia.

## `components/KnowledgeStructuredForm.tsx`

**Se quita:** el import de `Accordion` (línea 1) y todo el bloque 237-272.

**Helper puro, en el mismo archivo** (no exportado; solo lo usa este componente):

```ts
type ProgresoSeccion =
  | { tipo: 'faltan'; cuantos: number }   // hay obligatorios visibles sin llenar
  | { tipo: 'completa' }                  // hay obligatorios visibles y están todos
  | { tipo: 'opcionales'; llenos: number; total: number }; // la sección no exige nada

function progresoDeSeccion(
  seccion: KbSectionDef,
  campos: Record<string, KbFieldValue>,
): ProgresoSeccion;
```

Reglas, con la lógica pura que ya existe y sin duplicarla:
- `visibles = seccion.campos.filter(c => esVisible(c, campos))`
- `exigibles = visibles.filter(c => c.requisito !== 'opcional')` — incluye los `condicional`
  **visibles**, que es exactamente lo que hace `camposFaltantes`
- si `exigibles.length === 0` → `opcionales`, con `llenos = visibles.filter(c => !valorVacio(campos[c.id])).length`
- si hay `exigibles` sin llenar → `faltan`
- si no → `completa`

Se recalcula en cada render, que es lo que da el «en tiempo real» del criterio 4: `estructura` ya
viaja por props y cualquier tecla la cambia.

**Estructura JSX:**

```tsx
{schema.secciones.length > 0 && (
  <Tabs defaultValue={schema.secciones[0]?.id} className="w-full">
    <TabsList className="flex h-auto w-full justify-start gap-1 overflow-x-auto p-1">
      {schema.secciones.map((seccion) => (
        <TabsTrigger key={seccion.id} value={seccion.id} className="shrink-0 gap-2">
          {seccion.titulo}
          <IndicadorSeccion progreso={progresoDeSeccion(seccion, estructura.campos)} />
        </TabsTrigger>
      ))}
    </TabsList>

    {schema.secciones.map((seccion) => (
      <TabsContent key={seccion.id} value={seccion.id} className="mt-4">
        <KnowledgeSection {...(seccion.descripcion !== undefined ? { descripcion: seccion.descripcion } : {})}>
          {/* mismo map de ConditionalReveal + Campo que hoy, sin cambios */}
        </KnowledgeSection>
      </TabsContent>
    ))}
  </Tabs>
)}
```

`defaultValue={schema.secciones[0]?.id}` — con `?.`, no `!`, según la regla del prompt. `Tabs` lo
acepta `undefined` sin romper, y ese caso no se alcanza porque el bloque está bajo `length > 0`.

**El indicador**, componente local del archivo:

```tsx
function IndicadorSeccion({ progreso }: { progreso: ProgresoSeccion }): React.ReactElement | null
```

| Caso | Render | Tokens |
|---|---|---|
| `faltan` | `<span title="Falta 1 campo obligatorio" …>{cuantos}</span>` | `inline-flex size-4 items-center justify-center rounded-full bg-amber-100 text-[10px] font-semibold tabular-nums text-amber-700 dark:bg-amber-950 dark:text-amber-400` |
| `completa` | `<Check aria-hidden="true" />` + `<span className="sr-only">Sección completa</span>` | `size-3.5 text-success` |
| `opcionales` | `{llenos} de {total}` | `text-xs font-normal tabular-nums text-muted-foreground` |
| `opcionales` con `total === 0` | `null` | — |

**Nombre accesible (criterio 8).** El badge ámbar mete su número en el texto del botón, así que
`getByRole('tab', { name: 'Identidad' })` con `name` exacto **fallaría**. Dos medidas:
- el número va con `aria-hidden="true"` y la información se da en el `title` del `span` —
  legible por lector de pantalla vía `aria-describedby` implícito del `title` y por ratón en hover;
- los tests consultan con **regex** (`{ name: /Identidad/ }`), que es como ya están escritos hoy.

Con `aria-hidden` en el número, el nombre accesible del trigger vuelve a ser exactamente el título.
El contador `x de y` **no** se oculta: es texto informativo corto y no confunde («Contacto 2 de 4»
se lee bien), pero también se prueba con regex.

## Riesgo de A que hay que verificar al implementar

`TabsList` del kit trae `inline-flex h-9 … rounded-lg bg-muted p-1`. Con `overflow-x-auto`, `h-9`
recorta el `focus-visible:ring-2` de los triggers. Por eso arriba va `h-auto` + `w-full`. Si al
probar el anillo sigue recortado, la salida es `p-1.5` en la lista, **no** quitar el anillo.

---

# Feature C — Editor semanal de horarios

## Estructura de datos (el espejo)

```ts
// apps/frontend/src/features/knowledge-base/types/domain.ts
export interface KbScheduleInterval {
  desde: string;        // 'HH:mm'
  hasta: string;        // 'HH:mm'
  /** Para qué es este tramo: «Solo recepción de pedidos». Opcional y SIEMPRE opcional. */
  descripcion?: string;
}

export interface KbScheduleDay {
  dia: string;
  cerrado: boolean;
  intervalos: KbScheduleInterval[];
}
```

`apps/backend/src/features/kb/kb.types.ts` recibe **lo mismo**, con su comentario de espejo. El
backend guarda la `estructura` opaca (`Schema.Types.Mixed`), no la valida campo a campo y no deriva
`contenido`: por eso el cambio es de tipos y nada más. **Cero migración**: los documentos guardados
con `{desde, hasta}` encajan en el tipo nuevo con `descripcion === undefined`.

**Por qué extraer `KbScheduleInterval` a interfaz con nombre**: hoy es un literal inline repetido en
los dos lados. Con nombre, el espejo se compara de un vistazo y los cuatro componentes nuevos lo
importan en vez de re-escribirlo.

### Efecto en las utilidades existentes — analizado

| Función | Efecto | Acción |
|---|---|---|
| `valorVacio` (`kb-schemas.ts:287-301`) | Mira `cerrado` y `intervalos.length`. Un intervalo con solo descripción **cuenta como no vacío** | **Se deja como está.** Es coherente: el admin escribió algo. El serializador es quien decide que ese intervalo no aporta texto, y un día cuyos intervalos son todos inválidos no deja encabezado |
| `leerHorario` (`KnowledgeStructuredForm.tsx:45-51`) | Normaliza los 7 días; no mira dentro del intervalo | **Sin cambios**, se mueve tal cual al nuevo editor semanal |
| `emptyEstructura` | No pre-llena campos | **Sin cambios** |
| `campoAparece` (`kb-serialize.ts:114-120`) | `esVisible` + `!valorVacio` | **Sin cambios** |
| `camposFaltantes` | Ningún campo `horario` es obligatorio en `HORARIOS_SCHEMA` | **Sin cambios**; la validez del intervalo se comprueba aparte (ver abajo) |

## `lib/kb-horario.ts` (nuevo) — helpers puros

Van en `lib/` y no en el componente porque son lógica sin UI, testeable sola, y porque
`KnowledgeUploadEditor` necesita `estructuraConHorarioInvalido` sin montar el editor.

**Tres estados, no un booleano.** Es lo que permite que «me falta escribir la hora de cierre» avise
sin bloquear, mientras que «cierro antes de abrir» sí bloquea. Con un solo `boolean` los dos casos
serían indistinguibles y habría que elegir entre ser hostil mientras se teclea o tragarse un dato mal
formado.

```ts
export type EstadoIntervalo = 'ok' | 'incompleto' | 'invertido';

/**
 * - `incompleto` — falta alguna de las dos horas. Avisa, **no** bloquea.
 * - `invertido`  — están las dos y `desde >= hasta`. **Bloquea** el guardado.
 * - `ok`         — lo único que llega al texto que lee la IA.
 */
export function estadoIntervalo(intervalo: KbScheduleInterval): EstadoIntervalo;

/** Atajo de `estadoIntervalo(i) === 'ok'`. Estricto: es el filtro de la serialización. */
export function intervaloValido(intervalo: KbScheduleInterval): boolean;

/** Los intervalos que un día abierto aporta de verdad (solo `ok`). Vacío ⇒ el día no dice nada. */
export function intervalosUtiles(dia: KbScheduleDay): KbScheduleInterval[];

/**
 * `true` si algún día **abierto** tiene al menos un intervalo `invertido`. Es lo ÚNICO que bloquea
 * el guardado: los `incompleto` no cuentan, por deliberado (criterio 21).
 */
export function hayIntervalosInvertidos(dias: KbScheduleDay[]): boolean;

/** `true` si la estructura entera tiene algún campo `horario` con intervalos invertidos. */
export function estructuraConHorarioInvertido(estructura: KbEstructura): boolean;

/**
 * Copia los intervalos de `origen` a `destinos`. Los días CERRADOS no se tocan: cerrar un día es una
 * decisión explícita del admin y un copiado masivo no puede deshacerla en silencio.
 */
export function copiarHorario(
  dias: KbScheduleDay[],
  origen: string,
  destinos: readonly string[],
): KbScheduleDay[];
```

Comparación de horas: `'HH:mm'` de dos dígitos es **lexicográficamente ordenable**, así que
`desde < hasta` basta y no hace falta parsear. Se documenta en el archivo, porque es de esas cosas
que alguien «arregla» con un `parseInt` innecesario. Un intervalo con `desde === hasta` es
`invertido` (criterio 21): un tramo de duración cero no describe una franja de atención.

**Los nombres dicen `Invertidos`, no `Invalidos`, a propósito.** «Inválido» abarcaría también los
`incompleto`, que **no** bloquean, y el próximo lector daría por hecho que sí. El nombre es la
primera línea de defensa contra esa confusión.

`copiarHorario` copia **por valor** (`intervalos.map(i => ({ ...i }))`), incluida la descripción:
si el admin describió el tramo del lunes, la copia del martes debe decir lo mismo — que era el punto
de copiar.

## `lib/kb-serialize.ts` — `serializarDia`

```ts
function serializarDia(dia: KbScheduleDay): string | null {
  if (dia.cerrado) return `- ${dia.dia}: cerrado`;
  const utiles = intervalosUtiles(dia);
  if (utiles.length === 0) return null;             // NUEVO: día abierto sin nada útil se omite
  const tramos = utiles
    .map((i) => {
      const desc = i.descripcion?.trim() ?? '';
      return desc.length === 0 ? `${i.desde}–${i.hasta}` : `${i.desde}–${i.hasta} (${desc})`;
    })
    .join(', ');
  return `- ${dia.dia}: ${tramos}`;
}
```

Y el filtro de `case 'horario'` (líneas 74-79) pasa de `dia.cerrado || dia.intervalos.length > 0` a
`dia.cerrado || intervalosUtiles(dia).length > 0`, con `serializarDia` devolviendo `null` filtrado
por el `bloque`/`filter` de siempre.

**Determinismo (criterio 20).** Un intervalo sin descripción produce `08:00–12:00`, carácter por
carácter lo mismo que hoy. Los tres comportamientos que ya estaban —día cerrado se conserva, día
abierto sin tramos se omite, orden de ingreso respetado— no se mueven. Lo único que cambia para un
documento **ya guardado** es el caso de un intervalo con una hora en blanco, que hoy emite
`- lunes: –` y pasará a omitirse: eso **sí** re-versiona ese documento al guardarlo, y es
deliberado — hoy está metiendo basura en el texto que lee la IA. Se documenta como el único caso de
texto que cambia, y va a un test propio.

**Separador de la descripción: paréntesis.** `08:00–12:00 (Solo recepción de pedidos)` se lee natural
en una frase generada por la IA. Descartado el guion `—`, que ya usa el tri-estado para otra cosa
(`Etiqueta: Sí — detalle`) y crearía dos significados para el mismo signo en el mismo documento.

## Los cuatro componentes nuevos

```
ScheduleWeekEditor          — dueño del array de 7 días y del copiado
└── ScheduleDayRow          — una fila: nombre, estado, intervalos, acciones
    ├── ScheduleIntervalRow — desde, hasta, descripción, quitar
    └── CopiarHorarioMenu   — DropdownMenu de días destino
```

### `ScheduleWeekEditor.tsx`

```ts
interface ScheduleWeekEditorProps {
  dias: KbScheduleDay[];          // los 7, ya normalizados por el llamador
  onChange: (dias: KbScheduleDay[]) => void;
  /** Prefijo de los `id`; único dentro del formulario. */
  id: string;
}
export function ScheduleWeekEditor(props: ScheduleWeekEditorProps): React.ReactElement;
```

Es quien tiene la vista completa de la semana, así que es quien puede copiar de un día a otro —
`ScheduleDayRow` solo conoce el suyo. Envoltura: `rounded-lg border border-border divide-y
divide-border` (un solo borde para la semana, en vez de siete tarjetas).

### `ScheduleDayRow.tsx`

```ts
interface ScheduleDayRowProps {
  dia: KbScheduleDay;
  onChange: (dia: KbScheduleDay) => void;
  /** Días a los que se puede copiar este horario, con su estado (para no pisar los cerrados). */
  otrosDias: ReadonlyArray<{ dia: string; cerrado: boolean }>;
  onCopiar: (destinos: readonly string[]) => void;
  id: string;
}
```

### `ScheduleIntervalRow.tsx`

```ts
interface ScheduleIntervalRowProps {
  intervalo: KbScheduleInterval;
  onChange: (intervalo: KbScheduleInterval) => void;
  /** Para los `aria-label`: «Abre el lunes, horario 2». */
  dia: string;
  indice: number;
  id: string;
}
```

Mantiene **los mismos `aria-label`** que hoy (`Abre el ${dia}, horario ${n}` / `Cierra el …`): los
tests existentes de `fields.test.tsx` y `KnowledgeBasePage.test.tsx` los usan y no hay razón para
romperlos. Añade `Descripción del horario ${n} del ${dia}` para el campo nuevo.

### `CopiarHorarioMenu.tsx`

```ts
interface CopiarHorarioMenuProps {
  dia: string;
  otrosDias: ReadonlyArray<{ dia: string; cerrado: boolean }>;
  onCopiar: (destinos: readonly string[]) => void;
  disabled?: boolean;   // un día sin intervalos útiles no tiene nada que copiar
}
```

**Elección del control: `DropdownMenu` con `DropdownMenuCheckboxItem`**, y por qué frente a las
alternativas del brief:

| Opción | Por qué no |
|---|---|
| `Select` | Es para **elegir un valor**, no para ejecutar una acción, y no es multi-selección. Un `Select` que al cerrarse copia horarios miente sobre lo que es |
| Lista de `Checkbox` siempre visible | Seis casillas por día × 7 días = 42 controles permanentes en una UI cuyo objetivo declarado es ser **compacta** (criterio 15). Se cancelan entre sí |
| Botón «Aplicar a toda la semana» | Resuelve el caso frecuente en un clic pero **no** el de «lunes a viernes», que es el más común en comercio |
| **`DropdownMenu` + checkbox items (elegida)** | Multi-selección real, plegado por defecto (no cuesta espacio), anclado a la fila de origen y ya vendorizado. Y deja sitio a los dos atajos dentro del mismo menú |

Contenido del menú: dos atajos arriba (`Lunes a viernes`, `Toda la semana`), separador, y los seis
días restantes como `DropdownMenuCheckboxItem`. **Los días cerrados aparecen `disabled`** con la
leyenda «cerrado» a la derecha: el criterio 18 pide que no se sobrescriban y que se vea **antes** de
aplicar, no un aviso posterior. Al pie, un `Button` «Copiar» que confirma la selección — un
`DropdownMenuCheckboxItem` no cierra el menú al marcarse, que es justo lo que se quiere para elegir
varios.

## Propuesta de UI — la semana

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ Horario de atención · Opcional                                              │
│ Marca «Cerrado» los días que no abren: saberlo es tan útil como el horario.  │
├──────────┬──────────────────────────────────────────────────────────────────┤
│ Lunes    │ [08:00] a [12:00]  [Atención presencial      ]  [×]              │
│ ●Abierto │ [14:00] a [18:00]  [Solo recepción de pedidos]  [×]              │
│  [ ]     │ + Añadir otro horario            ⧉ Copiar a…                     │
├──────────┼──────────────────────────────────────────────────────────────────┤
│ Martes   │ [08:00] a [18:00]  [                        ]  [×]               │
│ ●Abierto │ + Añadir otro horario            ⧉ Copiar a…                     │
│  [ ]     │                                                                  │
├──────────┼──────────────────────────────────────────────────────────────────┤
│ Domingo  │ Cerrado                                                          │
│ ○Cerrado │                                                                  │
│  [✓]     │                                                                  │
└──────────┴──────────────────────────────────────────────────────────────────┘

Menú «Copiar a…» (DropdownMenu, anclado a la fila):
        ┌───────────────────────────────┐
        │ Copiar el horario del lunes a │
        │ ─────────────────────────────  │
        │ ▸ Lunes a viernes             │   ← DropdownMenuItem (atajo)
        │ ▸ Toda la semana              │
        │ ─────────────────────────────  │
        │ ☐ martes                      │   ← DropdownMenuCheckboxItem
        │ ☑ miércoles                   │
        │ ☐ jueves                      │
        │ ☐ viernes                     │
        │ ☐ sábado                      │
        │ ☐ domingo          cerrado    │   ← disabled
        │ ─────────────────────────────  │
        │            [ Copiar (1) ]     │
        └───────────────────────────────┘
```

| Pieza | Componente del kit | Tokens |
|---|---|---|
| Contenedor de la semana | — (`div`) | `rounded-lg border border-border divide-y divide-border` |
| Fila del día | — (`div`) | `grid grid-cols-[7.5rem_1fr] gap-3 px-3 py-2.5` |
| Nombre del día | — (`span`) | `text-sm font-medium capitalize` |
| Abierto/Cerrado | **`Switch`** + `Label` | `text-xs text-muted-foreground` |
| Estado visible | **`Badge`** `variant="secondary"` | solo en cerrado: `Cerrado` |
| Horas | **`Input`** `type="time"` | `w-28` (baja de `w-32`: son 7 filas) |
| Descripción | **`Input`** `type="text"` | `flex-1 min-w-0`, `maxLength={80}` |
| Quitar intervalo | **`Button`** `variant="ghost" size="icon"` | igual que `RepeatableList` hoy |
| Añadir | **`Button`** `variant="ghost" size="sm"` | `text-xs` |
| Copiar a… | **`DropdownMenu`** + **`Button`** `variant="ghost" size="sm"` | `text-xs` |
| Error de intervalo | — (`p`) | `text-xs text-destructive` + `aria-invalid` en los dos `Input` |

**Columna fija de 7.5rem para el día**: es lo que hace que la semana se lea como una tabla y se
puedan comparar los días de un vistazo (criterio 15). Sin esa alineación, siete filas apiladas son
solo siete tarjetas más chatas.

### `RepeatableList`: no se reutiliza aquí

Su firma es genérica (`RepeatableListProps<T>`, no `Record<string,string>` — el brief se equivoca
en eso), así que **técnicamente** aceptaría `KbScheduleInterval`. Se descarta igualmente por dos
razones concretas: pinta su botón «Añadir» y su estado vacío **con su propio layout vertical**
(`space-y-2` + `<li className="flex items-start gap-2">`), que es lo contrario de la fila compacta
que pide el criterio 15; y su estado vacío es un bloque `border-dashed` de tres líneas, siete veces
en pantalla. `ScheduleDayRow` monta su propia lista, con `MAX_INTERVALOS` y el botón en la misma
fila. `RepeatableList` **sigue intacta** para `otras_sedes` y `catalogo`.

## Validación (criterio 21) y su efecto en el guardado

`ScheduleIntervalRow` pinta según `estadoIntervalo`:

| Estado | Qué muestra | ¿Bloquea? |
|---|---|---|
| `ok` | nada | no |
| `invertido` | `aria-invalid` en los dos `Input` + **«La hora de cierre debe ser posterior a la de apertura.»** en `text-destructive` | **sí** |
| `incompleto` | **«Completa las dos horas.»** en `text-muted-foreground`, **sin** `aria-invalid` | no |

`KnowledgeUploadEditor` suma **solo** el caso invertido al gate ya existente:

```ts
const horarioInvertido = estructurado && estructuraConHorarioInvertido(estructura);
const puedeGuardar =
  contenidoListo && tituloListo && dentroDelTope && faltantes.length === 0 &&
  !horarioInvertido && !ocupado;
```

**Por qué bloquear el invertido:** el modal promete que lo que se ve es lo que leerá la IA. Como el
serializador lo **omite** (criterio 22), dejar guardar significaría tirar en silencio un tramo
completo que el admin acaba de teclear y da por guardado.

**Por qué NO bloquear el incompleto:** un campo de hora a medio llenar es un estado **natural
mientras se escribe** — se añade un tramo, se borra la hora para reescribirla, y durante esos
segundos el botón Guardar se apagaría. Bloquear ahí sería hostil y no protege nada: un intervalo sin
horas no es un dato que el admin crea haber escrito, es uno que aún no escribió. El aviso inline
basta, y por eso va en `muted` y no en `destructive`: no es un error, es una tarea pendiente.

**Por qué no meterlo en `camposFaltantes`:** esa función responde «¿qué campo exigible está vacío?»
y trabaja sobre `KbFieldDef`. Un intervalo mal formado no es un campo faltante — el campo está lleno,
está **mal**. Mezclarlos obligaría a `kb-schemas.ts` a conocer la forma interna de un `horario`, y
ese archivo hoy no conoce ningún `kind` en particular. Se queda fuera, a propósito.

---

## Mapa de tests

### `pages/KnowledgeBasePage.test.tsx` — el más afectado

**Por A — cambio mecánico de rol**, líneas verificadas:

| Líneas | Aserción actual | Pasa a |
|---|---|---|
| 546-548 | `getByRole('button', { name: /Identidad\|Propósito y valores\|Alcance y respaldo/ })` | `getByRole('tab', …)` |
| 627-629 | ídem `Qué ofrece`, `Precios y condiciones`, `Cómo se entrega` | `getByRole('tab', …)` |
| 729-731 | ídem `Dónde están`, `Cómo contactarlos`, `Cuándo atienden` | `getByRole('tab', …)` |
| 840-842 | ídem `Políticas frecuentes`, `Términos y condiciones` | `getByRole('tab', …)` |

**Por A — tests que ahora necesitan activar la pestaña antes de tocar un campo.** Son los que se
rompen de verdad, porque el campo ya no está montado:

| Test | Sección que hay que activar |
|---|---|
| «los dos obligatorios de empresa bloquean el guardado» | `Identidad` es la primera → sin cambio; el campo condicional «Nombre del grupo» está en `Alcance y respaldo` → **activar** |
| «ningún campo es obligatorio: basta el WhatsApp» (~768) | `Cómo contactarlos` |
| «marcar un día como Cerrado…» (~750) y «guardar horarios…» (~808) | `Cuándo atienden` |
| «el detalle solo se pide al responder “Sí”», «basta UNA respuesta», «guardar políticas» (~867-916) | `Políticas frecuentes` es la primera → sin cambio |
| «…abre el formulario guiado con los 7 días» (~719) | los días ya no están montados al abrir → **activar** `Cuándo atienden` |

Se añade un helper local al archivo para no repetir:

```ts
async function irASeccion(user, dialog: HTMLElement, nombre: RegExp): Promise<void> {
  await user.click(within(dialog).getByRole('tab', { name: nombre }));
}
```

**Por B — dos tests se invierten y uno se añade:**

| Línea | Hoy | Pasa a |
|---|---|---|
| ~781-806 | «el modal de esta categoría SÍ tiene botón Eliminar (HU-KB-10)» | «**no ofrece** Eliminar, por ser una categoría protegida (HU-KB-12)»: `queryByRole('button', { name: /Eliminar/ })` es `null` |
| ~918-941 | ídem para políticas (HU-KB-11) | ídem |
| — | *(no existe)* | **NUEVO**: «Información Complementaria SÍ conserva Eliminar» — blinda la excepción |

Siguen pasando sin tocarse: documento propio (~222), obligatorio (~240) y preset virtual (~251).

**Por C:**

| Test | Cambio |
|---|---|
| «…con los 7 días» (~719-735) | Ya no cuenta `getAllByRole('switch')` con 7 tarjetas: los 7 días siguen ahí pero en filas. La aserción de los nombres de día **se mantiene**; la de `toHaveLength(7)` sobre switches también |
| «marcar un día como Cerrado esconde sus tramos sin borrarlos» (~750-767) | Los `aria-label` no cambian → **solo** hay que activar la pestaña primero |
| «guardar horarios envía contenido y estructura» (~808-826) | Igual, más activar la pestaña |
| — | **NUEVO**: copiar el horario del lunes a martes y miércoles y comprobar que los tres tienen los mismos intervalos, y que un día cerrado no se sobrescribe |
| — | **NUEVO**: escribir una descripción y ver que llega al `contenido` como `(…)` |
| — | **NUEVO**: un intervalo con `hasta < desde` deshabilita «Guardar e indexar» y muestra el error |
| — | **NUEVO**: un intervalo con una hora **vacía** avisa pero **NO** deshabilita el guardado. Es el par del anterior y el que fija la asimetría del criterio 21 |

### `components/KnowledgeStructuredForm.test.tsx`

| Test (línea) | Cambio |
|---|---|
| `describe('el acordeón refleja el schema')` (87) | Renombrar a `las pestañas reflejan el schema` |
| «renderiza una sección por cada una declarada, con su descripción» (88) | Las secciones son `role="tab"`; **la descripción solo se ve en la activa** |
| «renderiza los campos de cada sección con su marcador de exigencia» (96) | Solo los de la pestaña activa; para los de la segunda, activarla |
| «un schema SIN secciones no pinta acordeón» (105) | → «no pinta pestañas»: `queryAllByRole('tab')` vacío |
| «el resumen de la sección cuenta los campos visibles llenos» (112) | Se parte en dos: el `x de y` de una sección **sin** obligatorios, y el **badge ámbar** de una **con** obligatorios, verificado por su `title` |
| «queda FUERA del acordeón: no se puede plegar hasta esconderla» (135) | → «queda fuera de las pestañas»: cambiar de pestaña **no** esconde «Información adicional» |
| «los errores rojos solo salen tras intentar guardar» (185) | **Ya no puede contar 2 errores simultáneos**: solo la pestaña activa monta campos. Pasa a contar los de la pestaña activa y a comprobar que el badge ámbar de la otra delata lo que falta ahí |
| «el resumen de la sección no cuenta los campos ocultos» (233) | Igual de válido; se reescribe contra el indicador de la pestaña |
| Los de `fallback defensivo` (250-296) | Sin cambio de fondo; activar pestaña si el campo no está en la primera |

### `components/fields/fields.test.tsx`

- `describe('ScheduleDayEditor')` (285-357) **se reescribe** como `describe('ScheduleWeekEditor')`.
  Los cuatro casos siguen valiendo y **conservan sus `aria-label`**: día abierto sin tramos, añadir
  con jornada por defecto, horario partido con «Quitar horario 1», y «Cerrado» que esconde sin
  borrar. El quinto («cada día rotula sus controles con su propio nombre») gana sentido: ahora los
  7 días conviven en el mismo árbol, así que es el test que impide que dos días compartan `aria-label`.
- **Nuevos**: descripción por intervalo, error de intervalo inválido con `aria-invalid`, y el menú de
  copiado (marcar dos días → Copiar → los tres coinciden; un día cerrado aparece `disabled`).
- No referencia al acordeón: **verificado**, este archivo no lo importa.

### `lib/kb-serialize.test.ts`

- «horario: un día por línea; “cerrado” es información» (~136) — **se mantiene igual** y pasa a ser
  el candado del criterio 20: mismos datos, mismo texto exacto que antes de la HU.
- «un horario sin días útiles no aparece» (~190) — sin cambio.
- **Nuevos**: intervalo con descripción → `08:00–12:00 (Atención presencial)`; descripción en blanco
  o solo espacios → **idéntico** a no tenerla; intervalo con una hora vacía → se omite; día abierto
  con todos los intervalos inválidos → no deja encabezado.

### `lib/schemas/horarios.schema.test.ts`

- «se identifica como `horarios` en su versión 1» (~56) — **no se toca**: es el test que fija el
  criterio 19.
- Los de forma del horario (~160-234) — siguen valiendo; se añade uno con descripción.
- El de presupuesto (~292-361) — **hay que revisarlo**: `estructuraAlTope` construye los intervalos
  sin descripción, y ahora el peor caso incluye 7 días × 4 tramos × 80 caracteres de descripción
  ≈ **2.240 caracteres más**. Con el margen actual (≈ 4.785) sigue cabiendo, pero el test debe
  **medirlo** con las descripciones llenas, no sin ellas.

### `lib/kb-presets.test.ts` y `lib/kb-horario.test.ts`

- `kb-presets.test.ts`: casos de `esPresetProtegido` — los dos títulos protegidos (con variantes de
  mayúsculas y espacios), «Información Complementaria» → `false`, un título libre → `false`.
- `kb-horario.test.ts` (nuevo): `estadoIntervalo` en sus tres salidas (`ok`, `incompleto` con una y
  con las dos horas vacías, `invertido` con `hasta < desde` y con `desde === hasta`);
  `hayIntervalosInvertidos` — un día **cerrado** con intervalo invertido **no** cuenta, y un
  `incompleto` **tampoco** cuenta nunca; `copiarHorario` (copia por valor con descripción, no pisa
  cerrados, no altera el orden de los días).

---

## Riesgos y supuestos

- **R-1 · Nombre accesible del trigger con badge.** Es el riesgo real de A. Mitigado con
  `aria-hidden` en el número y `title` en el contenedor; si aun así un test con `name` exacto falla,
  la salida es la regex, **no** quitar el indicador.
- **R-2 · `defaultValue` frente a reaperturas del modal.** `Tabs` es no controlado; al desmontarse el
  modal se pierde el estado y vuelve a la primera pestaña. **Es lo que pide el criterio 3**, pero
  conviene tenerlo escrito: si mañana se quiere recordar la última pestaña, hay que pasar a `value` +
  `onValueChange`, no a un `key` distinto.
- **R-3 · Desmontaje = pérdida de contexto para el admin.** Con el acordeón se veía todo a la vez.
  Lo compensa el indicador por pestaña: es la razón por la que el criterio 4 exige que **ninguna
  pestaña quede muda**, ni siquiera las que no exigen nada.
- **R-4 · Presets ya eliminados antes de esta HU.** Si un tenant borró «Horarios y ubicación» o
  «Políticas y términos», su tarjeta **no vuelve**: `mergePresetsWithDocuments` descarta los
  `oculto` y B no añade ninguna vía de reposición. Queda **fuera de alcance** y anotado como
  candidato a una HU de «restaurar categoría» (necesitaría un `PATCH /:id { oculto: false }` y UI
  propia). Vale la pena saber si algún tenant está ya en ese estado antes de liberar.
- **R-5 · `descripcion` en estructuras guardadas.** Es aditivo: `undefined` en todo lo existente y
  `?.trim() ?? ''` en el serializador. Ningún documento cambia de texto por esta propiedad. El
  **único** texto que sí cambia es el de un intervalo con hora en blanco (ver criterio 22), y es
  intencional.
- **R-6 · Presupuesto de caracteres de `horarios`.** 80 caracteres × hasta 28 intervalos es el mayor
  crecimiento que ha tenido esa categoría. El test de presupuesto debe medirlo **con las
  descripciones al tope**; si no cupiera, la palanca es `maxLength` de la descripción, no el número
  de tramos.
- **Supuesto:** «Información Complementaria» conserva Eliminar tal cual, sin discusión — el brief lo
  fija como excepción deliberada.

## Nota de diseño (regla §7)

`frontend-design:frontend-design` está registrada en este entorno y se aplicó al plan;
`emil-design-eng` e `impeccable:impeccable` **siguen sin estar registradas** (como ya se constató en
HU-KB-08…11), así que sus criterios se aplicaron de memoria y **se declaran como pendientes de
verificación** al implementar. Dónde influyeron:

- **«La estructura es información, no decoración.»** De ahí que el indicador de pestaña tenga **tres
  formas distintas** en vez de un número universal: un badge ámbar y un `x de y` significan cosas
  distintas y mezclarlos en un solo contador sería decorar con un número ambiguo. Y de ahí que se
  descarte una tercera fila o un icono por día en la semana.
- **«Gasta la audacia en un solo sitio.»** El elemento con carácter es la **rejilla semanal** —la
  columna fija de día que convierte siete tarjetas en una tabla comparable—. Todo lo demás
  (pestañas, menú de copiado, errores) se mantiene deliberadamente sobrio y con los patrones que el
  admin ya conoce del resto de la app.
- **«El copy es material de diseño.»** Es lo que justifica el criterio 13: un `AlertDialog` que
  promete algo que el sistema no hace es un bug de diseño, no un detalle de redacción. Igual el copy
  de error del intervalo, que dice **qué arreglar** («la hora de cierre debe ser posterior») en vez
  de un «valor inválido» genérico.
- **«Quita un accesorio antes de salir.»** Se descartó el `Badge` de estado *Abierto* en las filas
  abiertas: el `Switch` ya lo dice y los intervalos a la derecha lo demuestran. El `Badge` queda solo
  para *Cerrado*, donde la fila está por lo demás vacía y necesita decir algo.

## Verificación

- `pnpm --filter @sofiapp/api typecheck` y `pnpm --filter @sofiapp/api test` — obligatorios: la HU
  toca `kb.types.ts`.
- `pnpm --filter @sofiapp/web build` (incluye `tsc --noEmit`), `lint` (`--max-warnings 0`), `test`.
- `git diff --stat -- apps/backend` → **solo** `kb.types.ts` (criterio 24).
- `grep -rn "window\.\(alert\|confirm\|prompt\)\|[^.]\balert(\|\bconfirm(\|\bprompt(" apps/frontend/src`
  → sin resultados (criterio 23).
- `grep -rn "bg-\[#" apps/frontend/src/features/knowledge-base` → sin resultados.
- `grep -rn "accordion" apps/frontend/src/features/knowledge-base` → sin resultados (criterio 1).

> **Filtros de pnpm.** Los paquetes son `@sofiapp/web` y `@sofiapp/api`.
