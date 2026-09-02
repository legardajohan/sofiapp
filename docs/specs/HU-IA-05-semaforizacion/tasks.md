# HU-IA-05 — Tasks (checklist ejecutable)

> Claude Code: ejecuta en orden. Marca cada casilla al terminar. No cierres el feature hasta que
> TODO esté en verde.
>
> Se trabaja **sobre `feat/HU-IA-01`**, sin rama nueva. No ejecutar `git checkout -b`.
>
> El orden va de dentro hacia fuera: primero el contrato del modelo (§1-3), después el dominio
> (§4-7), después el slice y su exposición HTTP (§8-10), el worker (§11) y por último el frontend
> (§12-13). Así cada paso compila con el anterior y `tsc --noEmit` no acumula errores en cascada.
>
> El slice `ai-semaforo` **no tiene `model.ts`**: escribe sobre `Cliente` y lee de `audit_events`.
> Sus controllers, rutas y validación viven en `conversation.*` por coherencia de URL. Misma
> desviación consciente del patrón de 6 archivos que documentó HU-IA-04, y por el mismo motivo.

## 1. El puerto del LLM (`integrations/llm/`)

- [x] `llm-provider.types.ts`: `ClassifyLeadOutput` con `nivelInteres`, `objecion`, **`confianza`**
      (`number`) y **`motivo`** (`string`).
- [x] `ILlmProvider.classifyLead` recibe además `instrucciones: string`.
  - [x] **Obligatorio, no opcional.** Opcional dejaría vivo el mismo agujero que esta HU cierra: un
        llamador que lo olvide vuelve a un clasificador sin prompt, y el fallo es silencioso.
- [x] `gemini.provider.ts`: `CLASSIFY_SCHEMA` gana `confianza` (`NUMBER`) y `motivo` (`STRING`);
      `required: ['nivelInteres', 'confianza', 'motivo']`.
- [x] `classifyLead` pasa `systemInstruction: input.instrucciones` al `getGenerativeModel`.
      Mismo patrón que `generateReply` (línea ~114). **Este es el hueco 2 del spec.**

## 2. El servicio de IA (`services/ai/`)

- [x] `ai-service.types.ts`: `ClassifyResult` pasa a incluir `confianza` y `motivo` (reexportar
      `ClassifyLeadOutput` en vez de duplicar el tipo).
- [x] `ai.service.ts` → `classify()`: pasar `instrucciones: template.systemPrompt`.
      Hasta hoy `template` solo servía para versionar la cache key — el prompt sembrado era texto muerto.
- [x] Sanear la salida **antes** de cachear: `confianza` recortada a `[0,1]` con
      `Math.min(1, Math.max(0, Number(x) || 0))`; `motivo` con `.trim().slice(0, 240)` — el recorte que exige el AC16.
  - [x] `Number(x) || 0` cubre `undefined`, `null` y `NaN`; el `0` resultante nunca alcanza el
        umbral, así que ante una salida rara **no se toca el semáforo**.
- [x] **No tocar `buildCacheKey`**: ya incluye `template.version`, así que el bump a `2.0.0`
      invalida solo las entradas viejas y ninguna puede volver sin `confianza`.

## 3. La plantilla `classify` v2.0.0 (`seed/` + `scripts/`)

- [x] `seed-prompt-templates.ts`: `export const CLASSIFY_TEMPLATE_VERSION = '2.0.0'` (gemelo de
      `CHAT_TEMPLATE_VERSION`) y usarlo en la plantilla.
- [x] Ampliar el `systemPrompt` conservando lo que ya dice de los tres niveles y la objeción:
  - [x] **Confianza:** alta si el cliente lo dice explícitamente; media si se infiere; baja con uno
        o dos mensajes, mensajes ambiguos o un hilo casi todo de la empresa. **Ante la duda, bajarla.**
  - [x] **Motivo:** una frase, español, tercera persona, < 200 caracteres, que diga **qué dijo el
        cliente** para merecer ese nivel.
  - [x] **Prohibido citar nombre, teléfono, correo, documento o cualquier dato de contacto.**
        Este texto va a `audit_events`, que no tiene gate por subrol (`docs/data-model.md`) (AC16).
