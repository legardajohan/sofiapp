# HU-IA-08 — Plan técnico (CÓMO)

## Enfoque

**Pipeline real + canal sandbox.** El chat de prueba entra por el mismo camino que un WhatsApp
(`responderAutomaticamente`) y sale por el mismo `sendOutbound`. Lo único que cambia está en tres puntos:
- el **proveedor de salida**, que no llama a Meta;
- el **destino del tiempo real**, que es la sala del admin que prueba;
- el **flujo resuelto**, que puede ser uno elegido por el admin.

Todo se decide por una sola propiedad del hilo: `Cliente.esPrueba`. Se descarta un runtime paralelo en
memoria, porque duplicaría la orquestación y divergiría del comportamiento real (criterio 3).

```
Admin ── POST /api/sandbox/messages ─► sandbox.service.enviarMensajePrueba
                                         ├─ saveMessage (inbound, metaMessageId "prueba-in-<uuid>")
                                         ├─ notifyInboundMessage ──► publishRealtime ─► (esPrueba) asesor:<owner> "sandbox:message"
                                         └─ responderAutomaticamente(tenantId, clienteId, entrada)  ◄── mismo código que WhatsApp
                                               ├─ resolverFlujoPara(cliente) → ejecutarFlujo ─► ejecutarEfecto ─► sendOutbound
                                               └─ atenderConSofi → aiReplyQueue → processAiReplyJob ─► replyFromIa ─► sendOutbound
sendOutbound(cliente.esPrueba) ─► resolverProveedor → sandboxMessagingProvider (sin Meta/cuota/ventana)
```

## Archivos a crear / tocar

