# HU-FLOW-01 — Tasks (checklist ejecutable)

> Claude Code: ejecuta en orden. Marca cada casilla al terminar. No cierres el feature hasta que
> TODO esté en verde. Antes de tocar `apps/frontend`, invoca `emil-design-eng`,
> `impeccable:impeccable` y `frontend-design:frontend-design` (regla §7 del `CLAUDE.md` raíz).
>
> **Orden deliberado:** el motor puro y sus tests van **antes** que el modelo y los endpoints. Es el
> componente de mayor riesgo del proyecto y se valida sin infraestructura.

## Implementación — Backend

### 1. Tipos y motor puro (primero, y con tests antes de seguir)

- [ ] `features/flow/flow.types.ts`: `TIPOS_NODO`, `OPERADORES`, `IArista`, `INodo`, `ConfigNodo`
      (unión discriminada), `EfectoAccion`, `IFlow`, `IFlowState`, `Efecto`, DTOs y
      `IFlowResponse`.
- [ ] `features/flow/flow.engine.ts`: `avanzar(entrada: EntradaMotor): SalidaMotor`.
      - [ ] Normalización de texto para `igual_a` y `contiene` (sin mayúsculas ni tildes).
      - [ ] `opcion_elegida` casa por índice ("2") o por texto de la opción.
      - [ ] `ramaPorDefecto` cuando ninguna rama casa; el motor **nunca** lanza por una respuesta
            inesperada.
      - [ ] Encadenado de nodos sin espera en una sola invocación, con tope de saltos (25) contra
            ciclos.
      - [ ] Patrón `requiere` / `resueltos` para `intencion`, `kb` y `captura`: el motor describe la
            operación asíncrona, **no la ejecuta**.
- [ ] `flow.engine.test.ts` en verde **antes** de escribir el modelo. Sin Mongo, sin Redis, sin LLM.

### 2. Persistencia

- [ ] `features/flow/flow.model.ts`: schemas `Flow` y `FlowState`.
      - [ ] `Flow`: `tenantId` requerido e indexado, `entrada`, `version`, `estado`, `activo`.
      - [ ] Índice parcial único `{ tenantId: 1 }` con `partialFilterExpression: { activo: true }`
            — un solo flujo activo por tenant garantizado por la base, no solo por el service.
      - [ ] `FlowState`: índice `{ tenantId, clienteId }` único.
- [ ] `features/flow/flow.validation.ts`: Zod por tipo de nodo con `.strict()` + `superRefine` de
      grafo (ids únicos, `entrada` existente, referencias válidas, sin huérfanos).
      - [ ] Rechazar el `tipo: 'api'` (reservado, no implementado en esta spec).

### 3. Servicios

- [ ] `features/flow/flow.service.ts`: CRUD con `*Scoped`, subida de `version` en `PUT`, y
      activación exclusiva (desactivar el anterior en la misma operación).
- [ ] `features/flow/flow.runtime.service.ts`: `ejecutarFlujo(tenantId, clienteId, mensaje)`.
      - [ ] Resuelve `requiere: 'intencion'` con `getAIService().extract` (un `SlotSpec` `intencion`
            + `z.enum([...etiquetas])`). **No** añadir un método nuevo al `AIService`.
      - [ ] Resuelve `requiere: 'kb'` con `getAIService().chat` — hereda caché, FAQ y RAG.
      - [ ] Resuelve `requiere: 'captura'` con `getAIService().extract` y el `SlotSpec` del nodo.
      - [ ] Ejecuta los efectos **reusando** los services existentes: `sendOutbound`,
            `changeEstadoComercial`, el service de etiquetas de HU-OMNI-04,
            `createLeadFromConversation`, la asignación de HU-OMNI-02 y
            `setIaHabilitada(..., false)` para el `handoff`.
      - [ ] Persiste `FlowState` con `findOneAndUpdateScoped(..., { upsert: true })`, incluyendo el
            `metaMessageId` del último mensaje procesado (idempotencia).

### 4. Capa HTTP

- [ ] `flow.controller.ts`: `tenantId` del token, sin `try/catch`, sin Mongoose.
      `req.validatedQuery`, nunca `req.query`.
