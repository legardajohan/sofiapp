# HU-FLOW-03 — Plan técnico (CÓMO)

## Archivos a crear

```
apps/backend/src/features/flow/
└── flow.ia-node.test.ts                # el nodo `ia` de punta a punta (motor + runtime mockeado)

apps/frontend/src/features/flows/components/
└── IaOutputsEditor.tsx                 # lista de salidas del nodo `ia` (etiqueta, descripción, destino)
```

Un solo archivo nuevo por lado: este feature es sobre todo **extensión de piezas existentes**. Si
aparece un `flow.ia.service.ts` nuevo con lógica de ramificación, está mal — esa lógica va en el
motor puro, que es donde se puede testear sin Gemini.

## Archivos a modificar

```
apps/backend/src/
├── features/flow/flow.types.ts          # TIPOS_NODO + ConfigNodo 'ia' + ISalidaIa
│                                        #   + RequiereMotor 'ia' + resueltos.ia
├── features/flow/flow.validation.ts     # rama .strict() de 'ia' + destinos y huérfanos del grafo
├── features/flow/flow.engine.ts         # case 'ia' (multi-turno, contador, salida por rama)
├── features/flow/flow.runtime.service.ts# resolverRequiere case 'ia' + construirHistorial
├── features/flow/flow.model.ts          # enum `tipo` del NodoSchema
└── (tests) flow.engine.test.ts · flow.validation.test.ts · flow.isolation.test.ts

apps/frontend/src/features/flows/
├── types.ts                             # espejo de TIPOS_NODO y ConfigNodo
├── components/nodeVisuals.ts            # NODE_VISUALS · configPorDefecto · resumenConfig
│                                        #   · filasDeRama · configConDestino · tieneSalidaLineal
└── components/NodeInspector.tsx         # <IaForm>

docs/
├── data-model.md · domain.md            # el nodo `ia` en el vocabulario de flujos
└── integrations/llm-provider.md         # el nodo `ia` como consumidor de AIService
```

`AddNodeMenu.tsx` **no se toca**: itera `TIPOS_NODO` y lee `NODE_VISUALS`, así que el tipo nuevo
aparece solo en la paleta.

## Contratos

### `flow.types.ts` — la forma del nodo

```ts
export const TIPOS_NODO = [
  'mensaje', 'captura', 'condicion', 'intencion', 'kb', 'accion', 'handoff', 'espera', 'ia',
] as const;

export interface ISalidaIa {
  /** Nombre corto de la salida; es lo que la IA devuelve para decidir por dónde sale. */
  etiqueta: string;
  /** Cuándo se considera cumplida. Es la instrucción real que lee el modelo. */
  descripcion: string;
  nodoDestino: string;
}

// ConfigNodo gana:
| {
    tipo: 'ia';
    /** Qué debe lograr el asistente mientras tenga el turno, en lenguaje natural. */
    objetivo: string;
    salidas: ISalidaIa[];
    ramaPorDefecto: string;
    /** Tope duro de turnos; al alcanzarlo sale por `ramaPorDefecto` sin llamar a la IA. */
    maxTurnos: number;
    /** Si consulta la base de conocimiento del tenant para responder. */
    usarKb: boolean;
  }
```

Es a propósito el mismo esqueleto que `intencion` (`etiquetas[] + ramaPorDefecto`): así
`filasDeRama` y `configConDestino` del canvas funcionan con un `if` más y ningún mecanismo nuevo.

Y el contrato motor↔runtime:

```ts
export type RequiereMotor =
  | { tipo: 'intencion'; etiquetas: string[] }
  | { tipo: 'kb'; pregunta: string; kSobrescrito?: number }
  | { tipo: 'captura'; spec: SlotSpec }
  | { tipo: 'ia'; objetivo: string; salidas: ISalidaIa[]; usarKb: boolean };   // ← nuevo

// EntradaMotor.resueltos gana:
ia?: { respuesta: string; salida: string | null };   // `null` = todavía no puede decidir
```

