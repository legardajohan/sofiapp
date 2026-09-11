# HU-IA-03 — Tasks (checklist ejecutable)

> Claude Code: ejecuta en orden. Marca cada casilla al terminar. No cierres el feature hasta que
> TODO esté en verde.
>
> Se trabaja **sobre `feat/HU-IA-01`**, sin rama nueva. No ejecutar `git checkout -b`.

## 1. Cambios de contrato previos

Van primero porque el resto no compila sin ellos.

- [x] `features/audit/audit.types.ts`:
  - [x] `AuditAccion` += `'conversation.handoff'` (unión cerrada de 5 valores hoy).
  - [x] `IAuditEvent.actorId`, `RecordAuditInput.actorId` e `IAuditEventResponse.actorId` → admiten
        `null`. Comentar que `null` significa "acción del sistema", no "actor desconocido".
- [x] `features/audit/audit.model.ts`: `actorId` pasa a `required: false, default: null`.
- [x] `features/audit/audit.service.ts`: `toAuditEventResponse` → `doc.actorId?.toString() ?? null`
      (hoy hace `.toString()` directo y reventaría con actor nulo).
- [x] `features/conversation/conversation.mapper.ts`: `toAssignmentResponse` resuelve `actorNombre`
      a `'Sofi'` cuando el actor es nulo — el historial de asignaciones de HU-OMNI-02 ya lo pinta.
- [x] `realtime/realtime.types.ts`: `conversation:assigned` → `actor: { id: string | null; nombre: string | null }`.
- [x] `features/cliente/cliente.model.ts` y `cliente.types.ts`: `handoffAt: Date | null` y
      `handoffMotivo: HandoffMotivo | null`, ambos `default: null`. **Sin índice nuevo**: el campo se
      lee, no se busca.
- [x] `features/conversation/conversation.types.ts`: `IConversationResponse.handoff`.
- [x] `features/conversation/conversation.mapper.ts`: `IConversationSource` + `toConversationResponse`
      proyectan `handoff: { at, motivo } | null`.

## 2. Plantilla global `classify` (AC8)

- [x] `seed/seed-prompt-templates.ts`: añadir la entrada `method: 'classify'` a `GLOBAL_TEMPLATES`
      con la escala `frio | tibio | caliente` y la objeción, según el prompt del `plan.md`.
- [x] Extraer `CHAT_FRASE_DERIVACION` y componer `CHAT_SYSTEM_PROMPT` con ella.
  - [x] Verificar que el texto resultante es **idéntico** carácter a carácter al actual.
  - [x] **No** subir `CHAT_TEMPLATE_VERSION`: sigue en `1.1.0`.
- [x] **No** crear script de migración: `$setOnInsert` con filtro `{ tenantId: null, method }` inserta
      un método nuevo sin problema. El caso de HU-IA-02 era *modificar* una plantilla ya sembrada.

## 3. Feature de configuración (`features/ai/ai-handoff.*`)

- [x] `ai-handoff.types.ts`: `MOTIVOS_HANDOFF` (`as const`, el orden **es** la prioridad),
      `HandoffMotivo`, `IHandoffSettings`, `IHandoffSettingsDocument`, `HandoffSettingsDTO`,
      `UpdateHandoffSettingsDTO`, `HandoffDecision`, y las frases de fábrica de `explicitRequest`.
- [x] `ai-handoff.model.ts`: schema con `tenantId` requerido + indexado e índice **único**
      `{ tenantId: 1 }`; colección `handoff_settings`; `activo: false` de fábrica.
- [x] `ai-handoff.validation.ts`:
  - [x] `updateHandoffSettingsSchema` sobre `{ body }`.
  - [x] `umbral`: `z.number().min(env.KB_MIN_SCORE).max(1).nullable()` — por debajo del umbral global
        la regla no puede disparar nunca, así que se rechaza en el borde.
  - [x] `mensajeTransicion` `.min(1).max(500)`; listas `z.array(z.string().min(2)).max(30)`;
        `nivelMinimo: z.enum(['tibio','caliente'])`; `asesorDestinoId` objectId nullable.
