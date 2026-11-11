# Pendientes — reestructuración de roles (AUTH-04 → AUTH-05 → fase 3)

> Nota de traspaso para retomar en una sesión nueva (escrita el 2026-11-10). No es una spec SDD:
> es el contexto para lanzar `/sdd-spec AUTH-05-alcance-visibilidad`. Al crearse esa spec, este
> archivo puede borrarse o quedarse como índice.

## 0. Estado actual (léelo primero)

- **Rama:** todo se trabaja en `feat/AUTH-03`, **sin crear ramas nuevas** (pedido del usuario; omitir el
  paso "crear rama `feat/<ID>`" de `/sdd-implement`).
- **AUTH-03** (gestión de usuarios + revocación de sesión): commiteado en 4 commits (`f1f2d06`…`d0576fe`).
  Sin push ni merge a `develop`. Pendiente `/sdd-release AUTH-03-gestion-usuarios` cuando el usuario lo pida.
- **AUTH-04** (roles de empresa): implementado, **sin commit**. `spec.md` en `implementado`.
  Spec/plan/tasks en `docs/specs/AUTH-04-roles-empresa/`; decisión en `docs/adr/0017-roles-de-empresa.md`.
  Verificación al cierre: backend typecheck OK + 219 archivos / 2373 tests; frontend build + lint OK +
  109 archivos / 1071 tests (excluyendo `KnowledgeBasePage.test.tsx`, que se cuelga también en `develop`).
- **Primer paso mañana:** preguntar si se commitea AUTH-04 (skill `commit-changes`, mensajes en inglés,
  agrupados: api / web / docs) antes de empezar AUTH-05.

### Pendientes que arrastra AUTH-04

- [ ] Commit de AUTH-04 (cuando el usuario lo pida).
- [ ] Revisión visual light/dark de `/settings/users` (como Administrador y como Coordinador) y de la
      bandeja. No se pudo: en la sesión no había MongoDB ni Redis locales.
- [ ] `pnpm --filter @sofiapp/api migrate:roles-empresa` (dry-run por defecto) sobre una BD con datos
      reales y revisar el reporte (`destinosNoAsesor`: transferencias y flujos que apuntan a un
      administrador/coordinador). Luego `--apply`; tras deploy y ≥ 8 h, `--unset-legacy`.
- [ ] `/sdd-release` de AUTH-03 y AUTH-04 (los invoca el usuario).

## 1. Modelo que ya existe (AUTH-04) y sobre el que se construye

- `User.rol`: `superadmin | admin` (sin cambios). `User.rolEmpresa`: `administrador | coordinador | asesor`
  (obligatorio si `rol === 'admin'`). `User.coordinadorId`: solo asesores, su equipo. Índices
  `{ tenantId, coordinadorId }` y `{ tenantId, rolEmpresa, activo }`.
- JWT y `req.user` (`SafeUser`) llevan `rolEmpresa`; `socket.data.auth.rolEmpresa` también (en
  `socket.gateway.ts`, ya preparado para los rooms por equipo). Traducción de tokens/documentos viejos:
  `features/users/user.rol-empresa.ts` → `resolverRolEmpresa` (única tabla).
- Gates: `middlewares/authorize-rol-empresa.middleware.ts` con `ROLES_DATOS_SENSIBLES`, `ROLES_REPORTES`
  (hoy **solo `administrador`**), `ROLES_GESTION_USUARIOS` (`administrador`, `coordinador`),
  `ROLES_CONFIGURACION` (`administrador`), `authorizeRolEmpresa`, `tieneRolEmpresa`,
  `puedeVerDatosSensibles`. Gemelos en `apps/frontend/src/lib/roles.ts`.
- La gestión de usuarios **ya** está acotada por equipo (`cargarObjetivoPara` en `user.service.ts`).
  Lo que **no** está acotado todavía: quién ve qué conversación, lead, cliente o pendiente.
- Tests: helpers en `features/users/user.test-helpers.ts` (`crearUsuario(tenantId, { rolEmpresa,
  coordinadorId, activo })`, `tokenDe`, `llamar`, `crearClienteAsignado`). Los tests HTTP mockean
  `realtime/realtime.publisher.js` y `publicarSesionRevocada` del `internal-bus` (ver
  `user.management.test.ts`).

## 2. AUTH-05 · Alcance de visibilidad (el siguiente feature)

### Decisiones ya aprobadas por el usuario

| Rol | Ve conversaciones / leads / clientes | Asigna a |
|---|---|---|
| Administrador | Todo el tenant | Cualquier usuario activo |
| Coordinador | Propias + de los asesores de su equipo + **sin asignar** | Él mismo o asesores de su equipo |
| Asesor | Propias + **sin asignar** (para tomarlas) | Solo a sí mismo |

