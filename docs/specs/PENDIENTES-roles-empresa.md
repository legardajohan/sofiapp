# Pendientes — reestructuración de roles (AUTH-04 → AUTH-05)

> **Estado al 2026-11-11:** AUTH-05 está **implementado** (`docs/specs/AUTH-05-usuario-principal-jerarquia/`,
> ADR 0018), commiteado (`9bb400b`…`8cbdd84`). Este archivo queda como índice de decisiones. Pendientes reales:
> - [ ] `/sdd-release` de AUTH-03, AUTH-04 y AUTH-05 (los pide el usuario).
> - [ ] Sobre una BD con datos reales: `migrate:roles-empresa` y luego `migrate:usuario-principal`
>       (ambas en dry-run primero). Sin la segunda, las empresas existentes no tienen principal.
> - [ ] Revisión visual light/dark de `/settings/users` (principal, admin con y sin permiso,
>       coordinador) y del panel de Empresas.
> - [ ] Fase 3 (en pausa): ver §1.

> Nota de traspaso (actualizada el 2026-11-11). No es una spec SDD: es el contexto aprobado para
> lanzar `/sdd-spec AUTH-05-usuario-principal-jerarquia`. Al crearse esa spec, este archivo puede
> borrarse o quedarse como índice.

## 0. Estado actual

- **Rama:** todo se trabaja en `feat/AUTH-03`, **sin crear ramas nuevas** (pedido del usuario; omitir el
  paso "crear rama `feat/<ID>`" de `/sdd-implement`).
- **AUTH-03** (gestión de usuarios + revocación de sesión): commits `f1f2d06`…`d0576fe`.
- **AUTH-04** (roles de empresa): commits `b510ebb`…`c251a5e` (2026-11-11). `spec.md` en `implementado`.
- Nada pusheado ni mergeado a `develop`. `/sdd-release` de AUTH-03 y AUTH-04 cuando el usuario lo pida.

### Pendientes que arrastra AUTH-04

- [ ] Revisión visual light/dark de `/settings/users` (como Administrador y como Coordinador).
- [ ] `pnpm --filter @sofiapp/api migrate:roles-empresa` (dry-run) sobre BD con datos reales; luego
      `--apply`; tras deploy y ≥ 8 h, `--unset-legacy`.

## 1. Cambio de rumbo (2026-11-11)

**Se cancela la visibilidad por equipo** que iba a ser AUTH-05 (`resolverAlcance`, rooms por equipo,
`/users/asignables` recortado, filtros de bandeja/leads por alcance). Los tres roles ven y hacen lo
mismo en todo el producto; **la única diferencia es la pestaña Usuarios**.

- El **Asesor** tiene acceso a todo (Configuración, Campañas, Reportes, datos sensibles sin enmascarar)
  **excepto Usuarios**.
- Implica abrir a los tres roles `ROLES_DATOS_SENSIBLES`, `ROLES_REPORTES` y `ROLES_CONFIGURACION`
  (backend `middlewares/authorize-rol-empresa.middleware.ts` y frontend `lib/roles.ts`, guards
  `RequireReportes`/`RequireConfiguracion`, `nav-config.ts`). Evaluar si conviene eliminar esos gates en
  vez de listar los tres roles; `ROLES_GESTION_USUARIOS` (`administrador`, `coordinador`) se mantiene.
- La fase 3 anterior (estrategias de transferencia por rol, "Ver asignación", filtros de reportes por
  rol/coordinador, etiqueta de rol en selectores) queda **en pausa**: revisar con el usuario si sigue
  aplicando sin el alcance por equipo.

## 2. AUTH-05 · Usuario principal y jerarquía de gestión — decisiones aprobadas

### Usuario principal

- Es el Administrador que crea el superadmin al dar de alta la empresa (`tenant.service.ts` `createTenant`).
- Marca `esPrincipal: true` en `User`; **uno por tenant** (índice único parcial
  `{ tenantId } where esPrincipal: true`). Migración: marcar al Administrador activo más antiguo de cada
  tenant existente (dry-run por defecto, como `migrate-roles-empresa`).
- Nadie del tenant puede editarlo, cambiarle el rol, restablecerle la contraseña, desactivarlo ni
  eliminarlo (404 para no revelar, o 403; decidir en la spec).
- En la pestaña Usuarios, el principal **solo puede cambiar su propia contraseña** (con la actual).
- Siempre cuenta como Administrador (no se puede quitar el último administrador: ya existe
  `assertNoUltimoAdministrador`).

### Quién gestiona a quién

| Actor | Crea | Edita / restablece contraseña / desactiva / elimina |
|---|---|---|
| Principal | Administradores, Coordinadores, Asesores | Todos (menos a sí mismo, salvo su contraseña) |
| Administrador **con** permiso | Administradores, Coordinadores, Asesores | Todos excepto el principal |
| Administrador **sin** permiso | Coordinadores, Asesores | Coordinadores y Asesores |
| Coordinador | Asesores | Asesores de su equipo **y asesores sin coordinador** |
| Asesor | — (sin acceso a Usuarios) | — |

