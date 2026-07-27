# HU-OMNI-02 — Plan técnico (CÓMO)

> Reglas que NO se repiten aquí: `CLAUDE.md` raíz (aislamiento, `tenantId` del token),
> `apps/backend/CLAUDE.md` (patrón de 6 archivos + cadena de middlewares),
> `apps/frontend/CLAUDE.md` (apiClient único, TanStack Query, tokens semánticos, skills de diseño),
> `docs/multi-tenancy.md`.

## Archivos a crear / tocar

### Backend

```
apps/backend/src/
├── features/audit/                       # NUEVO — slice parcial (sin routes propias)
│   ├── audit.types.ts                    # AuditAccion, IAuditEvent, IAuditEventDocument
│   ├── audit.model.ts                    # colección audit_events; tenantId required + index
│   └── audit.service.ts                  # recordAuditEvent · listAuditEvents
├── features/users/                       # COMPLETAR (hoy solo model + types)
│   ├── user.validation.ts                # NUEVO — listUsersSchema
│   ├── user.mapper.ts                    # NUEVO — toUserResponse
│   ├── user.service.ts                   # NUEVO — listTenantUsers · assertAssignableAdmin · findUsersByIds
│   ├── user.controller.ts                # NUEVO — listUsersController
│   └── user.routes.ts                    # NUEVO — GET /
├── features/conversation/                # EXTENDER
│   ├── conversation.types.ts             # + asignadoA*, IAssignmentResponse, EstadoComercial
│   ├── conversation.validation.ts        # + assignSchema, assignmentsSchema; query + asignadoA/estado
│   ├── conversation.mapper.ts            # + IAsignadoSource, toAssignmentResponse
│   ├── conversation.service.ts           # + assignConversation, listAssignments; buildFiltro ampliado
│   ├── conversation.controller.ts        # + assignController, listAssignmentsController
│   └── conversation.routes.ts            # + PATCH /:id/assign, GET /:id/assignments
├── features/cliente/cliente.model.ts     # + índice { tenantId: 1, asesorId: 1 }
├── realtime/realtime.types.ts            # + evento 'conversation:assigned'
├── realtime/realtime.publisher.ts        # enrutado por room dentro de subscribeRealtime
└── app.ts                                # + app.use('/api/users', userRoutes)
```

### Frontend

```
apps/frontend/src/
├── lib/roles.ts                                 # NUEVO — ROL_LABEL/SUBROL_LABEL (extraídos de NavUser.tsx)
├── components/layout/NavUser.tsx                # importa los labels desde lib/roles.ts (sin duplicar)
├── features/users/
│   ├── types.ts                                 # NUEVO — UserDTO
│   ├── api.ts                                   # NUEVO — fetchTenantUsers()
│   └── hooks/useTenantUsers.ts                  # NUEVO — TanStack Query (staleTime largo)
└── features/inbox/
    ├── types.ts                                 # + asignadoA*, EstadoComercial, InboxFiltros, RealtimeAssignedEvent
    ├── api.ts                                   # + assignConversation(); fetchConversations(filtros)
    ├── hooks/useConversations.ts                # queryKey con los tres filtros
    ├── hooks/useAssign.ts                       # NUEVO — mutación + invalidate
    ├── hooks/useInboxRealtime.ts                # + on('conversation:assigned') → toast
    ├── components/AssignMenu.tsx                # NUEVO — DropdownMenu de asignación
    ├── components/AssigneeBadge.tsx             # NUEVO — iniciales + nombre/subrol
    ├── components/InboxFilters.tsx              # + Select de responsable y de estado
    ├── components/ConversationList.tsx          # + AssigneeBadge por fila
    └── pages/InboxPage.tsx                      # AssignMenu en la cabecera; filtros en la URL
```

### Docs

- `docs/data-model.md` — nueva sección `audit_events`; en `clientes`, nota de que `asignadoA` es el
  alias público de `asesorId` en la API.