```
apps/backend/src/
├── features/sandbox/                       # NUEVO · sin model.ts: vive en Cliente (como conversation/)
│   ├── sandbox.types.ts                    # ISandboxSessionResponse, SandboxEfecto, SANDBOX_TTL_DIAS
│   ├── sandbox.validation.ts               # enviarMensajeSchema, seleccionarFlujoSchema
│   ├── sandbox.service.ts                  # obtenerSesion, enviarMensajePrueba, seleccionarFlujo,
│   │                                       #  reiniciarSesion, avanzarEspera, barrerSesionesInactivas
│   ├── sandbox.controller.ts
│   ├── sandbox.routes.ts
│   ├── sandbox.effects.ts                  # emitirEfectoPrueba(cliente, efecto): no-op si !esPrueba
│   ├── sandbox.isolation.test.ts
│   ├── sandbox.service.test.ts
│   └── sandbox.fidelity.test.ts            # real (Meta mock) vs prueba → misma secuencia
├── features/cliente/
│   ├── cliente.types.ts / cliente.model.ts # + esPrueba, pruebaOwnerId, pruebaFlowId, pruebaUltimaActividad
│   └── cliente.filters.ts                  # NUEVO · filtroClientesReales(), matchClientesReales(alias)
├── features/lead/
│   ├── lead.types.ts / lead.model.ts       # + esPrueba
│   ├── lead.filters.ts                     # NUEVO · filtroLeadsReales()
│   └── lead.service.ts                     # createLeadFromConversation copia esPrueba y salta cuota; listados filtran
├── features/message/message.service.ts     # sendOutbound: resolverProveedor(cliente) + saltos de prueba
├── integrations/messaging/                 # NUEVO
│   ├── sandbox-messaging.provider.ts       # implementa IMessagingProvider sin red
│   └── resolver-proveedor.ts               # (cliente) => IMessagingProvider
├── features/flow/
│   ├── flow.service.ts                     # resolverFlujoPara(tenantId, cliente)
│   ├── flow.runtime.service.ts             # usa resolverFlujoPara; enviar_mensaje → notificarSaliente; emite efectos
│   └── flow.reminder.service.ts            # buscarCandidatos excluye esPrueba
├── features/conversation/conversation.service.ts
│                                           # listConversations usa filtroClientesReales; notifyInboundMessage,
│                                           #  notificarSaliente, assign/handoff enrutan prueba; notificación → owner
├── features/reports/{reports.types.ts,reports.service.ts}   # PREFIJO_CLIENTE_DEMO → matchClientesReales; contarVentas filtra leads
├── features/ai/{ai-topic,ai-semaforo,ai-extract}.service.ts # topic filtra; semáforo/extracción emiten efecto de prueba
├── features/pipeline/pipeline.service.ts, estado/estado.service.ts, semaforo/semaforo.service.ts
├── features/campaign/{campaign.segment.service.ts,campaign.service.ts}
├── features/usage/usage.service.ts         # getMetricUsed('leads') excluye esPrueba
├── services/ai/{ai.service.ts,ai-usage-log.model.ts}       # esPrueba opcional en chat/extract → logUsage
├── realtime/{realtime.types.ts,realtime.publisher.ts}      # sandbox:message, sandbox:effect → asesor:<owner>
├── workers/inbound-message.processor.ts    # export responderAutomaticamente con entrada agnóstica de canal
├── workers/ai-reply.processor.ts           # pasa esPrueba al AIService; efectos de handoff
├── worker.ts                               # scheduler SANDBOX_SWEEP diario
├── config/queues.ts                        # SANDBOX_SWEEP_SCHEDULER_ID / JOB
└── app.ts                                  # app.use('/api/sandbox', sandboxRoutes)

apps/frontend/src/
├── features/inbox/components/{MessageBubble,ConversationThread,MessageComposer}.tsx
│                                           # prop perspectiva ('asesor' | 'cliente'); media/audio opcionales
├── features/inbox/index.ts                 # exporta los tres componentes
├── features/assistant-sandbox/             # NUEVO
│   ├── api.ts · types.ts · index.ts
│   ├── hooks/useSandboxSession.ts          # GET/PUT/reset/advance-wait (TanStack Query)
│   ├── hooks/useSandboxRealtime.ts         # sandbox:message / sandbox:effect → setQueryData
│   ├── components/SandboxChat.tsx          # núcleo (página y Sheet)
│   ├── components/SandboxEffectCard.tsx
│   ├── components/SandboxFlowSelect.tsx
│   ├── components/SandboxSheet.tsx         # Sheet + botón "Probar" reutilizable
│   └── pages/AssistantTestPage.tsx
├── router.tsx                              # /settings/assistant/test con RequireRole admin
├── components/layout/nav-config.ts         # hijo "Probar asistente" bajo Asistente IA
└── features/{flows/pages/FlowEditorPage, knowledge-base/pages/KnowledgeBasePage,
             ai-assistant/pages/AssistantConfigPage}.tsx   # atajo SandboxSheet

docs/ · data-model.md (clientes, leads, ai_usage_logs) · domain.md (conversación de prueba)
      · api-contract.md (/api/sandbox) · multi-tenancy.md (exclusión de datos de prueba)
```

## Contratos

### Modelo (`cliente.model.ts`, `lead.model.ts`, `ai-usage-log.model.ts`)
```ts
// Cliente
esPrueba: { type: Boolean, default: false },
pruebaOwnerId: { type: ObjectId, ref: 'User', default: undefined },
pruebaFlowId: { type: ObjectId, ref: 'Flow', default: null },   // null = flujo activo
pruebaUltimaActividad: { type: Date },
ClienteSchema.index(
  { tenantId: 1, pruebaOwnerId: 1 },
  { unique: true, partialFilterExpression: { esPrueba: true } },
);
// Lead
esPrueba: { type: Boolean, default: false }      // copiado del Cliente al crear
// AiUsageLog
esPrueba: { type: Boolean, default: false }
```
Identidad del cliente de prueba:
- `metaUserId = "prueba-<userId>"` (cumple el único `{tenantId, metaUserId}`).
- `canalOrigen: 'whatsapp'`, por fidelidad.
- `telefono`: un número ficticio reservado derivado del `userId`, aceptado por `normalizarTelefono` y
  único por tenant para no chocar con el índice `{tenantId, telefono}` de `Lead`. Se verifica en la
  implementación.