- [x] `scripts/migrate-classify-template.ts` (crear), molde de `migrate-chat-template.ts`:
  - [x] `--dry-run` por defecto; actualiza `systemPrompt` + `version` de `{ tenantId: null, method: 'classify' }`.
  - [x] Informa de cuántas plantillas **de tenant** quedaron en la versión vieja y **no las pisa**:
        son personalizaciones del cliente.
  - [x] Sin esto, el seed (`$setOnInsert`) no actualiza nada en bases ya sembradas (hueco 9).
- [x] Script en `apps/backend/package.json`, junto al de la plantilla de chat.

## 4. Variables de entorno (`config/env.ts`)

- [x] Bloque comentado `// Semaforización automática por intención de compra (HU-IA-05)`.
- [x] `SEMAFORO_AUTO: z.enum(['on', 'off']).default('on')`.
  - [x] **Enum y no booleano**: `z.coerce.boolean()` convierte `"false"` en `true`, justo el fallo
        que un kill-switch no se puede permitir. Comentarlo en el archivo.
- [x] `SEMAFORO_MIN_CONFIANZA: z.coerce.number().min(0).max(1).default(0.7)`, con nota de que la
      escala es del modelo y **no** tiene relación con `KB_MIN_SCORE`/`FAQ_MATCH_THRESHOLD` (esas son
      similitudes de coseno), y de que se calibra mirando la bitácora, nunca a ojo.
- [x] `SEMAFORO_MIN_TURNOS_CLIENTE: z.coerce.number().int().positive().default(2)`, con el porqué:
      con 1, un «hola» suelto pinta de azul cada conversación nueva.

## 5. Resolver etiquetas por slug (`features/tag/tag.service.ts`)

- [x] `findSemaforoTags(tenantId): Promise<Map<SemaforoSlug, ITagResponse>>` con
      `findScoped(Tag, tenantId, { semaforo: { $exists: true } })`.
- [x] **Devuelve un mapa, no las cuatro.** El admin puede borrarlas (`docs/domain.md` §5): quien
      consuma pregunta por la que necesita y acepta `undefined`. Comentarlo.
- [x] **Sin índice nuevo**: `{ tenantId, semaforo }` (único parcial) ya lo cubre.

## 6. `Cliente` gana `semaforoIA` (`features/cliente/`)

- [x] `cliente.types.ts`: `ISemaforoIA` con `slug`, `confianza`, `motivo`, `nivelInteres`,
      `objecion`, `at` y `aplicado: SemaforoSlug | null`; y `semaforoIA?: ISemaforoIA` en `ICliente`.
  - [x] Comentar que `aplicado` es **también** el detector de override humano: si el semáforo vigente
        no es este, lo cambió una persona.
- [x] `cliente.model.ts`: subdocumento `semaforoIA` (`_id: false`), sin `enum` en `slug` por
      coherencia con el resto del modelo, sin índice (se proyecta, no se busca).

## 7. Auditoría (`features/audit/`)

- [x] `audit.types.ts`: `AuditAccion` gana `'cliente.semaforo'`.
- [x] `audit.service.ts`: `listAuditEventsQuery` y `listAuditEvents` ganan `accion?: AuditAccion`.
  - [x] **Aditivo**: sin el argumento, el comportamiento es el de hoy y `listAssignments` no cambia.

## 8. El slice `ai-semaforo` (`features/ai/`)

- [x] `ai-semaforo.types.ts` (crear):
  - [x] `semaforoDeClasificacion(nivelInteres, objecion): SemaforoSlug` — función **pura**:
        `caliente → verde`, `tibio → naranja`, `frio` con objeción `→ rojo`, sin objeción `→ azul`.
  - [x] Comentar el porqué contra `docs/domain.md` §5: azul es «consulta general sin intención
        comercial aún»; rojo es ese mismo frío ya bloqueado. En caliente y tibio la objeción no
        cambia el color — pintar de naranja a quien pide comprar escondería la oportunidad.
  - [x] `ISemaforoIAResponse` y `IClasificacionResponse` (DTO de la bitácora).
