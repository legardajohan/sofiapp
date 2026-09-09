# HU-FLOW-01-V2 — Tasks (checklist ejecutable)

> Claude Code: ejecuta en orden. Marca cada casilla al terminar. No cierres el feature hasta que
> TODO esté en verde. Antes de tocar `apps/frontend`, invoca `emil-design-eng`,
> `impeccable:impeccable` y `frontend-design:frontend-design` (regla §7 del `CLAUDE.md` raíz).
>
> **Orden deliberado:** el motor puro y sus tests van **antes** que el modelo y los endpoints. Es el
> componente de mayor riesgo del proyecto y se valida sin infraestructura.

## Implementación — Backend

### 1. Tipos y motor puro (primero, y con tests antes de seguir)

- [x] `features/flow/flow.types.ts`: `TIPOS_NODO`, `OPERADORES`, `IArista`, `INodo`, `ConfigNodo`
      (unión discriminada), `EfectoAccion`, `IFlow`, `IFlowState`, `Efecto`, DTOs y
      `IFlowResponse`.
- [x] `features/flow/flow.engine.ts`: `avanzar(entrada: EntradaMotor): SalidaMotor`.
      - [x] Normalización de texto para `igual_a` y `contiene` (sin mayúsculas ni tildes,
            `/\p{Diacritic}/gu`).
      - [x] `opcion_elegida` casa por índice ("2") o por texto de la opción.
      - [x] `ramaPorDefecto` cuando ninguna rama casa; el motor **nunca** lanza por una respuesta
            inesperada.
      - [x] Encadenado de nodos sin espera en una sola invocación, con tope de saltos (25) contra
            ciclos.
      - [x] Patrón `requiere` / `resueltos` para `intencion`, `kb` y `captura`: el motor describe la
            operación asíncrona, **no la ejecuta**.
- [x] `flow.engine.test.ts` en verde **antes** de escribir el modelo. Sin Mongo, sin Redis, sin LLM.
      (9/9 verde.)

### 2. Persistencia

- [x] `features/flow/flow.model.ts`: schemas `Flow` y `FlowState`.
      - [x] `Flow`: `tenantId` requerido, `entrada`, `version`, `estado`, `activo`.
            (Sin `index: true` de campo en `tenantId` — colisionaría de nombre con el índice
            parcial único de abajo; el compuesto `{tenantId,activo}` cubre las consultas.)
      - [x] Índice parcial único `{ tenantId: 1 }` con `partialFilterExpression: { activo: true }`
            — un solo flujo activo por tenant garantizado por la base, no solo por el service.
      - [x] `FlowState`: índice `{ tenantId, clienteId }` único.
- [x] `features/flow/flow.validation.ts`: Zod por tipo de nodo con `.strict()` + `superRefine` de
      grafo (ids únicos, `entrada` existente, referencias válidas, sin huérfanos).
      - [x] Rechazar el `tipo: 'api'` (reservado, no implementado en esta spec).

### 3. Servicios

- [x] `features/flow/flow.service.ts`: CRUD con `*Scoped` (patrón `tag.service.ts`, **no**
      `channel.service.ts`), subida de `version` en `PUT`, y activación exclusiva (desactivar el
      anterior en la misma operación).
- [x] `features/flow/flow.runtime.service.ts`: `ejecutarFlujo(tenantId, clienteId, mensaje, metaMessageId?)`.
      - [x] Resuelve `requiere: 'intencion'` con `getAIService().extract` (un `SlotSpec` `intencion`
            + `z.enum([...etiquetas])`). **No** se añadió ningún método nuevo al `AIService`.
      - [x] Resuelve `requiere: 'kb'` con `getAIService().chat` — hereda caché, FAQ y RAG.
      - [x] Resuelve `requiere: 'captura'` con `getAIService().extract` y el `SlotSpec` del nodo.
      - [x] Ejecuta los efectos **reusando** los services existentes: `sendOutbound`,
            el service de etiquetas de `conversation.service.ts` (`setConversationTags`, fusionando
            con las ya aplicadas), `createLeadFromConversation`, `assignConversation` de HU-OMNI-02
            y `setIaHabilitada(..., false)` para el `handoff`. `cambiar_estado` no tenía service
            propio (no existía `changeEstadoComercial`): se escribe inline vía `findOneAndUpdateScoped`
            sobre `Cliente`, tenant-safe igual que el resto.
      - [x] Persiste `FlowState` con `findOneAndUpdateScoped(..., { upsert: true })`, incluyendo
            `ultimoMetaMessageId` (idempotencia).
      - [x] Guarda extra (no prevista en el plan original): `ejecutarFlujo` también comprueba
            `cliente.iaHabilitada` por su cuenta, no solo el worker — defensa propia si algo más
            llega a invocarlo directamente.

