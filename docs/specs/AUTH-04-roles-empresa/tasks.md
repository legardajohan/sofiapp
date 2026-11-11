# AUTH-04 — Tasks (checklist ejecutable)

> Claude Code: ejecuta en orden. Marca cada casilla al terminar. No cierres el feature hasta que
> TODO esté en verde. Se trabaja sobre la rama `feat/AUTH-03` (sin rama propia).

## Implementación — backend

- [x] `features/users/user.types.ts`: `ROLES_EMPRESA`, `RolEmpresa`, `SUBROLES_LEGADOS`,
      `MAPEO_SUBROL_LEGADO`, DTOs con `rolEmpresa`/`coordinadorId`/`equipo`, `MoverEquipo`,
      `IManageUsersQuery`, `USER_HAS_DEPENDENCIES` (sustituye a `USER_HAS_ASSIGNED_CONVERSATIONS`).
- [x] `features/users/user.rol-empresa.ts`: `resolverRolEmpresa` (única tabla de traducción).
- [x] `features/users/user.model.ts`: `rolEmpresa` (required si `rol === 'admin'`), `coordinadorId`,
      índices `{ tenantId, coordinadorId }` y `{ tenantId, rolEmpresa, activo }`; fuera `subrol`.
- [x] `features/users/user.mapper.ts`: `rolEmpresa` (vía `resolverRolEmpresa`) y `coordinadorId`.
- [x] `types/express.d.ts` + `features/auth/auth.types.ts` + `auth.service.ts`: `rolEmpresa` en
      `SafeUser`, `ISessionUser` y el JWT.
- [x] `middlewares/authenticate-jwt.middleware.ts` y `realtime/socket.gateway.ts`: traducción de claims viejos.
- [x] `middlewares/authorize-rol-empresa.middleware.ts`: constantes `ROLES_*`, `authorizeRolEmpresa`,
      `tieneRolEmpresa`, `puedeVerDatosSensibles`. Borrar `authorize-subrol.middleware.ts` y su test.
- [x] Gates de datos sensibles y reportes: `contact-note.routes`, `pendiente.routes`, `reports.routes`,
      `conversation.routes` (`/:id/summary`) y los controllers de `cliente`, `conversation`, `lead`, `pipeline`.
- [x] Gates de configuración según la tabla de `plan.md` (16 routers). **Antes** de cerrar una lectura,
      `grep` de su endpoint en `apps/frontend/src/features/{inbox,leads,contacts,pipeline,clientes}`; si
      la usa la operación, queda abierta y se anota aquí.
- [x] `features/users/user.validation.ts`: create/update/manage/estado con `rolEmpresa`, `coordinadorId`, `equipo`.
- [x] `features/users/user.service.ts`: `UserActor` con `rolEmpresa`; `cargarObjetivoPara`,
      `assertCoordinadorValido`, `assertNoUltimoAdministrador`, `contarDependencias`, `moverEquipo`;
      reglas del coordinador en create/update/estado/password; 409 `USER_HAS_DEPENDENCIES`; cuotas por rol;
      auditoría `user.role_changed`, `user.coordinator_changed`, `user.team_moved`.
- [x] `features/users/user.routes.ts`: gate `ROLES_GESTION_USUARIOS`.
- [x] `features/audit/audit.types.ts`: acciones nuevas y renombrada.
- [x] `features/usage/usage.service.ts`: cuota `administradores` = `rolEmpresa: 'administrador'` activos.
- [x] `features/tenant/tenant.service.ts`: usuario inicial `rolEmpresa: 'administrador'` vía
      `createScoped(User, tenantId, …, { session })`.
- [x] `seed/migrate-roles-empresa.ts` (`--dry-run`, `--unset-legacy`, idempotente, scoped por tenant) +
      script en `package.json` (`migrate:roles-empresa`).
- [x] `seed/seed-inbox-demo.ts`: usuarios demo (1 administrador, 1 coordinador, 2 asesores, uno de ellos sin coordinador).
- [x] `grep -rn "subrol" apps/backend/src` solo en legado/migración/traducción y sus tests.

