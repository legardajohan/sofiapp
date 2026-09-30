# HU-NOTIF-01 — Centro de notificaciones (spec)

> **Spec-Driven Development.** Este es el QUÉ y el porqué. El CÓMO va en `plan.md`; la ejecución
> en `tasks.md`.

**Estado:** implementado

## Objetivo

Que un administrador se entere de que le transfirieron una conversación — ya sea porque **Sofi
hizo un handoff automático** (`HU-IA-03`) o porque **otro admin le reasignó el chat a mano**
(`HU-OMNI-02`) — de forma persistente y visible desde **cualquier pantalla** de la app, no solo
mientras tiene la bandeja abierta en ese instante.

## Punto de partida: qué ya existe

Verificado en el código, no asumido. Ambas rutas de transferencia **ya** publican el mismo evento
de tiempo real y **ya** dejan rastro auditable; nada de eso se rehace:

| Pieza | Dónde vive hoy |
|---|---|
| Reasignación manual admin→admin | `assignConversation()` (`conversation.service.ts:568-634`, HU-OMNI-02) |
| Handoff automático Sofi→admin | `handoffConversation()` (`conversation.service.ts:717-804`, HU-IA-03) |
| Evento de tiempo real dirigido | `publishRealtime({ type: 'conversation:assigned', targetUserId, actor })`, emitido **solo** al room `asesor:<destinatario>` (`realtime.publisher.ts:70-79`) |
| Auditoría | `recordAuditEvent()` — `conversation.assign` / `conversation.handoff` en `audit_events` |
| Toast al recibir | `useInboxRealtime.onAssigned()` (`apps/frontend/src/features/inbox/hooks/useInboxRealtime.ts:43-50`), `sonner` |
| Ambas specs previas | dejaron **fuera de alcance**, expresamente, cualquier notificación fuera de esa sesión web (`HU-OMNI-02/spec.md:64`, `HU-IA-03/spec.md:122`) |

## El hueco real (verificado en el código)

No es que falte "el aviso": el aviso ya se dispara. Lo que falta es que **sobreviva** al momento
en que se dispara.

1. **No hay persistencia.** El toast es el único rastro para el destinatario; no existe colección
   `notifications` ni endpoint para leerlas después. Si el admin no estaba mirando la pantalla en
   ese segundo, no hay dónde "evidenciar" que la notificación existió.
2. **El socket solo vive mientras la bandeja está montada.** `useInboxRealtime` abre el socket
   (`getSocket()`) al entrar a `/inbox` y lo **desconecta** (`disconnectSocket()`) al salir
   (`useInboxRealtime.ts:26,76`). Si el admin está en `/leads` o `/settings` cuando le reasignan un
   chat, el socket ni siquiera está conectado: el evento no llega y tampoco hay wtoast. Es el motivo
   técnico concreto por el que hoy "notificarse desde cualquier pantalla" es imposible sin tocar el
   ciclo de vida del socket.
3. **No hay dónde ver el historial de las suyas.** `GET /:id/assignments` (HU-OMNI-02) es un
   historial *por conversación*, no una bandeja de notificaciones *del usuario* a través de todas
   sus conversaciones.

## Alcance

Incluye:

**Backend**
- Modelo `Notification` (colección nueva, tenant-scoped): guarda quién la recibe, qué la disparó
  (handoff de Sofi o reasignación de otro admin), un snapshot del nombre/teléfono de la conversación
  y si ya se leyó.
- `createNotification()` se invoca desde **los mismos dos puntos que ya existen** —
  `assignConversation()` y `handoffConversation()` — exactamente en los casos donde hoy se emite
  `conversation:assigned` con un `targetUserId` real. No se toca la lógica de negocio de ninguno de
  los dos; se añade una escritura más junto a la que ya hacen.
- `GET /api/notifications` (paginado, más reciente primero), `GET /api/notifications/unread-count`,
  `PATCH /api/notifications/:id/read`, `PATCH /api/notifications/read-all`.
- **Cero eventos Socket.IO nuevos.** El mismo `conversation:assigned` que ya llega solo al
  destinatario es la señal para refrescar la campanita en el cliente.

**Frontend**
- La conexión del socket deja de vivir y morir con `/inbox`: pasa a abrirse una vez por sesión
  autenticada desde un hook global montado en `AppLayout`, que también asume el toast (movido desde
  `useInboxRealtime`) y la invalidación de la campanita. `useInboxRealtime` deja de llamar a
  `disconnectSocket()`.
- Campanita en el header de la app (nueva, no existe hoy ninguna franja de header global): ícono +
  contador de no leídas, desplegable con la lista (quién/qué, la conversación, cuándo, acción
  "Abrir"), botón "Marcar todas como leídas".

Fuera de alcance (otros features / fases, mismo criterio que dejaron `HU-OMNI-02` y `HU-IA-03`):

