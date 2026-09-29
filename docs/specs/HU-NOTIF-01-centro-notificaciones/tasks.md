# HU-NOTIF-01 — Tasks (checklist ejecutable)

> Claude Code: ejecuta en orden. Marca cada casilla al terminar. No cierres el feature hasta que
> TODO esté en verde. Contratos exactos en `plan.md`.

## Implementación — Backend

### 1. Slice `notification` (nuevo, patrón de 6 archivos)
- [x] `features/notification/notification.types.ts` — `NotificationTipo`, `INotification`,
  `INotificationDocument`, `INotificationResponse`, `CreateNotificationInput`.
- [x] `features/notification/notification.model.ts` — colección `notifications`; `tenantId` y
  `userId` `required` + índice `{ tenantId: 1, userId: 1, createdAt: -1 }`.
- [x] `features/notification/notification.validation.ts` — `listNotificationsSchema` (`page`/`limit`),
  `readOneSchema` (`params.id`).
- [x] `features/notification/notification.service.ts` — `createNotification` (vía `createScoped`,
  falla suave con `logger.error`, igual criterio que `recordAuditEvent`), `listNotifications` (vía
  `findScoped` + `countScoped`, mismo filtro en ambos), `countUnread`, `markAsRead` (filtro
  `{ _id, userId }` además del scope de tenant — 404 si no es del usuario), `markAllAsRead` (vía
  `updateManyScoped`, ya existe en el repositorio).
- [x] `features/notification/notification.controller.ts` — 4 controllers delgados, `tenantId`/`sub`
  del token, sin `try/catch`.
- [x] `features/notification/notification.routes.ts` — `GET /`, `GET /unread-count`,
  `PATCH /:id/read`, `PATCH /read-all`, cadena de middlewares completa con `authorize(['admin'])`.
- [x] `app.ts` — `app.use('/api/notifications', notificationRoutes)`.

### 2. Wiring en `conversation.service.ts` (extender, sin tocar la lógica existente)
- [x] `assignConversation()` — `await createNotification(...)` justo después del
  `publishRealtime({ type: 'conversation:assigned', ... })` existente, solo cuando `asignadoA` no es
  nulo (la rama idempotente ya retorna antes de llegar aquí).
- [x] `handoffConversation()` — `await createNotification(...)` dentro de la rama
  `!yaTeniaAsesor && destino`, junto al `publishRealtime({ type: 'conversation:assigned', ... })`
  que ya existe ahí; la rama `conversation:updated` no crea notificación.

## Implementación — Frontend

> **Antes de crear o modificar CADA componente**, invocar las skills `emil-design-eng`,
> `impeccable:impeccable` y `frontend-design:frontend-design` y aplicar sus criterios.
> Tokens semánticos únicamente (cero `bg-[#...]`), light y dark.

- [x] `features/notifications/types.ts` — `NotificationDTO`.
- [x] `features/notifications/api.ts` — `fetchNotifications`, `fetchUnreadCount`,
  `markNotificationRead`, `markAllNotificationsRead` vía `apiClient` (rutas SIN prefijo `/api`).
- [x] `features/notifications/hooks/useNotifications.ts` — TanStack Query, `queryKey: ['notifications', 'list', page, limit]`.
- [x] `features/notifications/hooks/useUnreadCount.ts` — `queryKey: ['notifications', 'unread-count']`.
- [x] `features/notifications/hooks/useMarkNotificationRead.ts` — mutación (una y "todas") con
  `invalidateQueries` de ambas query keys anteriores.
- [x] `features/notifications/hooks/useNotificationsRealtime.ts` — **NUEVO dueño del socket**:
  `getSocket()` al montar, `on('conversation:assigned')` → invalidate + `toast` (texto distinto si
  `actor.id` es `null` = Sofi vs un admin) con acción "Abrir" (navega a `/inbox` y `setActiveId`).
  Su cleanup **no** llama a `disconnectSocket()`.
- [x] `features/inbox/hooks/useInboxRealtime.ts` — **quitado** el `disconnectSocket()` del cleanup y
  el `toast.success(...)` de `onAssigned` (se queda solo con la invalidación de `['conversations']`);
  sigue usando `getSocket()` para obtener la instancia ya abierta por el hook global.
- [x] `features/notifications/components/NotificationBell.tsx` — `Popover` + `Badge` de contador +
  `ScrollArea` con la lista (icono por `tipo`: `Sparkles`/`UserCheck`, mismo vocabulario que los
  filtros de la bandeja; mensaje, `clienteResumen`, tiempo relativo, clic → marcar leída + abrir la
  conversación) + botón "Marcar todas como leídas".
- [x] `components/layout/AppLayout.tsx` — nueva franja de header dentro de `SidebarInset` (antes de
  `<main>`) con `SidebarTrigger` a la izquierda (estaba vendorizado pero sin usar en ningún lado —
  sin él el sidebar no se puede abrir en mobile) y `<NotificationBell/>` a la derecha; monta
  `useNotificationsRealtime()` una vez.
- [x] Punto de logout (`authStore.logout()`) — movida ahí la llamada a `disconnectSocket()` que se
  quitó de `useInboxRealtime`, antes del `window.location.href = '/login'`.

## Implementación — Docs