- `docs/api-contract.md` — `PATCH /conversations/:id/assign`, `GET /conversations/:id/assignments`,
  `GET /users`, y los query params `asignadoA` / `estado`; evento `conversation:assigned`.

## Contratos

### `audit.types.ts`
```ts
export type AuditAccion = 'conversation.assign';
export type AuditEntidad = 'cliente';

export interface IAuditEvent {
  tenantId: Types.ObjectId;
  actorId: Types.ObjectId;
  accion: AuditAccion;
  entidad: AuditEntidad;
  entidadId: Types.ObjectId;
  antes: Record<string, unknown>;
  despues: Record<string, unknown>;
}
export interface IAuditEventDocument extends IAuditEvent, Document {}
```

### `audit.model.ts`
```ts
const AuditEventSchema = new Schema<IAuditEventDocument>({
  tenantId:  { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  actorId:   { type: Schema.Types.ObjectId, ref: 'User',   required: true },
  accion:    { type: String, required: true },
  entidad:   { type: String, required: true },
  entidadId: { type: Schema.Types.ObjectId, required: true },
  antes:     { type: Schema.Types.Mixed, default: {} },
  despues:   { type: Schema.Types.Mixed, default: {} },
}, { timestamps: true, collection: 'audit_events' });

AuditEventSchema.index({ tenantId: 1, entidad: 1, entidadId: 1, createdAt: -1 });
```

### `audit.service.ts`
```ts
export async function recordAuditEvent(tenantId: string, input: RecordAuditInput): Promise<void>;
export function listAuditEvents(
  tenantId: string, entidad: AuditEntidad, entidadId: string,
): Query<...>;   // findScoped(AuditEvent, tenantId, { entidad, entidadId }).sort({ createdAt: -1 })
```
`recordAuditEvent` usa `createScoped` y **nunca lanza**: si falla, loguea con `logger.error` y sigue
(la asignación ya se persistió; perder la bitácora no debe romper la operación del usuario).

### `user.validation.ts` / `user.service.ts`
```ts
export const listUsersSchema = z.object({
  body: empty, params: empty,
  query: z.object({
    activo: z.coerce.boolean().optional().default(true),
    rol: z.enum(['admin']).optional().default('admin'),
  }),
});

// service — todas las lecturas por findScoped (nunca User.find directo)
export function listTenantUsers(tenantId: string, q: ListUsersQuery): Promise<IUserResponse[]>;
export async function assertAssignableAdmin(tenantId: string, userId: string): Promise<IUserResponse>;
export function findUsersByIds(tenantId: string, ids: string[]): Promise<Map<string, IUserResponse>>;
```
- `listTenantUsers` → `findScoped(User, tenantId, { rol, activo }).sort({ nombre: 1 }).lean()`.
  `passwordHash` ya es `select: false` en el schema; aun así el mapper solo proyecta campos seguros.
- `assertAssignableAdmin` → `findByIdScoped(User, tenantId, userId).lean()`; si no existe, o
  `rol !== 'admin'`, o `activo === false` → `throw new AppError('Usuario no asignable.', 404)`.
  **Es la única guarda que impide asignar cross-tenant** (el `tenantId` viene del token).
- `findUsersByIds` → una sola consulta por página de bandeja; alimenta `asignadoANombre`/`Subrol`.
  Nada de `populate` (saltaría el repositorio scoped) ni de N+1.

### `user.routes.ts` (+ montaje)
```ts
router.get('/', authenticateJWT, requireTenant, authorize(['admin']),
  validate(listUsersSchema), asyncHandler(listUsersController));
// app.ts → app.use('/api/users', userRoutes);   // junto al resto de rutas tenant-aware
```

