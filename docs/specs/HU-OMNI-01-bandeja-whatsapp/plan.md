# HU-OMNI-01 — Plan técnico (CÓMO)

## Archivos a crear / tocar

```
apps/backend/src/
├── features/conversation/
│   ├── conversation.types.ts        # IConversationResponse, IMessageResponse, FiltroBandeja, DTOs
│   ├── conversation.validation.ts   # Zod { body, params, query } (list, hilo, send, read)
│   ├── conversation.service.ts      # listConversations, getThread, replyMessage, markRead (todo *Scoped)
│   ├── conversation.mapper.ts       # Cliente/Message → *Response (mapXToResponse, _id string)
│   ├── conversation.controller.ts   # HTTP delgado; tenantId + asesorId del token
│   └── conversation.routes.ts       # GET / · GET /:id/messages · POST /:id/messages · PATCH /:id/read
├── features/cliente/
│   └── cliente.model.ts             # (editar) + noLeidos:Number=0, iaHabilitada:Boolean=true
├── realtime/
│   ├── socket.gateway.ts            # crea io, auth JWT (cookie), rooms tenant:/asesor:, tipos de evento
│   └── realtime.publisher.ts        # Redis pub/sub: publish(evento) / subscribe(io) — puente worker↔web
├── workers/
│   └── inbound-message.processor.ts # (editar) incrementar noLeidos + publicar message:new tras persistir
├── app.ts                           # (editar) http.createServer(app) + montar gateway + montar rutas
└── worker.ts                        # (editar) inicializa el publisher Redis (lado publish)

apps/frontend/src/
├── features/inbox/
│   ├── pages/InboxPage.tsx          # layout de 2 paneles; lee ?filtro; suscribe al socket
│   ├── components/ConversationList.tsx    # lista ordenada, preview, badge no leídos
│   ├── components/ConversationThread.tsx  # hilo + estados de entrega
│   ├── components/MessageComposer.tsx     # textarea + envío; deshabilitado fuera de ventana
│   ├── components/WindowClosedBanner.tsx  # aviso ventana 24 h cerrada
│   ├── components/SofiToggle.tsx          # switch iaHabilitada
│   ├── components/InboxFilters.tsx        # (opcional) chips de filtro dentro de la vista
│   ├── hooks/useConversations.ts    # useQuery lista + invalidación por eventos socket
│   ├── hooks/useThread.ts           # useQuery hilo + useMutation enviar/read
│   ├── api.ts                       # wrappers axios tipados (apiClient)
│   ├── types.ts                     # tipos de dominio/DTO del inbox
│   └── useInboxStore.ts             # UI-only: conversación activa, filtro
├── lib/socket.ts                    # cliente socket.io-client (withCredentials), conectar/desconectar
├── components/layout/nav-config.ts  # (editar) activar Inbox + submenú de filtros
└── router.tsx                       # (editar) ruta /inbox bajo RequireAuth→AppLayout (RequireRole)

docs/adr/
└── 0004-realtime-socketio-redis.md  # ADR corto: transporte realtime (Socket.IO + pub/sub Redis)
```

> Nota de modelo: **no hay `conversation.model.ts`** — el recurso reutiliza `Cliente` y `Message`.
> Los deltas `noLeidos` e `iaHabilitada` se documentan también en `docs/data-model.md → clientes`.

## Contratos

### `conversation.types.ts`
```ts
export type FiltroBandeja = 'todos' | 'mios' | 'sin_asignar' | 'sofi';
export interface IConversationResponse {
  id: string; clienteNombre: string | null; telefono: string;
  ultimoMensajeAt: string | null; preview: string | null;
  noLeidos: number; asesorId: string | null; iaHabilitada: boolean;
  ventana24hAbierta: boolean; estadoComercial: string;
}
export interface IMessageResponse {
  id: string; direccion: 'inbound'|'outbound'; sender: 'user'|'bot'|'agent';
  tipo: string; texto: string | null; attachmentUrl: string | null;
  status: 'sent'|'delivered'|'read'|'failed'; createdAt: string;
}
export interface IPaginated<T> { data: T[]; page: number; limit: number; total: number; }
```

### `conversation.validation.ts`
Zod con forma `{ body, params, query }`:
- list `query`: `page`/`limit` (coerce number, defaults 1/20), `filtro` enum `FiltroBandeja` opt.
- hilo `params`: `id` ObjectId; `query`: `page`/`limit`.
- send `params`: `id` ObjectId; `body`: `{ texto: string.min(1) }`.
- read `params`: `id` ObjectId.
- ia `params`: `id` ObjectId; `body`: `{ habilitada: boolean }`.
DTOs derivados con `z.infer` (nada de `any`).

### `conversation.service.ts` (todo vía repo `*Scoped`)
- `listConversations(tenantId, asesorId, { page, limit, filtro })` → `IPaginated`. Base:
  `findScoped(Cliente, tenantId, filtroMongo).sort({ ultimoMensajeAt: -1 })` con `skip/limit`;
  `preview` del último `Message` por `clienteId`. Si se usa `$group`/aggregate, **`$match { tenantId }`
  primero** (no existe aggregate scoped — marcar para multi-tenancy-guard).