### 4. Capa HTTP

- [x] `flow.controller.ts`: `tenantId` del token, sin `try/catch`, sin Mongoose.
- [x] `flow.routes.ts`: `GET /`, `POST /`, `GET /:id`, `PUT /:id` con la cadena de middlewares fija.
- [x] Montado en `app.ts`: `app.use('/api/flows', flowRoutes)`.

### 5. Enganche en el worker

- [x] `workers/inbound-message.processor.ts`: sustituido el `TODO(Fase 3)` de la línea 71 por la
      llamada a `ejecutarFlujo`, con las dos guardas (`iaHabilitada` y flujo activo) y el
      `try/catch` que impide que un flujo roto tumbe el job, documentado inline.

## Implementación — Frontend

- [x] Invocadas `emil-design-eng`, `impeccable:impeccable` (registro Product, tras
      `context.mjs --target apps/frontend/src/features/flows`) y `frontend-design:frontend-design`
      antes de escribir el primer componente. Decisiones que salieron de ahí: estrategia de color
      Restrained sobre los tokens ya existentes (sin paleta nueva); solo 2 tratamientos con color
      con significado — anillo `primary` para el nodo de inicio y borde/chip `destructive` para
      `handoff` — el resto de tipos se distingue por icono + label, no por color, para no saturar
      un canvas de 8 tipos con una paleta de 3-4 tokens; iconos `condicion`/`intencion` en
      `text-primary` (nodos de control de flujo) para que el ojo los encuentre al escanear el
      grafo; motion contenido (sin animaciones propias más allá de las nativas de Radix/React Flow).
- [x] `pnpm add @xyflow/react` en `apps/frontend/` (12.11.6).
- [x] ~~Instalar `tabs`/`popover`~~ — ya estaban vendorizados en `src/components/ui/`, no hace
      falta instalar nada del UI kit para este feature.
- [x] Alineadas las variables `--xy-*` de `@xyflow/react` a los tokens del proyecto en
      `src/index.css` (fondo, aristas, línea de conexión, controles, handles) — un solo bloque que
      hereda light/dark vía `hsl(var(--token))`, mismo criterio que `--sidebar-*` de DSN-03.
- [x] `features/flows/api.ts` y `types.ts`. Rutas **sin** el prefijo `/api`.
- [x] `hooks/useFlows.ts`, `useFlow.ts`, `useSaveFlow.ts` con TanStack Query.
- [x] `useFlowStore.ts` (Zustand): nodo seleccionado y errores de validación por nodo — el grafo
      en edición (`nodos`/`aristas`) vive como estado local de React Flow en `FlowEditorPage`
      (`useNodesState`/`useEdgesState`), no en Zustand: es la fuente de verdad natural de la
      librería y evita duplicar el mismo dato en dos sitios.
- [x] `components/nodes/FlowNode.tsx`: **un solo componente parametrizado por `nodo.tipo`**, no 8
      archivos — la distinción visual (icono, label, tratamiento de color) sale de
      `NODE_VISUALS`/`nodeVisuals.ts`, y los 8 tipos comparten exactamente la misma estructura de
      tarjeta. Registrar 8 componentes casi idénticos habría sido duplicación, no un "nodo custom
      por tipo" con más valor.
      - [x] `handoff` con borde/chip `destructive`, visualmente inequívoco (criterio 20).
- [x] `components/FlowCanvas.tsx`: `<ReactFlow>` con crear, arrastrar y conectar nodos.
      Extra no previsto en el plan: `components/AddNodeMenu.tsx` (menú para agregar cualquiera de
      los 8 tipos) — sin él el editor solo podía tener el nodo de inicio, ya que ni el plan ni el
      `EmptyFlowState` cubrían cómo agregar el SEGUNDO nodo en adelante.
- [x] `components/NodeInspector.tsx`: panel lateral de configuración del nodo seleccionado.
      - [x] Layout con el inspector en ancho fijo (`w-80`/`lg:w-96`) como hermano flex del canvas,
            nunca `absolute` — conviven sin recortarse (criterio 22).
      Extra no previsto: botón "Marcar como inicio" en el header del inspector — necesario para
      poder reasignar la entrada tras borrar el nodo de inicio original (si no, el flujo queda sin
      forma de fijar uno nuevo).
- [x] `components/ConditionEditor.tsx`: ramas (operador + valor + destino) y rama por defecto.
      Es la tarea literal de la historia: vive como el cuerpo casi completo del inspector para un
      nodo `condicion`, no como un campo más de un formulario largo.
