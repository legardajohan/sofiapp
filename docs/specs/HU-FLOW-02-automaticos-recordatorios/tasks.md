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

- [x] `config/queues.ts`: `FLOW_RUNTIME_QUEUE_NAME`, `FLOW_RESUME_JOB`, `FLOW_REMINDER_JOB`,
      `REMINDER_SWEEP_JOB`, `REMINDER_SWEEP_SCHEDULER_ID` y `flowRuntimeQueue`.
- [x] `config/env.ts`: `REMINDER_SWEEP_INTERVAL_MS` (default 600000) y `REMINDER_SWEEP_BATCH`
      (default 200).
- [x] `features/flow/flow.types.ts`: `FlowJobData` (unión `resume` | `reminder`).
      _`IReminderConfig` terminó en `tenant.types.ts` junto al resto de tipos de `Tenant`, no en
      `flow.types.ts` — es donde vive el resto del modelo de datos del tenant._
- [x] `workers/flow-runtime.processor.ts`: `processFlowRuntimeJob(job)`, despacho por `job.name`
      hacia `reanudarFlujo` / `enviarRecordatorio` / `ejecutarBarridoRecordatorios`.
      _`concurrency: 5` se declara al construir el `Worker` en `worker.ts`, no dentro del processor._
- [x] `worker.ts`: registrado el worker de `flow-runtime` y el Job Scheduler del barrido tras
      conectar a Mongo, con `upsertJobScheduler` (`bullmq ^5.79.2` instalado, confirmado que expone
      la API). No había placeholder `flow-runtime` que quitar.
- [x] `worker.ts`: eliminado el bloque `TEMP DEBUG` de `GEMINI_API_KEY`.

### 2. Nodo `espera` — el eje del tiempo

- [x] `features/flow/flow.types.ts`: `Efecto` gana `{ tipo: 'programar_espera'; minutos }`;
      `EntradaMotor.resueltos` gana `esperaCumplida?: true`; `IFlowState` gana
      `esperaToken?: string | null`.
      _Deliberadamente **sin** `nodoDestino` en el efecto ni en el job: al reanudar, el motor
      reentra en el MISMO nodo `espera` (no en su destino) y recalcula `siguienteLineal` con las
      aristas vigentes en ese momento — así una edición del flujo mientras la espera está pendiente
      no deja una decisión congelada. Ver la nota en `flow.types.ts` y el `plan.md` actualizado._
- [x] `features/flow/flow.model.ts`: `esperaToken` añadido al schema de `FlowState`.
- [x] `features/flow/flow.engine.ts`: `case 'espera'` real con las tres situaciones en orden —
      `resueltos.esperaCumplida` → avanza; `state.nodoActualId === nodo.id` → avanza sin encolar
      otra espera (criterio 4); primera llegada → emite `programar_espera` y se queda en el nodo.
- [x] `flow.runtime.service.ts`: el efecto `programar_espera` se intercepta en un `correrMotor`
      compartido (no en `ejecutarEfecto`) porque necesita devolver el token generado para que
      `persistirFlowState` lo escriba en el mismo `$set` — genera el token, encola el job con
      `delay`, `attempts` y `backoff`, y si falla el encolado no deja un token huérfano.
      `ejecutarEfecto` conserva un `case 'programar_espera'` defensivo que solo loguea si llega
      hasta ahí (no debería, es un fallo de cableado).
- [x] `persistirFlowState` decide el estado COMPLETO del token en cada llamada: el fresco si se
      programó una espera en esta pasada, o `null` en cualquier otro avance — invalidando de paso
      cualquier job diferido pendiente de un nodo `espera` anterior.