- [x] `ai-handoff.service.ts`:
  - [x] `getHandoffSettings(tenantId)` → `HandoffSettingsDTO`; devuelve los valores de fábrica con
        `heredado: true` si el tenant nunca guardó. **No lanza** (AC1).
  - [x] `updateHandoffSettings(tenantId, dto)` → valida `asesorDestinoId` con `assertAssignableAdmin`
        **antes** de escribir, y hace upsert con `findOneAndUpdateScoped`.
  - [x] `primerAdminActivo(tenantId)` → `string | null`, sobre `listTenantUsers`.
- [x] `ai-handoff.controller.ts`: dos `RequestHandler` delgados, `tenantId` desde
      `req.user!.tenantId!` — nunca del body.
- [x] `ai-handoff.routes.ts`: `GET /` y `PUT /` con la cadena
      `authenticateJWT, requireTenant, authorize(['admin']), validate(...), asyncHandler(...)`.
- [x] `app.ts`: montar `app.use('/api/ai/handoff-rules', aiHandoffRoutes)` **antes** de
      `app.use('/api/ai', aiAssistantRoutes)` (línea 77), por el mismo motivo del comentario de la
      línea 76. Si va después, el genérico se lo come.

## 4. Motor de evaluación (`ai-handoff.service.ts`)

- [x] `normalizar(texto)`: minúsculas + `normalize('NFD')` + quitar diacríticos (`\p{Diacritic}` con
      flag `u`), para que "asesoría" y "asesoria" comparen igual.
- [x] `contieneTermino(textoNormalizado, termino)`: coincidencia por **palabra completa**, no por
      subcadena — con `includes` la clave "asesor" dispararía dentro de "asesoría".
- [x] `evaluarAntesDeGenerar(settings, ultimoMensajeCliente)` → **función pura**, sin I/O:
      `explicit_request` → `keyword`, en ese orden.
- [x] `evaluarDespuesDeGenerar(settings, tenantId, historial, resultado)`:
  - [x] `low_confidence` primero (gratis, usa el `AiResult` ya en mano).
  - [x] Guardas obligatorias: `cacheHit` y `fromFaq` → **nunca** dispara.
  - [x] Sin fragmentos → dispara **solo** si la respuesta contiene `CHAT_FRASE_DERIVACION`.
  - [x] Con fragmentos → dispara solo si hay `umbral` y el mejor score está por debajo.
  - [x] `intent_purchase` después, y **solo** si está activo y nada anterior disparó: una llamada a
        `AIService.classify()` (no `classifyLead()`, que es del provider).
  - [x] Comparar `nivelInteres` por orden en `['frio','tibio','caliente']`, no por igualdad.
  - [x] Si `classify()` lanza → `logger.warn` y "no dispara". Nunca propagar: la respuesta ya está
        generada y tiene que salir.

## 5. Ejecución del handoff (`conversation.service.ts`)

- [x] `handoffConversation(tenantId, clienteId, motivo, asesorDestinoId)`:
  - [x] Cliente inexistente → salir en silencio (criterio de `marcarParaAsesor`).
  - [x] **Idempotencia:** `iaHabilitada === false` → `return` sin escribir, auditar ni publicar (AC15).
  - [x] Destino: el configurado, o `primerAdminActivo`. Si el configurado ya no es admin activo,
        `logger.warn` y caer al primero; si no hay ninguno, transferir **sin** asignar (AC12).
  - [x] **Una sola escritura** con `findOneAndUpdateScoped`: `$set` de `iaHabilitada:false`,
        `handoffAt`, `handoffMotivo` y `asesorId` **solo si estaba sin asignar** (AC11);
        `$inc: { noLeidos: 1 }`.
  - [x] `recordAuditEvent` con `actorId: null` y `accion: 'conversation.handoff'` (AC16).
  - [x] **Un solo** `publishRealtime`: `conversation:assigned` con `actor: { id: null, nombre: 'Sofi' }`
        si hay destino nuevo, `conversation:updated` si no. Reutilizar `resolveAsignado`/`resolveTags`/
        `resolveLeadMap`/`toConversationResponse`.
  - [x] **NUNCA** `Model.updateOne` ni `findByIdAndUpdate` directos.
- [x] `setIaHabilitada(..., true)`: `$unset` de `handoffAt` y `handoffMotivo` — reactivar a Sofi
      cierra el handoff (AC17).
- [x] **No** encadenar `assignConversation` + `setIaHabilitada` + `marcarParaAsesor`: publicaría tres
      eventos con un estado intermedio inconsistente y `assignConversation` exige un actor humano.

