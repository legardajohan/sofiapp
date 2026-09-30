# HU-NOTIF-01 — Plan técnico (CÓMO)

> Reglas que NO se repiten aquí: `CLAUDE.md` raíz (aislamiento, `tenantId` del token),
> `apps/backend/CLAUDE.md` (patrón de 6 archivos + cadena de middlewares),
> `apps/frontend/CLAUDE.md` (apiClient único, TanStack Query, tokens semánticos, skills de diseño),
> `docs/multi-tenancy.md`.

## Archivos a crear / tocar

### Backend

```
apps/backend/src/
├── features/notification/                    # NUEVO — slice de 6 archivos
│   ├── notification.types.ts                  # NotificationTipo, INotification(Document), INotificationResponse, CreateNotificationInput
│   ├── notification.model.ts                  # colección `notifications`; tenantId + userId required + index
│   ├── notification.validation.ts             # listNotificationsSchema, readSchema
│   ├── notification.service.ts                # createNotification · listNotifications · countUnread · markAsRead · markAllAsRead
│   ├── notification.controller.ts             # 4 controllers, delgados
│   └── notification.routes.ts                 # GET / · GET /unread-count · PATCH /:id/read · PATCH /read-all
├── features/conversation/conversation.service.ts   # EXTENDER — createNotification() junto a los publishRealtime existentes
└── app.ts                                     # + app.use('/api/notifications', notificationRoutes)
```

> **Sin cambios en `realtime.types.ts` ni en `realtime.publisher.ts`.** No hace falta un evento
> nuevo: `conversation:assigned` ya llega solo al room `asesor:<destinatario>`, y el cliente lo usa
> también como señal de "hay una notificación nueva".

### Frontend

```
apps/frontend/src/
├── features/notifications/                        # NUEVO
│   ├── types.ts                                    # NotificationDTO
│   ├── api.ts                                       # fetchNotifications · fetchUnreadCount · markAsRead · markAllAsRead
│   ├── hooks/
│   │   ├── useNotifications.ts                      # TanStack Query — lista (primeras N, paginado simple)
│   │   ├── useUnreadCount.ts                         # TanStack Query — contador
│   │   ├── useMarkNotificationRead.ts                # mutación + invalidate
│   │   └── useNotificationsRealtime.ts               # NUEVO — dueño del socket (connect/disconnect por sesión), toast + invalidate en 'conversation:assigned'
│   └── components/
│       └── NotificationBell.tsx                      # Popover: ícono + Badge de contador + lista + "Marcar todas como leídas"
├── features/inbox/hooks/useInboxRealtime.ts        # EDITAR — ya no abre/cierra el socket ni muestra el toast de asignación
└── components/layout/AppLayout.tsx                 # EDITAR — franja de header nueva con <NotificationBell/>; monta useNotificationsRealtime()
```

### Docs

- `docs/data-model.md` — nueva sección `notifications` (campos + índices).
- `docs/api-contract.md` — `GET /notifications`, `GET /notifications/unread-count`,
  `PATCH /notifications/:id/read`, `PATCH /notifications/read-all`.

## Contratos

### `notification.types.ts`

```ts
export type NotificationTipo = 'handoff' | 'assignment';

// Colección tenant-scoped. Se accede SIEMPRE vía *Scoped.
export interface INotification {
  tenantId: Types.ObjectId;
  userId: Types.ObjectId;          // destinatario
  tipo: NotificationTipo;
  conversacionId: Types.ObjectId;
  clienteResumen: string;          // snapshot: conversation.nombre ?? conversation.telefono
  actorId: Types.ObjectId | null;  // null = Sofi (handoff automático)
  actorNombre: string;             // 'Sofi', o el nombre del admin que reasignó
  mensaje: string;                 // ej. "Sofi te transfirió una conversación" / "Ana te reasignó una conversación"
  leidaAt: Date | null;
}
export interface INotificationDocument extends INotification, Document {}

export interface INotificationResponse {
  id: string;
  tipo: NotificationTipo;
  conversacionId: string;
  clienteResumen: string;
  actorId: string | null;
  actorNombre: string;
  mensaje: string;
  leidaAt: string | null;
  createdAt: string;
}

export interface CreateNotificationInput {
  userId: string;
  tipo: NotificationTipo;
  conversacionId: string;
  clienteResumen: string;
  actorId: string | null;
  actorNombre: string;
  mensaje: string;
}
```

