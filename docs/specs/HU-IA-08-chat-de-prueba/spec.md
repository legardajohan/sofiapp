# HU-IA-08 — Chat de prueba del asistente (spec)

> **Spec-Driven Development.** Este es el QUÉ y el porqué. El CÓMO va en `plan.md`; la ejecución
> en `tasks.md`. Le da al inquilino un lugar para **conversar con su propia configuración** (flujos,
> base de conocimiento, FAQs, contexto, comportamiento y transferencia) antes de exponerla a clientes
> reales, sin escribir desde un WhatsApp de verdad.

**Estado:** implementado

## Objetivo

Hoy un admin configura a Sofi a ciegas: para saber cómo responde tiene que escribirle desde un
teléfono real al número del tenant. Los dos probadores que existen son parciales:

- `POST /api/ai/answer` responde una pregunta suelta, sin historial ni flujo.
- `POST /api/kb/faqs/test` solo calibra FAQs.

Se quiere un **chat de prueba** dentro de SofiApp donde el admin escribe "como si fuera un cliente" y
recibe exactamente lo que recibiría ese cliente: la misma decisión entre flujo y Sofi, el mismo
disparador, los mismos nodos, la misma FAQ/RAG, las mismas reglas de transferencia, el mismo semáforo y
la misma extracción. **Fidelidad antes que comodidad:** se reutiliza el pipeline real, no un simulador
paralelo que diverja con el tiempo.

Referencia de mercado: Mercately no documenta un simulador para MIA. Recomienda "probar en cada canal
antes de producción" y "supervisar las primeras conversaciones", es decir, probar con un número real.

## Punto de partida: qué ya existe

Verificado en el código. Todo lo de esta tabla se **reutiliza**.

| Pieza | Dónde vive hoy |
|---|---|
| Decisión flujo vs Sofi | `responderAutomaticamente` / `atenderConSofi` (`workers/inbound-message.processor.ts`) |
| Motor de flujos puro + runtime | `avanzar` (`flow.engine.ts`), `ejecutarFlujo` / `reanudarFlujo` / `ejecutarEfecto` (`flow.runtime.service.ts`) |
| Respuesta de Sofi con ventana de agrupación | `aiReplyQueue` + `processAiReplyJob` (`workers/ai-reply.processor.ts`) |
| Único punto de envío saliente | `sendOutbound` (`features/message/message.service.ts`) |
| Interfaz de proveedor de mensajería | `IMessagingProvider` (`integrations/meta/messaging-provider.interface.ts`) |
| Hilo por cliente | `Cliente` + `Message` (no hay modelo `Conversation`) |
| Exclusión de hilos ficticios | prefijo `demo-` en `Cliente.metaUserId` (`PREFIJO_CLIENTE_DEMO`, bandeja y reportes) |
| Sala de socket por usuario | `asesor:<userId>` (`realtime/socket.gateway.ts`) |
| Hilo y burbujas de la bandeja | `ConversationThread`, `MessageBubble`, `MessageComposer` (`apps/frontend/src/features/inbox/components/`) |

## Decisiones de producto (acordadas con el usuario)

1. **Efectos reales, marcados como prueba.** Lo que el flujo o Sofi hagan (crear lead, asignar asesor,
   etiquetas, estado comercial, semáforo, extracción, transferencia) **se ejecuta de verdad** sobre un
   cliente marcado `esPrueba`. Todo lo marcado como prueba se excluye de bandeja, reportes, pipeline,
   cuotas del plan, campañas y recordatorios.
2. **Flujo a probar:** por defecto el flujo activo + Sofi, igual que vería un cliente real. Un selector
   permite probar **cualquier flujo del tenant, incluso inactivo**, sin activarlo.
3. **Acceso:** solo rol `admin`. Página propia en Configuración → Asistente IA → "Probar asistente",
   más un atajo "Probar" en el editor de flujos, la base de conocimiento y la configuración del asistente.
4. **Sesión:** una conversación de prueba por usuario, que persiste entre recargas. "Reiniciar" la borra
   en cascada y empieza como un contacto nuevo. Caduca sola tras **7 días** sin actividad.