### `flow.engine.ts` — `case 'ia'`

El contador de turnos vive en `variables` bajo `_ia:<nodoId>:turnos`. Se persiste solo, dentro del
`variables` que `persistirFlowState` ya guarda — **sin campo nuevo en `FlowState`**. El prefijo `_`
lo distingue de las variables de negocio que el admin puede leer con `var:<nombre>` en un nodo
`condicion`.

```ts
case 'ia': {
  const clave = `_ia:${nodo.id}:turnos`;
  const turnos = Number(variables[clave] ?? 0);
  const limpio = { ...variables };
  delete limpio[clave];                    // al salir del nodo, el contador se va con él

  // (a) El runtime ya resolvió la llamada a la IA.
  if (entrada.resueltos?.ia !== undefined) {
    const { respuesta, salida } = entrada.resueltos.ia;
    if (salida !== null) {
      const destino =
        config.salidas.find((s) => s.etiqueta === salida)?.nodoDestino ?? config.ramaPorDefecto;
      return { efectos: [], siguiente: destino, variables: limpio, esperandoRespuesta: false };
    }
    // Sigue conversando: responde y se queda en el nodo esperando al cliente.
    return {
      efectos: [{ tipo: 'enviar_mensaje', texto: respuesta }],
      siguiente: nodo.id,
      variables: { ...variables, [clave]: turnos + 1 },
      esperandoRespuesta: true,
    };
  }

  // (b) Se agotaron los turnos: sale por defecto SIN volver a llamar a la IA.
  if (turnos >= config.maxTurnos) {
    return { efectos: [], siguiente: config.ramaPorDefecto, variables: limpio, esperandoRespuesta: false };
  }

  // (c) Pide el turno de IA y cede el control, igual que hace `intencion`.
  return {
    efectos: [],
    siguiente: nodo.id,
    variables,
    esperandoRespuesta: false,
    requiere: { tipo: 'ia', objetivo: config.objetivo, salidas: config.salidas, usarKb: config.usarKb },
  };
}
```

**Decisión: al salir por una rama, el nodo no envía la respuesta de ese turno.** Quien habla es el
nodo al que apunta la salida. Enviar ambas cosas produciría dos mensajes seguidos, uno de la IA y
otro del flujo, que es justo lo que el admin no puede prever al dibujar el grafo. El panel del
inspector lo dice con todas las letras.

**Por qué el orden (a) → (b) → (c):** comprobar el tope antes de mirar `resueltos` descartaría una
respuesta ya pagada a Gemini.

### `flow.runtime.service.ts` — `resolverRequiere` case `'ia'`

**Una sola llamada** a `ai.extract()` que devuelve a la vez qué decir y si ya se puede salir. Separar
`chat()` + `extract()` costaría el doble y abre la puerta a que el modelo diga una cosa y decida
otra.

```ts
if (requiere.tipo === 'ia') {
  const historial = await construirHistorial(tenantId, clienteId, TURNOS_HISTORIAL);
  const contexto = requiere.usarKb
    ? (await searchKnowledge(tenantId, mensajeCliente)).map((c) => c.texto).join('\n---\n')
    : '';

  const etiquetas = requiere.salidas.map((s) => s.etiqueta) as [string, ...string[]];
  const schema = z.object({
    respuesta: z.string(),
    // `extractSlots` deja vacío lo que no encuentra; '' significa "aún no puedo decidir".
    salida: z.enum(etiquetas).or(z.literal('')).transform((v) => v || null),
  });

  const { data } = await ai.extract<{ respuesta: string; salida: string | null }>({
    tenantId: tenantOid,
    historial: contexto ? [...historial, { role: 'user', content: `Contexto:\n${contexto}` }] : historial,
    schema,
    camposObjetivo: [
      { campo: 'respuesta', tipo: 'texto', requerido: true,
        descripcion: `Redacta el siguiente mensaje para el cliente. Objetivo: ${requiere.objetivo}` },
      { campo: 'salida', tipo: 'texto', requerido: false,
        descripcion: `Si ya se cumplió una de estas condiciones, devuelve su nombre; si ninguna, déjalo vacío. ${
          requiere.salidas.map((s) => `"${s.etiqueta}": ${s.descripcion}`).join(' | ')}` },
    ],
  });
  return { ia: data };
}
```