### `notification.model.ts`

```ts
const NotificationSchema = new Schema<INotificationDocument>({
  tenantId:       { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  userId:         { type: Schema.Types.ObjectId, ref: 'User',   required: true },
  tipo:           { type: String, enum: ['handoff', 'assignment'], required: true },
  conversacionId: { type: Schema.Types.ObjectId, ref: 'Cliente', required: true },
  clienteResumen: { type: String, required: true },
  actorId:        { type: Schema.Types.ObjectId, ref: 'User', default: null },
  actorNombre:    { type: String, required: true },
  mensaje:        { type: String, required: true },
  leidaAt:        { type: Date, default: null },
}, { timestamps: true, collection: 'notifications' });

// Cubre listado (`sort createdAt desc`) y el conteo de no leídas (mismo prefijo tenantId+userId).
NotificationSchema.index({ tenantId: 1, userId: 1, createdAt: -1 });
```

### `notification.validation.ts`

```ts
export const listNotificationsSchema = z.object({
  body: empty, params: empty,
  query: z.object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(50).default(20),
  }),
});

export const readOneSchema = z.object({
  body: empty, query: empty,
  params: z.object({ id: objectId }),
});
// read-all no necesita schema propio: sin body, sin params, sin query → { body: empty, params: empty, query: empty }
```

### `notification.service.ts`

```ts
// Nunca lanza: igual criterio que recordAuditEvent — la operación de negocio (assign/handoff) ya
// se persistió; perder una notificación no debe romper la respuesta al usuario.
export async function createNotification(tenantId: string, input: CreateNotificationInput): Promise<void> {
  try {
    await createScoped(Notification, tenantId, { ...input, leidaAt: null });
  } catch (err) {
    logger.error('No se pudo crear la notificación', { error: String(err), tipo: input.tipo });
  }
}

export async function listNotifications(
  tenantId: string, userId: string, query: { page: number; limit: number },
): Promise<IPaginated<INotificationResponse>> {
  // findScoped(Notification, tenantId, { userId }).sort({ createdAt: -1 }).skip/limit + countScoped
  // MISMO filtro { tenantId, userId } en la query y en el count (precedente: listAuditEvents).
}

export async function countUnread(tenantId: string, userId: string): Promise<number> {
  // countScoped(Notification, tenantId, { userId, leidaAt: null })
}

export async function markAsRead(tenantId: string, userId: string, id: string): Promise<INotificationResponse> {
  // findOneAndUpdateScoped(Notification, tenantId, { _id: id, userId }, { leidaAt: new Date() }, { new: true })
  // El filtro { _id, userId } —no solo { _id, tenantId} que ya impone *Scoped— es la guarda que
  // impide a un admin marcar como leída la notificación de OTRO admin del mismo tenant.
  // if (!updated) throw new AppError('Notificación no encontrada.', 404);
  // Idempotente: sobre una ya leída, vuelve a fijar leidaAt (mismo comportamiento, sin rama especial).
}

export async function markAllAsRead(tenantId: string, userId: string): Promise<void> {
  // updateManyScoped(Notification, tenantId, { userId, leidaAt: null }, { leidaAt: new Date() })
  // — ya existe en base.repository.ts, no hace falta añadir nada al repositorio.
}
```

### `notification.controller.ts` / `notification.routes.ts`

```ts
router.get('/',              authenticateJWT, requireTenant, authorize(['admin']), validate(listNotificationsSchema), asyncHandler(listNotificationsController));
router.get('/unread-count',  authenticateJWT, requireTenant, authorize(['admin']), asyncHandler(unreadCountController));
router.patch('/:id/read',    authenticateJWT, requireTenant, authorize(['admin']), validate(readOneSchema), asyncHandler(markReadController));
router.patch('/read-all',    authenticateJWT, requireTenant, authorize(['admin']), asyncHandler(markAllReadController));
// app.ts → app.use('/api/notifications', notificationRoutes);
```