- `nombre: "Prueba · <nombre del admin>"`.

### Filtros centrales
```ts
// cliente.filters.ts
export function filtroClientesReales(): FilterQuery<ICliente> {
  return { esPrueba: { $ne: true }, metaUserId: { $not: PREFIJO_CLIENTE_DEMO } };
}
/** Para $match tras un $lookup con alias (p. ej. 'c' en reports). */
export function matchClientesReales(alias: string): Record<string, unknown>;
// lead.filters.ts
export function filtroLeadsReales(): FilterQuery<ILead> { return { esPrueba: { $ne: true } }; }
```
`PREFIJO_CLIENTE_DEMO` se mueve a `cliente.filters.ts`, y `reports.types.ts` lo reexporta para no romper
`scripts/backfill-temas-conversacion.ts`. **Regla:** toda consulta de negocio sobre `Cliente`/`Lead` que
alimente bandeja, reportes, métricas, segmentos o cuotas combina estos filtros.

### Salida (`message.service.ts`)
```ts
// integrations/messaging/resolver-proveedor.ts
export function resolverProveedor(cliente: Pick<ICliente, 'esPrueba'>): IMessagingProvider {
  return cliente.esPrueba ? sandboxMessagingProvider : metaWhatsAppClient;
}
```
En `sendOutbound`, con `esPrueba`:
- se salta `assertWithinQuota('mensajesMes')`, `getIntegrationWithToken`, la comprobación de ventana y
  `incrementUsage`;
- `modo: 'auto'` siempre manda texto, porque la ventana se considera abierta;
- `modo: 'plantilla'` usa `buildTemplatePayload` para guardar `texto`, sin `sendTemplate`;
- `modo: 'media'` responde 422 "No disponible en modo prueba".

El proveedor sandbox devuelve `{ messageId: "prueba-<uuid>" }`. La lectura del cliente pasa **antes** de
la cuota para poder decidir.

### Flujo resuelto (`flow.service.ts`)
```ts
export async function resolverFlujoPara(
  tenantId: string, cliente: Pick<ICliente, 'esPrueba' | 'pruebaFlowId'>,
): Promise<IFlowLean | null> {
  if (cliente.esPrueba && cliente.pruebaFlowId) return findByIdScoped(Flow, tenantId, cliente.pruebaFlowId).lean();
  return getActiveFlow(tenantId);
}
```
La usan `responderAutomaticamente`, `ejecutarFlujo` y `reanudarFlujo`, en lugar de `getActiveFlow`.

### Entrada (`inbound-message.processor.ts`)
```ts
export interface IEntradaAutomatica { tipo: string; texto?: string; mensajeId: string }
export async function responderAutomaticamente(tenantId: string, clienteId: string, entrada: IEntradaAutomatica): Promise<void>;
```
El webhook la llama con `{ tipo: msg.type, texto: msg.text?.body, mensajeId: msg.id }`, sin cambiar su
comportamiento.

### Tiempo real (`realtime.types.ts`, `realtime.publisher.ts`)
```ts
export type SandboxEfecto =
  | { tipo: 'lead_creado'; leadId: string; estado: string }
  | { tipo: 'asignado'; asesor: { id: string; nombre: string } }
  | { tipo: 'etiquetas'; tags: { id: string; nombre: string; color: string }[] }
  | { tipo: 'estado_comercial'; estado: string }
  | { tipo: 'semaforo'; color: string }
  | { tipo: 'datos_extraidos'; campos: Record<string, string> }
  | { tipo: 'handoff'; motivo: string; asesor: { id: string; nombre: string } | null }
  | { tipo: 'espera'; hasta: string }             // habilita "Avanzar ahora"
  | { tipo: 'flujo_fin' };

| { type: 'sandbox:message'; tenantId: string; ownerId: string; message: IMessageResponse }
| { type: 'sandbox:effect';  tenantId: string; ownerId: string; efecto: SandboxEfecto; at: string }
```
`subscribeRealtime` emite `sandbox:*` **solo** a `asesor:<ownerId>`. `notifyInboundMessage`,
`notificarSaliente`, `assignConversation` y `handoffConversation` publican `sandbox:message` o
`sandbox:effect` en lugar de `message:new`, `conversation:updated` o `conversation:assigned` cuando
`cliente.esPrueba`.