> _Desviaciones (backend):_
> - **Etiquetas:** `POST /api/tags` sigue abierto a todo rol, porque la bandeja crea etiquetas en línea a
>   propósito (`TagSelector`, HU-OMNI-04). Editar y borrar etiquetas sí es solo del Administrador.
> - **Migración:** por defecto es dry-run (como `migrate-plan-fields`); escribe con `--apply` y borra
>   `subrol` con `--unset-legacy`. El `$unset` va por `User.collection` con el `tenantId` fijado, porque
>   Mongoose descarta el `$unset` de un path que ya no está en el schema aunque se pase `strict: false`.
> - **Seed demo:** el equipo demo (`demo-1234`) se crea con el modelo y `tenantId` explícito, como el
>   resto de `seed-inbox-demo.ts`.
> - **Fixtures de tests:** se ajustaron 34 archivos de test y fixtures; sobre todo, los usuarios creados sin rol ahora pasan
>   `rolEmpresa: 'administrador'`; los tests que firman JWT con `subrol` siguen sirviendo gracias a la
>   traducción. `kb.routes.test` ahora espera 403 para coordinador/asesor (la KB es configuración).

## Implementación — frontend

> Antes de escribir componentes: invocar `emil-design-eng`, `impeccable:impeccable` y
> `frontend-design:frontend-design` (las instaladas; anotar las que falten).
> _En esta sesión solo está instalada `frontend-design` (invocada); `emil-design-eng` e `impeccable` no
> existen y sus criterios (estados de pending/foco, `motion-safe`, estados vacíos, copy) se aplicaron a mano._
>
> _Desviaciones (frontend):_
> - "Cambiar coordinador" vive en **Editar** (el `Sheet` muestra el selector de coordinador al elegir
>   Asesor), no en una acción aparte del menú.
> - El bloque compartido `OpcionCard` (tarjeta de opción con radio) sale de `DeactivateUserDialog` y lo
>   reusan el selector de rol y `TeamResolution`.
> - Gestión de catálogos en pantallas operativas oculta a quien no es Administrador: gestores de
>   opciones y de campos en `ContactEditDialog`/`AtributosEditor`, y `NuevoEstadoDialog`/`SemaforosDialog`
>   en `LeadsFilters`.
> - `RequireConfiguracion` envuelve 15 rutas: `/settings/*` (salvo users), `/flows`, `/campanas`,
>   `/etapas`, `/etiquetas`.

- [x] `stores/authStore.ts`, `features/auth/api.ts`, `LoginPage.tsx`, `AuthBootstrap.tsx`: `rolEmpresa`.
- [x] `lib/roles.ts`: `ROL_EMPRESA_LABEL`, `rolLabel`, `ROLES_*` y helpers gemelos del backend.
- [x] Guards `RequireReportes`, `RequireGestionUsuarios`, `RequireConfiguracion` (nuevo) y `router.tsx`.
- [x] `nav-config.ts` + `AppSidebar.tsx`: `rolesEmpresa` en lugar de `subroles`.
- [x] `features/users`: types, api, hooks; `UserFormSheet` (rol + coordinador), `TeamResolution`,
      `DeactivateUserDialog` (409 `USER_HAS_DEPENDENCIES`), `ChangeRoleDialog`, `UsersPage` (columnas,
      filtros, vista de coordinador, "Cambiar coordinador").
- [x] Bandeja: `AssigneeBadge`, `AssignMenu`, `ConversationList`, `inbox/types.ts` con "Nombre · Rol".
- [x] `contacts/lib/errors.ts` y `reports/pages/AdvisorReportPage.tsx`: copy y gate por `rolEmpresa`.
- [x] `grep -rn "subrol\|AdminSubrol" apps/frontend/src` = 0.
- [ ] Revisión visual en light y dark de `/settings/users` (administrador y coordinador) y de la bandeja.
      **Pendiente:** en esta sesión no hay MongoDB ni Redis locales para levantar el backend. Los
      componentes usan solo shadcn/ui y tokens semánticos.

## Docs

- [x] `docs/adr/0017-roles-de-empresa.md` (contexto, decisión, tabla de traducción, matriz, despliegue en pasos).
- [x] `docs/adr/README.md` + marcar 0006, 0011 y §1 de 0016 como reemplazados por 0017.
- [x] `docs/product.md` (tabla de roles), `docs/domain.md` (Usuario, Coordinador, Equipo),
      `docs/data-model.md` (`users.rolEmpresa`, `coordinadorId`, índices), `docs/api-contract.md`
      (endpoints de usuarios, 409 `USER_HAS_DEPENDENCIES`), `apps/frontend/CLAUDE.md` (RBAC).

