# HU-FLOW-01-V3 — Plan técnico (CÓMO)

> Ajustes sobre el editor de `HU-FLOW-01-V2`. El motor (`flow.engine.ts`), el modelo (`flow.model.ts`),
> la validación de grafo (`flow.validation.ts`) y los endpoints (`flow.routes.ts`) **no se tocan** —
> se reusan tal cual. Todo lo de este plan es frontend (puntos 1-4) más un script de seed backend
> (punto 5) que reusa `flow.validation.ts` y `flow.service.ts` sin modificarlos.

## Archivos a modificar

```
apps/frontend/src/features/flows/
├── components/nodes/FlowNode.tsx       # handles por rama/etiqueta en condicion/intencion
├── components/nodeVisuals.ts           # helper de ids de handle por nodo
├── pages/FlowEditorPage.tsx            # edges derivados de config + onConnect por handle
├── components/ConditionEditor.tsx      # "Ver más" para rama.valor
├── components/NodeInspector.tsx        # "Ver más" para etiqueta.descripcion (IntencionForm)
├── pages/FlowsPage.tsx                 # tooltip: un flujo activo, patrón de intención
└── components/EmptyFlowState.tsx       # copy: intención como punto de entrada si hay varios temas
```

## Archivos a crear

```
apps/backend/src/seed/
└── seed-flow-crm-ventas.ts             # flujo de ejemplo "Ventas CRM (demo)"
```

Y una entrada de script en `apps/backend/package.json` (`"seed:flow": "tsx src/seed/seed-flow-crm-ventas.ts"`,
mismo patrón que el `seed:inbox` ya existente para `seed-inbox-demo.ts`).

## Punto 1 — Handles por rama, edges derivados de `config`

**Por qué edges derivados y no aristas persistidas.** La exploración de código confirmó que
`condicion`/`intencion` resuelven su "siguiente nodo" leyendo `config.ramas[].nodoDestino` /
`config.etiquetas[].nodoDestino` (`flow.engine.ts:117-140`), **nunca** desde `flow.aristas`. Si el
canvas guardara una arista real de React Flow para cada rama (como hace hoy para los nodos
lineales), habría dos representaciones del mismo dato — `config.ramas[].nodoDestino` y una `IArista`
en paralelo — que podrían desincronizarse (p. ej. borrar una rama del inspector sin borrar su
arista). Por eso las líneas de rama se **derivan** de `config` en cada render y nunca se escriben en
el array `edges`/`aristas` que persiste `guardar()`.

### `nodeVisuals.ts`

```ts
/** Ids de handle de salida para un nodo `condicion`/`intencion`, en el mismo orden que sus ramas/
 *  etiquetas, más uno final para la rama por defecto. Nodos lineales (mensaje, captura, kb, accion)
 *  devuelven un array vacío — su único handle sigue siendo el implícito de `tieneSalidaLineal`.
 *  `handoff` también vacío: nodo terminal, sin salida. */
export function handlesDeRama(nodo: INodo): string[] {
  switch (nodo.config.tipo) {
    case 'condicion':
      return [...nodo.config.ramas.map((_, i) => `rama-${i}`), 'default'];
    case 'intencion':
      return [...nodo.config.etiquetas.map((_, i) => `etiqueta-${i}`), 'default'];
    default:
      return [];
  }
}

/** Etiqueta corta para pintar junto a la línea de una rama. */
export function labelDeRama(nodo: INodo, handleId: string): string {
  if (handleId === 'default') return 'Por defecto';
  if (nodo.config.tipo === 'condicion') {
    const i = Number(handleId.split('-')[1]);
    const rama = nodo.config.ramas[i];
    return rama ? `${OPERADOR_LABEL[rama.operador]}: "${rama.valor}"` : handleId;
  }
  if (nodo.config.tipo === 'intencion') {
    const i = Number(handleId.split('-')[1]);
    return nodo.config.etiquetas[i]?.etiqueta || handleId;
  }
  return handleId;
}
```

### `FlowNode.tsx`

