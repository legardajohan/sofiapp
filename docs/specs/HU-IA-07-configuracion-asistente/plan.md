# HU-IA-07 — Plan técnico (CÓMO)

> Se construye **sobre `feat/HU-IA-01`**, sin rama nueva.
>
> **No hay slice nuevo.** Las cinco modificaciones caen sobre features que ya existen: `features/ai/`
> (handoff), `features/conversation/` (resolución del destino), `features/cliente/` (el motivo
> guardado) y dos features del frontend. El único archivo nuevo del backend es un test; el resto son
> ampliaciones. **Ninguna colección nueva, ningún índice nuevo** — las métricas se apoyan en
> `{ tenantId, asesorId }` y `{ tenantId, estadoComercial }`, que ya existen.
>
> El único cambio con riesgo transversal es `aggregateScoped` en `base.repository.ts`: es el archivo
> que sostiene la regla número uno del proyecto, así que va primero y con su propio test.

## Archivos a crear

```
apps/backend/src/features/ai/
└── ai-handoff.metricas.test.ts        # [CREAR] agregado por asesor + aislamiento

apps/frontend/src/features/handoff/
├── components/CondicionDialog.tsx     # [CREAR] modal de crear/editar una condición extra
├── components/AsignacionDialog.tsx    # [CREAR] modal de asignación por asesor
├── components/CargaBar.tsx            # [CREAR] barra proporcional (CSS, sin librería)
├── hooks/useAsesorMetricas.ts         # [CREAR] useQuery del endpoint de métricas
├── components/HandoffSettingsForm.test.tsx  # [CREAR] condiciones extra, estrategia, título
└── components/AsignacionDialog.test.tsx     # [CREAR] tabla, carga, vacío, error
```

## Archivos a modificar

```
apps/backend/src/
├── repositories/base.repository.ts    # [MODIFICAR] aggregateScoped
├── repositories/base.repository.test.ts # [MODIFICAR] tests del helper nuevo
├── features/ai/
│   ├── ai-handoff.types.ts            # [MODIFICAR] condicionesExtras, estrategiaDestino, motivo custom
│   ├── ai-handoff.model.ts            # [MODIFICAR] los dos campos nuevos
│   ├── ai-handoff.validation.ts       # [MODIFICAR] Zod de condiciones y de estrategia
│   ├── ai-handoff.service.ts          # [MODIFICAR] evaluación extra, métricas, menor carga
│   ├── ai-handoff.controller.ts       # [MODIFICAR] controller de métricas
│   ├── ai-handoff.routes.ts           # [MODIFICAR] GET /asesores/metricas
│   ├── ai-handoff.service.test.ts     # [MODIFICAR] prioridad y guardas nuevas
│   ├── ai-handoff.routes.test.ts      # [MODIFICAR] cuerpo ampliado del PUT
│   └── ai-handoff.isolation.test.ts   # [MODIFICAR] el endpoint nuevo
├── features/cliente/
│   ├── cliente.types.ts               # [MODIFICAR] IHandoffCondicion en ICliente
│   └── cliente.model.ts               # [MODIFICAR] subdoc handoffCondicion
├── features/conversation/
│   ├── conversation.types.ts          # [MODIFICAR] handoff DTO gana la condición
│   ├── conversation.mapper.ts         # [MODIFICAR] proyecta handoffCondicion
│   └── conversation.service.ts        # [MODIFICAR] resolverDestino con estrategia; handoffConversation guarda la condición
└── workers/ai-reply.processor.ts      # [MODIFICAR] arrastra la condición hasta el handoff

apps/frontend/src/features/
├── ai-assistant/components/SystemPromptPreview.tsx   # [BORRAR]
├── ai-assistant/components/AssistantConfigForm.tsx   # [MODIFICAR] quita el bloque
├── ai-assistant/pages/AssistantConfigPage.test.tsx   # [MODIFICAR] quita el test de la vista previa
├── handoff/types.ts                   # [MODIFICAR] tipos nuevos + MOTIVO_LABEL.custom
├── handoff/api.ts                     # [MODIFICAR] fetchAsesorMetricas
├── handoff/index.ts                   # [MODIFICAR] exports
├── handoff/components/TriggerCard.tsx # [MODIFICAR] slot opcional de acciones
├── handoff/components/HandoffSettingsForm.tsx  # [MODIFICAR] las 4 piezas de UI
└── inbox/components/HandoffBanner.tsx # [MODIFICAR] pinta el nombre de la condición

docs/
├── data-model.md                      # [MODIFICAR] handoff_settings + clientes.handoffCondicion
├── api-contract.md                    # [MODIFICAR] §6: métricas + cuerpo ampliado del PUT
├── domain.md                          # [MODIFICAR] la prioridad con las extra dentro
└── multi-tenancy.md                   # [MODIFICAR] aggregateScoped en la lista del repositorio
```