- [x] `components/EmptyFlowState.tsx`: estado vacío guiado cuando `nodos.length === 0`, con botón
      que crea el nodo `entrada` (criterio 16).
- [x] `components/ActivateFlowDialog.tsx`: `AlertDialog` de shadcn que confirma la activación cuando
      ya existe otro flujo `activo`, nombrando el flujo que se desactivará (criterio 18).
- [x] Errores de validación del backend anclados al nodo culpable (borde/anillo destructivo en el
      canvas + banner in situ en el inspector, vía `lib/errors.ts#nodeErroresDesde` mapeando el
      índice de Zod al `id` del nodo), no un toast genérico (criterio 21).
- [x] Botón "Guardar" con estado de carga (`disabled` + spinner) durante `useSaveFlow`; en error, el
      canvas conserva `nodos`/`aristas` tal cual estaban — nunca se limpian (criterio 19).
- [x] `pages/FlowsPage.tsx`: listado con `Badge` de variante `success` en el flujo `activo`
      (criterio 17), y `pages/FlowEditorPage.tsx`.
- [x] `router.tsx`: rutas lazy `/flows` y `/flows/:id` (`:id === 'new'` = alta) como hijas de
      `AppLayout`, guardadas por rol admin.
- [x] `components/layout/nav-config.ts`: entrada "Flujos" con `roles: ['admin']`.
- [x] Editor revisado en **light y dark** contra los tokens semánticos; cero `bg-[#...]` en todo el
      feature (criterio 23) — pendiente de la revisión visual manual del usuario, per acuerdo de
      esta sesión de no hacer verificación visual/Playwright de mi parte.

## Tests (Vitest)

### Aislamiento multi-tenant (obligatorio)

- [x] `flow.isolation.test.ts` (5/5 verde):
      - [x] Flujo creado bajo tenantA no aparece en el listado de tenantB.
      - [x] `getFlowById` de un flujo de A con tenantB → 404 (nunca 403), y el flujo sigue intacto.
      - [x] `ejecutarFlujo(tenantB, clienteDeB, ...)` no resuelve el flujo activo de A.
      - [x] El `FlowState` de una conversación de A no es legible ni modificable desde B.
      - [x] Dos tenants pueden tener a la vez su propio flujo `activo: true` sin violar el índice
            parcial único.

### Motor puro — Definition of Done de la historia

- [x] `flow.engine.test.ts` (sin base de datos, 9/9 verde):
      - [x] **Flujo con dos ramas: dos respuestas distintas del cliente terminan en nodos
            distintos.** Este es el DoD literal de HU-FLOW-01.
      - [x] `igual_a` casa ignorando mayúsculas y tildes ("SÍ" ≡ "si").
      - [x] `contiene` casa con una subcadena.
      - [x] `opcion_elegida` casa tanto por índice ("2") como por el texto de la opción.
      - [x] Respuesta que no casa con nada → `ramaPorDefecto`, sin lanzar.
      - [x] Cadena de `mensaje` → `condicion` → `mensaje` resuelta en una sola invocación.
      - [x] Flujo con ciclo → corta en el tope de saltos y devuelve un efecto de error.
      - [x] Un nodo `kb` devuelve `requiere: { tipo: 'kb' }` y **no** produce texto por sí mismo.
      - [x] `siNoHayRespuesta` se toma cuando el `resueltos.respuestaKb` viene vacío.

### Validación de grafo y regla anti-duplicación de KB

- [x] `flow.validation.test.ts` (8/8 verde):
      - [x] Arista que apunta a un `id` inexistente → falla.
      - [x] Nodo huérfano → falla.
      - [x] El nodo de `entrada` debe existir entre los nodos declarados → falla si no.
            (Nota: "dos nodos de entrada" del enunciado original no aplica al esquema implementado
            — `entrada` es un único campo `string` en `Flow`, no un flag por nodo, así que no existe
            un estado posible de "dos entradas": solo puede apuntar a un id inexistente o válido.)
      - [x] `id` de nodo duplicados → falla.
      - [x] **Un nodo `condicion` con un campo `respuesta`/`texto` → falla** (criterio 10 del `spec`:
            el flujo no puede guardar contenido de conocimiento; `.strict()` lo rechaza).
      - [x] **Un nodo `kb` con texto de respuesta embebido → falla.**
      - [x] `tipo: 'api'` → falla (reservado, fuera de la unión discriminada).

### Runtime