- [x] `ai-semaforo.service.ts` (crear) — `clasificarYAplicarSemaforo(tenantId, clienteId, historial)`:
  - [x] **Nunca lanza.** `try/catch` + `logger.warn`, mismo criterio que `disparaIntencionDeCompra`:
        la respuesta al cliente ya salió y un fallo del clasificador no puede marcar el job fallido.
  - [x] Salir antes de llamar al modelo si `env.SEMAFORO_AUTO !== 'on'` (el interruptor ahorra también
        el coste) o si hay menos de `SEMAFORO_MIN_TURNOS_CLIENTE` turnos `role: 'user'`.
  - [x] `findByIdScoped(Cliente, …)` + `findSemaforoTags(…)`; resolver el semáforo vigente cruzando
        `cliente.tagIds` con el mapa. **NUNCA** `Model.find/findById` directos.
  - [x] Escribe **solo** si se cumplen las seis: interruptor · la tag del slug existe · confianza ≥
        umbral · turnos suficientes · el destino no es el vigente · no hay override humano.
  - [x] En cualquier otro caso, `$set: { semaforoIA }` con `aplicado: null` y **no toca `tagIds`**.
  - [x] Escritura del semáforo: `$pull: { tagIds: { $in: idsSemaforo } }` y después
        `$addToSet: { tagIds: idDestino }`, ambos scoped.
        **NUNCA `setConversationTags`**: reemplaza el conjunto entero y borraría las etiquetas libres.
  - [x] Dos updates y no uno: Mongo no admite `$pull` y `$addToSet` sobre el mismo campo a la vez, y
        recalcular el array en JS perdería una edición manual concurrente.
  - [x] `recordAuditEvent` **solo si el slug sugerido difiere del vigente**. Un evento por mensaje
        inundaría `audit_events` y volvería inútil la bitácora del CA-15.
  - [x] Si se aplicó, `publishRealtime({ type: 'conversation:updated', … })` — el mismo evento que ya
        emite `setConversationTags`, así el frontend no necesita nada nuevo.
- [x] `aplicarSemaforoSugerido(tenantId, clienteId, actorId)`: aplica la propuesta pendiente, audita
      con el `actorId` real, publica realtime, y `AppError('…', 409)` si no hay propuesta.
- [x] `listClasificaciones(tenantId, clienteId, query)`: molde exacto de `listAssignments`
      (`conversation.service.ts:520`), con `listAuditEvents(…, 'cliente.semaforo', …)`.
      Guarda de 404 con `findByIdScoped` **antes** de leer la bitácora: es lo que da el aislamiento.

## 9. Exposición HTTP (`features/conversation/`)

- [x] `conversation.types.ts`: `semaforoIA: ISemaforoIAResponse | null` en
      `IConversationOverviewResponse`.
  - [x] Comentar por qué **no** se cierra por subrol a diferencia del resumen (ADR-0006, enmienda de
        HU-IA-04): no es prosa libre sobre el transcript, es una frase acotada que la plantilla
        obliga a escribir sin datos de contacto. Si esa restricción se relajara, tendría que entrar
        en el gate.
- [x] `conversation.validation.ts`: `aplicarSemaforoSchema` (todo `empty` salvo `params.id`) y
      `classificationsSchema` (molde de `assignmentsSchema`), con `ClassificationsQuery` derivado.
- [x] `conversation.service.ts`: `getConversationOverview` proyecta `semaforoIA`. Sin consulta extra:
      el `Cliente` ya se lee ahí.
- [x] `conversation.controller.ts`: `aplicarSemaforoController` y `listClassificationsController`.
      `tenantId` y `actorId` del token; sin `try/catch`, sin lógica, sin Mongoose.
- [x] `conversation.routes.ts`:
  - [x] `POST /:id/semaforo` con `authenticateJWT, requireTenant, bandejaRoles, validate(aplicarSemaforoSchema)`.
  - [x] `GET /:id/classifications` con la misma cadena y `validate(classificationsSchema)`.
  - [x] **El `POST` no lleva cuerpo**: el destino es el que la IA ya guardó. Aceptar un slug del
        cliente duplicaría `PATCH /:id/tags` con otra semántica.
  - [x] **Montaje: ninguno.** `conversationRoutes` ya está en `app.ts` bajo `/api/conversations`.

## 10. Adaptar el llamador existente

