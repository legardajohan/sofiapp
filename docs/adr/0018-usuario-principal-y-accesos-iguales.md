# ADR 0018 — Usuario principal, jerarquía de gestión y accesos iguales

**Estado:** aceptado · **Fecha:** 2026-11-11 · **Contexto:** AUTH-05. Reemplaza en parte al ADR 0017:
los gates de datos sensibles, reportes y configuración (§ gates) y el alcance del Coordinador en la
gestión de usuarios. El modelo de roles (`rolEmpresa`, `coordinadorId`) de 0017 sigue vigente.

## Contexto

AUTH-04 dejó tres roles con jerarquía y planeaba un AUTH-05 de **visibilidad por equipo** (cada
usuario ve solo lo suyo o lo de su equipo). El negocio cambió de rumbo el 2026-11-11:

- Los tres roles usan el producto **igual**. La única diferencia es la pestaña **Usuarios**.
- El usuario que crea el superadmin con la empresa es el **usuario principal**: nadie de la empresa lo
  toca, y él solo cambia su contraseña con la actual. Si la olvida, solo el superadmin la restablece.
- Los Administradores gestionan Coordinadores y Asesores; a otros Administradores, solo si el
  principal se lo permite.
- El Coordinador crea asesores para cualquier equipo y gestiona los de su equipo y los que no tienen
  coordinador.
- Se pueden **eliminar** usuarios.

## Decisión

### 1. Accesos iguales; se cancela la visibilidad por equipo

`ROLES_DATOS_SENSIBLES`, `ROLES_REPORTES` y `ROLES_CONFIGURACION` pasan a ser los tres roles (backend y
`lib/roles.ts`). Los gates **se conservan**: volver a restringir es cambiar una constante, no ~100
rutas. `ROLES_GESTION_USUARIOS` sigue siendo Administrador y Coordinador. El resolvedor de alcance
por equipo, los rooms por equipo y `/users/asignables` no se construyen.

### 2. Usuario principal

- `User.esPrincipal: boolean`, con índice único parcial `{ tenantId }` donde `esPrincipal: true`: uno
  por empresa. Lo marca `createTenant`; las empresas existentes, `migrate:usuario-principal` (el
  Administrador activo más antiguo).
- Ningún usuario del tenant lo edita, le cambia el rol, le restablece la contraseña, lo desactiva ni
  lo elimina. El principal tampoco se edita a sí mismo: solo cambia su contraseña.
- No se transfiere (fuera de alcance).

### 3. Permiso de gestionar administradores

`User.puedeGestionarAdministradores: boolean`, solo significativo en Administradores no principales.
Lo escribe **solo el principal**, al crear o después. Con él, el Administrador crea y gestiona a otros
Administradores (nunca al principal ni el permiso). Al dejar de ser Administrador vuelve a `false`.

El principal y el permiso **no viajan en el JWT**: `cargarActor` los lee de BD en cada petición de
gestión, así retirar el permiso tiene efecto en la siguiente petición (mismo criterio que el equipo
del coordinador en 0017). `/auth/me` los expone solo para que la UI oculte acciones.

### 4. Matriz y códigos de respuesta

Vive en un único módulo puro, `features/users/user.permisos.ts`, que usan los asserts del service y
el cálculo de `acciones` de cada fila (la UI no ofrece nada que el backend vaya a rechazar):

| Actor ↓ / Objetivo → | Principal | Administrador | Coordinador | Asesor (su equipo o sin coord.) | Otro asesor |
|---|---|---|---|---|---|
| Principal | 403 | ✅ | ✅ | ✅ | ✅ |
| Admin con permiso | 403 | ✅ | ✅ | ✅ | ✅ |
| Admin sin permiso | 403 | 403 | ✅ | ✅ | ✅ |
| Coordinador | 404 | 404 | 404 | ✅ | 404 |

Lo que el actor **ve** pero no gestiona responde **403**; lo que **no ve**, **404** (no revelar que
existe). Sobre uno mismo siguen las reglas de AUTH-03 (`409` al desactivarse, restablecerse la
contraseña por gestión o eliminarse).

### 5. Contraseña propia y reset del superadmin

- `PATCH /api/auth/me/password { actual, nueva }` para cualquier usuario de empresa. Revoca **todas**
  sus sesiones y reemite la cookie de la petición en curso. `isTokenRevoked` compara `iat <= revokedAt`
  por segundo, así que el token nuevo se firma con `iat = floor(revokedAt / 1000) + 1`.
- `GET /api/admin/tenants/:id/principal` y `POST /api/admin/tenants/:id/principal/password`: rutas de
  superadmin. El `tenantId` sale del `:id` (mismo precedente que `/:id/plan` y `/:id/usage`) y la
  consulta sigue por el repositorio scoped. Solo afectan al principal de esa empresa.

### 6. Borrado lógico

Eliminar marca `eliminado: true` **y** `activo: false`, guarda `emailOriginal` y reescribe `email` a
`<id>.eliminado@invalid.sofiapp`. Así:

- cuotas, login, revocación y asignación ya lo excluyen (todos exigen `activo`);
- el email queda libre sin tocar el índice único global de ADR 0003;
- el historial sigue resolviendo su nombre (`findUsersByIds` no filtra eliminados).

Los listados y selectores filtran `eliminado`. Reactivar a un eliminado es `404`. Restaurar queda
fuera de alcance. Antes de eliminar se resuelven conversaciones y equipo igual que al desactivar (409
`USER_HAS_DEPENDENCIES`).

## Consecuencias

- **+** Una sola regla de gestión, testeable sin BD, que alimenta backend y UI.
- **+** El principal no puede quedar bloqueado por otro usuario de su empresa.
- **−** El guard "último Administrador activo" ya no es alcanzable por un actor válido (el principal
  es siempre Administrador y nadie lo toca); se conserva como defensa.
- **−** Coordinadores y asesores ven datos sensibles y reportes de toda la empresa. Si el negocio
  vuelve a pedir restricción, la vía es la visibilidad por equipo planteada (y cancelada) en
  `docs/specs/PENDIENTES-roles-empresa.md`.