- [x] `docs/data-model.md` — nueva sección `notifications` (campos + índices), junto a `audit_events`.
- [x] `docs/api-contract.md` — los 4 endpoints nuevos de `/notifications` (§6) y nota en §7 (tiempo
  real) de que la campanita reutiliza `conversation:assigned` sin evento nuevo.

## Tests (Vitest + MongoDB Memory Server)

> Patrón de `conversation.assign.test.ts` / `conversation.isolation.test.ts` (HU-OMNI-02).

- [x] `notification.service.test.ts` (10 tests)
  - [x] `assignConversation` con destinatario nuevo → crea `Notification` con `tipo: 'assignment'`,
    `actorId` del actor, `clienteResumen` correcto.
  - [x] `assignConversation` idempotente o `asignadoA: null` → NO crea `Notification`.
  - [x] `handoffConversation` sin asesor previo y con destino resuelto → crea `Notification` con
    `tipo: 'handoff'`, `actorId: null`, `actorNombre: 'Sofi'`.
  - [x] `handoffConversation` sobre conversación que ya tenía asesor, o sin destino disponible → NO
    crea `Notification`.
  - [x] `listNotifications`/`countUnread` devuelven solo lo del `userId` pedido, orden `createdAt desc`.
  - [x] `markAsRead` sobre una notificación de OTRO usuario del mismo tenant → 404, sin modificar nada.
  - [x] `markAsRead` idempotente (segunda llamada sobre la misma) → OK.
  - [x] `markAllAsRead` → todas las del usuario quedan `leidaAt` no nulo; las de otro usuario, intactas.
- [x] **`notification.two-admins.test.ts` (escenario del pedido — criterio 10, 1 test)**
  - [x] Dos usuarios `admin` (Ana, Beto) del mismo tenant; una conversación asignada a Ana.
  - [x] Ana reasigna a Beto (`assignConversation`) → Beto tiene 1 notificación `assignment` sin leer;
    Ana tiene 0; un admin de otro tenant tiene 0.
  - [x] `listNotifications` con el `userId` de Beto la lista; con el de Ana, no aparece.
- [x] `notification.isolation.test.ts` (**aislamiento**, 3 tests)
  - [x] token de `tenantB`: `listNotifications`/`countUnread`/`markAsRead` sobre datos de `tenantA` →
    vacío/0/404 según el caso; nunca datos de `tenantA`.
  - [x] Toda lectura/escritura pasa por `*Scoped`; ninguna consulta nueva usa `Model.find/create` directo.

## Verificación final

- [x] `pnpm --filter backend typecheck` sin errores.
- [x] `pnpm --filter backend test` en verde: **134 archivos, 1446 tests**, sin regresiones en
  `conversation.assign.test.ts` / `conversation.handoff.test.ts` (HU-IA-03) existentes.
- [x] `pnpm --filter frontend build && pnpm --filter frontend lint` en verde.
- [x] `app.ts` carga sin errores: varios `*.routes.test.ts` de la suite (p. ej.
  `lead.routes.test.ts`) importan `app.js` con supertest y montan la app completa —con
  `notificationRoutes` ya añadida— y los 1446 tests pasaron. No se levantó el servidor real
  (`dev:web`) contra el `.env` local para no tocar Mongo/Redis reales fuera de una sesión de
  verificación en vivo explícita.
- [x] Checklist de PR de `docs/multi-tenancy.md` §9 completo (ver nota abajo).
- [x] `spec.md` pasa a `**Estado:** implementado`.
- [ ] **Verificación en vivo (a cargo del usuario, no de esta sesión):** dos sesiones de `admin` del
  mismo tenant; reasignar de una a otra y confirmar que la campanita de la que recibe sube sin
  recargar estando en una pantalla distinta de `/inbox`, que el ícono/mensaje distingue handoff de
  Sofi vs reasignación humana, y que "Marcar todas como leídas" vacía el badge. Revisar light y dark.

### Checklist de PR — `docs/multi-tenancy.md` §9

- [x] Toda query usa `*Scoped` (`createScoped`, `findScoped`, `countScoped`,
  `findOneAndUpdateScoped`, `updateManyScoped`) — cero `Notification.find/create` directos.
- [x] `tenantId` sale del token (`req.user!.tenantId`) en los 4 controllers; nunca del body/params.
- [x] `Notification` lleva `tenantId` `required` + `index`.
- [x] Las 4 rutas de `notification.routes.ts` llevan `requireTenant` justo tras `authenticateJWT`.
- [x] No hay rutas cross-tenant en este feature (nada que restringir a `superadmin`).
- [x] Test de aislamiento añadido (`notification.isolation.test.ts`) y en verde.

## Definición de "hecho"

Cuando Sofi transfiere una conversación o cuando un admin le pasa el chat a otro, el destinatario
recibe la notificación en vivo si está conectado (como ya pasaba) y además queda una constancia
persistente y consultable después, visible desde una campanita en cualquier pantalla de la app —no
solo dentro de la bandeja—, con contador de no leídas y acción directa para abrir la conversación.
Todo con `tenantId` naciendo del token, sin una sola consulta fuera del repositorio tenant-safe, y
sin inventar ningún evento de tiempo real que no existiera ya.
