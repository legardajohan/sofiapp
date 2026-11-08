# HU-IA-08 — Tasks (checklist ejecutable)

> Claude Code: ejecuta en orden. Marca cada casilla al terminar. No cierres el feature hasta que
> TODO esté en verde. Rama: `feat/HU-IA-08-chat-de-prueba`.

## Implementación — backend

### 1. Marca de prueba en el dominio
- [x] `cliente.types.ts` / `cliente.model.ts`: `esPrueba`, `pruebaOwnerId`, `pruebaFlowId`, `pruebaUltimaActividad` + índice único parcial `{ tenantId, pruebaOwnerId }`.
- [x] `lead.types.ts` / `lead.model.ts`: `esPrueba`.
- [x] `ai-usage-log.model.ts`: `esPrueba`. `AIService.chat`/`extract`/`classify` aceptan `esPrueba?` y lo pasan a `logUsage`.
- [x] Crear `cliente.filters.ts` (`filtroClientesReales`, `matchClientesReales`, `PREFIJO_CLIENTE_DEMO` movido y reexportado desde `reports.types.ts`) y `lead.filters.ts` (`filtroLeadsReales`).

### 2. Exclusión de datos de prueba (criterio 8)
- [x] `conversation.service.ts` `listConversations`: `filtroClientesReales()` en lugar del `/^demo-/` suelto.
- [x] `reports.service.ts`: cada `PREFIJO_CLIENTE_DEMO` → `matchClientesReales('c')`; `contarVentas` filtra leads de prueba. Revisar las agregaciones sobre `audit_events`/`messages` sin `$lookup`.
- [x] `ai-topic.service.ts`: usar el filtro central.
- [x] `pipeline.service.ts`, `lead.service.ts` (listados), `estado.service.ts` y `semaforo.service.ts` (conteos): `filtroLeadsReales()`.
- [x] `campaign.segment.service.ts` y `campaign.service.ts` (cursor de envío): `filtroClientesReales()` + leads reales en los segmentos por estado/semáforo.
- [x] `usage.service.ts` `getMetricUsed('leads')`: excluir `esPrueba`.
- [x] `flow.reminder.service.ts` `buscarCandidatos`: excluir `esPrueba`.
- [x] `lead.service.ts` `createLeadFromConversation`: copia `esPrueba` del cliente y salta la cuota `leads` si es de prueba.

### 3. Canal de salida sandbox (criterio 4)
- [x] Crear `integrations/messaging/sandbox-messaging.provider.ts` (implementa `IMessagingProvider`, sin red) y `resolver-proveedor.ts`.
- [x] `sendOutbound`: leer el cliente primero; con `esPrueba`, saltar cuota, ventana, integración e `incrementUsage`; plantilla → solo texto renderizado; media → 422.

### 4. Flujo seleccionable y entrada agnóstica (criterios 2, 5, 7)
- [x] `flow.service.ts`: `resolverFlujoPara(tenantId, cliente)`.
- [x] `flow.runtime.service.ts`: `ejecutarFlujo` y `reanudarFlujo` usan `resolverFlujoPara`.
- [x] `inbound-message.processor.ts`: exportar `responderAutomaticamente(tenantId, clienteId, IEntradaAutomatica)` y adaptar la llamada del webhook (sin cambio de comportamiento).
- [x] Verificar que `processAiReplyJob` y el processor de `flow-runtime` salen sin error si el `Cliente` ya no existe (criterio 6).