---

## 0. `aggregateScoped` (`repositories/base.repository.ts`)

Va **primero**: es de lo que dependen las modificaciones 4 y 5, y es el único cambio de esta historia
sobre la regla número uno del proyecto.

```ts
/**
 * Agregación tenant-safe. **Antepone siempre** el `$match` del tenant: un pipeline que traiga el
 * suyo propio no puede saltárselo, porque el primero filtra antes.
 *
 * El `new Types.ObjectId(...)` NO es cosmético. `find` castea el filtro contra el schema; un
 * pipeline de agregación NO — un `tenantId` en forma de string no encontraría nada y devolvería
 * `[]` sin error. Falla cerrado, pero en silencio, y es justo el fallo que este helper existe para
 * que nadie tenga que recordar.
 */
export function aggregateScoped<R>(
  m: Model<unknown>,
  tenantId: TenantId,
  pipeline: PipelineStage[],
): Aggregate<R[]>;
```

> **Por qué un helper y no una agregación suelta.** El proyecto prohíbe `Model.find` directo
> (`CLAUDE.md` §1) por un motivo que aplica igual aquí, y más: una agregación mal escrita no lanza,
> devuelve datos de más. Concentrarlo en una función es lo que permite testear el invariante **una
> vez** en `base.repository.test.ts` en vez de en cada llamador.

> **No se añade `countScoped` por asesor.** Con `aggregateScoped`, todo el dashboard es una consulta.

---

## 1. Quitar «Así lo recibe el modelo» (`features/ai-assistant/`)

- **Borrar** `components/SystemPromptPreview.tsx`. Uso único (`AssistantConfigForm.tsx:93`), así que
  dejar el archivo sería código muerto que el lint no marca (es un export).
- `AssistantConfigForm.tsx`: quitar el import (L7) y el render (L93). Nada más — `tono` y
  `systemPrompt` siguen siendo estado del formulario.
- `AssistantConfigPage.test.tsx`: quitar el test `la vista previa refleja en vivo…` (L108-118) y la
  mención en el comentario de cabecera (L3).

> **Por qué se puede quitar.** No es que estorbe: es que hay algo mejor. `AiResponseContextSheet`
> (HU-IA-04) muestra el prompt **real** de una respuesta real, con su versión de plantilla y sus
> fragmentos recuperados. La vista previa lo **reconstruía a mano**, así que era una segunda fuente
> de verdad que había que mantener en sincronía cada vez que cambiara la composición del prompt — y
> HU-IA-05 y HU-IA-06 ya la cambiaron dos veces sin que nadie tocara este archivo.

---

## 2. Condiciones de transferencia propias

### 2.1 `ai-handoff.types.ts`