### `conversation.types.ts`
```ts
export type EstadoComercial = 'nuevo' | 'en_gestion' | 'pago_pendiente' | 'pagado' | 'perdido';

export interface IConversationResponse {
  /* …campos actuales… */
  asesorId: string | null;          // se conserva (compatibilidad con HU-OMNI-01)
  asignadoA: string | null;         // alias público del contrato (mismo valor que asesorId)
  asignadoANombre: string | null;
  asignadoASubrol: AdminSubrol | null;
}

export interface IAssignmentResponse {
  id: string;
  actorId: string;
  actorNombre: string | null;
  de: { id: string; nombre: string | null } | null;
  a:  { id: string; nombre: string | null } | null;
  createdAt: string;
}
```

### `conversation.validation.ts`
```ts
export const assignSchema = z.object({
  body: z.object({ asignadoA: objectId.nullable() }),
  params: z.object({ id: objectId }),
  query: empty,
});

export const assignmentsSchema = z.object({
  body: empty,
  params: z.object({ id: objectId }),
  query: z.object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(20),
  }),
});

// listConversationsSchema.query += {
//   asignadoA: z.union([objectId, z.literal('sin_asignar')]).optional(),
//   estado: z.enum(['nuevo','en_gestion','pago_pendiente','pagado','perdido']).optional(),
// }
```

### `conversation.service.ts`
```ts
function buildFiltro(filtro, asesorId, asignadoA?, estado?): FilterQuery<IClienteDocument> {
  // 1) el `filtro` actual (todos|mios|sin_asignar|sofi) tal cual
  // 2) if (asignadoA === 'sin_asignar') f.asesorId = null;
  //    else if (asignadoA) f.asesorId = new Types.ObjectId(asignadoA);   // gana sobre `filtro`
  // 3) if (estado) f.estadoComercial = estado;
}

export async function assignConversation(
  tenantId: string, actorId: string, clienteId: string, asignadoA: string | null,
): Promise<IConversationResponse> {
  // 1. findByIdScoped(Cliente, tenantId, clienteId).lean()  →  AppError('Conversación no encontrada.', 404)
  // 2. if (asignadoA) await assertAssignableAdmin(tenantId, asignadoA)   // 404 si no es admin activo del tenant
  // 3. const antes = cliente.asesorId ? String(cliente.asesorId) : null;
  //    if (antes === asignadoA) return <respuesta actual>;               // idempotente: sin auditoría ni realtime
  // 4. findOneAndUpdateScoped(Cliente, tenantId, { _id }, { asesorId: asignadoA }, { new: true })
  // 5. await recordAuditEvent(tenantId, { actorId, accion:'conversation.assign', entidad:'cliente',
  //      entidadId: clienteId, antes: { asignadoA: antes }, despues: { asignadoA } })
  // 6. await publishRealtime({ type:'conversation:assigned', tenantId, conversationId: clienteId,
  //      conversation, targetUserId: asignadoA, actor: { id: actorId, nombre } })
}

export async function listAssignments(
  tenantId: string, clienteId: string, query: AssignmentsQuery,
): Promise<IPaginated<IAssignmentResponse>>;   // 404 si la conversación no es del tenant
```
`listConversations` resuelve nombres con **una** llamada a `findUsersByIds` por página y pasa el
`Map` a `toConversationResponse`. `listAssignments` hace lo mismo con los ids de actor/origen/destino
que aparezcan en la página del historial.

### `realtime.types.ts` / `realtime.publisher.ts`
```ts
| {
    type: 'conversation:assigned';
    tenantId: string;
    conversationId: string;
    conversation: IConversationResponse;
    targetUserId: string | null;              // null = se desasignó
    actor: { id: string; nombre: string | null };
  }
```
Enrutado por room dentro de `subscriber.on('message')` (hoy siempre emite al room del tenant):
```ts
if (evt.type === 'conversation:assigned') {
  io.to(`tenant:${evt.tenantId}`).emit('conversation:updated', {
    type: 'conversation:updated', tenantId: evt.tenantId,
    conversationId: evt.conversationId, conversation: evt.conversation,
  });
  if (evt.targetUserId) io.to(`asesor:${evt.targetUserId}`).emit('conversation:assigned', evt);
} else {
  io.to(`tenant:${evt.tenantId}`).emit(evt.type, evt);
}
```
Así **todos** los admins del tenant refrescan su lista, pero el toast llega solo al destinatario.
El room `asesor:<sub>` ya se une en `createSocketGateway` — no hay cambios en el gateway.