### 5. Tiempo real, efectos y notificaciones (criterios 9, 10, 15)
- [x] `realtime.types.ts`: `SandboxEfecto`, `sandbox:message`, `sandbox:effect`. `realtime.publisher.ts`: enrutar `sandbox:*` solo a `asesor:<ownerId>`.
- [x] Crear `features/sandbox/sandbox.effects.ts` con `emitirEfectoPrueba(cliente, efecto)` (no-op si `!esPrueba`).
- [x] `conversation.service.ts`: `notifyInboundMessage`, `notificarSaliente`, `assignConversation` y `handoffConversation` publican `sandbox:*` cuando `esPrueba`; `destinatarioNotificacion` redirige al owner con "(prueba)".
- [x] `flow.runtime.service.ts` `ejecutarEfecto`:
  - [x] `enviar_mensaje` llama a `notificarSaliente` (corrige el hueco para clientes reales).
  - [x] Cada efecto emite `emitirEfectoPrueba`.
  - [x] `programar_espera` emite `{ tipo: 'espera' }`.
- [x] `ai-semaforo.service.ts`, `ai-extract.service.ts` y `ai-reply.processor.ts` (handoff): emitir efecto de prueba y pasar `esPrueba` al `AIService`.

### 6. Feature `sandbox/` (patrón de 6 archivos, sin model)
- [x] `sandbox.types.ts`: `ISandboxSessionResponse`, `SANDBOX_TTL_DIAS = 7`.
- [x] `sandbox.validation.ts`: `enviarMensajeSchema` (`texto` 1..4096, trim) y `seleccionarFlujoSchema` (`flowId` objectId | null).
- [x] `sandbox.service.ts`: `obtenerSesion` (upsert idempotente del cliente de prueba), `enviarMensajePrueba`, `seleccionarFlujo` (flujo scoped → 404; resetea `FlowState`), `reiniciarSesion`, `avanzarEspera` (409 sin espera) y `barrerSesionesInactivas`. Cada envío actualiza `pruebaUltimaActividad`.
- [x] `sandbox.controller.ts`: delgado, `tenantId`/`userId` del token.
- [x] `sandbox.routes.ts`: cadena fija con `authorize(['admin'])`.
- [x] Montar en `app.ts`: `app.use('/api/sandbox', sandboxRoutes)`.
- [x] `config/queues.ts` + `worker.ts`: scheduler `SANDBOX_SWEEP` diario en `flowRuntimeQueue` → `barrerSesionesInactivas`.

## Implementación — frontend

> Antes de tocar componentes: invocar `emil-design-eng`, `impeccable:impeccable` y `frontend-design:frontend-design` (regla 7).

- [x] `MessageBubble` / `ConversationThread`: prop `perspectiva` (`'asesor'` por defecto). `MessageComposer`: `onSendMedia`/`onSendAudio` opcionales (ocultar los controles si faltan). Exportarlos desde `features/inbox/index.ts`.
- [x] Crear `features/assistant-sandbox/`:
  - [x] `api.ts`, `types.ts`, `index.ts`;
  - [x] hooks `useSandboxSession` (query + mutaciones) y `useSandboxRealtime` (`sandbox:*` → `setQueryData`);
  - [x] componentes `SandboxChat`, `SandboxEffectCard`, `SandboxFlowSelect` y `SandboxSheet`;
  - [x] página `AssistantTestPage`.
- [x] `SandboxChat`:
  - [x] aviso "Modo prueba: nada se envía por WhatsApp";
  - [x] "Sofi está escribiendo…" con timeout de 30 s;
  - [x] estado vacío con sugerencias de primer mensaje;
  - [x] aviso de handoff (`iaHabilitada: false`);
  - [x] "Avanzar ahora" si `esperaPendiente`;
  - [x] "Reiniciar" con `AlertDialog`.
- [x] `router.tsx`: `/settings/assistant/test` en `RequireRole roles={['admin']}` + `Suspense`. `nav-config.ts`: hijo "Probar asistente".
- [x] Atajos `SandboxSheet` en `FlowEditorPage` (preselecciona el flujo), `KnowledgeBasePage` y `AssistantConfigPage`.
- [x] Revisión light/dark con tokens semánticos.