```ts
export const MOTIVOS_HANDOFF = [
  'explicit_request',
  'keyword',
  'custom',          // ← NUEVO: una condición que escribió el admin
  'low_confidence',
  'intent_purchase',
] as const;

/**
 * Una condición de transferencia creada por el admin. Es un grupo de palabras CON NOMBRE: lo que
 * añade sobre `reglas.keyword` es poder encenderlas por separado y que la bandeja diga cuál fue.
 *
 * Sin discriminante `tipo` **todavía**: hoy solo hay uno. La forma está preparada para ganarlo sin
 * migrar nada, pero cada tipo nuevo es un evaluador nuevo en el worker y eso es otra historia.
 */
export interface ICondicionExtra {
  /** Slug derivado del nombre AL CREARLA; NO cambia al renombrarla. Molde: `contact_options.key`. */
  key: string;
  nombre: string;
  activa: boolean;
  palabras: string[];
}

export type EstrategiaDestino = 'primero' | 'menor_carga' | 'fijo';
```

`IHandoffSettings` y `HandoffSettingsDTO` ganan `condicionesExtras: ICondicionExtra[]` y
`estrategiaDestino: EstrategiaDestino`.

`HandoffDecision` gana el detalle de la condición, porque el worker tiene que arrastrarlo hasta
`handoffConversation`:

```ts
export type HandoffDecision =
  | { dispara: false }
  | { dispara: true; motivo: HandoffMotivo; condicion?: { key: string; nombre: string } };
```

> **`condicion` opcional y no un `motivo` dinámico.** `HandoffMotivo` lo consumen cuatro capas
> (`Cliente.handoffMotivo`, la auditoría, el DTO de la bandeja, `MOTIVO_LABEL`) y un `Record` sobre
> una unión abierta deja de ser exhaustivo: el compilador dejaría de avisar del caso que falta.

### 2.2 `ai-handoff.model.ts`

```ts
condicionesExtras: {
  type: [new Schema({
    key: { type: String, required: true },
    nombre: { type: String, required: true, trim: true },
    activa: { type: Boolean, default: true },
    palabras: { type: [String], default: [] },
  }, { _id: false })],
  default: [],
},
estrategiaDestino: { type: String, enum: ['primero', 'menor_carga', 'fijo'], default: 'primero' },
```

> **`_id: false`**, igual que `semaforoIA` y `atributos`: la identidad es la `key`, y un `_id` de
> Mongo por fila sería un segundo identificador que nadie usa y que el DTO tendría que ocultar.

> **Sin script de migración.** Los dos campos tienen `default`, y para los documentos ya guardados
> `toDTO` rellena: `condicionesExtras: doc.condicionesExtras ?? []` y
> `estrategiaDestino: doc.estrategiaDestino ?? (doc.asesorDestinoId ? 'fijo' : 'primero')`. Un tenant
> que no abra esta pantalla se comporta exactamente igual que antes (AC12).

### 2.3 `ai-handoff.validation.ts`

Reutiliza `termino` y `listaTerminos`, que ya existen. Se añade:

```ts
const condicionKey = z.string().regex(/^[a-z0-9][a-z0-9_-]*$/).max(40);

const condicionExtra = z.object({
  key: condicionKey,
  nombre: z.string().trim().min(2).max(40),
  activa: z.boolean(),
  // Al menos una: una condición sin palabras no puede dispararse nunca, así que guardarla sería
  // dejar al admin creyendo que configuró algo. Mismo criterio que el umbral de `lowConfidence`.
  palabras: listaTerminos.min(1),
});

const condicionesExtras = z.array(condicionExtra).max(10).superRefine(/* key y nombre únicos */);
```

- **Máximo 10.** No es un límite técnico: cada condición es una tarjeta más en una pantalla que ya
  tiene cuatro, y a partir de ahí el admin deja de poder leer su propia configuración de un vistazo.
- **Únicas por `key` y por nombre normalizado** (sin mayúsculas ni tildes), con `superRefine` — molde
  exacto de `atributosSchema` (`cliente.validation.ts`), incluida la ruta del error por índice.

