# HU-OMNI-01 — Tasks (checklist ejecutable)

> Claude Code: ejecuta en orden. Marca cada casilla al terminar. No cierres el feature hasta que
> TODO esté en verde. Un feature a la vez; valida `tsc --noEmit` y el test de aislamiento antes de cerrar.

## Implementación — Backend (patrón de 6 archivos + realtime)

- [x] Editar `features/cliente/cliente.model.ts`: añadir `noLeidos: { type:Number, default:0 }` e
      `iaHabilitada: { type:Boolean, default:true }`. Reflejar el delta en `docs/data-model.md → clientes`.
- [x] Crear `features/conversation/conversation.types.ts` (`FiltroBandeja`, `IConversationResponse`,
      `IMessageResponse`, `IPaginated<T>`, DTOs).
- [x] Crear `features/conversation/conversation.validation.ts` (Zod `{ body, params, query }` para
      list, hilo, send, read; `page`/`limit` con coerce; `filtro` enum; `id` ObjectId). Incluye
      también `iaSchema` para `PATCH /:id/ia` (toggle de Sofi).
- [x] Crear `features/conversation/conversation.mapper.ts` (`Cliente`→`IConversationResponse`,
      `Message`→`IMessageResponse`, `_id` a string, calcular `ventana24hAbierta`).
- [x] Crear `features/conversation/conversation.service.ts`: `listConversations`, `getThread`,
      `replyMessage` (delega en `sendMessage` de HT-WA-01), `markRead`, `setIaHabilitada`. **Todo vía
      `*Scoped`**; cualquier `$group`/aggregate hace `$match { tenantId }` primero.
- [x] Crear `features/conversation/conversation.controller.ts` (delgado; `tenantId`/`asesorId` del token).
- [x] Crear `features/conversation/conversation.routes.ts` con la cadena fija de middlewares
      (`authorize(['coordinador','asesor'])`). Incluye `PATCH /:id/ia` (no listado originalmente en
      `plan.md`, añadido para completar el toggle de Sofi del `spec.md`; reconciliado en el triad).
- [x] Montar en `app.ts`: `app.use('/api/conversations', conversationRoutes)`.
- [x] Instalar `socket.io` en el backend.
- [x] Crear `realtime/socket.gateway.ts` (`createSocketGateway(server)`, auth JWT por cookie, rooms
      `tenant:`/`asesor:`, tipos `RealtimeEvent`, emisión solo al room del tenant).
- [x] Crear `realtime/realtime.publisher.ts` (`publishRealtime` / `subscribeRealtime` con ioredis
      dedicado, canal `realtime`, `REDIS_URL`).
- [x] Refactorizar `app.ts` a `http.createServer(app)` + `createSocketGateway` + `subscribeRealtime`;
      mantener `export default app` y exportar `server`. `subscribeRealtime` se omite en `NODE_ENV=test`
      para no abrir conexiones Redis en la suite.
- [x] Editar `workers/inbound-message.processor.ts`: tras persistir el inbound, incrementar `noLeidos`
      (update scoped) y `publishRealtime({ type:'message:new', ... })`. Dejado `// TODO(Fase 3): auto-reply`.
- [x] Añadido `countScoped` a `repositories/base.repository.ts` (no estaba en el plan original; lo
      necesita la paginación de `listConversations`/`getThread` sin salirse del repo tenant-safe).
- [x] Crear ADR `docs/adr/0004-realtime-socketio-redis.md` (transporte realtime elegido).

## Implementación — Frontend (bandeja de 2 paneles)

- [x] Instalar `socket.io-client`.
- [x] Crear `lib/socket.ts` (cliente con `withCredentials`, conectar/desconectar, listeners que
      invalidan queries `['conversations']` y `['thread', id]`).
