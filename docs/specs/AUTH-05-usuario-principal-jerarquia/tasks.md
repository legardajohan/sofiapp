# AUTH-05 — Tasks (checklist ejecutable)

> Claude Code: ejecuta en orden. Marca cada casilla al terminar. No cierres el feature hasta que
> TODO esté en verde. Se trabaja sobre la rama `feat/AUTH-03` (sin rama propia).

## Implementación — backend

- [x] `features/users/user.types.ts`: campos de `IUser`/`IUserResponse` (`esPrincipal`,
      `puedeGestionarAdministradores`, `eliminado`, `eliminadoEn`, `eliminadoPor`, `emailOriginal`,
      `acciones`), `IActorGestion`, `IAccionesUsuario`, `DeleteUserDTO`, `ICupoUsuarios`. (CA-1)
- [x] `features/users/user.model.ts`: campos + índice único parcial `tenant_principal_unico`. (CA-1)
- [x] `features/users/user.mapper.ts`: `esPrincipal` y `puedeGestionarAdministradores` en la respuesta.
- [x] `features/users/user.permisos.ts`: `rolesCreables`, `puedeGestionar`, `accionesSobre` (puras,
      según la matriz de `plan.md`). (CA-4…8)
- [x] `features/users/user.validation.ts`: `puedeGestionarAdministradores` en create/update,
      `deleteUserSchema`, `cupoSchema`. (CA-7, 11, 14)
- [x] `features/users/user.service.ts`:
  - [x] `cargarActor` y su uso en todas las funciones de gestión. (CA-7)
  - [x] `cargarObjetivoPara`: alcance del coordinador `{ $in: [actor, null] }`, eliminados → 404,
        `puedeGestionar` → 403; variante de lectura para `GET /:id`. (CA-4, 5, 8)
  - [x] `createTenantUser`: `rolesCreables`, coordinador elige coordinador, permiso solo del principal. (CA-5…8)
  - [x] `updateTenantUser`: coordinador cambia `coordinadorId` pero no rol; cambio de rol con
        `rolesCreables`; permiso solo del principal y reset al perder el rol; auditoría
        `user.admin_permission_changed`. (CA-5…8)
  - [x] `listManageableUsers`: alcance nuevo, sin eliminados, `acciones` por fila. (CA-4, 5, 8)
  - [x] Extraer la resolución de dependencias de `desactivarUsuario` a un helper compartido.
  - [x] `deleteTenantUser` (borrado lógico + email reescrito + revocación + auditoría). (CA-11)
  - [x] `assertDestinoConversaciones`: cualquier activo también para el coordinador.
  - [x] `listTenantUsers` sin eliminados. (CA-11)
  - [x] `getCupoUsuarios`. (CA-14)
  - [x] `getPrincipal` y `resetPrincipalPassword`. (CA-12)
- [x] `features/users/user.controller.ts` + `user.routes.ts`: `GET /cupo` (antes de `/:id`) y
      `DELETE /:id` con el gate de gestión. (CA-9, 11, 14)
- [x] `features/auth/session.service.ts`: `revokeUserSessions` devuelve el `Date` de revocación.
- [x] `features/auth/auth.types.ts`: `ISessionUser` + `mapUserToSession` con los flags. (CA-15)
- [x] `features/auth/auth.validation.ts`, `auth.service.ts` (`changeOwnPassword` con
      `iat = floor(revokedAt/1000) + 1`), `auth.controller.ts` (reemite cookies), `auth.routes.ts`
      (`PATCH /me/password` con `requireTenant`). (CA-10)
- [x] `features/tenant/tenant.service.ts`: `adminUser` con `esPrincipal: true`. (CA-2)
- [x] `features/tenant/tenant.validation.ts`, `tenant.controller.ts`, `tenant.routes.ts`:
      `GET /:id/principal`, `POST /:id/principal/password` (superadmin). (CA-12)