El cuerpo del `PUT` gana además la coherencia entre estrategia y asesor:

```ts
.superRefine((body, ctx) => {
  if (body.estrategiaDestino === 'fijo' && body.asesorDestinoId === null) { /* 400 */ }
  if (body.estrategiaDestino !== 'fijo' && body.asesorDestinoId !== null) { /* 400 */ }
})
```

> **Se valida en el borde, no en el servicio.** Un cuerpo con `estrategiaDestino: 'menor_carga'` y un
> `asesorDestinoId` puesto describe dos destinos a la vez: es una petición mal formada, no una regla
> de negocio (AC15).

### 2.4 `ai-handoff.service.ts` — la evaluación

`REGLAS_DE_FABRICA` no cambia; `settingsDeFabrica()` añade `condicionesExtras: []` y
`estrategiaDestino: 'primero'`.

En `evaluarAntesDeGenerar`, **después** de `keyword`:

```ts
for (const c of settings.condicionesExtras) {
  if (!c.activa) continue;
  if (algunTermino(ultimoMensajeCliente, c.palabras)) {
    return { dispara: true, motivo: 'custom', condicion: { key: c.key, nombre: c.nombre } };
  }
}
```

> **Se reutiliza `algunTermino`, no se copia.** Es la función que ya garantiza coincidencia por
> palabra completa, sin mayúsculas ni tildes (AC8). Duplicarla dejaría que las condiciones del admin
> se comportaran distinto de las de fábrica ante «asesoría» vs «asesor».

> **Van después de las cuatro fijas y antes de las dos caras.** Delante de `lowConfidence` e
> `intentPurchase` por el mismo motivo que ya pone `keyword` delante: son gratis, no llaman al
> modelo, y si la conversación se va a una persona, pagar una generación para tirarla es gasto y
> latencia puros. Detrás de las dos fijas de texto porque **la prioridad entre las de fábrica la
> fija el producto** (`ai-handoff.types.ts:4-9`), y esa promesa no se rompe.

### 2.5 Que el motivo llegue a la bandeja

- `cliente.types.ts` / `cliente.model.ts`: `handoffCondicion: { key, nombre } | null`, subdoc con
  `_id: false`, `default: null`. Se limpia junto a `handoffAt`/`handoffMotivo` en el `$unset` que ya
  existe al reactivar a Sofi (`conversation.service.ts:435`).
- `handoffConversation(tenantId, clienteId, motivo, ..., condicion)` lo escribe.
- `conversation.mapper.ts`: `handoff: { at, motivo, condicion }`.
- `HandoffBanner`: si hay `condicion`, pinta su `nombre`; si no, `MOTIVO_LABEL[motivo]`.
- `MOTIVO_LABEL` gana `custom: 'Cumplió una de tus condiciones'` — el fallback para una conversación
  transferida antes de que el nombre se guardara, y lo que hace que el `Record` siga siendo exhaustivo.

> **Se guarda el NOMBRE, no solo la clave.** Dos razones, y la segunda es la de peso: (a) el banner
> no puede leer la configuración de handoff para pintar una línea; (b) si el admin renombra o borra
> la condición, esa conversación debe seguir diciendo **por qué se transfirió entonces** (AC11).
> Mismo criterio con el que `lead.delete` guarda el lead entero en `antes`.

### 2.6 Frontend — el botón y el modal

`TriggerCard` gana un slot opcional `acciones?: React.ReactNode` a la derecha del interruptor. Es la
alternativa a bifurcar el componente: una condición extra **es** un disparador, solo que además se
puede editar y borrar.

`CondicionDialog` (`Dialog` de shadcn, ya vendorizado):