## Documentación
- [x] `docs/data-model.md`: campos nuevos de `clientes`, `leads` y `ai_usage_logs`, y el índice parcial.
- [x] `docs/domain.md`: concepto "conversación de prueba" y su exclusión.
- [x] `docs/api-contract.md`: endpoints `/api/sandbox/*`.
- [x] `docs/multi-tenancy.md`: regla "datos de prueba se excluyen con `filtroClientesReales`/`filtroLeadsReales`" y el barrido global como excepción documentada.

## Tests (Vitest + Mongo Memory Server)

- [x] `sandbox.isolation.test.ts` (criterio 16):
  - [x] el admin del tenant B no ve, no escribe, no reinicia ni avanza la sesión del tenant A;
  - [x] el admin X no ve la de Y;
  - [x] `flowId` ajeno → 404.
- [x] `sandbox.service.test.ts`:
  - [x] la sesión es idempotente (1);
  - [x] el envío sigue la decisión flujo/Sofi (2);
  - [x] `PUT` del flujo resetea `FlowState` y los clientes reales siguen con el activo (5);
  - [x] el reset no deja huérfanos (6);
  - [x] `advance-wait` reanuda y el job viejo se descarta (7);
  - [x] 409 sin espera pendiente;
  - [x] el barrido borra solo las sesiones de más de 7 días (12).
- [x] `message.service` (4):
  - [x] con un cliente de prueba no llama a `metaWhatsAppClient` ni a la cuota ni a `incrementUsage`, y no lanza fuera de ventana;
  - [x] una plantilla guarda el texto renderizado;
  - [x] media → 422.
- [x] Exclusión (8): un cliente y un lead de prueba no aparecen en:
  - [x] `listConversations`, los reportes y `contarVentas`;
  - [x] pipeline, los conteos por estado y por semáforo;
  - [x] segmentos de campaña;
  - [x] `getMetricUsed('leads')` y `buscarCandidatos`.
- [x] Realtime (9):
  - [x] los eventos de un hilo de prueba van solo a `asesor:<owner>`, con el tipo `sandbox:*`;
  - [x] un cliente real sigue emitiendo `message:new` al tenant.
- [x] Notificaciones (10): una asignación o un handoff de prueba notifica al owner con "(prueba)", no al asesor.
- [x] `AiUsageLog` con `esPrueba` (11).
- [x] Hueco corregido (15): `enviar_mensaje` de un flujo real emite `message:new`.
- [x] `sandbox.fidelity.test.ts` (3): misma configuración y mismo texto → la misma secuencia de salientes y efectos en un cliente real (Meta mock) y en uno de prueba.
- [x] Frontend:
  - [x] test de `SandboxChat` (envío, efecto renderizado, reiniciar con confirmación);
  - [x] el `AssistantConfigPage.test.tsx` existente sigue verde.

## Verificación final

- [x] `pnpm --filter @sofiapp/api typecheck` sin errores.
- [x] `pnpm --filter @sofiapp/api test` en verde (nuevos + existentes de reportes, campañas, bandeja y flujos).
- [x] `pnpm --filter @sofiapp/web build && pnpm --filter @sofiapp/web lint` en verde.
- [x] Checklist de PR de `docs/multi-tenancy.md` §9 revisado.
- [ ] Recorrido manual de `plan.md` → Verificación, hecho por el usuario (pendiente).
- [x] `git status` sin capturas `*.png`/`*.jpg` coladas.
- [x] `spec.md` → `**Estado:** implementado`.

## Definición de "hecho"

Un admin abre "Probar asistente", o "Probar" desde el editor de flujos o la KB, y conversa con Sofi:
- recibe exactamente lo que recibiría un cliente por WhatsApp, con su flujo activo o uno elegido;
- ve como tarjetas lo que el sistema hizo (lead, asignación, etiquetas, semáforo, transferencia, esperas);
- puede reiniciar cuando quiera.

Nada de lo probado llega a Meta, ensucia la bandeja, los reportes, el pipeline, las campañas, ni las
cuotas del plan, ni molesta a un asesor real. Ningún tenant ni ningún otro admin puede ver la sesión.
