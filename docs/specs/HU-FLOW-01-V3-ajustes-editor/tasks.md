# HU-FLOW-01-V3 — Tasks (checklist ejecutable)

> Claude Code: ejecuta en orden. Marca cada casilla al terminar. No cierres el feature hasta que
> TODO esté en verde. Antes de tocar `apps/frontend`, invoca `emil-design-eng`,
> `impeccable:impeccable` y `frontend-design:frontend-design` (regla §7 del `CLAUDE.md` raíz).
>
> El motor, el modelo y los endpoints de `HU-FLOW-01-V2` no se tocan en esta spec.

## Implementación — Frontend

### 1. Handles por rama y edges derivados (punto 1)

- [x] Invocadas `emil-design-eng`, `impeccable:impeccable` (vía `context.mjs --target
      apps/frontend/src/features/flows`, registro Product) y `frontend-design:frontend-design`
      antes de tocar componentes. Decisión que salió de ahí, distinta de la nota original del
      plan: en vez de repartir N handles a lo ancho del borde inferior de un nodo de 224px (se
      sentía amontonado con 3+ ramas), cada rama/etiqueta se pinta como su propia **fila** dentro
      del nodo (lista con `divide-y`), con su handle `Position.Right` alineado a esa fila — crece
      en alto, nunca se amontona, y el handle en `bg-primary` reusa el mismo tratamiento de color
      con significado que ya tenían los iconos "destacados" de `condicion`/`intencion`.
- [x] `nodeVisuals.ts`: `filasDeRama(nodo)` (nombre final; el plan proponía `handlesDeRama` +
      `labelDeRama` por separado, se fusionaron en una sola función que también trae el `destino`
      de cada rama) y `configConDestino(config, handleId, destino)`.
- [x] `FlowNode.tsx`: `condicion`/`intencion` renderizan una fila por elemento de `filasDeRama`,
      cada una con su `Handle type="source" position={Position.Right}`. `handoff` sigue sin handle
      de salida. Nodo ensanchado a `w-64` para que la fila (texto + handle) no se sienta apretada.
- [x] `FlowEditorPage.tsx`:
      - [x] `useMemo` `edgesDerivados` a partir de `nodes` (uno por rama/etiqueta con destino, más
            la rama por defecto), con `deletable:false`/`reconnectable:false` — nunca se escriben
            en el `edges` que persiste `guardar()`.
      - [x] `FlowCanvas` recibe `edgesParaCanvas = [...edges, ...edgesDerivados]`.
      - [x] `actualizarDestinoDeRama(nodeId, handleId, destino)` — usa `configConDestino`.
      - [x] `onConnect` desvía a `actualizarDestinoDeRama` cuando `sourceHandle` es `default` o
            empieza por `rama-`/`etiqueta-`; el resto sigue creando una arista genérica igual que
            hoy.
      - [x] El `<Select>` de destino en `ConditionEditor`/`IntencionForm` se conserva sin cambios
            de comportamiento (accesibilidad/teclado) — lee y escribe el mismo `config`.
- [x] `index.css`: `.react-flow__edge-textbg`/`.react-flow__edge-text` alineados a los tokens del
      proyecto (`--card`/`--muted-foreground`) para que la etiqueta de cada línea de rama no se vea
      con los colores por defecto de la librería.

### 2. Guía de uso del flujo único (punto 2)

- [x] `FlowsPage.tsx`: ícono `Info` + `Tooltip` (shadcn, patrón de `SensitiveValue.tsx` con
      `TooltipProvider` propio) junto al título "Flujos" explicando la regla de un flujo activo y
      el patrón de nodo `intencion` como router de temas — sin modal, inline.
- [x] `EmptyFlowState.tsx`: copy ajustado mencionando `intención` como punto de entrada cuando se
      esperan varios temas.

### 3-4. Texto expandible (puntos 3 y 4)

- [x] `ConditionEditor.tsx`: "Ver más"/"Ver menos" para `rama.valor` cuando supera 28 caracteres;
      expande un `Textarea` de ancho completo debajo de la fila compacta (animado con el truco
      `grid-template-rows` 0fr↔1fr, 200ms ease-out); el input compacto se deshabilita mientras está
      expandido para que solo haya una superficie editable a la vez.
      - [x] **Ajuste post-commit #1** (feedback directo del usuario tras ver el editor real): el
            grid de 3 columnas iguales (operador/valor/destino) dentro de un panel de 320-384px
            dejaba cada control tan angosto que ni el operador ni el destino se leían completos —
            el mismo problema de fondo que el scroll horizontal del valor, solo que en otro
            control. Se apiló la fila (operador+eliminar, luego valor a todo el ancho, luego
            destino a todo el ancho), igual que ya hacía `IntencionForm` al lado — consistencia con
            el propio patrón del archivo vecino en vez de inventar uno nuevo.
      - [x] **Ajuste post-commit #2** (el problema seguía, ahora identificado con precisión: no era
            el input compacto sino el `<Select>` de destino — `SelectContent` de shadcn no trae
            límite de ancho ni `white-space` propio, así que una opción larga —el resumen de un
            nodo `mensaje` puede ser su texto completo— hacía crecer el desplegable sin límite en
            una sola línea al abrirlo, portal fuera del panel de 320-384px y por eso "de toda la
            pantalla"). Se extrajo `DestinoSelect.tsx` (nuevo, reusado por `ConditionEditor` y
            `IntencionForm` en sus 4 selects de destino) con `max-w-xs` + `whitespace-normal
            break-words` en el contenido: el texto largo ahora se envuelve dentro de un cajón
            acotado, visible completo, en vez de una sola línea sin límite.