- Para `condicion`/`intencion`: en vez de omitir el `Handle` de salida (como hoy), renderiza un
  `Handle type="source"` por cada id de `handlesDeRama(nodo)`, distribuidos horizontalmente en el
  borde inferior del nodo (`style={{ left: ... }}` proporcional al índice, igual que el patrón
  estándar de React Flow para múltiples handles con el mismo `Position.Bottom`). El nodo crece de
  alto (`min-h`) cuando el número de ramas no cabe cómodo en el ancho fijo de `w-56` — decisión de
  diseño a confirmar con `emil-design-eng`/`frontend-design` (ver más abajo), pero el contrato de
  datos es: N handles con id estable, nunca un handle genérico para estos dos tipos.
- `handoff` sigue sin handle de salida — no cambia.

### `FlowEditorPage.tsx`

- Nuevo `useMemo` `edgesDerivados` que recorre `nodes`, y para cada `condicion`/`intencion` arma un
  `Edge` de React Flow por cada rama/etiqueta con `nodoDestino` no vacío (más la rama por defecto si
  apunta a algo), con `sourceHandle` igual al id de `handlesDeRama` y `label` de `labelDeRama`.
- `decoratedNodes`/`edges` que se pasan a `FlowCanvas` se convierten en `[...edges, ...edgesDerivados]`
  — `edges` (estado de React Flow) sigue siendo solo las aristas lineales reales; `edgesDerivados` es
  puramente de presentación, recalculado en cada cambio de `config`.
- `onConnect` gana una rama al principio:
  ```ts
  const onConnect: OnConnect = useCallback(
    (connection) => {
      const handle = connection.sourceHandle;
      if (handle && (handle.startsWith('rama-') || handle.startsWith('etiqueta-') || handle === 'default')) {
        actualizarDestinoDeRama(connection.source!, handle, connection.target!);
        return; // nunca crea una arista genérica para estos handles
      }
      setEdges((eds) => addEdge({ ...connection, id: nuevoId('arista') }, eds));
    },
    [setEdges, actualizarDestinoDeRama],
  );
  ```
  `actualizarDestinoDeRama(nodeId, handle, destino)` es una función nueva, junto a `actualizarConfig`,
  que localiza el nodo por `nodeId` y hace el `set` correspondiente sobre `ramas[i].nodoDestino` /
  `etiquetas[i].nodoDestino` / `ramaPorDefecto` según el `handle`, reusando `setNodes` igual que
  `actualizarConfig` ya hace.
- El `<Select>` de destino en `ConditionEditor`/`IntencionForm` **se conserva tal cual** (no se
  quita nada): sigue siendo la vía accesible por teclado, y como lee/escribe el mismo `config`, el
  drag-and-drop y el dropdown quedan siempre en sync sin código adicional de sincronización.

**Skills de diseño obligatorias antes de tocar estos tres componentes** (regla §7 de `CLAUDE.md`
raíz): `emil-design-eng`, `impeccable:impeccable`, `frontend-design:frontend-design`. Puntos a
resolver con ellas: cómo distribuir N+1 handles en un nodo de 224px sin que se vean amontonados
(¿el nodo crece de alto con una fila por handle en vez de distribuirlos en el ancho?), y cómo pintar
la etiqueta de cada línea sin saturar el canvas cuando hay varias ramas.

## Punto 2 — Guía de uso del flujo único (sin tocar backend)

- `FlowsPage.tsx`: junto al título "Flujos", un ícono de información con `Tooltip` (shadcn, ya
  vendorizado) con un texto corto: algo como *"Un solo flujo puede estar activo por empresa. Usa un
  nodo de Intención al inicio para manejar varios temas — horarios, precios, ventas — dentro del
  mismo flujo."*
- `EmptyFlowState.tsx`: el copy actual dice "Empieza por el nodo de inicio: el primer mensaje o
  condición que ve el cliente al entrar al flujo." Se ajusta para mencionar también `intención`
  como punto de entrada natural cuando se esperan varios temas distintos.
- Mismas skills de diseño obligatorias antes de tocar estos dos componentes.

## Puntos 3-4 — Texto expandible en vez de scroll horizontal

Mismo patrón en `ConditionEditor.tsx` (`rama.valor`) y en `NodeInspector.tsx`
(`IntencionForm`, `etiqueta.descripcion`):

- Estado local por fila (`useState<Set<number>>` de índices expandidos, o un booleano por fila
  gestionado en un `Record<number, boolean>` — decisión de implementación, no de contrato).