- [x] `flow.runtime.service.ts`: exportado `reanudarFlujo(tenantId, clienteId, token)` — **sin**
      `flowId` ni `nodoDestino** como parámetros: resuelve el flujo activo igual que `ejecutarFlujo`
      (mismo criterio: siempre el vigente, nunca uno congelado) y el `FlowState` por
      `{tenantId, clienteId}` (único por conversación). Valida el token, re-comprueba
      `iaHabilitada`, y reusa `correrMotor`.
- [x] `flow-runtime.processor.ts` (job `resume`): delega en `reanudarFlujo`; el descarte por token
      desparejado ocurre DENTRO de `reanudarFlujo` (primera línea), no en el processor.

### 3. Recordatorio de inactividad

- [x] `features/cliente/cliente.model.ts` + `cliente.types.ts`: campo
      `recordatorioEnviadoParaVentana: Date` + índice `{ ventana24hExpiraEn: 1, iaHabilitada: 1 }`,
      documentado junto al índice.
- [x] `features/tenant/tenant.model.ts` + `tenant.types.ts` + `tenant.validation.ts`: subdocumento
      `recordatorio` (`activo` default **false**, `antelacionMinutos`, `texto`, `templateId`) e
      `IReminderConfig`/`IReminderResponse`/`UpdateReminderDTO`/`UpdateReminderInput`.
- [x] `features/tenant/tenant.service.ts`: `getReminderConfig(tenantId)` y
      `updateReminderConfig(tenantId, dto)` — por el propio `_id` del `Tenant` (no lleva
      `tenantId`, el documento ES el tenant). Regla de coherencia: `activo: true` sin `texto` →
      `AppError(..., 422)`.
- [x] `features/flow/flow.controller.ts` + `flow.routes.ts`: `GET`/`PUT /api/flows/reminder`.
      **Corrección de ruteo durante la implementación:** el plan original decía
      `/api/tenants/me/reminder`, pero `tenant.routes.ts` se monta en `/api/admin/tenants`
      (superadmin, cross-tenant, sin `requireTenant` — `app.ts:64`); colgar ahí una ruta de admin
      normal mezclaría dos modelos de seguridad bajo el mismo prefijo `/admin/`. Los endpoints
      quedaron en `flow.routes.ts` (ya montado en `/api/flows`, ya tenant-aware), registrados
      **antes** de `GET/PUT /:id` para que Express no capture `"reminder"` como si fuera un id. El
      *service* se queda en `tenant.service.ts` (el dato vive en `Tenant`); el *controller* y las
      *rutas* van en `flow`, que es quien las consume.
- [x] `features/flow/flow.reminder.service.ts`:
      - [x] `buscarCandidatos(ahora)`: cross-tenant, acotado a la antelación MÁXIMA permitida
            (1440 min) — no conoce todavía la antelación de cada tenant candidato.
      - [x] `filtrarPorConfiguracionTenant(candidatos, ahora)`: filtra por la política de CADA
            tenant (`activo` + su propia `antelacionMinutos`), en una sola consulta batched a
            `Tenant`. Es la pieza que el `plan.md` original no resolvía (asumía una única
            antelación global para todo el barrido).
      - [x] `enviarRecordatorio(tenantId, clienteId)`: reconfirma elegibilidad con datos frescos
            (si hubo un inbound nuevo, `ventana24hExpiraEn` ya se alejó de la franja — así se
            detecta "actividad después" sin un campo aparte), marca
            `recordatorioEnviadoParaVentana = ventana24hExpiraEn` con `findOneAndUpdateScoped`
            **antes** de enviar, y llama `sendOutbound(..., { modo: 'auto', texto,
            plantillaFallback }, 'bot')`.
      - [x] Degradación de los criterios 10 y 11: `AppError` 422/429 → log y `return`, sin
            reintentar; cualquier otro error se propaga para que BullMQ reintente.
      - [x] `ejecutarBarridoRecordatorios(ahora)`: junta `buscarCandidatos` +
            `filtrarPorConfiguracionTenant` y encola un job `reminder` por conversación elegible.
            _No existe un `workers/reminder-sweep.processor.ts` separado: la orquestación del
            barrido es lógica de dominio (vive en `flow.reminder.service.ts`, junto a
            `enviarRecordatorio`); `flow-runtime.processor.ts` solo la invoca al recibir el job
            `sweep`, igual que ya invoca `reanudarFlujo`/`enviarRecordatorio` para los otros dos._

## Implementación — Frontend

> V3 ya dejó el nodo `espera` completo en el editor (paleta, icono, `configPorDefecto`,
> `resumenConfig` y `EsperaForm`). Lo que quedaba era la configuración del recordatorio y quitar un
> aviso.

- [x] `features/flows/api.ts`: `fetchReminder()` / `updateReminder()` sobre `/flows/reminder`
      (sin el prefijo `/api`).
- [x] `features/flows/hooks/useReminderSettings.ts` (TanStack Query: `useQuery` + `useMutation`,
      con `setQueryData` al guardar).
- [x] `features/flows/components/ReminderSettings.tsx`: switch de activación, antelación (presets
      de 30 min a 12 h, no un número libre), texto y selector de plantilla filtrado a
      `status: 'APPROVED'` (catálogo de `HT-WA-02`); montado en `FlowsPage`.
- [x] Vista previa con `TemplatePreview` (reutilizado de `whatsapp-templates`), tanto del texto
      libre como de la plantilla de respaldo, siempre visible — no solo al activar.
- [x] Antelación con contexto: ejemplo en vivo ("si el cliente escribió a las X, el aviso saldría a
      las Y, antes de que la ventana se cierre a las Z"), recalculado según la hora real.
- [x] Estado desactivado como default con badge "Desactivado" (variante `secondary`, no de error) y
      copy explícito ("no se envía nada hasta que lo actives").
- [x] `NodeInspector.tsx`: quitado el aviso "el flujo todavía no los ejecuta"; en su lugar,
      `previsionEspera(minutos)` da una previsión legible ("se reanuda ~2 h después").
- [x] Componentes del UI kit (`switch`, `select`, `textarea`, `badge`, `label`, `button`,
      `skeleton`); nada hecho a mano.
- [x] Tokens semánticos (`bg-card`, `border-border`, `text-muted-foreground`, `bg-primary`); cero
      `bg-[#...]`. Hereda light/dark automáticamente, sin CSS propio.

## Tests (Vitest)

### Aislamiento multi-tenant (obligatorio)

- [x] `flow.reminder.isolation.test.ts`:
      - [x] Con dos tenants con candidatos simultáneos, `filtrarPorConfiguracionTenant` respeta la
            política de CADA tenant (uno activo, otro no) sin cruzarlas.
      - [x] `enviarRecordatorio(tenantA, clienteDeB)` → 404, y no marca ni envía nada.
      - [x] Un `templateId` mal configurado apuntando a la plantilla de OTRO tenant nunca se
            resuelve (`findByIdScoped` con el tenant equivocado → 404, nunca la plantilla ajena).
      - [x] Marcar `recordatorioEnviadoParaVentana` en A no altera el documento de B.
      - [x] `GET`/`PUT /api/flows/reminder` (en `flow.routes.test.ts`): cada admin lee y escribe
            solo la config de SU tenant; no hay parámetro por el que alcanzar la de otro.
      - [x] `reanudarFlujo(tenantB, clienteDeA, token)` no toca el `FlowState` de A
            (`flow.isolation.test.ts`).

### Nodo `espera`

- [x] `flow.engine.test.ts` (motor puro, sin IO): las tres situaciones del `case 'espera'`.
- [x] `flow.runtime.service.test.ts` + `flow-runtime.processor.test.ts`:
      - [x] Un nodo `espera` de N minutos encola un job con `delay: N * 60000` y guarda el token en
            el `FlowState`.
      - [x] Al vencer, `reanudarFlujo` continúa en el nodo siguiente y limpia el token.
      - [x] Si encolar falla, no queda un `esperaToken` huérfano.
      - [x] **Si el cliente responde durante la espera**, el token viejo ya no coincide y
            `reanudarFlujo` no hace nada (criterio 3).
      - [x] `reanudarFlujo` con `iaHabilitada: false` no hace nada.
      - [x] El dispatcher `processFlowRuntimeJob` despacha cada nombre de job al handler correcto
            (y un nombre desconocido no lanza).

### Recordatorio — Definition of Done de la historia

- [x] `flow.reminder.test.ts`:
      - [x] **Una conversación inactiva recibe el recordatorio antes de que expire su ventana**
            (texto libre, ventana abierta) — DoD literal de HU-FLOW-02.
      - [x] Con la ventana ya vencida, sale la plantilla HSM (criterio 9).
      - [x] Sin plantilla configurada y ventana vencida → se omite, se registra (marca la ventana
            igual) y **no** se reintenta (criterio 10).
      - [x] Cuota agotada → termina sin enviar y lo registra (criterio 11).
      - [x] No se envía si `iaHabilitada` es `false`, ni si `estadoComercial` es `pagado`/`perdido`.
      - [x] No se envía si hubo actividad posterior (la ventana se alejó más allá de la antelación).
      - [x] `recordatorio.activo: false` → no se envía nada.
      - [x] **Idempotencia:** dos llamadas consecutivas producen un único envío (criterio 7).
      - [x] Un inbound nuevo reabre la ventana y la conversación vuelve a ser candidata de
            `buscarCandidatos` sin limpiar banderas a mano.
      - _Verificado con tiempos reales relativos (`Date.now() + delta`), no con el reloj del sistema
        congelado: manipular `vi.useFakeTimers()` junto a operaciones reales de MongoDB introduce
        más riesgo de bloqueos que valor de prueba aquí — el efecto (una ventana a N minutos de
        distancia) es el mismo._

### Regla de no duplicar la ventana

- [x] Test de humo en `flow.reminder.test.ts`: con ventana vencida y plantilla aprobada, el modo lo
      decide `sendOutbound`; esta spec nunca compara `ventana24hExpiraEn` para elegir el modo.

### Frontend

- [x] `ReminderSettings.test.tsx`: desactivado es el estado inicial; el selector de plantilla
      solo ofrece lo que devuelve el catálogo `APPROVED`; el botón Guardar nace deshabilitado y se
      habilita al editar; activar sin texto bloquea el guardado; guarda con el payload correcto.

## Documentación

- [x] `docs/data-model.md`: `Cliente.recordatorioEnviadoParaVentana` (+ el índice cross-tenant),
      `FlowState.esperaToken` y el subdocumento `Tenant.recordatorio`.
- [x] `docs/architecture.md`: `flow-runtime` deja de ser un nombre reservado ("Fase 3") y pasa a
      describir el trabajo real (nodos `espera` + recordatorios, barrido periódico).
- [x] `docs/multi-tenancy.md`: registrada `buscarCandidatos` como la cuarta excepción documentada
      de lectura sin scope (junto a `login`, el webhook y superadmin), explicando por qué solo
      devuelve identificadores.
- [x] `docs/api-contract.md`: los dos endpoints `GET`/`PUT /api/flows/reminder`, con la nota de que
      van antes de `/:id` en el router.

## Verificación final

- [x] `pnpm --filter backend typecheck` sin errores.
- [x] `pnpm --filter backend test` con los 649 tests preexistentes + los nuevos, todos en verde.
- [x] `pnpm --filter frontend build && pnpm --filter frontend lint` en verde.
- [x] `pnpm --filter frontend vitest run src/features/flows` (23 tests, todo lo tocado por este
      feature) en verde. _La suite completa del frontend (38 archivos) revienta por memoria en esta
      máquina de desarrollo, con y sin paralelismo — problema del entorno con archivos no
      relacionados con este cambio, no algo introducido aquí; no se insistió en correrla entera._
- [ ] Checklist de PR de `docs/multi-tenancy.md` §9 — revisar antes de mergear.
- [ ] **Prueba manual E2E** (queda para el usuario, requiere WhatsApp real): ajustar
      `ventana24hExpiraEn` de una conversación real para que caiga en la franja de antelación y
      comprobar que llega el recordatorio — una vez con la ventana abierta (texto libre) y otra con
      la ventana ya vencida (plantilla HSM).
- [ ] Comprobar en vivo que responder durante una espera cancela la reanudación programada (cubierto
      por test automatizado; pendiente de una verificación manual si se desea).
- [x] No se generaron capturas de verificación en esta sesión.

## Definición de "hecho"

Los flujos avanzan también con el tiempo, no solo con las respuestas, y una conversación que se
enfría recibe su recordatorio antes de perder la ventana de 24 h — en texto libre si aún se puede, y
con plantilla aprobada si ya no. Con esto el módulo M06 queda completo y la épica de Remarketing
hereda la cola, el scheduler y la selección automática de modo.