## 6. Integración en el worker

- [x] `workers/ai-reply.messages.ts`: añadir `MENSAJE_HANDOFF` (default de `mensajeTransicion`),
      comentado como copy de cara al cliente.
- [x] `workers/ai-reply.processor.ts`:
  - [x] Leer `getHandoffSettings(tenantId)` **una vez**, tras la guarda del historial (línea 53).
  - [x] Punto 1: `evaluarAntesDeGenerar` → si dispara, `ejecutarHandoff(..., null)` y `return`
        **sin llamar a `chat()`** (AC4).
  - [x] Capturar el `AiResult<string>` **completo**: hoy la línea 57 desecha todo salvo `.data`, y
        sin `retrievedChunks`/`cacheHit`/`fromFaq` no hay `low_confidence`.
  - [x] Punto 2: `evaluarDespuesDeGenerar` → si dispara, `ejecutarHandoff(..., texto)` y `return`.
  - [x] `ejecutarHandoff`: `intent_purchase` **anexa** la respuesta al aviso en **un solo** mensaje;
        el resto **sustituye**. Primero avisar, después transferir; si el envío falla con `AppError`,
        `logger.warn` y transferir igual.
  - [x] `logger.info('Handoff ejecutado', { tenantId, clienteId, motivo })`.
- [x] **No** tocar `inbound-message.processor.ts`: sus guardas de `iaHabilitada` ya bastan para AC14.

## Tests (Vitest)

- [x] `features/ai/ai-handoff.service.test.ts` (crear) — el motor, disparador por disparador:
  - [x] `explicit_request`: "quiero hablar con una persona" → dispara; mensaje normal → no.
  - [x] `keyword`: coincide con la lista del admin; case-insensitive; con y sin acentos.
  - [x] `keyword`: **"asesoría" NO dispara** la palabra clave "asesor" (palabra completa, no subcadena).
  - [x] `low_confidence`: sin fragmentos + frase de derivación → dispara.
  - [x] `low_confidence`: **`cacheHit: true` → NO dispara** aunque `retrievedChunks` esté vacío.
  - [x] `low_confidence`: **`fromFaq: true` → NO dispara** aunque `retrievedChunks` esté vacío.
  - [x] `low_confidence`: **"gracias" respondido con naturalidad → NO dispara** (sin fragmentos pero
        sin frase de derivación). Es el falso positivo que HU-IA-02 acaba de corregir en el prompt.
  - [x] `low_confidence`: con `umbral` por encima de `KB_MIN_SCORE` y mejor score por debajo → dispara.
  - [x] `intent_purchase`: `caliente` con mínimo `caliente` → dispara; `tibio` → no.
  - [x] `intent_purchase`: `tibio` con mínimo `tibio` → dispara (comparación por orden, no igualdad).
  - [x] `intent_purchase`: **`classify()` no se llama** si la regla está inactiva, ni si un disparador
        anterior ya saltó (comprobar con el mock que no se invocó).
  - [x] `classify()` lanza → no dispara y no propaga.
  - [x] **Prioridad:** dos condiciones ciertas a la vez → un solo motivo, el primero del orden (AC9).
  - [x] Regla inactiva no se evalúa; `activo: false` no evalúa nada (AC3).
- [x] `features/ai/ai-handoff.isolation.test.ts` (crear) — el invariante:
  - [x] La configuración de tenantA no se lee con token de tenantB.
  - [x] `PUT` de tenantB no alcanza el documento de tenantA (crea el suyo, no pisa el ajeno).
  - [x] `asesorDestinoId` de un admin de otro tenant → rechazado por `assertAssignableAdmin`.
  - [x] Evaluar una conversación de tenantA nunca lee la configuración de tenantB.
- [x] `features/ai/ai-handoff.routes.test.ts` (crear, supertest):
  - [x] `GET` sin configuración guardada → 200 con valores de fábrica y `heredado: true`.
  - [x] `PUT` guarda y el `GET` siguiente devuelve lo guardado con `heredado: false`.
  - [x] `PUT` con `umbral` por debajo de `KB_MIN_SCORE` → 400.
  - [x] Rol `asesor` (no admin) → 403; sin token → 401.
  - [x] La ruta resuelve a este router y **no** al de `/api/ai` (regresión del orden de montaje).