`AIService.extract()` ya antepone su propio turno de tarea (`conTurnoDeTarea`), así que las
instrucciones del nodo van en las **descripciones de los slots**, que es lo que llega al
`responseSchema` de Gemini. El contexto de KB va como un turno más del historial.

### `construirHistorial` — la continuidad conversacional

Hoy `resolverRequiere` arma `[{ role: 'user', content: mensajeCliente }]`
(`flow.runtime.service.ts:39`): un solo turno. El nodo `ia` necesita la conversación entera:

```ts
/** Últimos `limite` mensajes de la conversación como `ChatTurn[]`, del más antiguo al más nuevo. */
async function construirHistorial(
  tenantId: TenantId, clienteId: string, limite: number,
): Promise<ChatTurn[]>;
```

Lee `Message` con `findScoped(Message, tenantId, { clienteId })`, ordena por `createdAt`
descendente, toma `limite` y da la vuelta al array; mapea `sender: 'user' → 'user'` y todo lo demás
(`bot`, `agent`) → `'model'`, descartando los mensajes sin `texto` (imágenes, audios). El índice
`{ tenantId: 1, clienteId: 1, createdAt: 1 }` ya existe en `message.model.ts`.

**Se usa solo en el caso `'ia'`.** `intencion`, `kb` y `captura` se quedan con su historial de un
turno: cambiarlo alteraría el comportamiento ya probado de `HU-FLOW-01` y sus claves de caché, y no
es lo que pide esta spec.

`TURNOS_HISTORIAL` es una constante del módulo (arranca en 20), no una env var: no es algo que se
ajuste por despliegue.

### `flow.validation.ts`

```ts
z.object({
  tipo: z.literal('ia'),
  objetivo: z.string().min(10).max(2000),
  salidas: z.array(z.object({
    etiqueta: z.string().min(1).max(40),
    descripcion: z.string().min(1).max(500),
    nodoDestino: z.string().min(1),
  })).min(1).max(8),
  ramaPorDefecto: z.string().min(1),
  maxTurnos: z.number().int().min(1).max(10),
  usarKb: z.boolean(),
}).strict()
```

`maxTurnos` acotado a 10 es el criterio 4 hecho estructura: no se puede guardar un flujo con un nodo
`ia` capaz de conversar indefinidamente. `salidas` tiene un mínimo de 1 porque un nodo `ia` sin
salidas solo podría terminar por agotamiento — sería un `kb` caro.

En el `superRefine` del grafo, `ia` se suma a donde hoy se listan `condicion`/`intencion`: sus
`nodoDestino` y su `ramaPorDefecto` deben existir, y los nodos alcanzables desde ellos **no** son
huérfanos (criterio 5). Buscar los dos sitios: la validación de destinos y el conjunto de nodos
alcanzables.

### Frontend

`nodeVisuals.ts`, los cinco puntos:

```ts
NODE_VISUALS.ia = { icon: Sparkles, label: 'Asistente IA', destacado: true };
tieneSalidaLineal: tipo !== 'condicion' && tipo !== 'intencion' && tipo !== 'ia' && tipo !== 'handoff';
filasDeRama:    salidas.map((s, i) => ({ handleId: `salida-${i}`, label: s.etiqueta || 'Sin nombre',
                  destino: s.nodoDestino })) + la fila `default` ('Si no resuelve');
configConDestino: rama `ia` idéntica a la de `intencion`, con `salidas` en vez de `etiquetas`;
configPorDefecto: { tipo: 'ia', objetivo: '', salidas: [], ramaPorDefecto: '', maxTurnos: 3, usarKb: true };
resumenConfig:  `${salidas.length} salida(s) · máx. ${maxTurnos} turnos`;
```