### Notificaciones
Helper en `conversation.service.ts`:
```ts
function destinatarioNotificacion(cliente, userId): { userId: string; prefijo: string } {
  return cliente.esPrueba
    ? { userId: String(cliente.pruebaOwnerId), prefijo: '(prueba) ' }
    : { userId, prefijo: '' };
}
```
Se aplica en asignación y handoff antes de `createNotification`.

### Endpoints (`sandbox.routes.ts`)

Todos van con `authenticateJWT → requireTenant → authorize(['admin']) → validate → asyncHandler`.

| Método | Ruta | Body | Respuesta |
|---|---|---|---|
| GET | `/api/sandbox/session` | — | `200 ISandboxSessionResponse` |
| POST | `/api/sandbox/messages` | `{ texto: string(1..4096, trim) }` | `202 { message: IMessageResponse }` |
| PUT | `/api/sandbox/session` | `{ flowId: objectId \| null }` | `200 ISandboxSessionResponse` |
| POST | `/api/sandbox/session/reset` | — | `200 ISandboxSessionResponse` (vacía) |
| POST | `/api/sandbox/session/advance-wait` | — | `202`; `409` si no hay espera pendiente |

```ts
export interface ISandboxSessionResponse {
  clienteId: string;
  flujo: { id: string; nombre: string; activo: boolean } | null;   // null = flujo activo del tenant
  flujoActivo: { id: string; nombre: string } | null;
  iaHabilitada: boolean;                                          // false tras handoff → aviso en UI
  esperaPendiente: { hasta: string } | null;
  mensajes: IMessageResponse[];
}
```
El controller toma `tenantId` y `userId` de `req.user`; ningún endpoint recibe `clienteId`.

### Reset y TTL
`reiniciarSesion(tenantId, userId)` hace `deleteManyScoped` de:
- `Message`, `FlowState`, `ContactNote` y `Notification` por `conversacionId`;
- `AuditEvent` con `entidadId ∈ {cliente, leads}`;
- `Lead` con `{ clienteId, esPrueba: true }`;
- `deleteOneScoped(Cliente)`.

No cancela jobs de BullMQ. El siguiente `GET` crea un `Cliente` con `_id` nuevo, y los jobs viejos
(`ai-reply`, `flow-runtime`) encuentran su `clienteId` borrado y salen sin efecto. Se verifica que cada
processor tolere el cliente inexistente.

`barrerSesionesInactivas()` es un barrido **global** (misma excepción documentada que
`buscarCandidatos`): busca `Cliente.find({ esPrueba: true, pruebaUltimaActividad < now-7d })` y llama a
`reiniciarSesion` por cada uno con su propio `tenantId`. Se programa con `upsertJobScheduler` en
`flowRuntimeQueue`, `every: 24h`.

### Avanzar espera
`avanzarEspera` lee `FlowState.esperaToken` (scoped) y llama a `reanudarFlujo(tenantId, clienteId, token)`.
Al vencer, el job diferido ve el token cambiado y se descarta, igual que en HU-FLOW-02.

## Notas

- **Fidelidad:** el chat de prueba no reimplementa ninguna decisión. Si en el futuro cambia la lógica de
  Sofi o del flujo, la prueba la hereda sola. El test `sandbox.fidelity.test.ts` lo protege.
- **Auditoría en reportes:** las agregaciones de `reports.service.ts` que leen `audit_events` o `messages`
  y no hacen `$lookup` a `Cliente`/`Lead` se revisan una a una. Si alguna cuenta eventos sin unir con el
  cliente, se le añade el `$lookup` + `matchClientesReales`.