```
┌ Nueva condición de transferencia ──────────────┐
│                                                 │
│ Nombre                                          │
│ [ Facturación                              ]    │
│ Lo verás en la bandeja cuando Sofi transfiera   │
│ por esta condición.                             │
│                                                 │
│ Palabras que la activan                  3 / 30 │
│ [ nit                              ] [ + ]      │
│ ( factura ×) ( recibo ×) ( nit ×)               │
│ Coinciden como palabra completa: «factura» no   │
│ se activa dentro de «facturación».              │
│                                                 │
│              [ Cancelar ]  [ Añadir condición ] │
└─────────────────────────────────────────────────┘
```

- **`TermList` se reutiliza tal cual.** Ya resuelve chips, Enter, duplicados y el tope de 30. Escribir
  un segundo editor de listas sería inconsistencia visual, no una decisión de diseño.
- La `key` se deriva del nombre con `slugificar` (el que ya usa `ContactEditDialog` para los
  atributos), y **solo al crear**: al editar, la `key` viaja intacta.
- El mismo diálogo sirve para editar: el título y el botón cambian de verbo (`Añadir condición` /
  `Guardar condición`), y el campo nombre avisa de que la clave no cambia.
- **No guarda contra el servidor.** Devuelve la condición al formulario, que la mete en su estado; se
  persiste con el `Guardar cambios` que ya existe. Un modal que guardara por su cuenta rompería el
  «Descartar cambios» de la página.

---

## 3. Renombrar la sección (`HandoffSettingsForm.tsx:241-244`)

`Qué pasa al transferir` → **`Asignación y aviso`**.

La sub-línea actual («A quién le llega la conversación y qué se le dice al cliente mientras tanto»)
se conserva: con el título más corto, es la que hace el trabajo de explicar, y ya está escrita en los
términos del admin.

> **Por qué este título.** Es el par de las otras cabeceras de la página («Cuándo transferir»): dos
> palabras, sin verbo, nombrando lo que se configura. «Asignación» es además el vocabulario que el
> producto ya usa en HU-OMNI-02 y el que aparece en el botón nuevo de al lado, «Ver asignación»: la
> misma palabra para la misma cosa en los dos sitios.

---

## 4. Reparto por carga

### 4.1 `ai-handoff.service.ts` — el agregado

```ts
/** Estados que cuentan como carga viva. `pagado` y `perdido` son cierres (docs/domain.md §3). */
const ESTADOS_ACTIVOS = ['nuevo', 'en_gestion', 'pago_pendiente'] as const;

/** Conversaciones activas por asesor, en UNA consulta. La clave del mapa es el id del asesor. */
async function cargaPorAsesor(tenantId: string): Promise<Map<string, number>>;

/**
 * Admin activo con menos conversaciones activas. **Empate → el primero por nombre**: el reparto
 * tiene que poder explicársele a quien pregunte por qué le llegó a él, y un desempate aleatorio no
 * se puede explicar. `listTenantUsers` ya ordena por nombre, así que basta con recorrerlo en orden.
 *
 * Un admin sin ninguna conversación cuenta como 0 y por tanto gana: es exactamente a quien
 * queremos mandarle la siguiente.
 */
export async function asesorConMenorCarga(tenantId: string): Promise<string | null>;
```

El pipeline, sobre `aggregateScoped`:

```ts
[
  { $match: { asesorId: { $ne: null }, estadoComercial: { $in: ESTADOS_ACTIVOS } } },
  { $group: { _id: '$asesorId', activas: { $sum: 1 } } },
]
```

> Se apoya en `{ tenantId, asesorId }` y `{ tenantId, estadoComercial }`, que ya existen. **Ningún
> índice nuevo.**

### 4.2 `conversation.service.ts` — `resolverDestino`

```ts
async function resolverDestino(
  tenantId: string,
  estrategia: EstrategiaDestino,
  asesorDestinoId: string | null,
): Promise<string | null>
```

Cascada, conservando el fallback que ya tiene hoy:

1. `'fijo'` → `assertAssignableAdmin`; si falla (el asesor se desactivó), `logger.warn` y sigue.
2. `'menor_carga'` → `asesorConMenorCarga`, dentro de `try/catch`: si el agregado falla, se registra
   y **se sigue**.