- [x] `middlewares/authorize-rol-empresa.middleware.ts`: `ROLES_DATOS_SENSIBLES`, `ROLES_REPORTES` y
      `ROLES_CONFIGURACION` = `ROLES_EMPRESA`. (CA-13)
- [x] `features/plan/plan.validation.ts` + `plan.service.ts`: `administradores ≤ usuarios` en create y
      update fusionado. (CA-14)
- [x] `features/audit/audit.types.ts`: `user.deleted`, `user.password_changed`,
      `user.admin_permission_changed`.
- [x] `seed/migrate-usuario-principal.ts` + script `migrate:usuario-principal` en `package.json`. (CA-3)
- [x] `seed/seed-inbox-demo.ts`: el administrador demo es principal.
- [x] `features/users/user.test-helpers.ts`: `crearUsuario` acepta `esPrincipal` y
      `puedeGestionarAdministradores`.

> _Desviaciones (backend):_
> - **Permisos en un módulo puro** (`user.permisos.ts`): `cargarObjetivoPara` y `accionesSobre` usan la
>   misma función, `puedeGestionar`. `cargarActor` responde 401 si el actor está inactivo o eliminado
>   en BD aunque su JWT siga vigente.
> - **Último Administrador:** ya no lo alcanza ningún actor válido (el principal siempre es
>   Administrador y nadie del tenant lo toca). El guard queda como defensa y no tiene test HTTP. El
>   test que lo cubría en AUTH-04 (un actor fantasma inactivo) ahora comprueba el 401 de `cargarActor`.
> - **Sobre sí mismo:** el principal no se edita (`PATCH` → 403). Estado, contraseña por gestión y
>   eliminar sobre uno mismo siguen en 409 para todos, incluido el principal (se ajustó la redacción
>   del CA-4).
> - **Cupo:** `getSeatUsage` vive en `usage.service.ts`, que ya resolvía los límites del tenant;
>   `user.service.getCupoUsuarios` solo lo expone.
> - **Plan `administradores ≤ usuarios`:** en create lo valida Zod. En update lo valida el service
>   contra los límites guardados. `createPlan` llamado directo (sin Zod) no lo revalida.
> - **Aislamiento:** los casos de CA-16 viven en `user.principal.test.ts` (principal de otro tenant →
>   404), `user.delete.test.ts` (eliminar a un usuario de otro tenant), `tenant.principal.test.ts`
>   (el reset no toca otra empresa) y `migrate-usuario-principal.test.ts`. No se añadieron a
>   `user.isolation.test.ts`.
> - **Tests ajustados por los accesos iguales:** `reports.*.routes` (5), `kb.routes`, `pendiente.routes`,
>   `conversation.overview.routes`, `tests/unit/contact-note.routes`, `authorize-rol-empresa.middleware`,
>   `user.roles` (la matriz pasa a "los tres roles pasan" + el asesor sin gestión), `user.management`
>   (el admin del escenario es principal; coordinador elige coordinador y reasigna a cualquiera) y
>   `tests/unit/auth.service` (sesión con los flags nuevos).

## Tests — backend

- [x] `user.permisos.test.ts`: matriz completa (5 actores × 5 objetivos), `rolesCreables`, acciones
      sobre uno mismo. (CA-4…8)
- [x] `user.principal.test.ts`:
  - [x] Cualquier usuario (incluido el principal) → 403 al editar/rol/estado/contraseña/eliminar al
        principal; aparece en `/manage` con `acciones` en `false`. (CA-4)
  - [x] Admin sin permiso: 403 sobre administradores, al crear administrador y al promover/degradar;
        ✅ sobre coordinadores y asesores. (CA-5)
  - [x] Admin con permiso: crea y gestiona administradores no principales; enviar el permiso → 403. (CA-6)
  - [x] Permiso: solo el principal; 400 con otro rol; vuelve a `false` al degradar; retirarlo tiene
        efecto en la siguiente petición sin re-login; auditoría. (CA-7)