Cada controller: `const tenantId = req.user!.tenantId.toString(); const userId = req.user!.sub;` (o
el campo equivalente que ya usan `assignController`/`listAssignmentsController`) y delega al service.

### `conversation.service.ts` — los dos puntos de escritura

En `assignConversation`, justo **después** del `publishRealtime({ type: 'conversation:assigned', ... })`
existente (línea ~631) y dentro del mismo `if` implícito (solo cuando `asignadoA` es no nulo — la
rama idempotente ya retornó antes, así que este punto solo se alcanza en una reasignación efectiva):

```ts
if (asignadoA) {
  await createNotification(tenantId, {
    userId: asignadoA,
    tipo: 'assignment',
    conversacionId: clienteId,
    clienteResumen: conversation.nombre ?? conversation.telefono,
    actorId,
    actorNombre: actorInfo?.nombre ?? 'Un administrador',
    mensaje: `${actorInfo?.nombre ?? 'Un administrador'} te reasignó una conversación`,
  });
}
```

En `handoffConversation`, dentro de la misma rama donde hoy se decide `conversation:assigned` en vez
de `conversation:updated` (línea ~792-803: `!yaTeniaAsesor && destino`):

```ts
if (!yaTeniaAsesor && destino) {
  await publishRealtime({ type: 'conversation:assigned', /* … igual que hoy … */ });
  await createNotification(tenantId, {
    userId: destino,
    tipo: 'handoff',
    conversacionId: clienteId,
    clienteResumen: conversation.nombre ?? conversation.telefono,
    actorId: null,
    actorNombre: 'Sofi',
    mensaje: 'Sofi te transfirió una conversación',
  });
} else {
  await publishRealtime({ type: 'conversation:updated', tenantId, conversationId: clienteId, conversation });
}
```

`createNotification` nunca lanza (falla suave + log), así que no necesita `try/catch` en el
llamador — mismo trato que ya recibe `recordAuditEvent`.

### Frontend — contratos

```ts
// features/notifications/types.ts
export interface NotificationDTO {
  id: string;
  tipo: 'handoff' | 'assignment';
  conversacionId: string;
  clienteResumen: string;
  actorNombre: string;
  mensaje: string;
  leidaAt: string | null;
  createdAt: string;
}

// features/notifications/api.ts — SIN prefijo /api (lo pone baseURL)
export async function fetchNotifications(page = 1, limit = 20): Promise<Paginated<NotificationDTO>>;
export async function fetchUnreadCount(): Promise<number>;
export async function markNotificationRead(id: string): Promise<NotificationDTO>;
export async function markAllNotificationsRead(): Promise<void>;
```

`useNotificationsRealtime.ts` — reemplaza la responsabilidad de ciclo de vida del socket que hoy
tiene `useInboxRealtime`:

```ts
export function useNotificationsRealtime(): void {
  const qc = useQueryClient();
  useEffect(() => {
    const socket = getSocket();               // conecta si no existe

    const onAssigned = (evt: RealtimeAssignedEvent): void => {
      void qc.invalidateQueries({ queryKey: ['notifications'] });
      void qc.invalidateQueries({ queryKey: ['notifications', 'unread-count'] });
      const nombre = evt.conversation.nombre ?? evt.conversation.telefono;
      toast.success(evt.actor.id ? 'Nueva conversación asignada' : 'Sofi te transfirió una conversación', {
        description: evt.actor.id ? `${evt.actor.nombre ?? 'Un administrador'} te asignó a ${nombre}` : nombre,
        action: { label: 'Abrir', onClick: () => { navigate('/inbox'); setActiveId(evt.conversationId); } },
      });
    };

    socket.on('conversation:assigned', onAssigned);
    return () => {
      socket.off('conversation:assigned', onAssigned);
      // SIN disconnectSocket(): la sesión, no la pantalla, es dueña de la conexión.
      // (El logout es quien debe llamar a disconnectSocket() — ver Notas.)
    };
  }, [qc]);
}
```

`useInboxRealtime.ts` — se le **quita** la propiedad del socket y el toast de `onAssigned`, se le
**deja** todo lo demás igual (sigue usando `getSocket()` para obtener la instancia ya abierta):