5. **Notificaciones de una prueba:** una asignación o transferencia de prueba **no avisa a asesores
   reales**. La asignación queda registrada (la tarjeta dice a quién habría ido), pero la notificación
   va al propio admin que prueba, marcada "(prueba)".

## Alcance

Incluye:
- Cliente de prueba por `(tenantId, userId)` con `esPrueba`, `pruebaOwnerId`, `pruebaFlowId`.
  `Lead.esPrueba` y `AiUsageLog.esPrueba`.
- Canal de salida sandbox: `sendOutbound` no llama a Meta ni consume la cuota `mensajesMes`, y no
  aplica la ventana de 24h cuando el cliente es de prueba. El `Message` se persiste igual.
- Plantillas HSM de un nodo `mensaje`: se **renderizan** (texto final) sin enviarse a Meta.
- Filtro central de "datos reales" aplicado en bandeja, reportes, pipeline, leads, cuotas, campañas,
  conteos de estados/semáforos y barrido de recordatorios.
- Eventos de tiempo real de un hilo de prueba **solo** a la sala del admin que prueba, nunca a la del tenant.
- Tarjetas de efectos en el chat: lead creado, asignado a, etiquetas, estado comercial, semáforo,
  datos extraídos, transferido a asesor y "esperando N · Avanzar ahora".
- Endpoints `/api/sandbox/*` (sesión, enviar, elegir flujo, reiniciar, avanzar espera).
- Barrido diario que borra sesiones de prueba inactivas más de 7 días.
- Frontend: página `/settings/assistant/test`, `Sheet` lateral desde los atajos, estado "Sofi está
  escribiendo…", estado vacío con sugerencias, light/dark.
- Corrección: los mensajes que envía el flujo (`ejecutarEfecto` → `sendOutbound`) no emiten
  `message:new`. Se cablea `notificarSaliente` en ese camino, porque el chat de prueba depende de lo mismo.

Fuera de alcance:
- Media, audio y stickers entrantes en el chat de prueba (solo texto).
- Botones/listas interactivas de WhatsApp (no existen hoy en el sistema).
- Varios escenarios guardados con nombre, compartir sesiones o comparar respuestas entre versiones.
- Probar campañas o recordatorios de 24h (son salientes masivos/programados, no conversación).
- Instagram / Messenger.

## Criterios de aceptación

1. `GET /api/sandbox/session` crea, si no existe, el cliente de prueba del usuario autenticado
   (`esPrueba: true`, `pruebaOwnerId = req.user.id`, `metaUserId = "prueba-<userId>"`, `iaHabilitada: true`)
   y devuelve la sesión: cliente, flujo seleccionado (o `null` = activo) y los mensajes del hilo.
   Llamadas repetidas devuelven **la misma** sesión (índice único parcial `{ tenantId, pruebaOwnerId }`).
2. `POST /api/sandbox/messages { texto }` persiste el mensaje entrante y aplica **la misma decisión**
   que un mensaje de WhatsApp (flujo activo o seleccionado → `ejecutarFlujo`; `trigger_no_cumplido` o
   sin flujo → Sofi con ventana de agrupación). Responde `202`; las respuestas llegan por socket.
3. Con la misma configuración y el mismo texto, la secuencia de mensajes salientes y efectos de un
   cliente de prueba es **idéntica** a la de un cliente real con Meta mockeado (test de fidelidad).
4. `sendOutbound` con un cliente `esPrueba` **no** invoca `metaWhatsAppClient`, no llama a
   `assertWithinQuota('mensajesMes')` ni a `incrementUsage`, no rechaza por ventana de 24h, y persiste el
   `Message` con `metaMessageId` `prueba-<uuid>`. Una plantilla HSM se guarda con su texto renderizado.
5. `PUT /api/sandbox/session { flowId | null }` fija el flujo a probar (validado como flujo del propio
   tenant) y reinicia el `FlowState` del cliente de prueba. `ejecutarFlujo` y `reanudarFlujo` usan ese
   flujo para el cliente de prueba y **siguen usando `getActiveFlow`** para cualquier cliente real.
