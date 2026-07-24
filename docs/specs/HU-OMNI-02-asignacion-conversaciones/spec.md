# HU-OMNI-02 — Asignación de conversaciones a asesores (spec)

> **Spec-Driven Development.** Este es el QUÉ y el porqué. El CÓMO va en `plan.md`; la ejecución
> en `tasks.md`. Extiende el módulo **M01 — Bandeja Omnicanal** construido en `HU-OMNI-01`: allí se
> puede *leer* y *filtrar* por responsable, aquí se puede *cambiarlo*.

**Estado:** implementado

## Objetivo

Permitir **asignar, reasignar, auto-asignarse y desasignar** el responsable de una conversación
entre los administradores de un mismo tenant, **filtrar la bandeja** por responsable y por estado
comercial, dejar **constancia auditable** de cada cambio y **notificar en vivo** al administrador
destino para que la conversación aparezca de inmediato en su bandeja.

Tras `AUTH-02` todos los usuarios operativos de un tenant son `admin` con un `subrol` **opcional**
(`director | manager | coordinator | secretary`) que es solo metadata y **no altera permisos**. Por
eso: cualquier `admin` puede asignar a cualquier otro `admin`, sin importar el subrol de origen ni
el de destino, y un `admin` que recibe una conversación que no le corresponde puede reasignarla a
otro (no hay restricción de propiedad).

**Decisión de nomenclatura.** El campo persistido sigue siendo `Cliente.asesorId` (definido en
`INF-02`, resemantizado en `AUTH-02` como *usuario admin asignado a la conversación*). `asignadoA`
es el nombre **público del contrato HTTP** (query param, body del PATCH y campo del DTO). No hay
migración de datos ni renombrado en Mongo; ver "Fuera de alcance".

## Alcance

Incluye:

- **`PATCH /api/conversations/:id/assign`** — un único endpoint cubre los cuatro gestos:
  asignar (`{ asignadoA: <userId> }`), reasignar (mismo body sobre una conversación ya asignada),
  auto-asignarse (`<userId>` = el `sub` del token) y desasignar (`{ asignadoA: null }`).
- **Filtros de bandeja en `GET /api/conversations`:**
  - `?asignadoA=<userId>` y `?asignadoA=sin_asignar`,
  - `?estado=nuevo|en_gestion|pago_pendiente|pagado|perdido` (sobre `Cliente.estadoComercial`),
  - combinables entre sí y con el `?filtro=todos|mios|sin_asignar|sofi` ya existente.
- **`GET /api/conversations/:id/assignments`** — historial paginado de reasignaciones de esa
  conversación (más reciente primero), con actor, origen, destino y fecha.
- **Auditoría genérica:** nueva colección tenant-scoped `audit_events` y el servicio interno
  `recordAuditEvent()`. Se estrena con la acción `conversation.assign`, pero queda disponible para
  futuros eventos auditables (cambios de `estadoComercial`, borrados, etc.).
- **`GET /api/users`** — completar el slice `features/users` (hoy solo `model` + `types`) con una
  lectura tenant-scoped de los administradores del tenant, para alimentar el selector de la UI.
- **Tiempo real dirigido:** nuevo evento `conversation:assigned` que el gateway emite **solo** al
  room `asesor:<destinatario>`, más el `conversation:updated` al room `tenant:<id>` que refresca la
  lista de todos los admins conectados.
- **UI de la bandeja:** menú "Asignar a…" en la cabecera del hilo (con "Asignármela", lista de
  admins con su subrol, y "Quitar asignación"), badge de responsable en cada fila de la lista,
  selectores de filtro por responsable y por estado, y **toast** al admin que recibe una
  conversación.
- Índice `{ tenantId: 1, asesorId: 1 }` en `Cliente` — ya documentado en `docs/data-model.md` pero
  ausente del schema Mongoose.

Fuera de alcance (otros features / fases):

- **Renombrar** `Cliente.asesorId` → `asignadoA` en Mongo y la room `asesor:<id>` del gateway (con su
  migración de datos): sigue fuera de alcance desde `AUTH-02`. Aquí `asignadoA` vive **solo** en el
  contrato HTTP.
- CRUD de usuarios: alta, edición, desactivación y asignación del `subrol`. `GET /api/users` es
  **solo lectura**.
- Reparto automático (round-robin, por carga, por horario) y reglas de escalamiento.
- Pantalla general de auditoría / bitácora del tenant (aquí solo el historial por conversación).
- Notificaciones fuera de la sesión web (push del navegador, email, WhatsApp interno).
- Cambiar `estadoComercial` desde la bandeja (sigue siendo de `M02`); aquí solo se **filtra** por él.

