# HU-FLOW-02 — Tasks (checklist ejecutable)

> Claude Code: ejecuta en orden. Marca cada casilla al terminar. No cierres el feature hasta que
> TODO esté en verde. Antes de tocar `apps/frontend`, invoca `emil-design-eng`,
> `impeccable:impeccable` y `frontend-design:frontend-design` (regla §7 del `CLAUDE.md` raíz).
>
> **Regla que atraviesa todo el feature:** esta spec **nunca** decide libre-vs-plantilla. Solo
> decide *a quién* y *cuándo* escribirle, y delega el modo en `sendOutbound` (`HT-WA-02`). Si en
> algún punto aparece una comparación de `ventana24hExpiraEn` para elegir el modo de envío, está
> mal.

## Implementación — Backend

### 1. Infraestructura de cola

- [ ] `config/queues.ts`: `FLOW_RUNTIME_QUEUE_NAME`, `FLOW_RESUME_JOB`, `FLOW_REMINDER_JOB`,
      `REMINDER_SWEEP_JOB` y `flowRuntimeQueue`.
- [ ] `config/env.ts`: `REMINDER_SWEEP_INTERVAL_MS` (default 600000) y `REMINDER_SWEEP_BATCH`
      (default 200).
- [ ] `features/flow/flow.types.ts`: `FlowJobData` (unión `resume` | `reminder`) e
      `IReminderConfig`.
- [ ] `workers/flow-runtime.processor.ts`: worker de la cola, con `concurrency` explícita y
      despacho por `job.name`.
- [ ] `worker.ts`: registrar el worker de `flow-runtime` y el Job Scheduler del barrido tras
      conectar a Mongo.
      _Confirmar contra la versión de `bullmq` del `package.json` si la API es `upsertJobScheduler`
      o `repeat` + `jobId`; el comportamiento requerido (idempotente al reiniciar) es el mismo._
- [ ] `worker.ts`: eliminar el bloque `TEMP DEBUG` de `GEMINI_API_KEY` (líneas 13-23), marcado para
      borrar y que además vuelca un prefijo de la API key al log.

### 2. Nodo `espera`

- [ ] `features/flow/flow.model.ts`: añadir `esperaToken` a `FlowState`.
- [ ] `flow.runtime.service.ts`: al recibir el efecto de espera, generar `esperaToken`, guardarlo en
      el `FlowState` con `findOneAndUpdateScoped` y encolar el job diferido con `delay`, `attempts`
      y `backoff`.
- [ ] `flow.runtime.service.ts`: al avanzar por respuesta del cliente, regenerar/limpiar
      `esperaToken`.
- [ ] `flow-runtime.processor.ts` (job `resume`): si el `token` del job no coincide con el del
      `FlowState`, **descartar sin hacer nada** — el cliente respondió mientras tanto.

### 3. Recordatorio de inactividad

- [ ] `features/cliente/cliente.model.ts`: campo `recordatorioEnviadoParaVentana: Date` + índice
      `{ ventana24hExpiraEn: 1, iaHabilitada: 1 }`.
      _Documentar junto al índice por qué es el único que no empieza por `tenantId`: el barrido es
      cross-tenant por naturaleza, igual que la resolución de tenant del webhook._
- [ ] `features/tenant/tenant.model.ts` + `tenant.validation.ts`: subdocumento `recordatorio`
      (`activo` con default **false**, `antelacionMinutos`, `texto`, `templateId`).
- [ ] `features/flow/flow.reminder.service.ts`:
      - [ ] `buscarCandidatos(ahora)` con la consulta de los criterios 4 y 5 (`ventana24hExpiraEn`
            en la franja, `iaHabilitada: true`, `estadoComercial` fuera de `pagado`/`perdido`, sin
            recordatorio para esa ventana), limitada a `REMINDER_SWEEP_BATCH`.
      - [ ] `enviarRecordatorio(tenantId, clienteId)` marca
            `recordatorioEnviadoParaVentana = ventana24hExpiraEn` con `findOneAndUpdateScoped`
            **antes** de enviar (idempotencia frente a barridos solapados).
      - [ ] Envío con `sendOutbound(..., { modo: 'auto', texto, plantillaFallback }, 'bot')`.
      - [ ] Degradación de los criterios 9 y 10: `AppError` 422/429 → log y `return`, sin reintentar;
            cualquier otro error sí se propaga para que BullMQ reintente.
- [ ] `workers/reminder-sweep.processor.ts`: recorre los candidatos y encola un job `reminder` por
      conversación, cada uno con su `tenantId`.

## Implementación — Frontend

- [ ] `features/flows/hooks/useReminderSettings.ts` (TanStack Query) sobre el endpoint de
      configuración del tenant.
- [ ] `features/flows/components/ReminderSettings.tsx`: switch de activación, antelación, texto y
      selector de plantilla filtrado a `status: 'APPROVED'` (catálogo de `HT-WA-02`).
- [ ] Vista previa de lo que se enviará, tanto en texto libre como en plantilla, **antes** de
      activar. _Esto manda mensajes a personas reales sin supervisión: tiene que verse qué sale._