- [x] `ai-handoff.service.ts`: `disparaIntencionDeCompra` sigue leyendo solo `data.nivelInteres`.
      Cambio de compilación, **no de conducta**: sus tests deben seguir pasando salvo por los dobles
      de `classify`, que ahora devuelven dos campos más.

## 11. El worker (`workers/ai-reply.processor.ts`)

- [x] Extraer el cuerpo actual a `ejecutarAutoReply(data): Promise<ChatTurn[] | null>`, que devuelve
      el `historial` usado o `null` si no hubo nada que responder.
- [x] `processAiReplyJob` queda en tres líneas: llamar, y si hay historial,
      `clasificarYAplicarSemaforo`.
  - [x] Un único punto de enganche en vez de una llamada antes de cada uno de los seis `return`.
- [x] Va **después** de la decisión de handoff a propósito: con `intentPurchase` activa,
      `evaluarDespuesDeGenerar` ya llamó a `classify()` con ese mismo historial → misma cache key →
      acierto de caché, coste cero.
- [x] `ejecutarAutoReply` devuelve el historial **también cuando disparó un handoff**: un handoff por
      `intent_purchase` es justo el caso en que la conversación merece ponerse verde.

## 12. Frontend — datos

- [x] `features/inbox/types.ts`: `SemaforoIADTO` y `semaforoIA: SemaforoIADTO | null` en
      `ConversationOverviewDTO`.
- [x] `features/inbox/api.ts`: `aplicarSemaforo(conversationId)`.
      **Ruta SIN el prefijo `/api`** — lo aporta el `baseURL` del `apiClient`.
- [x] `features/inbox/hooks/useAplicarSemaforo.ts` (crear): `useMutation` que invalida
      `['conversations']` y `['conversation-overview', id]`, con `toast.error` en `onError`.
- [x] **`useInboxRealtime` no se toca**: ya invalida el overview en `conversation:updated`, que es lo
      que publican tanto el worker como el endpoint.

## 13. Frontend — la franja

> Antes de escribir el componente, invocar las tres skills de diseño (regla §7) y anotar el resultado.

- [x] Invocar `emil-design-eng`, `impeccable:impeccable` y `frontend-design:frontend-design`.
      **En este entorno solo la tercera está registrada**; las otras dos devuelven `Unknown skill`.
      Se invocan igualmente y sus criterios se aplican desde conocimiento propio.
- [x] `components/IntentStrip.tsx` (crear), con el molde `BANDA` exacto de
      `ConversationSummaryStrip`: `flex items-start gap-2 border-b border-border bg-muted/40 px-4 py-2`.
  - [x] **De una sola línea** (`cn(BANDA, 'items-center')`) y **no renderiza nada si `semaforoIA` es
        `null`**. Tres bandas apiladas serían demasiado: esta es ambiente, no la dispara el usuario,
        así que no tiene estado vacío, ni skeleton, ni invitación a actuar.
  - [x] **Aplicado** (`aplicado === slug`): `TagChip` + motivo truncado (completo en `title`) + hora
        en `text-[11px] text-muted-foreground`. Es un hecho, no una acción.
  - [x] **Propuesta** (`aplicado !== slug`): lo mismo, más
        `Button variant="outline" size="sm" className="h-6 shrink-0 text-xs"` **«Aplicar»**, gemelo
        del «Generar resumen» de la banda de arriba.
  - [x] **La confianza NO se pinta como porcentaje.** «72 %» es falsa precisión y no le dice al
        asesor qué hacer; el número va en el `title` y en la bitácora.
  - [x] El color viene de la BD y por tanto pasa **solo** por `TagChip` → `tagColors()`. Cero
        `bg-[#...]`; todo lo demás, tokens semánticos.
  - [x] Icono de acento en `text-primary`, distinto del `Sparkles` del resumen para que las dos
        bandas no se confundan de un vistazo.
  - [x] Sin animación de entrada del chip (criterio de `TagChip`: se ve decenas de veces al día);
        `motion-reduce` en la transición del botón.
  - [x] `aria-label` del botón nombra la etiqueta destino («Aplicar la etiqueta Avanza»), no un
        genérico.
- [x] `pages/InboxPage.tsx`: montar la franja **bajo** `ConversationSummaryStrip` y sobre el hilo.
- [x] Terminar en **claro y oscuro** con tokens semánticos.