- [x] `features/conversation/conversation.handoff.test.ts` (crear):
  - [x] Apaga `iaHabilitada`, escribe `handoffAt`/`handoffMotivo` e incrementa `noLeidos`.
  - [x] Asigna al destino cuando estaba sin asignar.
  - [x] **No reasigna** cuando ya tenía responsable (AC11).
  - [x] Sin admins activos → transfiere sin asignar y publica `conversation:updated` (AC12).
  - [x] **Idempotente:** segunda llamada no escribe, no audita, no publica (AC15).
  - [x] Registra `conversation.handoff` con `actorId: null` (AC16).
  - [x] **Aislamiento:** no alcanza a un cliente de otro tenant.
  - [x] `setIaHabilitada(true)` limpia `handoffAt`/`handoffMotivo` (AC17).
- [x] `workers/ai-reply.processor.test.ts` (extender):
  - [x] **Añadir `handoffConversation` al factory del mock de `conversation.service.js`** — el módulo
        se mockea entero, y sin esto el import queda `undefined` y rompen los tests existentes.
  - [x] Disparador previo → **`chat()` no se llama**, se envía el mensaje de transición y se transfiere.
  - [x] `low_confidence` → se envía el mensaje de transición **en lugar de** la respuesta generada.
  - [x] `intent_purchase` → se envía **un solo** `replyFromIa` con respuesta + aviso concatenados.
  - [x] `activo: false` → ningún cambio respecto al comportamiento actual (regresión).
  - [x] El envío del aviso falla con `AppError` → se transfiere igual y el job **resuelve**.
- [x] `workers/inbound-message.processor.test.ts` (extender) — AC14:
  - [x] Cliente con handoff (`iaHabilitada: false`) + texto → **no encola** auto-reply.
  - [x] Cliente con handoff + audio → **no manda** acuse de no-texto.
- [x] `seed/` — plantilla `classify`:
  - [x] Tras `seedPromptTemplates()` existe una global `classify` activa y `classify()` deja de
        lanzar 500.
  - [x] El seed es idempotente y **no** pisa una plantilla `classify` propia de un tenant.
  - [x] `CHAT_SYSTEM_PROMPT` compuesto con `CHAT_FRASE_DERIVACION` es idéntico al texto anterior.

## Frontend

> Antes de crear o tocar cualquier componente, invocar las tres skills de diseño (regla §7 del
> `CLAUDE.md` raíz) y dejar constancia del resultado abajo.

- [x] Invocar `emil-design-eng`, `impeccable:impeccable` y `frontend-design:frontend-design`.
      **En este entorno solo la tercera está registrada**; las otras dos devuelven `Unknown skill`.
      Se invocan igualmente y sus criterios se aplican desde conocimiento propio.
- [x] `features/handoff/types.ts`: espejo del DTO + constantes de límite (interfaces a mano, **no**
      derivadas de zod: el frontend no lo tiene).
- [x] `features/handoff/api.ts`: `fetchHandoffSettings()` / `saveHandoffSettings(payload)`.
      **Rutas SIN el prefijo `/api`** — lo aporta el `baseURL` del `apiClient`.
- [x] `features/handoff/hooks/useHandoffSettings.ts`: `useQuery(['handoff-settings'])` +
      `useMutation` que **siembra** la caché con `setQueryData` (el `PUT` devuelve el objeto completo),
      con toast en `onSuccess` y `onError`.
- [x] `features/handoff/pages/HandoffSettingsPage.tsx`: los tres estados desacoplados de
      `AssistantConfigPage` — `isPending` → skeletons, `isError` → tarjeta con «Reintentar», datos →
      contenido. Contenedor `mx-auto max-w-4xl space-y-6`.
- [x] `features/handoff/components/HandoffSettingsForm.tsx`: `useState` por campo,
      `useEffect([settings])` para resincronizar tras guardar, `hayCambios`/`esValido`/`puedeGuardar`
      derivados, botonera «Descartar cambios» / «Guardar cambios» con spinner.
- [x] `features/handoff/components/TriggerCard.tsx`: una tarjeta por disparador con `Switch`, ayuda
      que explica **qué le pasa al cliente**, y parámetros deshabilitados con el interruptor apagado.
- [x] Orden de la pantalla: interruptor maestro → cuatro disparadores → destino y mensaje.
- [x] Copy sin vocabulario de implementación: «Cuando el cliente pide hablar con una persona», no
      `explicit_request`. Mismo verbo en botón y toast («Guardar cambios» → «Cambios guardados»).
