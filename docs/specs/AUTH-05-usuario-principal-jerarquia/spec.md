# AUTH-05 — Usuario principal y jerarquía de gestión (spec)

> **Spec-Driven Development.** Este archivo es el **QUÉ** (objetivo, alcance y criterios de
> aceptación). El **CÓMO** vive en `plan.md` y la ejecución en `tasks.md`. Reemplaza al AUTH-05
> anterior (visibilidad por equipo), **cancelado** el 2026-11-11: los tres roles de empresa quedan con
> los mismos accesos y solo se diferencian en la pestaña Usuarios. Decisiones de origen en
> `docs/specs/PENDIENTES-roles-empresa.md` §1–§2.

**Estado:** implementado

## Objetivo

Que cada empresa tenga un **usuario principal** intocable desde dentro del tenant, que la gestión de
usuarios siga una jerarquía clara (principal → administradores → coordinadores → asesores), que se
puedan **eliminar** usuarios sin perder historial, que cualquiera cambie su propia contraseña con la
actual y que el **superadmin** sea el único que recupera la contraseña del principal.

Decisiones de negocio (validadas con el usuario):

1. **Accesos iguales.** Administrador, Coordinador y Asesor ven y hacen lo mismo en todo el producto
   (bandeja, leads, contactos, datos sensibles, reportes, configuración, campañas). La única diferencia
   es la pestaña **Usuarios**, a la que el Asesor no entra.
2. **Usuario principal.** Es el Administrador que crea el superadmin al dar de alta la empresa. Uno por
   empresa. Nadie del tenant puede editarlo, cambiarle el rol o la contraseña, desactivarlo ni
   eliminarlo. Él mismo solo puede **cambiar su contraseña** ingresando la actual.
3. **Permiso "gestionar otros administradores".** Solo el principal lo concede o lo quita, al crear o
   después. Sin él, un Administrador gestiona Coordinadores y Asesores; con él, también crea y gestiona
   a los demás Administradores (nunca al principal ni el permiso).
4. **Coordinador.** Crea asesores y elige su coordinador de la lista (cualquiera, él mismo o ninguno).
   Gestiona a los asesores de su equipo y a los que no tienen coordinador, y puede moverlos a otro
   coordinador (con lo que salen de su alcance).
5. **Eliminar** es **borrado lógico**: el usuario desaparece de listados y selectores, no cuenta en el
   plan, no inicia sesión y libera su email. El historial conserva su nombre.
6. **Superadmin** restablece la contraseña **solo del principal**, desde el panel de Empresas.
7. **Cuotas.** Usuarios (todos los roles) y Administradores del plan se respetan al crear, reactivar y
   promover; un plan no puede tener más administradores que usuarios.

Reglas de respuesta: lo que el actor **ve en la lista pero no puede gestionar** responde **403**
(el principal; un Administrador para un admin sin permiso). Lo que **no ve** responde **404** (para el
coordinador, cualquier usuario fuera de su alcance), como en AUTH-04.

## Alcance

Incluye:

- **Modelo `User`:** `esPrincipal`, `puedeGestionarAdministradores`, `eliminado`, `eliminadoEn`,
  `eliminadoPor`, `emailOriginal`. Índice único parcial: un solo principal por tenant.
- **Alta de empresa** con `esPrincipal: true` y **migración** que marca al principal de las empresas
  existentes.
- **Reglas de gestión** de la tabla de `plan.md` en listar, ver, crear, editar, cambiar estado,
  restablecer contraseña y eliminar; `acciones` por fila calculadas en el backend.
- **Contraseña propia** para todo usuario de empresa (`PATCH /api/auth/me/password`).
- **Eliminar** (`DELETE /api/users/:id`), con la misma resolución de dependencias que la desactivación.
- **Superadmin:** ver al principal y restablecerle la contraseña.
- **Accesos iguales:** `ROLES_DATOS_SENSIBLES`, `ROLES_REPORTES` y `ROLES_CONFIGURACION` pasan a los
  tres roles (backend y frontend).
- **Cuotas:** `GET /api/users/cupo` y validación `administradores ≤ usuarios` en planes.
- **Frontend:** pantalla Usuarios, formulario, diálogos de eliminar y de cambiar mi contraseña,
  `NavUser`, panel de Empresas.