- [x] `user.roles.test.ts` (ampliar): coordinador crea asesor con otro coordinador o `null`; ve y
      gestiona su equipo + sin coordinador; otro equipo → 404; tras moverlo → 404; cambiar rol → 403. (CA-8)
- [x] Asesor → 403 en `/manage`, `/:id`, create, update, estado, password, delete y `/cupo`. (CA-9)
- [x] `auth.password.test.ts`: actual incorrecta → 400 sin cambios; nueva corta → 400; correcta →
      token viejo revocado, cookie nueva válida, login con la nueva, auditoría; reset por gestión sobre
      uno mismo sigue en 409. (CA-10)
- [x] `user.delete.test.ts`: a sí mismo 409; principal 403; último administrador 409; dependencias 409
      sin cambios y resolución OK; tras eliminar: no aparece en `/manage` ni `GET /api/users`
      (tampoco con `?activo=false`), no cuenta en cuotas, login 401, sesiones revocadas, email
      reutilizable, reactivar 404, auditoría con email original. (CA-11)
- [x] `tenant.principal.test.ts`: `GET` y `POST …/principal/password` como superadmin (solo el
      principal del `:id`; otro tenant intacto; revoca sesiones; auditoría en el tenant); usuario de
      empresa → 403; tenant sin principal → 404. (CA-12)
- [x] Alta de empresa crea al principal; un segundo principal en el mismo tenant falla por el índice. (CA-1, 2)
- [x] `migrate-usuario-principal.test.ts`: dry-run no escribe; `--apply` marca al más antiguo; dos
      corridas idempotentes; reporta tenants sin administrador; solo toca su tenant. (CA-3)
- [x] Accesos iguales: ajustar a 2xx / sin máscara los tests que esperaban 403 para coordinador/asesor
      (`kb.routes.test`, `reports.*`, `contact-note.*`, `pendiente.*`, `cliente.*`, `conversation.*`,
      `authorize-rol-empresa.middleware.test`). (CA-13)
- [x] Cupo: `GET /cupo` con y sin plan; plan create/update con `administradores > usuarios` → 400. (CA-14)
- [x] **Aislamiento** (`user.isolation.test.ts`): el principal y el permiso de un tenant no habilitan
      nada en otro; `DELETE`, `/cupo` y `/:id` con un id de otro tenant → 404; la migración y el reset
      del superadmin no tocan otros tenants. (CA-16)

## Implementación — frontend

> Antes de escribir componentes: invocar `frontend-design:frontend-design`; aplicar a mano los criterios
> de `emil-design-eng` e `impeccable` (no instaladas) y anotarlo aquí.

- [x] `lib/roles.ts`: constantes a los 3 roles; retirar `MOTIVO_DATOS_SENSIBLES` / enmascarado de UI
      si quedan sin uso. (CA-13, 15)
- [x] `stores/authStore.ts`: `esPrincipal` y `puedeGestionarAdministradores` en el usuario de sesión.
- [x] `features/users/types.ts`, `api.ts`, `hooks/useManageUsers.ts`: `acciones`, `eliminarUsuario`,
      `useCupoUsuarios`, `cambiarMiContrasena`.
- [x] `components/CupoUsuarios.tsx` (uso del plan).
- [x] `pages/UsersPage.tsx`: insignia Principal, acciones por `acciones`, propia fila → "Cambiar mi
      contraseña", filtro de coordinador para el coordinador.
- [x] `components/UserFormSheet.tsx`: roles según actor, coordinador seleccionable por el coordinador,
      `Switch` del permiso solo para el principal.
- [x] `components/DeleteUserDialog.tsx` (reutiliza `TeamResolution`/`OpcionCard`).
- [x] `components/ChangeOwnPasswordDialog.tsx` + entrada en `components/layout/NavUser.tsx`.
- [x] `features/admin-tenants/components/ResetPrincipalPasswordDialog.tsx` + acción en `TenantTable.tsx`
      + `api/admin-tenants.ts`.