- El afordance "Ver más" solo aparece si `valor.length` supera un umbral (28 caracteres, el mismo
  ancho aproximado que cabe hoy en el input antes de recortarse visualmente).
- Al expandir: debajo de la fila compacta aparece una fila de ancho completo con `<Textarea rows={2}>`
  ligada al mismo valor, con una transición de alto suave (no un salto brusco — criterio de pulido
  de `emil-design-eng`). Un "Ver menos" la colapsa de vuelta al input de una línea.
- El input compacto **nunca** desaparece — sigue siendo la vista por defecto para valores cortos
  (la mayoría), que es el caso común y no necesita fricción adicional.

## Punto 5 — Seed `seed-flow-crm-ventas.ts`

Mismo esqueleto que `apps/backend/src/seed/seed-inbox-demo.ts`: conecta a Mongo con
`mongoose.connect(env.MONGODB_URI)`, aborta si `NODE_ENV=production` salvo `--force`, resuelve
`tenantId` con `User.findOne({ email: args.email }).lean()` (falla si no existe o si es superadmin
sin tenant).

**Diseño del flujo de ejemplo** ("Ventas CRM (demo)"):

```
mensaje (bienvenida)
  → intencion { etiquetas: [precio, horario, comprar, hablar_con_alguien], ramaPorDefecto: handoff }
      precio            → kb { pregunta: 'ultimo_mensaje', siNoHayRespuesta: '...' }
      horario           → mensaje (horario fijo)
      comprar           → condicion { variable: 'ultimo_mensaje', ramas: [{contiene: 'tarjeta', ...}, {contiene: 'transferencia', ...}], ramaPorDefecto: captura }
                            → captura (correo) → accion { crear_lead } → mensaje (confirmación)
      hablar_con_alguien → handoff
      (default)          → handoff
```

Este grafo toca 7 de los 8 tipos de nodo (todos menos `espera`, fuera de alcance), es un caso de uso
de ventas reconocible, y ejercita el propio patrón del punto 2 (un nodo `intencion` como router de
temas) — sirve también como ejemplo vivo de esa recomendación.

**Validación antes de persistir (criterio 8):** el script construye el DTO
(`{ nombre, nodos, aristas, entrada, activo: false }`) y lo pasa por el **mismo** schema Zod que usa
`validate(createFlowSchema)` en `flow.routes.ts` (`flow.validation.ts`) antes de llamar a
`flow.service.ts`'s `createFlow(tenantId, dto)`. Nunca `new Flow(...).save()` directo — así el
ejemplo queda garantizado estructuralmente válido exactamente igual que si viniera del editor
(ids únicos, un solo nodo de entrada, sin huérfanos, sin campos de texto en `condicion`/`intencion`).

**Idempotencia (criterio 10):** antes de insertar, borra cualquier `Flow` del mismo tenant con
`nombre: 'Ventas CRM (demo)'` (`deleteMany` scoped por `tenantId` + `nombre`, patrón de
`limpiarDemo` en `seed-inbox-demo.ts`). `activo` queda en `false` salvo que se pase `--activar`,
para no desactivar en silencio un flujo real que ya esté activo en ese tenant.

**Aislamiento (criterio 9):** toda operación del script (resolver tenant, borrar el demo anterior,
crear el nuevo) lleva el `tenantId` resuelto explícito en el filtro — nunca una query sin `tenantId`
— igual que exige `docs/multi-tenancy.md` para código que corre fuera del ciclo HTTP.

## Verificación

- `pnpm --filter backend typecheck` · `pnpm --filter backend test`
- `pnpm --filter frontend build && pnpm --filter frontend lint`
- Manual: crear un nodo `condicion` con 2+ ramas, arrastrar una línea desde cada handle de rama y
  confirmar que fija el `nodoDestino` correcto y que la línea se ve con su etiqueta; cambiarlo por
  el `<Select>` del inspector y confirmar que la línea se mueve igual; escribir un valor largo en
  una rama y confirmar "Ver más" en vez de scroll horizontal; correr
  `pnpm --filter backend seed:flow -- --email=user-empresa-test@test.com` y confirmar en `/flows`
  que aparece "Ventas CRM (demo)" para ese tenant y en ningún otro.