- `getThread(tenantId, clienteId, page)` → `findByIdScoped(Cliente,…)` (valida pertenencia) +
  `findScoped(Message, tenantId, { clienteId }).sort({ createdAt: 1 })`.
- `replyMessage(tenantId, asesorId, clienteId, texto)` → delega en `sendMessage` de HT-WA-01
  (que ya valida ventana 24 h y lanza `AppError(…,422)`); no duplicar la regla.
- `markRead(tenantId, clienteId)` → `findOneAndUpdateScoped(Cliente, tenantId, {_id}, { noLeidos:0 })`.
- `setIaHabilitada(tenantId, clienteId, valor)` → update scoped del flag.

### `conversation.routes.ts` (cadena fija de middlewares)
`authenticateJWT → requireTenant → authorize(['coordinador','asesor']) → validate(schema) → asyncHandler(controller)`.
Montaje en `app.ts`: `app.use('/api/conversations', conversationRoutes)`.

### `realtime/socket.gateway.ts`
```ts
export function createSocketGateway(server: http.Server): Server /* socket.io */;
// handshake: lee JWT de la cookie (mismo secreto que authenticateJWT), verifica,
// socket.join(`tenant:${tenantId}`) y `asesor:${asesorId}`; rechaza si no hay token.
export type RealtimeEvent =
  | { type: 'message:new'; tenantId: string; conversationId: string; message: IMessageResponse }
  | { type: 'conversation:updated'; tenantId: string; conversation: IConversationResponse };
```
Emite siempre a `io.to('tenant:'+tenantId)` — nunca broadcast global.

### `realtime/realtime.publisher.ts`
```ts
export function publishRealtime(evt: RealtimeEvent): Promise<void>; // worker → Redis PUBLISH canal 'realtime'
export function subscribeRealtime(io: Server): void;               // web → Redis SUBSCRIBE, reemite a room
```
Usa una conexión ioredis dedicada (SUBSCRIBE bloquea el cliente). `REDIS_URL` ya existe en `env.ts`.

### `app.ts` (refactor)
De `app.listen(...)` a `const server = http.createServer(app); const io = createSocketGateway(server);
subscribeRealtime(io); server.listen(env.PORT)`. Mantener `export default app` y **exportar también
`server`** para no romper imports/tests existentes.

### Frontend — `lib/socket.ts` + hooks
`io(VITE_API_BASE_URL, { withCredentials: true })`; en `message:new`/`conversation:updated`
`queryClient.invalidateQueries(['conversations'])` y, si la conversación está abierta, `['thread', id]`.
`api.ts`: wrappers tipados que devuelven `res.data`. Queries/mutations con TanStack Query (patrón de
`AdminTenantsPage`). Zustand `useInboxStore` solo para UI (conversación activa, filtro).

### Frontend — nav + router
`nav-config.ts`: quitar `disabled` de Inbox (`to:'/inbox'`, roles `['coordinador','asesor']`) y añadir
sub-items con `to:'/inbox?filtro=...'` e iconos `Inbox`, `UserCheck`, `UserX`, `Sparkles`.
`router.tsx`: ruta hija `/inbox` bajo `RequireAuth→AppLayout` con `RequireRole roles={['coordinador','asesor']}`,
lazy-load de `InboxPage`.

## Notas

- **Ventana 24 h:** no se reimplementa; `replyMessage` delega en `sendMessage` (HT-WA-01). El front
  solo pinta el aviso usando `ventana24hAbierta` del `IConversationResponse`.
- **Sofi:** este feature solo persiste/lee `iaHabilitada` y alimenta el filtro. El auto-reply real
  (`generateReply`) es Fase 3; dejar comentario `// TODO(Fase 3): hook auto-reply` donde el worker
  decidiría responder.
- **Aislamiento:** `tenantId` siempre del token (rutas) o del JWT del handshake (socket); nunca del
  payload del evento para decidir el room de entrada. El publisher incluye `tenantId` y el gateway
  reemite solo a ese room. Pasar el service por la skill `multi-tenancy-guard`.
- **Frontend design:** usar `emil-design-eng` + plugin `impeccable` para el pulido de la bandeja;
  light/dark solo con tokens semánticos (INF-03). Instalar `socket.io-client`; considerar
  `pnpm dlx shadcn@3.8.5 add scroll-area` (pin 3.8.5) para el scroll del hilo.
- **Dependencias nuevas:** backend `socket.io`; frontend `socket.io-client`.

## Verificación

- `pnpm --filter backend typecheck` y `pnpm --filter backend test` (incluye test de aislamiento).
- `pnpm --filter frontend build && pnpm --filter frontend lint`.
- Prueba en vivo (Playwright): simular un inbound (webhook/worker) y ver el mensaje aparecer sin
  recargar; responder dentro de ventana; verificar light y dark. Capturas desechables en
  `.playwright-mcp/` y borrarlas al terminar.