- **Permiso `puedeGestionarAdministradores`** (boolean en `User`, solo para Administradores no principales):
  - Solo el **principal** puede concederlo o quitarlo, al crear o editar después.
  - Con el permiso, el Administrador también **crea** Administradores (sin poder concederles el permiso).
  - Se lee de BD en cada petición (no en el JWT): retirarlo tiene efecto inmediato.
  - Un Administrador sin permiso que intenta actuar sobre otro Administrador → 404.
- **Coordinador y asesores:**
  - Al crear un asesor elige su coordinador de la **lista de coordinadores** (cualquiera, él mismo o
    ninguno).
  - Al editar puede **mover asesores a otro coordinador** o dejarlos sin coordinador. Si lo mueve a otro
    equipo, deja de verlo/gestionarlo.
  - Ve y gestiona los asesores de su equipo más los que no tienen coordinador.
  - Hoy `cargarObjetivoPara` (`features/users/user.service.ts`) solo acepta `coordinadorId = actor`:
    ampliar a `coordinadorId ∈ { actor, null }`; validar el coordinador destino con
    `assertCoordinadorValido`.
- El Administrador (cualquiera) asigna asesores a cualquier coordinador o a ninguno (ya existe).

### Cambiar la contraseña propia

- Nuevo endpoint para **todos** los roles (p. ej. `POST /api/auth/me/password` con `{ actual, nueva }`):
  verifica `actual` con bcrypt (401/400 si no coincide), guarda la nueva y revoca las **demás** sesiones.
- Para el principal es la única opción sobre sí mismo; para el resto, se ofrece también desde su perfil.
- Hoy `resetTenantUserPassword` bloquea la propia con "usa tu perfil": mantener ese bloqueo.

### Eliminar usuarios — borrado lógico

- `eliminado: true` (+ `eliminadoEn`, `eliminadoPor`): desaparece de listados y selectores, no cuenta en
  las cuotas y no puede iniciar sesión (revocar sesiones).
- Mismas dependencias que la desactivación (`USER_HAS_DEPENDENCIES`: conversaciones asignadas, flujos,
  asesores a cargo) que deben resolverse antes de eliminar.
- **Email:** el índice único es global (ADR 0003). Para poder reutilizar el email, o se cambia a índice
  parcial `{ email } where eliminado != true`, o se reescribe el email al eliminar (p. ej.
  `deleted+<id>+<email>`). Decidir en la spec.
- Auditoría `user.deleted`. No hay restauración en el alcance (confirmar en la spec).

### Superadmin: restablecer contraseña del principal

- Acción en el panel de Empresas (`apps/frontend/src/features/admin-tenants`), **solo para el principal**.
- Endpoint de superadmin (p. ej. `POST /api/admin/tenants/:id/admin-password`): resuelve al principal del
  tenant indicado (excepción cross-tenant ya propia del rol `superadmin`), guarda la nueva contraseña,
  revoca sus sesiones y registra auditoría.

### Cuotas del plan

- Ya existe: `usuarios` cuenta a todos los activos; `administradores` solo al rol Administrador
  (`usage.service.ts` `getMetricUsed`, `user.service.ts` `assertCupo`, `tenant.service.ts`).
- Completar: excluir `eliminado` de los conteos; aplicar cuota al **reactivar** un usuario
  (`usuarios` y, si es Administrador, `administradores`); validar `administradores ≤ usuarios` al
  crear/editar un plan (`plan.service.ts` / `plan.validation.ts`); mostrar el uso
  ("7 de 10 usuarios · 2 de 3 administradores") en la pantalla Usuarios.

### Tests a cubrir

- Nadie puede tocar al principal (cada acción → 404/403); el principal solo cambia su contraseña.
- Admin sin permiso vs. admin con permiso sobre otros administradores; solo el principal concede el
  permiso; retirarlo tiene efecto en la siguiente petición.
- Coordinador: crea asesor con cualquier coordinador o ninguno; gestiona su equipo y los sin
  coordinador; los de otro equipo → 404; mover un asesor lo saca de su alcance.
- Asesor → 403 en todas las rutas de Usuarios; acceso a reportes/configuración/datos sensibles.
- Cambio de contraseña propia: actual incorrecta → error; correcta → revoca las demás sesiones.
- Borrado lógico: no lista, no cuenta en cuota, no inicia sesión, dependencias → 409.
- Superadmin resetea solo al principal; un usuario de tenant no accede al endpoint.
- Aislamiento multi-tenant en todos los endpoints nuevos (`docs/multi-tenancy.md` §8).

## 3. Comandos y reglas útiles

- Backend: `pnpm --filter @sofiapp/api typecheck` · `pnpm --filter @sofiapp/api test`.
- Frontend: `pnpm --filter @sofiapp/web build && pnpm --filter @sofiapp/web lint`; tests:
  `pnpm vitest run --exclude "**/KnowledgeBasePage.test.tsx" --exclude "**/node_modules/**"` (en `apps/frontend`).
- Skills de diseño: solo está instalada `frontend-design:frontend-design`; `emil-design-eng` e
  `impeccable` no existen (aplicar sus criterios a mano y anotarlo en `tasks.md`).
- `/sdd-spec`, `/sdd-implement` y `/sdd-release` los invoca el usuario.
- Helpers de tests: `features/users/user.test-helpers.ts` (`crearUsuario`, `tokenDe`, `llamar`).