- **Docs:** ADR `0018`, `product.md`, `domain.md`, `data-model.md`, `api-contract.md`,
  `apps/frontend/CLAUDE.md`, `PENDIENTES-roles-empresa.md`.

Fuera de alcance:

- Restaurar un usuario eliminado.
- Contraseña propia del superadmin; "olvidé mi contraseña" por email.
- Transferir el rol de principal a otro usuario.
- Visibilidad por equipo (cancelada) y fase 3 (transferencia por rol, "Ver asignación", filtros de
  reportes por rol/coordinador): **en pausa**.

## Criterios de aceptación

1. **Modelo.** `User` admite `esPrincipal` (default `false`), `puedeGestionarAdministradores` (default
   `false`), `eliminado` (default `false`), `eliminadoEn`, `eliminadoPor` y `emailOriginal`. Guardar un
   segundo principal en el mismo tenant falla por el índice único parcial `{ tenantId }` con
   `esPrincipal: true`; en tenants distintos no.
2. **Alta de empresa.** El `adminUser` que crea el superadmin en `POST /api/admin/tenants` nace con
   `rolEmpresa: 'administrador'` y `esPrincipal: true`, dentro de la transacción del alta.
3. **Migración.** `migrate-usuario-principal.ts` sin flags no escribe y reporta, por tenant, a quién
   marcaría como principal y qué tenants no tienen ningún Administrador activo. Con `--apply` marca al
   Administrador activo más antiguo (`createdAt` asc) de cada tenant sin principal. Correrlo dos veces
   no cambia nada la segunda. Solo toca usuarios del tenant que procesa.
4. **Principal intocable.** `PATCH /api/users/:id`, `PATCH /:id/estado`, `POST /:id/password` y
   `DELETE /:id` sobre el principal → **403** para cualquier otro Administrador (para el Coordinador
   es 404, como todo lo que no ve). El propio principal tampoco se edita (`PATCH /:id` → 403); sobre
   sí mismo, estado, contraseña por gestión y eliminar responden 409 como para cualquiera. El principal aparece en `GET /api/users/manage` con `esPrincipal: true` y todas sus
   `acciones` en `false`.
5. **Administrador sin permiso.** Crea, edita, restablece contraseña, desactiva, reactiva y elimina
   Coordinadores y Asesores. Sobre un Administrador → **403**. Crear un Administrador, o cambiar el rol
   de alguien a o desde Administrador → **403**. Ve a los Administradores en el listado con `acciones`
   en `false`.
6. **Administrador con permiso.** Además crea y gestiona Administradores que no son el principal.
   Enviar `puedeGestionarAdministradores` → **403** (solo el principal).
7. **Permiso.** Solo el principal lo envía en `POST /api/users` o `PATCH /api/users/:id`; con
   `rolEmpresa` distinto de `administrador` → 400. Si el usuario deja de ser Administrador, el permiso
   vuelve a `false`. Se resuelve desde la BD en cada petición: tras retirarlo, la siguiente petición del
   afectado sobre un Administrador → 403 sin necesidad de re-login. Se audita
   `user.admin_permission_changed`.
8. **Coordinador.**
   - `POST /api/users` solo con `rolEmpresa: 'asesor'` (otro → 403); `coordinadorId` = cualquier
     coordinador **activo** del tenant, él mismo o `null` (otro valor → 404).
   - `GET /manage` y `GET /:id` devuelven solo asesores con `coordinadorId` igual a él o `null`; otro
     usuario → 404.
   - Edita `nombre`, `email` y `coordinadorId` de esos asesores, los activa/desactiva, les restablece la
     contraseña y los elimina. Cambiar `rolEmpresa` → 403. Tras moverlo a otro coordinador, el asesor
     queda fuera de su alcance (404).
9. **Asesor.** 403 en todos los endpoints de gestión de usuarios, incluido `GET /api/users/cupo`.
10. **Contraseña propia.** `PATCH /api/auth/me/password { actual, nueva }` para cualquier usuario de
    empresa: `actual` incorrecta → 400 y nada cambia; `nueva` < 8 caracteres → 400. Si es correcta
    guarda la nueva, **revoca todas las sesiones** del usuario, reemite la cookie de la petición actual
    (que sigue autenticada) y audita `user.password_changed`. `POST /api/users/:id/password` sobre uno
    mismo sigue respondiendo 409.