3. Cualquier otro caso, y todos los fallbacks → `primerAdminActivo`.

> **Nunca deja la conversación sin dueño por un fallo de una métrica** (AC18). Un handoff que no
> asigna es un cliente esperando; un handoff que asigna al primero en vez de al de menos carga es un
> reparto subóptimo. La diferencia de coste entre los dos errores no admite discusión.

### 4.3 Frontend

Tercera opción en el `Select`, con el `SIN_ASESOR_FIJO` actual reemplazado por dos centinelas:

| Valor del `Select` | Se guarda |
|---|---|
| `__primero__` | `{ estrategiaDestino: 'primero', asesorDestinoId: null }` |
| `__menor_carga__` | `{ estrategiaDestino: 'menor_carga', asesorDestinoId: null }` |
| `<id de usuario>` | `{ estrategiaDestino: 'fijo', asesorDestinoId: <id> }` |

Copy de las opciones, en lo que el admin controla y no en cómo está hecho:

- `El primero del equipo` — se conserva, pero la ayuda de abajo pasa a decir que es por orden
  alfabético. Hoy no lo dice y es información que cambia la decisión.
- `Quien tenga menos conversaciones activas` — no «menor carga»: nombra la unidad que el admin acaba
  de ver en el modal de al lado, y es la misma cifra.

---

## 5. El modal de asignación

### Skills de diseño (regla §7 del `CLAUDE.md` raíz)

Antes de escribir los componentes hay que invocar `emil-design-eng`, `impeccable:impeccable` y
`frontend-design:frontend-design`. En este entorno **solo la tercera está registrada**; las otras dos
devuelven `Unknown skill`. Se invocan igualmente y queda constancia en `tasks.md`, aplicando sus
criterios desde conocimiento propio — igual que hicieron HU-IA-04, HU-IA-05 y HU-IA-06.

**Lo que cambió por la pasada de `frontend-design`.** El primer boceto era una barra apilada por
`estadoComercial`: cinco segmentos de color por asesor. Se descartó por dos motivos, y el segundo es
el que manda:

1. Cinco colores accesibles y distinguibles en claro y oscuro **no existen** en el vocabulario de
   tokens del proyecto (`primary`, `muted`, `success`, `destructive`), y `tagColors` es para colores
   que vienen de la base de datos. Habría que inventarlos, contra la regla de cero color arbitrario.
2. Una barra apilada responde «cómo se reparte la cartera de este asesor». La pregunta que trae al
   admin a este modal es otra: **«¿quién está más cargado?»**. Esa es una sola variable, y una sola
   variable se lee mejor en una sola barra.

Resultado: **la barra codifica solo la asignación activa**, proporcional al asesor más cargado; el
desglose por estado vive en columnas numéricas al lado. Es el accesorio que se quita.

### Sitio y forma

Botón `variant="outline" size="sm"` **«Ver asignación»**, junto al `Select` de «Asesor que la
recibe» (misma fila, `sm:flex-row`). Abre un `Dialog`:

```
┌ Cómo está repartido el trabajo ─────────────────────────────┐
│ Conversaciones sin cerrar por asesor. Totales, sin rango.   │
│                                                              │
│ Asesor      Activas                    Nuevas  Gestión  Pago  Pagadas │
│ Ana Ruiz    ███████████████████  18        4       11      3      27  │
│ Luis Peña   ████████             8         2        5      1      12  │
│ Carlos M.   ███                  3         1        2      0      31  │
│                                                              │
│ «Activas» son las que no están en pagado ni perdido.        │
│                                              [ Cerrar ]      │
└──────────────────────────────────────────────────────────────┘
```

Decisiones de forma:

- **Ordenado por activas, descendente.** El orden es información: quien abre esto busca al saturado,
  y ponerlo primero es la respuesta. Alfabético sería ordenar por un dato que no importa aquí.