`IaForm` en `NodeInspector.tsx` + `IaOutputsEditor.tsx`:

| Campo | Control | Nota |
|---|---|---|
| Objetivo | `Textarea` | Es la instrucción real que lee el modelo, no una nota interna |
| Consultar la KB | `Switch` | Encendido por defecto |
| Máximo de turnos | `Input` numérico | Con el coste explicado: cada turno es una llamada al modelo |
| Salidas | `IaOutputsEditor` | Etiqueta + descripción + `DestinoSelect`, y añadir/quitar |
| Si no resuelve | `DestinoSelect` | La `ramaPorDefecto` |

**Decisiones de las skills de diseño** (invocar `emil-design-eng`, `impeccable:impeccable` y
`frontend-design:frontend-design` **antes** de escribir los componentes):

- **La descripción de una salida es un prompt, no una etiqueta.** El campo tiene que invitar a
  escribir una frase, con un ejemplo de placeholder real, no parecer un `name=` técnico.
- **El coste tiene que ser visible.** "Máximo de turnos" sin contexto es un número; con "cada turno
  es una consulta al modelo" es una decisión informada.
- **Decir qué pasa al salir.** El panel explica que cuando la IA elige una salida, el mensaje lo da
  el nodo siguiente — es la duda que va a tener todo el que dibuje este nodo por primera vez.
- Reusar `IaOutputsEditor` sobre el patrón ya probado de las etiquetas de `intencion`, incluido el
  afordance "Ver más" de `HU-FLOW-01-V3` para las descripciones largas. Nada hecho a mano donde ya
  haya un componente del UI kit.

## Notas

- **Por qué el nodo `ia` no reemplaza al nodo `kb`.** `kb` responde una pregunta y sigue; es barato
  y predecible. `ia` conversa y decide. Un flujo bien hecho usa `kb` para las preguntas sueltas y
  reserva `ia` para los tramos donde de verdad hace falta negociar con el cliente.
- **Por qué el contador va en `variables` y no en `FlowState`.** `variables` ya se persiste, ya se
  copia entre reentradas del motor y ya se limpia al salir del nodo. Un campo propio en `FlowState`
  habría que resetearlo a mano, que es exactamente el tipo de estado que se desincroniza.
- **Por qué una sola llamada al modelo y no dos.** Además del coste, una segunda llamada podría
  decidir salir por una rama que no concuerda con lo que la primera acabó de responderle al cliente.
- **`iaHabilitada` (criterio 6) no necesita código nuevo:** `ejecutarFlujo` ya vuelve sin hacer nada
  si el cliente la tiene en `false` (`flow.runtime.service.ts:198-199`), y el worker lo comprueba
  antes de llamar. Sí hay que cubrirlo con un test, porque es el escenario "un asesor entra a una
  conversación que estaba en manos de la IA".
- **La cuota (criterio 7) tampoco:** las respuestas salen por `sendOutbound`, que ya llama a
  `assertWithinQuota`. Con la cuota agotada lanza y `ejecutarEfecto` se lo traga y lo registra
  (`flow.runtime.service.ts:142-149`), sin tumbar el resto de la pasada.

## Verificación

- `pnpm --filter backend typecheck` · `pnpm --filter backend test`
- `pnpm --filter frontend build && pnpm --filter frontend lint`
- Prueba manual: añadir al flujo demo (`seed-flow-crm-ventas.ts`, de `HU-FLOW-01-V3`) un nodo `ia`
  con dos salidas ("quiere_comprar", "solo_curiosea") y comprobar por WhatsApp que conversa varios
  turnos y luego sale por la rama correcta.