- Datos sensibles y reportes: el **coordinador los gana en AUTH-05, solo de su equipo**. Hay que sumar
  `'coordinador'` a `ROLES_DATOS_SENSIBLES` y `ROLES_REPORTES` (backend y `lib/roles.ts`) **junto con** el
  recorte por alcance, nunca antes (si no, vería los de toda la empresa).
- Configuración y campañas siguen solo para el Administrador.

### Tareas

1. **`resolverAlcance(tenantId, actor)`** (propuesta: `features/users/user-scope.service.ts`, sin ciclo de
   imports con `conversation.service`, que ya importa `user.service`):
   - Devuelve `{ tipo: 'empresa' } | { tipo: 'equipo', userIds: string[] } | { tipo: 'propio', userId }`.
   - Coordinador: `userIds` = él + asesores con `coordinadorId` = él, leídos de BD en cada petición
     (`findScoped(User, { coordinadorId })`, indexado). No va en el JWT: mover un asesor tiene efecto
     inmediato.
   - Helper `filtroPorAlcance(alcance, campo)` → `{}` | `{ [campo]: { $in: [...ids, null] } }` |
     `{ [campo]: { $in: [id, null] } }` (el `null` = sin asignar, visible para todos según la decisión).
2. **Aplicarlo** (los controllers pasan el actor; los services reciben el alcance ya resuelto):
   - `conversation.service.ts`: `buildFiltro` (filtros `todos|mios|sin_asignar|sofi` + `asignadoA`),
     `listConversations`, `getThread`, `getConversationOverview`, `markRead`, `setIaHabilitada`,
     `setConversationTags`, `reply*`, `generateConversationSummary`, `assignConversation` (el coordinador
     solo asigna a su equipo; el asesor solo se auto-asigna o desasigna lo suyo) y `listAssignments`.
     Una conversación fuera de alcance → **404** (no 403: no revelar que existe).
   - `lead.service.ts` sobre `Lead.responsableId`: `listLeads`, `getLeadById`, `updateLeadEstado`,
     `updateLeadSemaforo`, `deleteLead`, historiales. `?asesor=` fuera de alcance → página vacía.
   - `pipeline.service.ts` `getPipeline` (mismo filtro que leads).
   - `cliente.service.ts` sobre `Cliente.asesorId`: `getContactHistory`, `updateCliente`,
     `extractContactData`, `confirmarDatosExtraidos`.
   - `pendiente.service.ts` (`listPendientes`, `generarReportePendientes`) y `contact-note.service.ts`:
     acotar por el cliente de la nota.
   - `reports.service.ts`: reporte por asesor y tiempo activo acotados al equipo para el coordinador
     (hoy `findScoped(User, tenantOid, {})` trae a todos).
   - Ojo: `Lead.responsableId` y `Cliente.asesorId` pueden divergir; cada módulo usa su campo. Unificarlos
     está fuera de alcance.
3. **Rooms de tiempo real** (`realtime/socket.gateway.ts` + `realtime/realtime.publisher.ts`):
   - Hoy casi todo se emite a `tenant:<id>` (`realtime.publisher.ts`: `conversation:assigned` reemitido
     como `conversation:updated`, y el `io.to('tenant:…')` final para `message:new`, `message:updated`,
     `conversation:updated`, `conversations:reassigned`, `lead:stage-changed`). Con alcance eso filtraría
     vistas previas ajenas a los asesores.
   - Propuesta: al conectar, administrador → `tenant:<id>:admins`; coordinador → `equipo:<id>`; todos →
     `asesor:<id>`. El publisher calcula destinos con el `asesorId` de la conversación y el
     `coordinadorId` de ese asesor; las **sin asignar** van a todo el tenant. Eventos de catálogo
     (`template:status-updated`, `campaign:progress`) pueden seguir en `tenant:<id>`.
   - Al mover un asesor de equipo (`user.coordinator_changed`/`user.team_moved`), emitir algo como
     `team:changed` para que ambos coordinadores invaliden queries (y re-unir sockets al room correcto o
     desconectar para que reconecten).
4. **Endpoint `GET /api/users/asignables?rol=&coordinadorId=`**: usuarios que el actor puede ver/asignar
   según su alcance, con `rolEmpresa`, `coordinadorId` y `coordinadorNombre`. `GET /api/users` (selector
   actual, abierto a todos) se recorta o se reemplaza por este.
   - Consumidores en frontend (hoy todos vía `features/users/hooks/useTenantUsers.ts`): `inbox/AssignMenu`,
     `inbox/InboxFilters`, `leads/LeadsFilters`, `handoff/HandoffSettingsForm`, `flows/NodeInspector`,
     `users/pages/UsersPage` (destinos al desactivar).