- **La barra es proporcional al máximo, no al total.** La pregunta es comparativa entre asesores, así
  que la escala tiene que estar anclada al más cargado; contra el total, con diez asesores todas las
  barras serían igual de cortas y no dirían nada.
- **La barra es decorativa** (`aria-hidden`): el valor accesible es el número que va al lado. Un
  lector de pantalla lee la tabla, no la longitud de un `div`.
- **`pagado` va en su propia columna, al final**, separada del resto: es la única métrica de
  desempeño de la fila y mezclarla con la cartera viva invitaría a sumarlas.
- **Se dice que son totales.** Sin rango temporal, porque `estadoComercial` no guarda fecha de cierre.
  Callarlo dejaría que alguien leyera «31 pagadas» como «este mes».
- `Table` de shadcn, ya vendorizado. **Cero dependencias nuevas** (AC21).
- Tokens semánticos, claro y oscuro, cero `bg-[#...]`. La barra es `bg-primary` sobre `bg-muted`.
- Sin animación de entrada de las barras: el modal se abre para leerlo, no para verlo montarse.

| Estado | Qué se ve |
|---|---|
| **Cargando** | Tres filas de `Skeleton` con la forma de la tabla, `aria-busy` |
| **Vacío** | «Todavía no hay asesores activos en tu empresa.» + qué hacer: dar de alta o reactivar a alguien desde Usuarios |
| **Error** | `role="alert"` con el mensaje del servidor y un botón «Reintentar» |

### Backend

```
GET /api/ai/handoff-rules/asesores/metricas
  authenticateJWT · requireTenant · authorize(['admin']) · validate(...) · asyncHandler
```

```ts
export interface AsesorMetricasDTO {
  asesorId: string;
  nombre: string;
  /** Suma de los estados vivos. Es la cifra que gobierna el reparto por menor carga. */
  activas: number;
  /** Desglose completo, incluidos los cierres. Un asesor sin nada trae todo a 0. */
  porEstado: Record<EstadoComercial, number>;
}
```

- **Un solo endpoint y una sola agregación**, más la lista de admins que ya se resuelve con
  `listTenantUsers`.
- **Filas también para los asesores con cero.** Se parte de los admins activos y se rellena desde el
  agregado, no al revés: un asesor sin trabajo asignado es justo el que hay que ver (AC20).
- **Solo admins activos.** Un usuario desactivado no puede recibir conversaciones, así que listarlo
  sería ofrecer un destino imposible.
- Misma ruta y mismos roles que la configuración que se está editando: es información **para**
  decidir el destino, no un módulo de reportes. Cuando exista CRM-04, esto se mueve allí.

### Frontend — datos

```ts
// handoff/api.ts — ruta SIN el prefijo `/api`: lo aporta el baseURL del apiClient.
export const fetchAsesorMetricas = async (): Promise<AsesorMetricasDTO[]> => { … };
```

```ts
// handoff/hooks/useAsesorMetricas.ts
// `enabled: abierto` + `staleTime: 0`: los datos cambian con cada handoff, así que cada apertura
// del modal los vuelve a pedir. Sin esto se leería una foto de hace media hora para tomar una
// decisión sobre el reparto de ahora.
export function useAsesorMetricas(abierto: boolean): UseQueryResult<AsesorMetricasDTO[]>;
```

---

## Notas

- **Aislamiento.** Todo lo nuevo pasa por `*Scoped`, incluida la agregación. El `tenantId` del
  endpoint nace del token; el de la resolución por carga, del job, que lo resolvió por
  `MetaIntegration` en el webhook. Ninguna función nueva acepta `tenantId` desde un cuerpo.
- **La auditoría no cambia.** `conversation.handoff` ya registra el motivo; ahora el `despues`
  arrastra además la condición cuando la hay. No hay acción nueva: sigue siendo el mismo hecho.
