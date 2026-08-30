# HU-FLOW-01 — Plan técnico (CÓMO)

## Archivos a crear

```
apps/backend/src/
├── features/flow/
│   ├── flow.types.ts              # TipoNodo, OperadorCondicion, INodo, IArista, IFlow, IFlowState, DTOs
│   ├── flow.model.ts              # schemas Flow y FlowState + índices
│   ├── flow.validation.ts         # Zod por tipo de nodo (unión discriminada) + validación de grafo
│   ├── flow.engine.ts             # MOTOR PURO: (flow, state, mensaje) → { nodoSiguiente, efectos[] }
│   ├── flow.service.ts            # CRUD tenant-safe + activación exclusiva
│   ├── flow.runtime.service.ts    # ejecuta los efectos del motor (I/O: Mongo, AIService, sendOutbound)
│   ├── flow.controller.ts
│   ├── flow.routes.ts
│   ├── flow.engine.test.ts        # sin Mongo: el DoD de la historia vive aquí
│   ├── flow.isolation.test.ts
│   ├── flow.validation.test.ts
│   └── flow.routes.test.ts

apps/frontend/src/features/flows/
├── api.ts · types.ts · index.ts
├── pages/FlowsPage.tsx · pages/FlowEditorPage.tsx
├── components/FlowCanvas.tsx           # <ReactFlow> + tokens semánticos
├── components/nodes/*.tsx              # un nodo custom por tipo
├── components/NodeInspector.tsx        # panel lateral de configuración del nodo seleccionado
├── components/ConditionEditor.tsx      # ramas: operador + valor + destino
└── hooks/useFlows.ts · useFlow.ts · useSaveFlow.ts
```

## Archivos a modificar

```
apps/backend/src/
├── app.ts                              # app.use('/api/flows', flowRoutes)
└── workers/inbound-message.processor.ts# reemplaza el TODO(Fase 3) de la línea 71
apps/frontend/src/
├── router.tsx                          # /flows y /flows/:id
└── components/layout/nav-config.ts     # entrada "Flujos" (rol admin)
docs/
├── data-model.md                       # concretar `config` por tipo de nodo; + campo `entrada`
└── domain.md                           # entidad Flow: de "Fase 3" a implementada
```

## Contratos

### `flow.types.ts`

```ts
export const TIPOS_NODO = ['mensaje','captura','condicion','intencion','kb','accion','handoff','espera'] as const;
export type TipoNodo = (typeof TIPOS_NODO)[number];

export const OPERADORES = ['igual_a', 'contiene', 'opcion_elegida'] as const;
export type OperadorCondicion = (typeof OPERADORES)[number];

export interface IArista { id: string; from: string; to: string; condicion?: string }

interface INodoBase { id: string; tipo: TipoNodo; posicion: { x: number; y: number } }

/** Config por tipo. Unión discriminada: Zod la valida y TS la estrecha. */
export type ConfigNodo =
  | { tipo: 'mensaje';   texto?: string; templateId?: string; parametros?: string[] }
  | { tipo: 'captura';   campo: string; descripcion: string; tipoDato: 'texto'|'numero'|'fecha'|'booleano'; pregunta: string; reintentos: number }
  | { tipo: 'condicion'; variable: 'ultimo_mensaje' | `var:${string}`; ramas: IRamaCondicion[]; ramaPorDefecto: string }
  | { tipo: 'intencion'; etiquetas: Array<{ etiqueta: string; descripcion: string; nodoDestino: string }>; ramaPorDefecto: string }
  | { tipo: 'kb';        pregunta: 'ultimo_mensaje' | string; kSobrescrito?: number; siNoHayRespuesta: string }
  | { tipo: 'accion';    efecto: EfectoAccion }
  | { tipo: 'handoff';   motivo?: string; notificarAsesorId?: string }
  | { tipo: 'espera';    minutos: number };                       // lo ejecuta HU-FLOW-02

export interface IRamaCondicion { operador: OperadorCondicion; valor: string; nodoDestino: string }

export type EfectoAccion =
  | { tipo: 'cambiar_estado'; estado: EstadoComercial }
  | { tipo: 'aplicar_etiquetas'; tagIds: string[] }
  | { tipo: 'crear_lead' }
  | { tipo: 'asignar_asesor'; asesorId: string };

export interface INodo extends INodoBase { config: ConfigNodo }
```

> **La restricción anti-duplicación de KB es estructural, no un comentario.** `condicion` e
> `intencion` no tienen ningún campo de texto de respuesta en su config: no hay dónde escribirla.
> `kb` tampoco: solo declara qué preguntar y a dónde ir si no hay respuesta. Zod usa
> `.strict()` en cada rama de la unión, así que una clave extra (`respuesta`, `texto`…) es un 400,
> no un campo ignorado en silencio.

### `flow.model.ts` — dos schemas, dos colecciones

```ts
// flows — la definición
FlowSchema.index({ tenantId: 1, activo: 1 });
// Solo un flujo activo por tenant, garantizado por el índice y no solo por el service:
FlowSchema.index({ tenantId: 1 }, { unique: true, partialFilterExpression: { activo: true } });

// flow_states — el runtime, uno por conversación
FlowStateSchema.index({ tenantId: 1, clienteId: 1 }, { unique: true });
FlowStateSchema.index({ tenantId: 1, flowId: 1 });
```