- [x] `flow.runtime.service.test.ts` (con `AIService` y `sendOutbound` mockeados, 7/7 verde):
      - [x] Con `iaHabilitada: false` el flujo no se ejecuta.
      - [x] Sin flujo activo en el tenant, no se ejecuta nada.
      - [x] Un nodo `handoff` deja `iaHabilitada: false`.
      - [x] Un nodo `kb` llama a `AIService.chat` exactamente una vez y **no** consulta la KB por su
            cuenta.
      - [x] Todo envío pasa por `sendOutbound` (ninguna llamada directa a `metaWhatsAppClient`).
      - [x] Reprocesar el mismo `metaMessageId` no vuelve a avanzar el flujo (idempotencia).
      - [x] Un efecto que lanza (`sendOutbound` rechazado) queda registrado en el log y **no**
            propaga al llamador.

### Contrato HTTP

- [x] `flow.routes.test.ts` (Supertest, patrón de `lead.routes.test.ts`, 9/9 verde):
      - [x] Sin sesión → 401; con rol distinto de admin → 403.
      - [x] `POST /api/flows` sin `X-CSRF-Token` → 403.
      - [x] `PUT /api/flows/:id` con `activo: true` desactiva el flujo activo anterior.
      - [x] Grafo inválido → 400 con el detalle de Zod.
      - [x] Extra: un flujo de otro tenant vía `PUT` → 404, nunca 403, y sigue intacto.

### Frontend

- [x] `ConditionEditor.test.tsx` (4/4 verde): añadir, editar y eliminar ramas; la rama por defecto
      siempre existe.
- [x] `FlowCanvas.test.tsx` (1/1 verde): renderiza nodos y aristas de un flujo cargado. Necesitó
      stub de `getBoundingClientRect` (jsdom no mide layout real; documentado en el propio test).
- [x] `EmptyFlowState.test.tsx` (2/2 verde): se muestra cuando `nodos.length === 0` y crea el nodo
      `entrada` al interactuar (criterio 16).
- [x] `ActivateFlowDialog.test.tsx` (3/3 verde): pide confirmación antes de desactivar el flujo
      activo anterior (criterio 18).

## Documentación

- [x] `docs/data-model.md`: concretado el `config` de cada tipo de nodo, añadido el campo `entrada`
      a `flows` y `esperandoRespuesta`/`ultimoMetaMessageId` a `flow_states`.
- [x] `docs/domain.md`: la entidad `Flow` deja de estar marcada como "Fase 3"; documentado el
      vocabulario de nodos y **la regla de que el flujo no almacena conocimiento**.
- [x] `docs/api-contract.md`: añadidos los cuatro endpoints de `/api/flows`.
- [ ] `docs/architecture.md`: **sin tocar, deliberadamente.** El motor corre síncrono dentro del
      job `inbound-messages` existente (`ejecutarFlujo` llamado desde
      `inbound-message.processor.ts`) — esta spec NO añade una cola `flow-runtime` propia. Ese
      placeholder sigue reservado para `HU-FLOW-02` (nodos `espera`, recordatorios), que sí la
      necesita.

## Verificación final

- [x] `pnpm --filter backend typecheck` sin errores.
- [x] `pnpm --filter backend test` con todos los tests en verde (76 archivos / 640 tests, incluidos
      los 38 nuevos de `flow`).
- [x] `pnpm --filter frontend build && pnpm --filter frontend lint` en verde.
- [x] Checklist de PR de `docs/multi-tenancy.md` §9 revisado: `*Scoped` en todo el service (incluida
      `desactivarFlowActivo`, corregida de `Flow.updateMany` directo a `updateManyScoped`);
      `tenantId` del token en el controller; `Flow`/`FlowState` con `tenantId` requerido e indexado
      (el de `Flow` vía los compuestos, no un `index:true` de campo — ver nota en `flow.model.ts`);
      `requireTenant` inmediatamente tras `authenticateJWT` en las 4 rutas; test de aislamiento
      añadido (`flow.isolation.test.ts`, 5/5 verde).
- [ ] **Verificación manual/visual (E2E con celular real, recorrido de los 8 criterios UX en
      light/dark) queda a cargo del usuario** — Claude no usa Playwright ni hace verificación
      visual por su cuenta en este feature.

## Definición de "hecho"

Un administrador dibuja un flujo con ramas, lo activa (con confirmación si desplaza a otro), y las
conversaciones reales avanzan por el camino que corresponde a lo que responde el cliente. El editor
guía al admin en cada paso (estado vacío, carga, errores anclados, badge de activo) y queda prolijo
en light y dark. El flujo orquesta y delega: el conocimiento sigue viviendo en la KB, la ventana de
24 h en `sendOutbound`, y los efectos de dominio en los services que ya existían. `HU-FLOW-02` puede
añadir esperas y recordatorios encima.