- Notificaciones fuera de la sesión web: push del navegador, correo, WhatsApp interno.
- Notificar sobre cualquier evento que no sea handoff de Sofi o reasignación admin→admin (mensaje
  nuevo sin leer, campaña, cambio de etapa, etc.). El `tipo` del modelo queda abierto a futuro, pero
  esta HU solo escribe `'handoff'` y `'assignment'`.
- Borrar notificaciones: solo se pueden marcar como leídas.
- Notificar al `superadmin` (no tiene `tenantId`, no participa de handoff ni de reasignación).
- Preferencias de notificación por usuario (silenciar tipos, frecuencia, etc.).

## Criterios de aceptación

1. **Reasignación admin→admin.** Cuando `assignConversation()` fija un `asignadoA` no nulo y
   distinto del responsable anterior (el mismo caso que hoy emite `conversation:assigned`), se crea
   una `Notification` para el destinatario con `tipo: 'assignment'`, el `actorId`/nombre de quien
   reasignó y un snapshot del nombre o teléfono de la conversación. La reasignación idempotente
   (mismo valor) y la desasignación (`asignadoA: null`) **no** crean notificación — mismo criterio
   por el que hoy tampoco emiten toast.
2. **Handoff automático.** Cuando `handoffConversation()` asigna un asesor **nuevo** (conversación
   que no tenía responsable), se crea una `Notification` con `tipo: 'handoff'`, `actorId: null` y
   `actorNombre: 'Sofi'`. Un handoff que no cambia de responsable (ya tenía asesor) o que no
   encuentra a quién asignar no crea notificación — mismo criterio por el que hoy tampoco emite
   `conversation:assigned`.
3. `GET /api/notifications` devuelve, paginado y ordenado por `createdAt` descendente, únicamente
   las notificaciones del usuario autenticado — nunca las de otro admin del mismo tenant ni las de
   otro tenant.
4. `GET /api/notifications/unread-count` devuelve el conteo de no leídas del usuario autenticado.
5. `PATCH /api/notifications/:id/read` marca como leída una notificación solo si pertenece al
   usuario autenticado dentro de su tenant; sobre una notificación de otro usuario o de otro tenant
   responde `404` y no modifica nada. Es idempotente.
6. `PATCH /api/notifications/read-all` marca como leídas todas las pendientes del usuario
   autenticado, sin tocar las de otros usuarios del mismo tenant.
7. **Tiempo real reutilizado, no reinventado.** Ningún evento Socket.IO nuevo: el `conversation:assigned`
   existente, recibido en el hook global de `AppLayout`, dispara el toast (ya no lo hace
   `useInboxRealtime`) y la invalidación de `unread-count`/lista de notificaciones, estando el admin
   en **cualquier** pantalla de la app.
8. **El socket ya no depende de `/inbox`.** La conexión se abre una vez por sesión autenticada y se
   cierra al cerrar sesión, no al navegar fuera de la bandeja. Un admin que recibe una reasignación
   estando en `/leads` ve subir el contador de la campanita sin recargar y sin haber pasado por
   `/inbox`.
9. **Campanita.** Visible en el header de cualquier pantalla autenticada, con badge de no leídas,
   lista desplegable (icono distinto para `handoff` vs `assignment`, quién/qué, conversación, hace
   cuánto) y acción "Abrir" que navega a `/inbox` y activa esa conversación. "Marcar todas como
   leídas" vacía el badge. Terminada en **light y dark** con tokens semánticos (`INF-03`), invocando
   antes `emil-design-eng`, `impeccable:impeccable` y `frontend-design:frontend-design` (regla del
   `CLAUDE.md` raíz §7).
10. **Escenario del pedido — dos admins delegan un chat.** Test automatizado con dos usuarios
    `admin` del mismo tenant: reasignar una conversación de uno al otro genera y persiste la
    notificación correcta, visible **solo** para el destinatario (ni para quien reasignó, ni desde
    otro tenant).
11. **Aislamiento multi-tenant.** Toda lectura/escritura de `notifications` pasa por el repositorio
    `*Scoped`; ningún endpoint permite leer o marcar como leída una notificación de otro tenant ni
    de otro usuario del mismo tenant. Test de aislamiento en verde.
12. `pnpm --filter @sofiapp/api typecheck` y `pnpm --filter @sofiapp/api test` en verde;
    `pnpm --filter @sofiapp/web build && pnpm --filter @sofiapp/web lint` en verde.

## Dependencias

- **`HU-OMNI-02`** — `assignConversation()`, `assertAssignableAdmin()`, evento `conversation:assigned`.
- **`HU-IA-03`** — `handoffConversation()`, actor de sistema (`actorId: null`, `'Sofi'`).
- **`HU-OMNI-01`** — gateway Socket.IO (rooms `tenant:`/`asesor:`), puente Redis pub/sub.
- **`AUTH-02`** — roles `superadmin | admin` y `subrol` opcional.
- **`INF-02`** — repositorio `*Scoped`, `requireTenant`, `tenantId` del token.
- **`DSN-03`** (UI kit shadcn/ui: `popover`, `dropdown-menu`, `scroll-area`, `badge`, `sonner`) e
  **`INF-03`** (tokens de color light/dark).