## Tests (Vitest)

- [x] `user.rol-empresa.test.ts`: tabla completa de traducción (incluye sin subrol y valor desconocido).
- [x] `authorize-rol-empresa.middleware.test.ts`: 403 por rol; token viejo con `subrol` traducido.
- [x] `user.roles.test.ts` (matriz): por cada rol, notas/pendientes/summary/reportes/config escritura →
      200 o 403 esperado; lecturas operativas (etiquetas, etapas, campos, opciones, semáforos, plantillas) → 200 para asesor.
- [x] `user.management.test.ts`:
  - [x] Administrador: alta de cada rol; asesor con coordinador válido, inactivo (404) o no-coordinador (404);
        `coordinadorId` con rol ≠ asesor → 400.
  - [x] Coordinador: `/manage` solo su equipo; `GET /:id` de otro equipo → 404; crear coordinador → 403;
        crear asesor sin `coordinadorId` → nace en su equipo; con otro `coordinadorId` → 403; editar rol → 403;
        desactivar asesor de su equipo reasignando a otro de su equipo → OK, a uno ajeno → 404.
  - [x] Asesor: 403 en todos los endpoints de gestión; `GET /api/users` → 200.
  - [x] Equipos: mover asesor entre coordinadores y liberarlo (auditoría, sin revocar sesión);
        promover asesor a coordinador limpia `coordinadorId`.
  - [x] Dependencias: desactivar coordinador con equipo sin `equipo` → 409 con `asesores`; con `liberar` y
        `reasignar` → cero asesores apuntando a él; degradar coordinador con equipo → mismo 409.
  - [x] Último Administrador: desactivar o degradar → 409.
  - [x] Cuotas: promover a administrador sin cupo → 429; crear asesor sin cupo de administradores → OK.
- [x] `user.management.isolation.test.ts`: `coordinadorId` y `coordinadorDestinoId` de otro tenant → 404;
      un coordinador del tenant A no ve ni toca usuarios del tenant B.
- [x] `migrate-roles-empresa.test.ts`: dry-run no escribe; mapeo correcto; idempotencia; `--unset-legacy`;
      solo toca usuarios del tenant procesado; reporta destinos de transferencia/flujos afectados.
- [x] `tenant.service` test: el usuario inicial nace `administrador`.
- [x] `usage.service` test: `administradores` cuenta solo administradores activos.
- [x] Tests existentes que firman JWT con `subrol` siguen en verde por la traducción (ajustar solo los
      que esperaban acceso de `manager` a gestión de usuarios o de `coordinator` a algo que ahora cierra).
- [x] Frontend `UsersPage.test.tsx`: vista de coordinador (sin filtros de rol/coordinador, alta sin rol),
      flujo del 409 con equipo, acciones ocultas sobre uno mismo.

## Verificación final

- [x] `pnpm --filter @sofiapp/api typecheck` sin errores.
- [x] `pnpm --filter @sofiapp/api test` en verde.
- [x] `pnpm --filter @sofiapp/web build && pnpm --filter @sofiapp/web lint` en verde.
- [x] Tests del frontend en verde: 109 archivos / 1071 tests excluyendo `KnowledgeBasePage.test.tsx`,
      que se cuelga también sobre `develop` (preexistente, ajeno a AUTH-04).
- [ ] `migrate:roles-empresa` (dry-run) sobre una BD con datos reales, salida revisada. **Pendiente:** sin
      BD local en esta sesión; la migración está cubierta por `migrate-roles-empresa.test.ts`.
- [x] Checklist de PR de `docs/multi-tenancy.md` §9 revisado.
- [x] `git status` sin capturas `*.png`/`*.jpg` ajenas al cambio.

## Definición de "hecho"

Cada empresa tiene solo Administradores, Coordinadores y Asesores. El Administrador gestiona a todo el
equipo y reparte asesores entre coordinadores; el Coordinador gestiona solo a sus asesores; el Asesor no
gestiona a nadie ni configura nada. Los usuarios existentes quedan migrados con un rol que no les da más
permisos de los que tenían, nadie pierde la sesión al desplegar y ningún asesor queda colgado de un
coordinador inactivo.