11. **Eliminar.** `DELETE /api/users/:id { conversaciones?, equipo? }` aplica las mismas reglas de
    alcance que editar. Eliminarse a sí mismo → 409; al principal → 403; al último Administrador activo
    → 409. Con dependencias sin resolver → 409 `USER_HAS_DEPENDENCIES` (como la desactivación) y sin
    cambios. Al eliminar: `eliminado: true`, `activo: false`, `emailOriginal` = email,
    `email` = `<id>.eliminado@invalid.sofiapp`, sesiones revocadas. El eliminado no aparece en
    `GET /manage` ni en `GET /api/users`, no cuenta en ninguna cuota, no inicia sesión, su email se
    puede reutilizar y reactivarlo → 404. Se audita `user.deleted` con el email original.
12. **Superadmin.** `GET /api/admin/tenants/:id/principal` → `{ id, nombre, email }` (404 si no hay).
    `POST /api/admin/tenants/:id/principal/password { password }` guarda la nueva contraseña del
    principal de **ese** tenant, revoca sus sesiones y audita `user.password_reset` en ese tenant con el
    superadmin como `actorId`. Un usuario de empresa en cualquiera de las dos → 403.
13. **Accesos iguales.** Coordinador y Asesor reciben 2xx (no 403) en notas de contacto, pendientes,
    `POST /conversations/:id/summary`, `/api/reports/*`, las escrituras de configuración de AUTH-04 y
    campañas; el correo, el documento y los atributos `sensible` llegan sin enmascarar.
14. **Cuotas.** `GET /api/users/cupo` → `{ usuarios: { usado, limite }, administradores: { usado,
    limite } }` (`limite: null` si el tenant no tiene plan). Crear, reactivar o promover a Administrador
    por encima del límite → 429, como hoy. `POST /api/admin/plans` y `PATCH /api/admin/plans/:id` con
    `administradores > usuarios` (en el update, contra los valores guardados) → 400.
15. **Frontend.**
    - `/settings/users`: insignia "Principal"; uso del plan ("7 de 10 usuarios · 2 de 3
      administradores"); acciones de cada fila según `acciones`; en la propia fila, solo "Cambiar mi
      contraseña".
    - Formulario: el rol ofrece lo que el actor puede asignar; el Coordinador elige coordinador; el
      switch "Puede gestionar otros administradores" solo lo ve el principal con rol Administrador.
    - Diálogo de eliminar (resuelve conversaciones y equipo como la desactivación) y diálogo "Cambiar mi
      contraseña" (actual, nueva, confirmación), también accesible desde `NavUser` para todos.
    - Sidebar y guards: Reportes y Configuración visibles para los tres roles; Usuarios no para el Asesor.
    - Panel Empresas (superadmin): acción "Restablecer contraseña del principal" con nombre y email.
    - shadcn/ui, tokens semánticos, prolijo en light y dark.
16. **Aislamiento multi-tenant y verificación.** Toda query pasa por el repositorio scoped; `tenantId`
    nace del token salvo en `/api/admin/tenants/:id/principal*` (superadmin, mismo precedente que
    `/:id/plan` y `/:id/usage`). Tests: el principal o el permiso de un tenant no habilitan nada en otro;
    `DELETE`/`cupo` no ven usuarios de otro tenant (404); el superadmin solo afecta al principal del `:id`.
    `pnpm --filter @sofiapp/api typecheck` (`tsc --noEmit`) y `test` en verde; `pnpm --filter
    @sofiapp/web build` y `lint` en verde.

## Dependencias

- **AUTH-04** (roles de empresa, `coordinadorId`, `cargarObjetivoPara`, 409 `USER_HAS_DEPENDENCIES`) y
  **AUTH-03** (gestión, revocación de sesión): se implementa sobre la misma rama, `feat/AUTH-03`.
- **ADR 0017** (se reemplaza en parte con el ADR 0018), **ADR 0003** (email único global), **ADR 0016**.
- **INF-02** (repositorio scoped, `requireTenant`).
- **HU-SAAS-02** (planes, `assertWithinQuota`, `getPlanLimits`).