## 14. Documentación

- [x] `docs/domain.md` §5: cómo consume IA-05 el semáforo y la tabla del mapeo
      `nivelInteres` × `objecion`.
- [x] `docs/data-model.md`: `clientes.semaforoIA` y `cliente.semaforo` en la lista de acciones
      auditadas de `audit_events`.
- [x] `docs/api-contract.md` §6: `POST /api/conversations/:id/semaforo` y
      `GET /api/conversations/:id/classifications`.
- [x] **Anotar** (sin ampliar el alcance a una puesta al día completa) que los docs siguen por detrás
      del código en `Cliente.resumenIA`, `handoffAt`/`handoffMotivo`, la acción `conversation.handoff`
      y los endpoints de HU-IA-03/04.

## Tests (Vitest)

- [x] `features/ai/ai-semaforo.service.test.ts` (crear):
  - [x] **Las seis combinaciones del mapeo** (AC4), sobre la función pura.
  - [x] `caliente` + confianza sobre el umbral → la etiqueta `verde` queda en `tagIds` (AC5).
  - [x] Una conversación con etiquetas libres las **conserva** todas tras clasificar (AC6).
  - [x] Etiqueta del slug destino borrada → no escribe, **no lanza** y queda propuesta (AC7).
  - [x] `confianza` bajo el umbral → propone y no escribe (AC8).
  - [x] Menos de `SEMAFORO_MIN_TURNOS_CLIENTE` turnos del cliente → **ni siquiera llama al modelo** (AC9).
  - [x] Slug destino == vigente → ni escribe ni audita (AC9 + no inundar la bitácora).
  - [x] Semáforo puesto a mano (≠ `semaforoIA.aplicado`) → pasa a proponer y no escribe (AC10).
  - [x] `SEMAFORO_AUTO=off` → no llama al clasificador ni escribe (AC11).
  - [x] Payload de auditoría: `actorId: null`, `antes.semaforo`, `despues` con `aplicado`,
        `confianza`, `motivo`, `nivelInteres` y `objecion` (AC14).
  - [x] `aplicarSemaforoSugerido` sin propuesta pendiente → `409` (AC17); con propuesta → aplica y
        audita con el `actorId` real.
  - [x] `listClasificaciones` devuelve **solo** eventos `cliente.semaforo`, no las asignaciones (AC15).
- [x] `features/ai/ai-semaforo.isolation.test.ts` (crear):
  - [x] **AISLAMIENTO:** `POST /semaforo` y `GET /classifications` de tenantA → **404** con token de
        tenantB (AC20).
  - [x] Clasificar en tenantA no toca clientes, etiquetas ni eventos de tenantB.
  - [x] `findSemaforoTags` de A no devuelve etiquetas de B.
  - [x] Mockear `services/ai/ai-service.singleton.js` **antes** de los imports del SUT (abre Redis al
        instanciarse), como ya hace `ai-handoff.isolation.test.ts`.
- [x] `services/ai/ai.service.test.ts` (extender):
  - [x] `classify()` pasa el `systemPrompt` de la plantilla como `instrucciones` al proveedor (AC2).
  - [x] Propaga `confianza` y `motivo` (AC1).
  - [x] `confianza: 1.4` se recorta a `1`; `confianza` ausente → `0`; `motivo` largo → 240 caracteres.
- [x] `workers/ai-reply.processor.test.ts` (extender):
  - [x] Se llama a la clasificación **una vez, al final** del ciclo (AC12).
  - [x] Un fallo del clasificador **no rompe** el auto-reply: la respuesta sale igual (AC13).
  - [x] Se llama también cuando se disparó un handoff por `intent_purchase`.
  - [x] Con `SEMAFORO_AUTO=off` no se llama.
- [x] `seed/seed-prompt-templates.test.ts` (extender): la plantilla `classify` sembrada está en
      `2.0.0` (AC3).
- [x] `features/conversation/` — rutas (supertest, extender el archivo que corresponda):
  - [x] `POST /:id/semaforo` y `GET /:id/classifications`: sin token → 401; rol no `admin` → 403.
  - [x] `GET /:id/overview` incluye `semaforoIA` (AC18).