- [x] Crear `features/inbox/api.ts` (wrappers tipados sobre `apiClient`) y `features/inbox/types.ts`.
- [x] Crear `features/inbox/hooks/useConversations.ts`, `hooks/useThread.ts` y
      `hooks/useInboxRealtime.ts` (TanStack Query + suscripción socket).
- [x] Crear `features/inbox/useInboxStore.ts` (UI-only: conversación activa).
- [x] Crear componentes: `ConversationList`, `ConversationThread`, `MessageComposer`,
      `WindowClosedBanner`, `SofiToggle`, `InboxFilters`, `MessageStatus` — UI kit + tokens semánticos
      (light/dark).
- [x] Crear `features/inbox/pages/InboxPage.tsx` (2 paneles, lee `?filtro` de la URL, suscribe al socket).
- [x] Activar Inbox en `components/layout/nav-config.ts` (quitar `disabled`) + submenú
      `Todos`/`Míos`/`Sin asignar`/`Sofi activa` con iconos `Inbox`/`UserCheck`/`UserX`/`Sparkles`.
- [x] Añadir ruta `/inbox` en `router.tsx` bajo `RequireAuth→AppLayout` con
      `RequireRole roles={['coordinador','asesor']}` (lazy).
- [x] Proxy WebSocket `/socket.io` en `vite.config.ts` (necesario en dev; no estaba en el plan
      original — sin él el socket no llega al backend detrás del proxy de Vite).

## Tests (Vitest)

- [x] `tests/isolation/conversation.isolation.test.ts` — **aislamiento** (4 tests):
  - [x] `listConversations(tenantB)` no devuelve conversaciones creadas para `tenantA`.
  - [x] `getThread(tenantB, clienteDeA)` → 404 (no filtra mensajes de otro tenant).
  - [x] `markRead(tenantB, clienteDeA)` no modifica el doc de `tenantA`.
  - [x] `replyMessage(tenantB, clienteDeA, …)` no envía (404, no encuentra el cliente en su scope).
- [x] `tests/unit/conversation.service.test.ts` — casos funcionales (4 tests):
  - [x] Orden por `ultimoMensajeAt` desc y `preview` = último mensaje.
  - [x] Filtros `mios` / `sin_asignar` / `sofi` segmentan correctamente.
  - [x] `replyMessage` fuera de ventana 24 h propaga `AppError(…, 422)` (regla de HT-WA-01).
  - [x] `markRead` deja `noLeidos = 0`.
- [x] `tests/unit/socket.gateway.test.ts` — integración (2 tests): handshake sin JWT → rechazado;
      con JWT de `tenantB` no recibe un evento emitido al room de `tenantA`.

## Verificación final

- [x] `pnpm --filter backend typecheck` sin errores.
- [x] `pnpm --filter backend test` — **88/88 tests en verde** (incluidos los 10 nuevos de este feature).
- [x] `pnpm --filter frontend build && pnpm --filter frontend lint` sin errores.
- [x] Prueba en vivo: verificada personalmente por el usuario en el navegador (bandeja en vivo,
      envío dentro de ventana, light/dark). Datos de prueba sembrados con un script desechable
      (`_demo_omni.ts`, fuera del repo) que ya fue eliminado tras la verificación.
- [x] Checklist de PR de `docs/multi-tenancy.md` §9 revisado (repo `*Scoped`, `tenantId` del token,
      test de aislamiento presente).

## Definición de "hecho"

Se cumple el DoD del enunciado: **un mensaje entrante aparece en vivo en la bandeja y el asesor
responde dentro de la ventana de 24 h**. La lista se ordena por recencia con preview y no leídos, el
hilo se ve completo, el toggle de Sofi persiste `iaHabilitada` y los filtros del sidebar segmentan la
bandeja. Todo aislado por tenant, en light y dark, con typecheck/test/build en verde. Deja listo el
terreno realtime (Socket.IO + puente Redis) que reutilizarán M02 (`cliente:estado-changed`) y Fase 3
(auto-reply de Sofi).