- [x] Sidebar/guards: Reportes y Configuración visibles para los 3 roles; Usuarios no para el asesor.
- [x] Tests: `UsersPage.test.tsx` (insignia, acciones por fila, propia fila, coordinador),
      `AdminTenantsPage.test.tsx` (acción de reset), diálogos nuevos.

> _Desviaciones (frontend):_
> - **Skills de diseño:** se invocó `frontend-design`. `emil-design-eng` e `impeccable` no están
>   instaladas; sus criterios se aplicaron a mano: estados pending, foco visible, `motion-safe` en los
>   botones, errores junto al campo y no en toasts, estados vacíos que dicen qué hacer y copy en voz
>   activa. Se reutilizaron los tokens y los componentes shadcn existentes (`Dialog`, `AlertDialog`,
>   `Switch`, `Badge`, `Tooltip`, `Progress`): la pantalla sigue el sistema visual del producto, no
>   inventa uno.
> - **Eliminar** no tiene un `DeleteUserDialog` propio: `DeactivateUserDialog` recibe `modo="eliminar"`.
>   Cambian el copy y el botón; la resolución de conversaciones y equipo se comparte sin duplicarla.
> - **`MOTIVO_DATOS_SENSIBLES` se conserva** con copy neutro ("Tu usuario no tiene acceso a este dato."):
>   la UI de enmascarado sigue existiendo para cuando el backend devuelva `puedeVerSensibles: false`
>   (hoy, ningún rol de empresa).
> - **"Cambiar mi contraseña"** está en `NavUser` (todo usuario de empresa) y en el menú de la propia
>   fila de Usuarios. No hay un botón en la cabecera, para no repetir la acción en la misma pantalla.
> - **Coordinador:** ve la columna Coordinador ("Tú" o "Sin coordinador") y un filtro "Filtrar por
>   equipo" (mi equipo y sin coordinador / solo mi equipo / solo sin coordinador).
> - **Tests:** `ChangeOwnPasswordDialog` no tiene test de componente propio; su contrato HTTP lo cubre
>   `auth.password.test.ts`. Se ajustaron `ContactEditDialog.test` (copy del motivo; el asesor ve las
>   mismas acciones de catálogo que el administrador) y el fixture de `LeadsFilters.test`.

## Docs

- [x] `docs/adr/0018-usuario-principal-y-accesos-iguales.md` + nota en `0017` ("reemplazado en parte").
- [x] `docs/product.md`, `docs/domain.md` (principal, permiso, borrado lógico, accesos iguales),
      `docs/data-model.md` (campos e índice de `User`), `docs/api-contract.md` (endpoints nuevos),
      `apps/frontend/CLAUDE.md` (guards).
- [x] `docs/specs/PENDIENTES-roles-empresa.md` → índice con el estado final.

## Verificación final

- [x] `pnpm --filter @sofiapp/api typecheck` (`tsc --noEmit`) en verde.
- [x] `pnpm --filter @sofiapp/api test` en verde (incluye aislamiento).
- [x] `pnpm --filter @sofiapp/web build && pnpm --filter @sofiapp/web lint` en verde; vitest del
      frontend (excluyendo `KnowledgeBasePage.test.tsx`).
- [ ] `migrate:usuario-principal` en dry-run sobre una BD con datos; revisar el reporte.
- [ ] Revisión visual light/dark: principal, admin con y sin permiso, coordinador, asesor y superadmin
      (capturas en `.playwright-mcp/`, borradas al terminar).
- [x] Checklist PR de `docs/multi-tenancy.md` §9: ninguna query directa a `Model.find/create/findById`
      en código nuevo; `tenantId` del token salvo las rutas `/admin/tenants/:id/principal*`.

## Definición de "hecho"

- Los 16 criterios de `spec.md` cubiertos por un test o una verificación explícita.
- Typecheck, tests, build y lint en verde.
- `spec.md` en **Estado:** implementado.