### Frontend — contratos

```ts
// features/users/types.ts
export interface UserDTO { id: string; nombre: string; email: string; rol: UserRol; subrol?: AdminSubrol }

// features/inbox/types.ts
export interface InboxFiltros { filtro: FiltroBandeja; asignadoA?: string; estado?: EstadoComercial }
export interface RealtimeAssignedEvent {
  tenantId: string; conversationId: string; conversation: ConversationDTO;
  targetUserId: string | null; actor: { id: string; nombre: string | null };
}

// features/inbox/api.ts
export async function assignConversation(id: string, asignadoA: string | null): Promise<ConversationDTO>;
```

`useInboxRealtime` añade:
```ts
socket.on('conversation:assigned', (evt: RealtimeAssignedEvent) => {
  void qc.invalidateQueries({ queryKey: ['conversations'] });
  toast.success('Nueva conversación asignada', {
    description: `${evt.actor.nombre ?? 'Un administrador'} te asignó ${nombreDe(evt.conversation)}`,
    action: { label: 'Abrir', onClick: () => setActiveId(evt.conversationId) },
  });
});
```

`AssignMenu.tsx` — `DropdownMenu` de shadcn sobre un trigger que muestra el responsable actual
(`AssigneeBadge`) o "Sin asignar":
- `Asignármela` (si el usuario actual no es el responsable),
- separador + lista de admins (`useTenantUsers`) con iniciales, nombre y subrol traducido, check en
  el actual,
- separador + `Quitar asignación` (solo si hay responsable), en `text-destructive`.
Estado `pending` mientras corre la mutación; los errores del backend se muestran con `toast.error`.

`InboxFilters.tsx` conserva los 4 chips actuales y añade dos `Select` (responsable y estado) que
escriben en los query params de `/inbox`; `InboxPage` los lee de `useSearchParams` y los pasa a
`useConversations`, cuyo `queryKey` pasa a ser `['conversations', { filtro, asignadoA, estado }]`.

## Notas

- **Aislamiento:** ninguna consulta nueva sale del repositorio `*Scoped`. La única agregación del
  feature (`Message.aggregate` de previews, de HU-OMNI-01) no se toca.
- `?filtro=mios` es el atajo de `?asignadoA=<sub del token>` y se conserva: el submenú del sidebar
  (`nav-config.ts`) no cambia. Si llegan ambos, `asignadoA` gana (es el más específico).
- `authorize(['admin'])` es el único guard: por `AUTH-02` el `subrol` **no** participa de la
  autorización, ni en el backend ni en la UI.
- El `superadmin` no tiene `tenantId`, así que nunca aparece en `GET /api/users` (que es
  tenant-scoped) y no puede ser asignado.
- **Frontend:** antes de crear o modificar cualquier componente hay que invocar las skills
  `emil-design-eng`, `impeccable:impeccable` y `frontend-design:frontend-design` (regla del
  `CLAUDE.md` raíz y de `apps/frontend/CLAUDE.md`). El `AssignMenu`, el badge y el toast son
  exactamente el tipo de micro-interacción que esas skills cubren.

## Verificación

- `pnpm --filter backend typecheck`
- `pnpm --filter backend test` (incluye los tests de aislamiento de `tasks.md`)
- `pnpm --filter frontend build && pnpm --filter frontend lint`
- Prueba en vivo con dos sesiones de admin del mismo tenant (ver `tasks.md` → Verificación final).