- [x] `NodeInspector.tsx` (`IntencionForm`): mismo patrón para `etiqueta.descripcion`.

## Implementación — Backend

### 5. Seed de ejemplo (punto 5)

- [x] `apps/backend/src/seed/seed-flow-crm-ventas.ts`:
      - [x] CLI `--email=<admin>` (obligatorio), `--force` (permite correr en producción),
            `--activar` (opcional, activa el flujo tras crearlo).
      - [x] Resuelve `tenantId` vía `User.findOne({ email }).lean()`, igual que
            `resolveTenantId` de `seed-inbox-demo.ts`.
      - [x] Construye el DTO del flujo "Ventas CRM (demo)": mensaje (bienvenida) → intención
            [precio/horario/comprar/hablar_con_alguien] → kb (precio) / mensaje (horario) /
            condición (tarjeta/transferencia → mensaje → captura correo → acción crear_lead →
            mensaje confirmación) / handoff (rama por defecto y "hablar_con_alguien"). Toca 7 de
            los 8 tipos de nodo (todos menos `espera`, fuera de alcance).
      - [x] Valida el DTO con `createFlowSchema.shape.body` de `flow.validation.ts` (el mismo
            schema que usa `POST /api/flows`) antes de llamar a `createFlow(tenantId, dto)` de
            `flow.service.ts` — nunca un `Flow.create()` crudo.
      - [x] Idempotente: `Flow.deleteMany({ tenantId, nombre: 'Ventas CRM (demo)' })` antes de
            insertar.
      - [x] `activo: false` salvo `--activar` (se pasa como `dto.activo`; `createFlow` ya maneja la
            exclusividad con `desactivarFlowActivo`).
      - [x] Toda operación (`deleteMany`, `createFlow`) lleva `tenantId` explícito.
- [x] `apps/backend/package.json`: script `"seed:flow": "tsx --env-file .env
      src/seed/seed-flow-crm-ventas.ts"` (mismo patrón que `seed:inbox`).

## Tests

- [x] `nodeVisuals.test.ts` (nuevo, 6/6 verde): `filasDeRama` produce exactamente una fila por
      rama/etiqueta + la rama por defecto con su `destino`; nodos que no ramifican no producen
      ninguna fila; `configConDestino` actualiza el campo correcto para `condicion`/`intencion`
      tanto por índice de rama como por el handle `default`. Es el test de "los edges derivados son
      exactamente los esperados" que pedía el plan, a nivel de la función pura que los alimenta
      (más directo que renderizar `FlowEditorPage` completo con React Flow).
- [x] `ConditionEditor.test.tsx` (2 casos nuevos, 6/6 verde en total): un valor corto no muestra
      "Ver más"; un valor largo lo muestra, expande a un `Textarea` con el valor completo y
      deshabilita el input compacto, y "Ver menos" vuelve a habilitarlo.
- [x] Aislamiento del seed (punto 9 del `spec.md`): no se agregó un test nuevo dedicado — el script
      reusa `createFlow`/`flow.service.ts`, ya cubierto por `flow.isolation.test.ts` (5/5 verde,
      incluida la mecánica del índice parcial único), y su único statement adicional
      (`Flow.deleteMany({ tenantId, nombre })`) lleva `tenantId` explícito en el filtro — mismo
      criterio, sin repositorio scoped, que ya usa `seed-inbox-demo.ts` (que tampoco tiene test
      propio). La demostración real es ejecutar el script contra el tenant de prueba (ver
      Verificación final) — **pendiente de la corrida real del usuario contra su Mongo de
      desarrollo**, no se ejecutó desde esta sesión.

## Verificación final

- [x] `pnpm --filter backend typecheck` sin errores.
- [x] `pnpm --filter backend test`: 76 archivos / 640 tests en verde (sin regresiones; el seed no
      tiene test propio, ver nota arriba).
- [x] `pnpm --filter frontend build && pnpm --filter frontend lint` en verde.
- [x] Checklist de PR de `docs/multi-tenancy.md` §9 revisado para `seed-flow-crm-ventas.ts`: las dos
      operaciones de Mongo (`deleteMany`, y `createFlow` por dentro) llevan `tenantId` explícito;
      ninguna query sin tenant.
- [x] `pnpm --filter backend seed:flow -- --email=user-empresa-test@test.com` corrido contra la
      base de desarrollo (con autorización del usuario): creó el flujo "Ventas CRM (demo)"
      (`flowId 6a9a0d92bf1d8eba4fef4491`) en el tenant `6a696700a3aca08708da6dfe`, sin activar
      (`activo:false`). **Falta la confirmación visual del usuario en `/flows`.**
- [ ] **Verificación manual/visual del editor (arrastrar líneas de rama, expandir "Ver más", leer el
      tooltip, light/dark) queda a cargo del usuario** — sin Playwright ni verificación visual de
      parte de Claude, por acuerdo ya vigente en el proyecto.

## Definición de "hecho"

El admin ve y puede dibujar con líneas las ramas de `condicion`/`intencion` igual que ya podía con
los nodos lineales, entiende desde la propia UI por qué hay un solo flujo activo y cómo cubrir
varios temas con nodos de intención, puede leer un valor largo de condición o intención sin pelear
con una barra de scroll, y existe un script listo (`seed:flow`) para sembrar un flujo de ventas de
CRM real y válido en la base de datos del tenant de prueba — a falta de que el usuario lo corra
contra su Mongo de desarrollo.