6. `POST /api/sandbox/session/reset` borra el cliente de prueba y todo lo que colgó de él (mensajes,
   `FlowState`, leads `esPrueba`, notificaciones, eventos de auditoría y notas). El siguiente
   `GET /session` arranca un hilo vacío. Jobs pendientes (`ai-reply`, `flow-runtime`) de la sesión
   borrada terminan sin efecto y sin error.
7. `POST /api/sandbox/session/advance-wait` reanuda ya un flujo detenido en un nodo `espera`, con la
   misma semántica que el job diferido. El job original, al vencer, se descarta por token.
8. Un cliente o lead de prueba **no aparece ni cuenta** en: bandeja (`listConversations`), reportes
   (todos los de `reports.service.ts`, incluido `contarVentas`), temas (`ai-topic`), pipeline/kanban,
   listado de leads, conteos por estado y por semáforo, segmentos y envío de campañas, cuota `leads`
   (`getMetricUsed`) y barrido de recordatorios (`buscarCandidatos`). Crear un lead de prueba no exige ni
   consume cuota `leads`.
9. Los eventos de tiempo real de un hilo de prueba (`message:new`, `conversation:updated`,
   `conversation:assigned`) se emiten **solo** a `asesor:<pruebaOwnerId>` como `sandbox:message` /
   `sandbox:effect`, nunca a `tenant:<id>`. Un efecto de flujo o post-respuesta (lead, asignación,
   etiquetas, estado, semáforo, extracción, handoff, espera) emite un `sandbox:effect` tipado.
10. Una asignación o un handoff sobre un cliente de prueba no crea notificaciones para el asesor destino.
    Crea una para `pruebaOwnerId` con el prefijo "(prueba)".
11. El uso del LLM de una prueba se registra en `AiUsageLog` con `esPrueba: true` (cuesta tokens reales) y
    las métricas de uso de IA lo pueden distinguir.
12. Un barrido diario del worker borra las sesiones de prueba sin mensajes en 7 días, con la misma
    rutina que el reset.
13. Todos los endpoints `/api/sandbox/*` exigen `authenticateJWT → requireTenant → authorize(['admin'])`.
    `tenantId` y `userId` salen **siempre** del token; ningún endpoint acepta un `clienteId`.
14. Frontend:
    - La página `/settings/assistant/test` (con entrada "Probar asistente" en el sidebar) muestra el
      chat con perspectiva de cliente (lo que escribe el admin, a la derecha), un selector de flujo, un
      aviso permanente "Modo prueba: nada se envía por WhatsApp" y "Reiniciar" con confirmación.
    - Los atajos "Probar" de `FlowEditorPage` (preselecciona ese flujo), `KnowledgeBasePage` y
      `AssistantConfigPage` abren el mismo chat en un `Sheet`.
    - Correcto en light y dark con tokens semánticos.
15. Los mensajes enviados por el flujo a un cliente **real** emiten `message:new` (corrección del hueco
    actual) y aparecen en la bandeja en vivo.
16. **Aislamiento multi-tenant:**
    - un admin del tenant B no puede leer, escribir, reiniciar ni avanzar la sesión de prueba de un admin
      del tenant A;
    - un admin X no ve la sesión de otro admin Y del mismo tenant;
    - `PUT /session` con un `flowId` de otro tenant → 404.

    `pnpm --filter @sofiapp/api typecheck` en verde, y `pnpm --filter @sofiapp/web build && lint` en verde.

## Dependencias

- HU-FLOW-01/02/03/04 (motor de flujos, esperas, nodo IA, triggers): implementados.
- HU-IA-01/02/03/05/06/07 (Sofi, ventana de agrupación, handoff, semáforo, extracción, configuración): implementados.
- HU-NOTIF-01 (centro de notificaciones): `createNotification` existe y se usa.
- HU-REP-* (reportes con exclusión `demo-`): se generaliza su filtro.