- [ ] `flow.routes.ts`: `GET /`, `POST /`, `GET /:id`, `PUT /:id` con la cadena de middlewares fija.
- [ ] Montar en `app.ts`: `app.use('/api/flows', flowRoutes)` en el bloque tenant-aware.

### 5. Enganche en el worker

- [ ] `workers/inbound-message.processor.ts`: sustituir el `TODO(Fase 3)` de la línea 71 por la
      llamada a `ejecutarFlujo`, con las dos guardas (`iaHabilitada` y flujo activo) y el
      `try/catch` que impide que un flujo roto tumbe el job.
      _Documentar en el comentario por qué ese `try/catch` es la excepción a la regla del proyecto._

## Implementación — Frontend

- [ ] `pnpm add @xyflow/react` en `apps/frontend/` (12.x, ya fijado en `docs/architecture.md`).
- [ ] Instalar lo que falte del UI kit: `pnpm dlx shadcn@3.8.5 add tabs popover`.
      _Fijar 3.8.5; las 4.x asumen Tailwind v4 y rompen el proyecto._
- [ ] Alinear las variables CSS de `@xyflow/react` a la paleta del proyecto en `src/index.css`
      (mismo criterio que se aplicó a `--sidebar-*` en DSN-03). Cero grises por defecto de la
      librería.
- [ ] `features/flows/api.ts` y `types.ts`. Rutas **sin** el prefijo `/api`.
- [ ] `hooks/useFlows.ts`, `useFlow.ts`, `useSaveFlow.ts` con TanStack Query.
- [ ] Store Zustand para el estado de edición del canvas (nodo seleccionado, cambios sin guardar).
- [ ] `components/nodes/*.tsx`: un nodo custom por tipo, con color e icono distinguibles y
      heredando los tokens semánticos. El `handoff` debe leerse como la salida del automatismo.
- [ ] `components/FlowCanvas.tsx`: `<ReactFlow>` con crear, arrastrar y conectar nodos.
- [ ] `components/NodeInspector.tsx`: panel lateral de configuración del nodo seleccionado.
- [ ] `components/ConditionEditor.tsx`: ramas (operador + valor + destino) y rama por defecto.
      _Es la tarea literal de la historia: tiene que ser lo más rápido del editor._
- [ ] Errores de validación del backend anclados al nodo culpable, no un toast genérico.
- [ ] `pages/FlowsPage.tsx` (listado + cuál está activo) y `pages/FlowEditorPage.tsx`.
- [ ] `router.tsx`: rutas lazy `/flows` y `/flows/:id` como hijas de `AppLayout`, guardadas por rol
      admin.
- [ ] `components/layout/nav-config.ts`: entrada "Flujos" con `roles: ['admin']`.
- [ ] Revisar el editor completo en **light y dark**; cero `bg-[#...]`.

## Tests (Vitest)

### Aislamiento multi-tenant (obligatorio)

- [ ] `flow.isolation.test.ts`:
      - [ ] Flujo creado bajo tenantA no aparece en el listado de tenantB.
      - [ ] `GET /api/flows/:id` de un flujo de A con sesión de B → 404 (nunca 403).
      - [ ] `ejecutarFlujo(tenantB, clienteDeB, ...)` no resuelve el flujo activo de A.
      - [ ] El `FlowState` de una conversación de A no es legible ni modificable desde B.
      - [ ] Dos tenants pueden tener a la vez su propio flujo `activo: true` sin violar el índice
            parcial único.

### Motor puro — Definition of Done de la historia

- [ ] `flow.engine.test.ts` (sin base de datos):
      - [ ] **Flujo con dos ramas: dos respuestas distintas del cliente terminan en nodos
            distintos.** Este es el DoD literal de HU-FLOW-01.
      - [ ] `igual_a` casa ignorando mayúsculas y tildes ("SÍ" ≡ "si").
      - [ ] `contiene` casa con una subcadena.
      - [ ] `opcion_elegida` casa tanto por índice ("2") como por el texto de la opción.
      - [ ] Respuesta que no casa con nada → `ramaPorDefecto`, sin lanzar.
      - [ ] Cadena de `mensaje` → `condicion` → `mensaje` resuelta en una sola invocación.
      - [ ] Flujo con ciclo → corta en el tope de saltos y devuelve un efecto de error.
      - [ ] Un nodo `kb` devuelve `requiere: { tipo: 'kb' }` y **no** produce texto por sí mismo.
      - [ ] `siNoHayRespuesta` se toma cuando el `resueltos.respuestaKb` viene vacío.