- [x] La tarjeta de baja confianza advierte de que depende de la frase de derivación del prompt.
- [x] `features/handoff/index.ts`: barrel con la página y los tipos.
- [x] `router.tsx` (**no existe `App.tsx`**): ruta `/settings/assistant/handoff` con
      `lazy` + `RequireRole roles={['admin']}` + `Suspense fallback={<Loading />}`.
- [x] `components/layout/nav-config.ts`: «Asistente IA» pasa a tener `children` —«Comportamiento» y
      «Transferencia a un asesor»—, igual que hace «Conocimiento».
- [x] `features/inbox/types.ts`: `ConversationDTO.handoff`.
- [x] `features/inbox/pages/InboxPage.tsx`: franja sobre el compositor con el par **neutro**
      `bg-muted/40` + `text-secondary-foreground` (**no** `destructive-subtle`: un handoff es
      información, no un error, y no hay token `warning` en el proyecto).
- [x] `features/inbox/components/ConversationList.tsx`: indicador por fila, excluyente con el
      `Sparkles` de «Sofi activa» — el handoff apaga `iaHabilitada`, así que no compiten por el sitio.
- [x] `features/inbox/hooks/useInboxRealtime.ts`: tolerar `evt.actor.nombre` nulo (cae a «Sofi»).
- [x] **Actualizar el factory `makeConversation`** de `ConversationList.test.tsx` con el campo nuevo,
      o los tests existentes dejan de compilar.
- [x] `ConversationList.test.tsx`: fila con handoff muestra el indicador y **no** el de Sofi activa.
- [x] Todo componente nuevo o tocado, terminado en **claro y oscuro** con tokens semánticos. Cero
      utilidades de color arbitrarias (`bg-[#...]`).

## Verificación final

> Filtros reales de pnpm: `@sofiapp/api` y `@sofiapp/web`. Los nombres `backend`/`frontend` del
> `CLAUDE.md` raíz no matchean ningún paquete y pnpm no ejecuta nada.

- [x] `pnpm --filter @sofiapp/api typecheck` sin errores.
- [x] `pnpm --filter @sofiapp/api test` → **671 pasan, 76 archivos, cero fallos** (eran 603/71 antes
      de esta HU: +68 tests, cero regresiones).
- [x] `pnpm --filter @sofiapp/web build` y `pnpm --filter @sofiapp/web lint` sin errores.
      `pnpm --filter @sofiapp/web test` → **528 pasan, 29 archivos**.
- [x] Checklist de PR de `docs/multi-tenancy.md` §9 revisado: cero `Model.find/create/findById`
      directos, `tenantId` siempre del token, test de aislamiento presente.
> **Los cinco checks manuales quedan pendientes**: necesitan el canal de Meta conectado y tráfico
> real de WhatsApp, que este entorno no tiene. El camino completo sí está cubierto por tests
> automáticos (worker → evaluación → `handoffConversation` → evento de tiempo real).

- [ ] Manual: encender petición explícita → «quiero hablar con un asesor» → llega el aviso, la
      conversación queda asignada y sin leer, Sofi apagada, franja visible.
- [ ] Manual: escribir otro mensaje en ese hilo → **no** llega respuesta ni acuse.
- [ ] Manual: reactivar Sofi con el interruptor → la franja desaparece.
- [ ] Manual: con baja confianza encendida, «gracias» → **no** se transfiere; una pregunta fuera de
      la KB → sí se transfiere.
- [ ] Manual: revisar `audit_events` → un solo `conversation.handoff`, actor nulo, motivo correcto.
- [x] `git status` sin `*.png`/`*.jpg` de verificación colados.

## Definición de "hecho"

El admin decide desde *Asistente IA → Transferencia a un asesor* cuándo Sofi deja de contestar.
Cuando se cumple una de esas condiciones, el cliente recibe un aviso, la conversación aparece
asignada y sin leer en la bandeja del asesor —que lo ve en vivo—, marcada como transferida por Sofi,
y el bot queda callado en ese hilo hasta que una persona lo reactive. Un "gracias" no transfiere a
nadie, una respuesta cacheada tampoco, y la configuración de una empresa no se evalúa jamás contra
las conversaciones de otra.