- [ ] Mostrar la antelación con contexto ("una conversación que expira a las 18:00 recibiría el
      aviso a las 16:00"), no un número desnudo.
- [ ] El estado desactivado debe verse deliberado, no roto: es el estado por defecto.
- [ ] `NodeInspector` (de HU-FLOW-01): panel del nodo `espera` con los minutos y una previsión
      legible.
- [ ] Reusar `switch`, `input`, `select`, `card` del UI kit; nada hecho a mano.
- [ ] Revisar en **light y dark** con tokens semánticos; cero `bg-[#...]`.

## Tests (Vitest)

### Aislamiento multi-tenant (obligatorio)

- [ ] `flow.reminder.isolation.test.ts`:
      - [ ] Con dos tenants con candidatos simultáneos, cada job recibe el `tenantId` de su propia
            conversación.
      - [ ] `enviarRecordatorio(tenantA, clienteDeB)` → 404, y no marca ni envía nada.
      - [ ] El recordatorio del tenant A no usa la plantilla, las credenciales ni la cuota del
            tenant B.
      - [ ] Marcar `recordatorioEnviadoParaVentana` en A no altera el documento de B.

### Nodo `espera`

- [ ] `flow-runtime.processor.test.ts`:
      - [ ] Un nodo `espera` de N minutos encola un job con `delay: N * 60000`.
      - [ ] Al vencer, el flujo se reanuda en el nodo siguiente.
      - [ ] **Si el cliente responde durante la espera**, el job diferido se descarta por token
            desparejado y el flujo no avanza dos veces (criterio 3).

### Recordatorio — Definition of Done de la historia

- [ ] `flow.reminder.test.ts` (con el reloj manipulado):
      - [ ] **Una conversación inactiva recibe el recordatorio antes de que expire su ventana.**
            Este es el DoD literal de HU-FLOW-02.
      - [ ] Con la ventana aún abierta, `sendOutbound` recibe `modo: 'auto'` y sale texto libre.
      - [ ] Con la ventana ya vencida, sale la plantilla HSM (criterio 8).
      - [ ] Sin plantilla configurada o no aprobada, y con la ventana vencida → se omite, se
            registra y **no** se reintenta (criterio 9).
      - [ ] Cuota agotada → termina sin enviar y lo registra (criterio 10).
      - [ ] No se envía si `iaHabilitada` es `false`.
      - [ ] No se envía si `estadoComercial` es `pagado` o `perdido`.
      - [ ] No se envía si hubo actividad posterior al inbound que abrió la ventana.
      - [ ] `recordatorio.activo: false` en el tenant → no se envía nada.
      - [ ] **Idempotencia:** dos barridos consecutivos sobre la misma conversación producen un
            único envío (criterio 6).
      - [ ] Un inbound nuevo reabre la ventana y la conversación vuelve a ser candidata sin limpiar
            banderas a mano.

### Regla de no duplicar la ventana

- [ ] Revisión explícita (y test de humo): ninguna función de esta spec compara
      `ventana24hExpiraEn` para elegir el modo de envío. La única comparación permitida es la de
      `buscarCandidatos`, y sirve para elegir **a quién**, no **cómo**.

### Frontend

- [ ] `ReminderSettings.test.tsx`: el selector de plantilla solo ofrece las `APPROVED`; desactivado
      es el estado inicial.

## Documentación

- [ ] `docs/data-model.md`: `Cliente.recordatorioEnviadoParaVentana`, `FlowState.esperaToken` y el
      subdocumento `Tenant.recordatorio`.
- [ ] `docs/architecture.md`: `flow-runtime` deja de ser un nombre reservado y pasa a ser un worker
      real; documentar el barrido periódico.
- [ ] `docs/multi-tenancy.md`: registrar `buscarCandidatos` como la tercera excepción documentada de
      lectura sin scope (junto a `login` y el webhook), explicando por qué solo devuelve
      identificadores.
- [ ] `docs/api-contract.md`: el endpoint de configuración del recordatorio.

## Verificación final

- [ ] `pnpm --filter backend typecheck` sin errores.
- [ ] `pnpm --filter backend test` con todos los tests en verde.
- [ ] `pnpm --filter frontend build && pnpm --filter frontend lint` en verde.
- [ ] Checklist de PR de `docs/multi-tenancy.md` §9 revisado.
- [ ] **Prueba manual E2E:** ajustar `ventana24hExpiraEn` de una conversación real para que caiga en
      la franja de antelación y comprobar que llega el recordatorio — una vez con la ventana
      abierta (texto libre) y otra con la ventana ya vencida (plantilla HSM).
- [ ] Comprobar que responder durante una espera cancela la reanudación programada.
- [ ] Las capturas de verificación quedaron en `.playwright-mcp/` o el scratchpad, y se borraron.

## Definición de "hecho"

Los flujos avanzan también con el tiempo, no solo con las respuestas, y una conversación que se
enfría recibe su recordatorio antes de perder la ventana de 24 h — en texto libre si aún se puede, y
con plantilla aprobada si ya no. Con esto el módulo M06 queda completo y la épica de Remarketing
hereda la cola, el scheduler y la selección automática de modo.
