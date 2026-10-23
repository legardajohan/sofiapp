# HU-FLOW-04 — Plan técnico

> Cubre los criterios de `spec.md`. Regla raíz §7: en todo componente de `apps/frontend` invocar antes
> `emil-design-eng`, `impeccable:impeccable` y `frontend-design:frontend-design`, y usar shadcn.

## Hallazgos que motivan el plan

- Sin trigger: `apps/backend/src/workers/inbound-message.processor.ts` (~l.204-256,
  `responderAutomaticamente`) manda todo mensaje al flow activo (`getActiveFlow`); sin flow, `atenderConSofi`.
- Nodo gigante: el nodo es `w-64` (`FlowNode.tsx` L28); lo agranda `<ReactFlow fitView>` sin opciones
  (`FlowCanvas.tsx` L51): con 1 nodo hace zoom hasta `maxZoom` 2.
- Dark en blanco: `<ReactFlow>` sin `colorMode` pone la clase `light` en `.react-flow`, y `index.css`
  (~L420, `.light {…}`) re-declara los tokens claros dentro del canvas. Confirmar al implementar.
- Conectores: edge por defecto con `label` derivado (`filasDeRama`, `nodeVisuals.ts` L56-88); `IArista.condicion`
  no se usa.

## Archivos a crear / tocar

```
apps/backend/src/features/flow/
  flow.types.ts            (tocar)  ITriggerFlow, IFlow.trigger?
  flow.model.ts            (tocar)  subdocumento trigger, default { tipo: 'siempre' }
  flow.validation.ts       (tocar)  Zod discriminado por tipo (.strict()), trigger en create/update
  flow.trigger.ts          (nuevo)  evaluarTrigger(...) puro
  flow.trigger.test.ts     (nuevo)
  flow.runtime.service.ts  (tocar)  detectar "inicia flujo" y evaluar trigger; retorno { atendido }
  flow.isolation.test.ts   (tocar)  caso trigger A vs B
apps/backend/src/workers/
  inbound-message.processor.ts       (tocar)  si no atendido → atenderConSofi
  inbound-message.processor.test.ts  (tocar)  casos de trigger
apps/frontend/src/features/flows/
  types.ts                         (tocar)  ITriggerFlow, FlowDTO/SaveFlowPayload.trigger
  components/nodeVisuals.ts        (tocar)  NODE_DESCRIPCION, describirRelacion()
  components/nodeVisuals.test.ts   (nuevo/tocar)
  components/AddNodeMenu.tsx       (tocar)  Tooltip por opción
  components/edges/FlowEdge.tsx    (nuevo)  edge custom con tooltip
  components/FlowCanvas.tsx        (tocar)  fitViewOptions, min/maxZoom, colorMode, edgeTypes
  components/nodes/FlowNode.tsx    (tocar)  w-64 → w-60
  components/TriggerSettings.tsx   (nuevo)  editor del trigger
  pages/FlowEditorPage.tsx         (tocar)  montar TriggerSettings, crearNodo paso 260→300
apps/frontend/src/index.css        (tocar)  bloque --xy-* (~L222-255) y labels de edge en dark
docs/data-model.md (sección flows ~l.613) · docs/api-contract.md (payload de flows)
```

## Contratos

```ts
// flow.types.ts (el front lo espeja en types.ts)
type TipoTrigger = 'siempre' | 'palabra_clave' | 'primer_mensaje' | 'horario';
interface ITriggerFlow {
  tipo: TipoTrigger;
  palabras?: string[];                       // palabra_clave: 1..20, no vacías
  horario?: { dias: number[]; desde: string; hasta: string; zonaHoraria: string }; // dias 0-6, HH:mm
}
// IFlow.trigger?: ITriggerFlow   (ausente = siempre; sin migración)
```

- **Zod:** unión discriminada por `tipo` con `.strict()`; `desde < hasta`; `zonaHoraria` IANA válida
  (default `America/Bogota`). Se acepta en `POST /api/flows` y `PUT /api/flows/:id` (mismos middlewares
  que hoy: `authenticateJWT → requireTenant → authorize(['admin']) → validate`).
- **Índices:** ninguno nuevo; el índice parcial único de `activo` por `tenantId` se mantiene.
- **`evaluarTrigger(trigger, { texto, esPrimerMensaje, ahora }): boolean`** — función pura (como
  `flow.engine.ts`); `contiene` reutiliza la normalización del motor (minúsculas, sin tildes, trim).
- **Runtime:** `ejecutarFlujo` determina si *inicia* (no hay `FlowState` o el flow terminó; verificar la
  forma exacta de `FlowState` y extraer helper `flujoEnCurso`). Solo en ese caso evalúa el trigger; si da
  `false` retorna `{ atendido: false }` y el worker cae a `atenderConSofi`. `esPrimerMensaje` se calcula con
  el repositorio scoped de mensajes. Sin jobs BullMQ nuevos.
- **Multi-tenant:** el `tenantId` viene del webhook (`phone_number_id`, excepción documentada) o del token;
  toda lectura/escritura pasa por `*Scoped`. Nada de `Model.find` directo.

### Frontend

- `NODE_DESCRIPCION[tipo]`: 1-2 líneas "qué hace + ejemplo corto" para los 9 tipos.
- `describirRelacion(origen, fila, destino): string` pura: para `condicion` «Si el mensaje contiene "x" →
  {destino}», `intencion` «Si la intención es "x" → …», `ia` «Si la IA elige "x" → …», rama por defecto
  «Si ninguna coincide → …», lineal «Después de {origen}, sigue {destino}».
- `AddNodeMenu`: `Tooltip` (shadcn) `side="right"` en cada `DropdownMenuItem`; sin retardo entre ítems
  contiguos; abre también con foco de teclado.
- `FlowEdge`: `BaseEdge` + `EdgeLabelRenderer`; el label es el trigger del `Tooltip`. Registrado en
  `edgeTypes` de `FlowCanvas`.
- `FlowCanvas`: `fitViewOptions={{ maxZoom: 1, padding: 0.4 }}`, `minZoom 0.4`, `maxZoom 1.5`,
  `colorMode={resolvedTheme === 'dark' ? 'dark' : 'light'}` con `useTheme()`; así desaparece el pin
  `.light` dentro del canvas. Ajustar `--xy-*` y fondos del `Controls` a tokens semánticos.
- `TriggerSettings`: `Select` de tipo; chips de palabras; días/horas/zona; texto de ayuda con ejemplo.
  Mismo patrón que `ReminderSettings.tsx`. Estado junto a `entrada` en `FlowEditorPage` y enviado en el save.

## Notas

- Compatibilidad: flows existentes quedan en `siempre`; ningún cambio de comportamiento sin editar.
- Un flow activo por tenant se mantiene (decisión de V3). Si en el futuro hay varios, el trigger será el
  criterio de selección; fuera de alcance aquí.
- Cero colores arbitrarios (`bg-[#…]`); tokens semánticos; verificar light y dark.
- La verificación visual la hace el usuario (no Playwright).

## Verificación

- `pnpm --filter @sofiapp/api typecheck` · `pnpm --filter @sofiapp/api test`
- `pnpm --filter @sofiapp/web build && pnpm --filter @sofiapp/web lint`
- Checklist PR de `docs/multi-tenancy.md` §9.
- Manual (usuario): `/flows/new` en light y dark: tooltips de menú y conectores, tamaño del primer nodo,
  zoom/controles; configurar trigger y probar con mensajes.