### Validación de grafo y regla anti-duplicación de KB

- [ ] `flow.validation.test.ts`:
      - [ ] Arista que apunta a un `id` inexistente → 400.
      - [ ] Nodo huérfano → 400.
      - [ ] Dos nodos de entrada, o ninguno → 400.
      - [ ] `id` de nodo duplicados → 400.
      - [ ] **Un nodo `condicion` con un campo `respuesta`/`texto` → 400** (criterio 10 del `spec`:
            el flujo no puede guardar contenido de conocimiento).
      - [ ] **Un nodo `kb` con texto de respuesta embebido → 400.**
      - [ ] `tipo: 'api'` → 400 (reservado).

### Runtime

- [ ] `flow.runtime.service.test.ts` (con AIService y `sendOutbound` mockeados):
      - [ ] Con `iaHabilitada: false` el flujo no se ejecuta.
      - [ ] Sin flujo activo en el tenant, no se ejecuta nada.
      - [ ] Un nodo `handoff` deja `iaHabilitada: false` y emite el evento de tiempo real.
      - [ ] Un nodo `kb` llama a `AIService.chat` exactamente una vez y **no** consulta la KB por su
            cuenta.
      - [ ] Todo envío pasa por `sendOutbound` (ninguna llamada directa a `metaWhatsAppClient`).
      - [ ] Reprocesar el mismo `metaMessageId` no vuelve a avanzar el flujo (idempotencia).
      - [ ] Un efecto que lanza queda registrado en el log y **no** propaga al job del worker.

### Contrato HTTP

- [ ] `flow.routes.test.ts` (Supertest, patrón de `lead.routes.test.ts`):
      - [ ] Sin sesión → 401; con rol distinto de admin → 403.
      - [ ] `POST /api/flows` sin `X-CSRF-Token` → 403.
      - [ ] `PUT /api/flows/:id` con `activo: true` desactiva el flujo activo anterior.
      - [ ] Grafo inválido → 400 con el detalle de Zod.

### Frontend

- [ ] `ConditionEditor.test.tsx`: añadir, editar y eliminar ramas; la rama por defecto siempre
      existe.
- [ ] `FlowCanvas.test.tsx`: renderiza nodos y aristas de un flujo cargado.

## Documentación

- [ ] `docs/data-model.md`: concretar el `config` de cada tipo de nodo (hoy dice "a definir en spec
      de M06"), añadir el campo `entrada` a `flows` y `esperandoRespuesta` a `flow_states`.
- [ ] `docs/domain.md`: la entidad `Flow` deja de estar marcada como "Fase 3"; documentar el
      vocabulario de nodos y **la regla de que el flujo no almacena conocimiento**.
- [ ] `docs/api-contract.md`: añadir los cuatro endpoints de `/api/flows`.
- [ ] `docs/architecture.md`: el worker `flow-runtime` deja de ser un placeholder reservado.

## Verificación final

- [ ] `pnpm --filter backend typecheck` sin errores.
- [ ] `pnpm --filter backend test` con todos los tests en verde.
- [ ] `pnpm --filter frontend build && pnpm --filter frontend lint` en verde.
- [ ] Checklist de PR de `docs/multi-tenancy.md` §9 revisado.
- [ ] **Prueba manual E2E:** flujo con dos ramas publicado y activo; desde un celular real
      responder una vez por cada rama y verificar en la bandeja que cada respuesta recorrió el
      camino correcto.
- [ ] Comprobar que una pregunta de conocimiento la responde la KB/FAQ a través del nodo `kb`, y que
      cambiar la respuesta en la KB cambia lo que contesta el flujo **sin tocar el flujo**.
- [ ] Las capturas de verificación quedaron en `.playwright-mcp/` o el scratchpad, y se borraron.

## Definición de "hecho"

Un administrador dibuja un flujo con ramas, lo activa, y las conversaciones reales avanzan por el
camino que corresponde a lo que responde el cliente. El flujo orquesta y delega: el conocimiento
sigue viviendo en la KB, la ventana de 24 h en `sendOutbound`, y los efectos de dominio en los
services que ya existían. `HU-FLOW-02` puede añadir esperas y recordatorios encima.