- **Coste:** las pruebas consumen tokens reales del LLM. Se registran con `esPrueba` para poder
  mostrarlos aparte. No hay cuota de IA hoy (`data-model.md`), así que no se introduce un tope aquí.
- **Ventana de agrupación:** el chat respeta `AI_REPLY_WINDOW_MS`. La UI muestra "Sofi está escribiendo…"
  desde el envío hasta el primer `sandbox:message` del bot, o hasta un timeout de 30 s con un aviso.
- **Handoff en prueba:** tras una transferencia, `iaHabilitada` queda en `false`, como en real. La UI lo
  muestra ("Sofi transfirió la conversación; reinicia para volver a probar").
- **Perspectiva de burbujas:** en el chat de prueba, el admin es "el cliente" y sus mensajes (`sender:
  'user'`) van a la derecha, como en su WhatsApp. `MessageBubble` recibe `perspectiva`, que por defecto
  es `'asesor'` para no alterar la bandeja.
- **Frontend (regla 7 de `CLAUDE.md`):** antes de escribir componentes se invocan `emil-design-eng`,
  `impeccable:impeccable` y `frontend-design:frontend-design`. Componentes shadcn ya vendorizados:
  `Sheet`, `Select`, `AlertDialog`, `Button`, `Badge`, `Card`, `ScrollArea`, `Tooltip`.

## Verificación

- `pnpm --filter @sofiapp/api typecheck` · `pnpm --filter @sofiapp/api test`.
- `pnpm --filter @sofiapp/web build && pnpm --filter @sofiapp/web lint`.
- Prueba manual: la hace el usuario, sin Playwright. Recorrido:
  1. FAQ → respuesta inmediata.
  2. Pregunta de KB → RAG.
  3. Flujo con `captura` + `crear_lead` → tarjetas.
  4. Elegir un flujo inactivo → corre ese.
  5. Nodo `espera` → "Avanzar ahora".
  6. "Quiero hablar con un asesor" → tarjeta de handoff, sin notificación al asesor.
  7. La bandeja, los reportes, el pipeline y el uso del plan no cambian.
  8. Reiniciar → hilo vacío.

## Desviaciones respecto al diseño original (registradas al implementar)

- **Sin `resolver-proveedor.ts`.** `sendOutbound` decide con una sola comparación (`cliente.esPrueba`) y
  delega en `enviarEnPrueba`, que usa `sandboxMessagingProvider`. Un resolvedor genérico de proveedores
  habría sido una abstracción con un único caso; si algún día hay un segundo canal, se extrae entonces.
- **`MessageComposer` no se tocó.** El chat de prueba es solo texto, así que tiene su propio
  `SandboxComposer` (Enter envía, Mayús+Enter salta de línea) en vez de volver opcionales los
  adjuntos y el audio del composer de la bandeja. `MessageBubble` sí gana la prop `perspectiva`
  (`'asesor'` por defecto, sin cambio para la bandeja) y `ConversationThread` no se usa: el chat
  intercala mensajes y tarjetas de efecto, y necesita su propia lista.
- **`FlowState.esperaHasta`.** No estaba en el diseño: hace falta para mostrar cuándo vence la espera y
  ofrecer «Avanzar ahora» sin adivinarlo.
- **Tarjetas de efecto solo en el navegador.** Llegan por socket y viven en un store de Zustand; al
  recargar la página los mensajes persisten (están en Mongo) pero las tarjetas de esa sesión se pierden.
  Persistirlas exigiría una colección propia por un dato que el admin solo necesita mientras prueba.
- **Cambiar de flujo** también reactiva a Sofi y limpia los datos de transferencia, para que una prueba
  transferida no quede muda al probar otro guion.
- **Etiquetado de uso de IA:** chat de Sofi, nodos de flujo (intención, KB, captura, IA), semáforo,
  extracción y la clasificación de la regla de transferencia por intención de compra pasan `esPrueba`.