- **Orden de implementación.** `aggregateScoped` (§0) → el borrado del frontend (§1, independiente de
  todo) → tipos, modelo y Zod del handoff (§2.1-2.3) → motor y propagación del motivo (§2.4-2.5) →
  reparto por carga (§4.1-4.2) → endpoint de métricas (§5 backend) → frontend del handoff
  (§2.6, §3, §4.3, §5) → docs. Así `tsc --noEmit` no acumula errores en cascada y cada modificación
  del frontend cae sobre un backend que ya responde.
- **Dependencias entre las cinco.** La 1 y la 3 son independientes y se pueden hacer en cualquier
  momento. La 2 es autónoma. La **4 depende de la 0** (`aggregateScoped`) y la **5 también**; además
  la 4 y la 5 comparten la definición de «activa», así que la 5 debería ir **después** de la 4 para
  que la constante `ESTADOS_ACTIVOS` nazca una sola vez y en su sitio. La 5 se apoya visualmente en
  la 3 (el botón vive en la sección renombrada), pero no la necesita para compilar.

## Riesgos

1. **`aggregateScoped` toca la regla número uno.** Es el riesgo real de la historia. Mitigación: el
   `$match` del tenant va **primero** y no es sobrescribible por el pipeline del llamador, el
   `tenantId` se castea dentro del helper, y los dos invariantes tienen test propio antes de que
   exista el primer llamador.
2. **`HandoffMotivo` gana un valor.** Cualquier `switch` o `Record` sobre la unión deja de ser
   exhaustivo y el compilador lo va a señalar — que es exactamente lo que se quiere. Mitigación:
   `tsc --noEmit` es el inventario de sitios a tocar; ninguno se busca a mano.
3. **La carga se lee en el camino caliente del worker.** `asesorConMenorCarga` añade una agregación
   por handoff. Es un evento poco frecuente (no uno por mensaje) y la agregación va sobre dos índices
   existentes, pero queda dicho. Si algún día molesta, el sitio para cachearlo es este párrafo.
4. **El nombre de la condición se denormaliza.** `Cliente.handoffCondicion.nombre` puede divergir del
   nombre actual de la condición. **Es deliberado** (AC11), pero hay que resistir la tentación de
   «arreglarlo» resolviéndolo contra la configuración en el mapper.
5. **Diez condiciones extra son diez tarjetas más.** La página ya tiene cuatro. Si en uso real
   resulta ilegible, la solución es colapsarlas, no subir el tope.

## Verificación

```bash
pnpm --filter @sofiapp/api typecheck
pnpm --filter @sofiapp/api test
pnpm --filter @sofiapp/web build
pnpm --filter @sofiapp/web lint
pnpm --filter @sofiapp/web test
```

> **Los filtros son `@sofiapp/api` y `@sofiapp/web`.** Los nombres `backend`/`frontend` del
> `CLAUDE.md` raíz no matchean ningún paquete del workspace.

Manual, con un tenant real y la transferencia encendida:

1. Crear una condición «Facturación» con `factura`, `recibo`, `nit`; guardar; recargar y comprobar
   que sigue ahí y encendida.
2. Escribir por WhatsApp «necesito la factura» → la conversación se transfiere y el banner dice
   «facturación».
3. Renombrar la condición a «Cobros» → esa conversación **sigue** diciendo «facturación».
4. Abrir «Ver asignación» con tres admins de carteras distintas: el más cargado, arriba, con la
   barra más larga.
5. Cambiar el destino a «Quien tenga menos conversaciones activas», guardar, y provocar un handoff:
   llega al de la barra más corta.
6. Desactivar a ese asesor y volver a provocar un handoff → llega a otro, sin error en el log.
7. Un tenant que nunca guardó configuración: la pantalla abre en fábrica, sin condiciones extra y
   con «El primero del equipo».
8. Los dos modales, revisados en claro y oscuro, y navegables solo con teclado.