- [x] `features/inbox/components/IntentStrip.test.tsx` (crear):
  - [x] Aplicado → muestra chip y motivo, **sin** botón (AC19).
  - [x] Propuesta → muestra además «Aplicar».
  - [x] `semaforoIA: null` → **no renderiza nada**.

## Verificación final

> Filtros reales de pnpm: `@sofiapp/api` y `@sofiapp/web`. Los nombres `backend`/`frontend` del
> `CLAUDE.md` raíz no matchean ningún paquete y pnpm no ejecuta nada.

- [x] `pnpm --filter @sofiapp/api typecheck` sin errores (AC21).
- [x] `pnpm --filter @sofiapp/api test` -> **757 pasan, 81 archivos, cero fallos** (eran 699/78).
      De paso se arreglaron 8 fallos **preexistentes**: `conversation.tags.test.ts` y
      `tests/isolation/tag.isolation.test.ts` eran los dos unicos archivos de conversacion que no
      mockeaban `realtime.publisher`, asi que `publishRealtime` se quedaba esperando a un Redis que
      no hay y agotaban su timeout. Se les puso el mismo mock que ya usan los otros 17.
- [x] `pnpm --filter @sofiapp/web build`, `lint` y `test` sin errores (AC22).
- [x] Checklist de PR de `docs/multi-tenancy.md` §9 completo: cero `Model.find/create/findById`
      directos, `tenantId` siempre del token (o del job, resuelto por `MetaIntegration`), test de
      aislamiento presente.
- [x] Repaso cruzado: cada criterio del `spec.md` tiene su test o su check manual aquí.
- [x] `git status` sin `*.png`/`*.jpg` de verificación colados.
- [x] `spec.md` pasa a `**Estado:** implementado`.

### Manual (tenant real, Sofi encendida en la conversación)

- [ ] Escribir «quiero matricularme, ¿cómo pago?» → tras la ventana de agrupación la conversación
      aparece con **Avanza** en la lista, sin abrirla, y la franja muestra el motivo.
- [ ] `GET /api/conversations/:id/classifications` devuelve el evento con `antes`, `despues`,
      `confianza`, `motivo` y `actorId: null`.
- [ ] Subir `SEMAFORO_MIN_CONFIANZA` a `0.99` y repetir → la franja muestra la propuesta con
      «Aplicar»; al pulsarlo se aplica y queda un segundo evento con el `actorId` del admin.
- [ ] Borrar la etiqueta de semáforo destino desde `/etiquetas` y repetir → nada se rompe, el
      auto-reply sale igual y queda la propuesta.
- [ ] `SEMAFORO_AUTO=off` → no se escribe nada y `ai_usage_logs` no registra un `classify` extra.
- [ ] Cambiar el semáforo a mano y escribir otro mensaje → la IA no lo pisa; pasa a proponer.
- [ ] Correr `migrate-classify-template.ts --dry-run` y revisarlo **antes** de la ejecución real: es
      una escritura sobre datos reales y la decide quien despliega.

> **Pendientes, y por qué.** En este entorno no hay Redis levantado (Docker Desktop tampoco está
> corriendo), así que `app.ts` y `worker.ts` no arrancan y no se puede recorrer el camino real por
> WhatsApp. Lo que sí quedó cubierto por tests automáticos: las dos rutas nuevas contra `app.ts` con
> supertest (401/403/409/404), el enganche en el worker, las seis combinaciones del mapeo, el umbral,
> las guardas de "no degradar", la intervención humana, el interruptor y la auditoría.

## Definición de "hecho"

Un cliente escribe «quiero matricularme, ¿cómo pago?» y, sin que nadie abra el hilo, la conversación
aparece en la bandeja marcada como *Avanza*, con una frase que explica por qué. El movimiento queda
en la bitácora —de *Informativo* a *Avanza*, por el sistema, con su confianza y su motivo— y se puede
consultar por API. Con confianza baja la franja propone en vez de aplicar; con la etiqueta borrada no
se rompe nada; con el semáforo puesto a mano por un asesor, la IA no lo toca. Ninguna clasificación
cruza la frontera entre dos tenants, y los tests de aislamiento lo demuestran.