5. **Bandeja y filtros de leads (frontend):**
   - `AssignMenu`: destinos según alcance, agrupados por rol ("Nombre · Rol"; ya muestra el rol).
   - `InboxFilters` "Asignado a": según alcance; ocultarlo para el asesor.
   - Sidebar de la bandeja (`components/layout/nav-config.ts`, hijos Todos/Míos/Sin asignar/Sofi): para
     el asesor "Todos" sobra o se renombra.
   - `LeadsFilters` "Responsable": según alcance con etiqueta de rol.
   - Invalidar queries ante `team:changed`.
6. **Tests** (en la línea de los de aislamiento multi-tenant, `docs/multi-tenancy.md` §8):
   - Visibilidad entre equipos: el coordinador A no ve/abre/asigna conversaciones, leads, clientes,
     notas ni pendientes del equipo B (404 / página vacía); sí lo suyo, lo de su equipo y lo sin asignar.
   - Entre roles: el asesor no ve lo de otro asesor; el administrador ve todo.
   - Asignación: coordinador → asesor ajeno 404; asesor → otro usuario 403/404.
   - Tiempo real: un evento de una conversación del equipo B no llega al socket del coordinador A ni a
     un asesor ajeno (test del publisher con `io` simulado).
   - Mover un asesor de equipo cambia la visibilidad en la siguiente petición.
   - Datos sensibles/reportes del coordinador acotados a su equipo.

### Casos borde a cubrir en la spec

- Empresa sin coordinadores; coordinador sin asesores (ve lo suyo y lo sin asignar).
- Asesor reasignado mientras el coordinador anterior tiene la conversación abierta → 404 en la siguiente
  petición + refresco por `team:changed`.
- Notificaciones (`features/notification`): **sin verificar** quién recibe hoy los avisos de
  transferencia; alinearlo con el alcance.
- Conversaciones que hoy tienen asignadas administradores o coordinadores: las conservan.

## 3. Fase 3 · Selectores, transferencia y reportes (después de AUTH-05)

- **Transferencia de la IA** (`features/ai/ai-handoff.service.ts`, `features/handoff/components/HandoffSettingsForm.tsx`):
  `asesorConMenorCarga` y `metricasPorAsesor` hoy usan `listTenantUsers({ rol: 'admin' })` (todos los
  usuarios). Nuevas estrategias: "menor carga" solo entre **asesores**; `menor_carga_equipo` +
  `coordinadorDestinoId`; "usuario específico" agrupado por rol; "El primero del equipo" solo asesores.
  Sin candidatos → sin asignar + aviso a administradores.
- **"Ver asignación"** (`features/handoff/components/AsignacionDialog.tsx`, está en Asistente →
  Transferencia, no en el Dashboard): columna "Asesor" → "Usuario" con "Nombre · Rol"; filtro por rol y
  coordinador, "solo asesores" por defecto.
- **Reportes → Tiempo activo** (`features/reports/components/AdvisorActivityChart.tsx`,
  `hooks/use-activity-params.ts`, `reports.service.ts` HU-REP-06): selector agrupado "Todos los roles",
  "Todos los administradores/coordinadores/asesores", "Equipo de X" e individuales; backend
  `grupo` + `coordinadorId` + `asesorId`.
- **Reportes → Detalle por asesor** (`features/reports/components/AdvisorTable.tsx`): columna "Usuario"
  (nombre + rol) + "Coordinador"; filtros por rol, coordinador, búsqueda e inactivos; KPIs
  (`AdvisorKpiStrip`) recalculados con el mismo filtro. Backend: `rolEmpresa`, `coordinadorId`,
  `coordinadorNombre` en cada fila.
- **Flujos** (`features/flows/components/NodeInspector.tsx`, efecto `asignar_asesor`): selector con
  etiqueta de rol.

## 4. Comandos y reglas útiles

- Backend: `pnpm --filter @sofiapp/api typecheck` · `pnpm --filter @sofiapp/api test`.
- Frontend: `pnpm --filter @sofiapp/web build && pnpm --filter @sofiapp/web lint`; tests:
  `pnpm vitest run --exclude "**/KnowledgeBasePage.test.tsx" --exclude "**/node_modules/**"` (en `apps/frontend`).
- Skills de diseño: solo está instalada `frontend-design:frontend-design`; `emil-design-eng` e
  `impeccable` no existen (aplicar sus criterios a mano y anotarlo en `tasks.md`).
- `/sdd-spec`, `/sdd-implement` y `/sdd-release` los invoca el usuario (no se pueden lanzar con la
  herramienta Skill).