```ts
// ANTES: return () => { ...; disconnectSocket(); };
// AHORA: return () => { socket.off('message:new', onMessage); /* … sin disconnectSocket() … */ };

// onAssigned se reduce a la invalidación que le importa a la bandeja (la campanita ya no vive aquí):
const onAssigned = (evt: RealtimeAssignedEvent): void => {
  void qc.invalidateQueries({ queryKey: ['conversations'] });
};
```

`NotificationBell.tsx` — `Popover` (trigger: botón ícono `Bell` de `lucide-react` + `Badge`
superpuesto con `unreadCount` cuando es `> 0`, oculto en `0`) → contenido: `ScrollArea` con la lista
de `useNotifications()` (icono `Sparkles` para `handoff`, `UserCheck` para `assignment`, mismo
lenguaje visual que los filtros de `HU-OMNI-01`), cada fila con `mensaje`, `clienteResumen`,
timestamp relativo y clic → `markNotificationRead` + navegar a `/inbox` + `setActiveId`; footer con
botón "Marcar todas como leídas" (deshabilitado si `unreadCount === 0`).

`AppLayout.tsx` — hoy no existe ninguna franja de header; se añade una barra delgada dentro de
`SidebarInset`, antes de `<main>`, con `SidebarTrigger` (ausente hoy: sin él el sidebar no se puede
abrir en mobile, donde `Sidebar` se comporta como `Sheet`) a la izquierda y `<NotificationBell/>` a
la derecha. `useNotificationsRealtime()` se monta una vez aquí (mismo nivel que `SidebarProvider`).

## Notas

- **Por qué no hay evento Socket.IO nuevo.** `conversation:assigned` ya cumple exactamente lo que
  necesita la campanita: llega solo al destinatario correcto, ya trae `actor` y `conversation`, y ya
  respeta toda la idempotencia/guardas que tienen `assignConversation`/`handoffConversation`.
  Duplicarlo en un `notification:new` sería mantener dos eventos para la misma causa.
- **Por qué el socket cambia de dueño.** Es un hallazgo de la investigación, no una preferencia:
  hoy `useInboxRealtime` desconecta el socket al salir de `/inbox` (`disconnectSocket()`), así que
  ningún evento de tiempo real —ni el toast que ya existe— llega si el admin está en otra pantalla.
  Sin este cambio, el criterio de aceptación 8 (notificarse fuera de `/inbox`) es imposible.
- **`disconnectSocket()` no desaparece:** pasa a llamarse desde el flujo de logout
  (`authStore.logout()` o donde corresponda), no desde el `useEffect` de un hook de pantalla. Si el
  flujo de logout no tiene hoy un punto natural para esto, añadir la llamada ahí es parte de esta
  historia (una línea), no una historia aparte.
- **`clienteResumen` es un snapshot, no un join.** Igual criterio que `audit_events.antes/despues`:
  se congela el nombre/teléfono en el momento de crear la notificación, para no depender de un
  `populate` (saltaría el repositorio scoped) ni de que la conversación siga existiendo igual después.
- **Aislamiento doble.** `*Scoped` resuelve tenant; el filtro `{ userId }` dentro de cada función del
  service es lo que impide que un admin lea o marque como leída la notificación de **otro** admin
  del mismo tenant — no es redundante con `*Scoped`, es una guarda de negocio distinta.
- **`authorize(['admin'])`** es el único guard, igual que `HU-OMNI-02`/`GET /api/users`: el
  `superadmin` no tiene `tenantId` y nunca participa de handoff ni de reasignación.
- **Frontend:** antes de crear o modificar cualquier componente, invocar `emil-design-eng`,
  `impeccable:impeccable` y `frontend-design:frontend-design` (regla del `CLAUDE.md` raíz §7). La
  campanita, su badge y el nuevo header son exactamente el tipo de pieza que esas skills deben guiar
  antes de escribir una línea de JSX.

## Verificación

- `pnpm --filter backend typecheck`
- `pnpm --filter backend test` (incluye los tests de aislamiento y el escenario de dos admins de `tasks.md`)
- `pnpm --filter frontend build && pnpm --filter frontend lint`
- Verificación visual/manual del resultado queda para el usuario (no se ejecuta Playwright ni
  verificación en vivo desde esta sesión).