## Criterios de aceptación

1. `PATCH /api/conversations/:id/assign` con `{ asignadoA: "<userId>" }` persiste el valor en
   `Cliente.asesorId` del tenant del token y responde `200` con el `IConversationResponse`
   incluyendo `asignadoA`, `asignadoANombre` y `asignadoASubrol` resueltos.
2. El mismo endpoint cubre los cuatro gestos: `{ asignadoA: null }` devuelve la conversación a
   "Sin asignar"; enviar el propio `sub` del token es auto-asignarse; y **cualquier** `admin` puede
   reasignar una conversación ya asignada a otro `admin` (con cualquier subrol) — no hay
   comprobación de propiedad ni de subrol en el guard.
3. Un `asignadoA` que no exista, no tenga rol `admin`, esté `activo: false` o pertenezca a otro
   tenant produce `AppError(…, 404)` y **no** modifica nada. Asignar el valor que la conversación ya
   tiene es idempotente: `200`, sin evento de auditoría nuevo y sin emisión de realtime.
4. `GET /api/conversations?asignadoA=<userId>` devuelve solo las conversaciones de ese responsable y
   `?asignadoA=sin_asignar` solo las que tienen `asesorId` nulo; `?estado=<estadoComercial>` filtra
   por ese estado; ambos parámetros son combinables entre sí y con `?filtro=`.
5. Cada cambio efectivo escribe un documento en `audit_events` con
   `{ tenantId, actorId, accion: 'conversation.assign', entidad: 'cliente', entidadId,
   antes: { asignadoA }, despues: { asignadoA }, createdAt }`, y
   `GET /api/conversations/:id/assignments` lo devuelve paginado y ordenado por `createdAt` desc.
6. **Definition of Done — tiempo real:** al asignar, el gateway emite `conversation:assigned`
   **únicamente** al room `asesor:<destinatario>` y `conversation:updated` al room `tenant:<id>`.
   El admin destino ve la conversación aparecer en su filtro "Míos" **sin recargar** y recibe un
   toast que indica quién se la asignó; los demás admins del tenant ven la lista actualizada pero
   **no** reciben el toast.
7. `GET /api/users` responde `200` con los usuarios `admin` **activos del propio tenant**
   (`{ id, nombre, email, rol, subrol }`), nunca `passwordHash`, y nunca usuarios de otro tenant ni
   el `superadmin` (que no tiene `tenantId`).
8. La UI funciona en **light y dark** usando exclusivamente tokens semánticos (cero colores
   arbitrarios `bg-[#...]`, per `INF-03`): menú de asignación en la cabecera del hilo, badge de
   responsable por fila, filtros de responsable/estado sincronizados con la URL y toast de recepción.
   Cada componente nuevo o modificado se construye **invocando** las skills `emil-design-eng`,
   `impeccable:impeccable` y `frontend-design:frontend-design` (regla del `CLAUDE.md` raíz).
9. **Test de aislamiento multi-tenant:** con token de `tenantB`, `PATCH .../assign` y
   `GET .../assignments` sobre una conversación de `tenantA` devuelven `404`; un admin de `tenantA`
   no puede ser asignado desde `tenantB`; los `audit_events` de `tenantA` son invisibles para
   `tenantB`; y `GET /api/users` de `tenantB` no lista usuarios de `tenantA`. Toda lectura/escritura
   pasa por el repositorio `*Scoped` y no se introduce ninguna agregación nueva.
10. `pnpm --filter backend typecheck` y `pnpm --filter backend test` en verde;
    `pnpm --filter frontend build && pnpm --filter frontend lint` en verde.

## Dependencias

- **`HU-OMNI-01`** — bandeja, `conversation.mapper`, gateway Socket.IO, puente Redis y filtro `mios`.
- **`AUTH-02`** — roles `superadmin | admin` y `subrol` opcional en el token y en el store; define la
  semántica de `asesorId` que aquí se hace editable.
- **`INF-02`** — repositorio `*Scoped`, `requireTenant`, `tenantId` del token.
- **`AUTH-01`** — JWT en cookie httpOnly (lo reutilizan REST y el gateway).
- **`DSN-03`** (UI kit shadcn/ui: `dropdown-menu`, `select`, `badge`, `avatar`, `sonner`) e
  **`INF-03`** (tokens de color light/dark).