`Flow`: `{ tenantId, nombre, nodos, aristas, entrada: string, version, estado: 'borrador'|'publicado', activo }`.
`entrada` es el `id` del nodo inicial; `data-model.md` no lo tenía y hace falta para arrancar.

`FlowState`: `{ tenantId, clienteId, flowId, nodoActualId, variables: Record<string, unknown>, esperandoRespuesta: boolean, actualizadoAt }`.

`esperandoRespuesta` distingue "el flujo está parado en un `captura` esperando al cliente" de "el
flujo terminó". Sin ese bit, un mensaje entrante no sabe si reanudar o empezar de cero.

### `flow.engine.ts` — el corazón, y es puro

Toda la lógica de ramificación vive aquí, sin una sola llamada de I/O. Es lo que hace verificable el
Definition of Done y lo que permite testear el grafo sin Mongo ni Redis.

```ts
export interface EntradaMotor {
  flow: IFlow;
  state: IFlowState | null;          // null = la conversación aún no entró al flujo
  mensaje: string;                   // texto del último mensaje del cliente
  /** Resultados de operaciones asíncronas resueltas FUERA del motor. */
  resueltos?: { intencion?: string; capturado?: unknown; respuestaKb?: string };
}

export interface SalidaMotor {
  nodoSiguiente: string | null;      // null = flujo terminado
  efectos: Efecto[];                 // qué debe hacer el runtime, en orden
  variables: Record<string, unknown>;// variables actualizadas
  esperandoRespuesta: boolean;
  /** El motor pide una operación asíncrona y cede el control hasta tenerla. */
  requiere?: { tipo: 'intencion'; etiquetas: string[] } | { tipo: 'kb'; pregunta: string } | { tipo: 'captura'; spec: SlotSpec };
}

export function avanzar(entrada: EntradaMotor): SalidaMotor;
```

El patrón `requiere` / `resueltos` es lo que mantiene el motor puro: cuando toca clasificar una
intención o consultar la KB, el motor **no llama** al LLM — describe lo que necesita y el runtime lo
resuelve y le vuelve a entrar. El motor sigue siendo una función de datos a datos.

**Evaluación de condiciones** (criterio 4 del `spec`):

```ts
const norm = (s: string) => s.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

igual_a:        norm(valorCliente) === norm(rama.valor)
contiene:       norm(valorCliente).includes(norm(rama.valor))
opcion_elegida: coincide con el índice ("2") o con el texto de la opción
```

Si ninguna rama casa → `ramaPorDefecto` (criterio 5). El motor **nunca** lanza por una respuesta
inesperada: una conversación real trae de todo.

**Protección contra ciclos:** el motor recorre nodos sin espera (`mensaje`, `accion`, `condicion`)
encadenados en una sola invocación. Un tope de saltos (p. ej. 25) corta un flujo mal diseñado con
un ciclo y devuelve un efecto de error registrable en vez de colgar el worker.

### `flow.runtime.service.ts` — el lado sucio

Ejecuta los `Efecto[]` que devuelve el motor y resuelve lo que el motor pide:

| Efecto | Implementación (todo reuso) |
|---|---|
| `enviar_mensaje` | `sendOutbound(tenantId, clienteId, { modo: 'auto', ... })` — `HT-WA-02` |
| `cambiar_estado` | `changeEstadoComercial` del feature `cliente` |
| `aplicar_etiquetas` | el service de etiquetas de `HU-OMNI-04` (valida que los tags sean del tenant) |
| `crear_lead` | `createLeadFromConversation` de `lead.service.ts` |
| `asignar_asesor` | el service de asignación de `HU-OMNI-02` |
| `handoff` | `setIaHabilitada(tenantId, clienteId, false)` (`conversation.service.ts:299`) + realtime |
| `requiere: intencion` | `getAIService().extract(...)` con un único `SlotSpec` `intencion` y schema `z.enum([...etiquetas])` |
| `requiere: kb` | `getAIService().chat({ tenantId, historial })` — hereda caché, FAQ y RAG |
| `requiere: captura` | `getAIService().extract(...)` con el `SlotSpec` del nodo |

**Ni un solo efecto reimplementa lógica de dominio existente.** El flujo orquesta; los services ya
escritos siguen siendo los dueños de sus reglas (incluida la de la ventana de 24 h, que vive en
`sendOutbound`).

Para el nodo `intencion` se reutiliza `AIService.extract` en vez de añadir un método nuevo: ya
recibe un `schema` de Zod y un `SlotSpec[]`, que es exactamente la forma de "clasifica esto en una
de estas etiquetas".

### Enganche en el worker inbound

Sustituye el `TODO(Fase 3)` de `workers/inbound-message.processor.ts:71`:

```ts
// Motor de flujos (HU-FLOW-01). Guardas, en este orden:
//  1. `iaHabilitada` false → un asesor tomó la conversación; el bot no interviene.
//  2. Sin flujo `activo` en el tenant → no hay nada que ejecutar.
// El fallo del flujo NO debe tumbar el job: el mensaje ya está persistido y visible en la bandeja.
if (cliente.iaHabilitada) {
  try {
    await ejecutarFlujo(tenantId, clienteId.toString(), msg.text?.body ?? '');
  } catch (err) {
    logger.error('Fallo del motor de flujos', { tenantId, clienteId, error: String(err) });
  }
}
```

El `try/catch` aquí es deliberado y es la excepción, no la norma: el `attempts` que `HT-WA-01-V2`
añade al job reintentaría **todo** el procesamiento (incluida la persistencia) si el flujo lanzara,
y un flujo mal configurado no puede impedir que el mensaje llegue a la bandeja.

### Endpoints

| Método | Ruta | Rol | Notas |
|---|---|---|---|
| `GET` | `/api/flows` | admin | lista del tenant |
| `POST` | `/api/flows` | admin | valida el grafo completo |
| `GET` | `/api/flows/:id` | admin | 404 si es de otro tenant (nunca 403) |
| `PUT` | `/api/flows/:id` | admin | sube `version`; activar desactiva el anterior |

Cadena fija: `authenticateJWT → requireTenant → authorize(['admin']) → validate → asyncHandler`.

### `flow.validation.ts` — validación de grafo en el borde

Zod con `superRefine` sobre el flujo completo, para que un grafo roto no llegue nunca al service:

- `id` de nodo únicos.
- `entrada` existe entre los nodos.
- toda `arista.from` / `arista.to` y todo `nodoDestino` / `ramaPorDefecto` / `siNoHayRespuesta`
  apuntan a un `id` existente.
- ningún nodo huérfano (sin arista entrante y distinto de `entrada`).
- `config` con `.strict()` por tipo — es lo que hace exigible el criterio 10 del `spec`.

### Frontend — decisiones de las skills de diseño (regla §7 del `CLAUDE.md` raíz)

Invocar `emil-design-eng`, `impeccable:impeccable` y `frontend-design:frontend-design` **antes** de
escribir el primer componente. Puntos que deben resolver:

- **Un canvas es caro cognitivamente.** El editor debe dejar claro de un vistazo dónde empieza el
  flujo y qué nodos están mal configurados, sin obligar a abrir cada uno.
- **Tipos de nodo distinguibles sin leer**: color e icono por tipo, con los tokens semánticos. El
  nodo `handoff` debe verse como lo que es: la salida del automatismo.
- **El inspector es donde se pasa el tiempo**, no el canvas. Configurar una condición (operador +
  valor + destino) tiene que ser rápido y evidente; es la tarea literal de la historia.
- **Errores del backend anclados al nodo culpable**, no un toast genérico con el mensaje de Zod.
- **Motion contenido**: el arrastre y la conexión ya tienen su feedback nativo; no añadir
  animaciones que compitan con él.

`@xyflow/react` 12.x trae CSS propio: sus variables se alinean a la paleta del proyecto en
`index.css` (mismo criterio que se aplicó a `--sidebar-*` en DSN-03), en vez de dejar los grises
por defecto de la librería. Nodos custom, no los de serie, para que hereden los tokens.

Componentes shadcn/ui: `card`, `select`, `input`, `button`, `badge`, `dialog`, `tooltip`,
`separator`, `sheet` (ya vendorizados). Probablemente falten `tabs` y `popover`:
`pnpm dlx shadcn@3.8.5 add tabs popover` (versión fijada; las 4.x asumen Tailwind v4).

### Frontend — convenciones a respetar

- `apiClient.get('/flows')`, **sin** el prefijo `/api`.
- TanStack Query para el flujo cargado; Zustand para el estado de edición del canvas (nodo
  seleccionado, cambios sin guardar), que es estado de UI puro.
- Tokens semánticos, cero `bg-[#...]`, terminado en light y dark.

## Notas

- **Por qué el motor es puro y aparte del service.** Es el componente de mayor riesgo técnico del
  proyecto (`docs/product.md` §8). Separar decisión (`flow.engine.ts`) de ejecución
  (`flow.runtime.service.ts`) permite cubrir el grafo con tests rápidos y deterministas, sin Mongo
  ni LLM, que es la única forma realista de confiar en él.
- **Un flujo activo por tenant** se garantiza con un índice parcial único, no solo con una
  comprobación en el service: dos peticiones concurrentes de activación no pueden dejar dos activos.
- **Nodo `api` reservado, no implementado**: el valor queda en el enum de `data-model.md` para no
  migrar el enum después, pero Zod lo rechaza en esta spec.
- **Idempotencia**: si el mismo mensaje se procesa dos veces (reintento del job), el flujo puede
  avanzar dos veces. Se mitiga guardando en `FlowState` el `metaMessageId` del último mensaje
  procesado y saltando si se repite.

## Verificación

- `pnpm --filter backend typecheck` · `pnpm --filter backend test`
- `pnpm --filter frontend build && pnpm --filter frontend lint`
- Prueba manual E2E: flujo con dos ramas activo, mensaje desde un celular real por cada rama, y
  comprobar en la bandeja que cada respuesta recorrió el camino correcto.
