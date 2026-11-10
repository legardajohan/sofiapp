# AUTH-03 — Gestión de usuarios por tenant (spec)

> **Spec-Driven Development.** Este archivo es el **QUÉ** (objetivo, alcance y criterios de
> aceptación). El **CÓMO** vive en `plan.md` y la ejecución en `tasks.md`. Completa lo que AUTH-02
> dejó fuera de alcance ("asignar o editar el `subrol` de un usuario") y añade revocación de sesión,
> porque sin ella desactivar o degradar a un usuario no surte efecto hasta que vence su JWT.

**Estado:** implementado

## Objetivo

Que el **gestor de usuarios** de cada empresa cree, edite, active y desactive a los usuarios de su
tenant, les asigne **subrol** y les restablezca la contraseña, con aislamiento multi-tenant total y con
efecto **inmediato** de la desactivación y de cualquier cambio de permisos.

Decisiones de negocio (validadas con el usuario):

1. **Gestores:** solo `director` y el admin **sin subrol** (el propietario: primer usuario del tenant).
2. **`subrol` obligatorio** al crear: un admin sin subrol tiene acceso total (ADR 0006/0011), y no debe
   nacer así por omisión. El propietario inicial conserva su condición.
3. **Contraseña:** la fija el gestor al crear y puede restablecerla. La invitación por email queda fuera.
4. **Desactivar con conversaciones asignadas** se **impide** (409). El gestor elige **reasignarlas** a
   otro admin activo o **moverlas a la bandeja sin asignar**, y en ese mismo paso se desactiva.

"Roles" en este feature significa **subrol**: dentro de una empresa `rol` es siempre `admin`.

## Alcance

Incluye:

- **Backend `features/users`:** listado de gestión filtrable, detalle, alta, edición, cambio de estado
  (activar/desactivar) y restablecimiento de contraseña.
- **Gate de gestión** `SUBROLES_GESTION_USUARIOS = ['director']` (+ admin sin subrol, misma convención
  que `authorizeSubrol`). Se registra en el ADR nuevo `0016`.
- **Jerarquía anti-escalamiento:** propietario (admin sin subrol) > `director` > resto de subroles.
- **Revocación de sesión:** colección `session_revocations` (scoped por tenant), chequeo en
  `authenticateJWT` y en el handshake de Socket.IO, y desconexión de los sockets vivos del usuario.
- **Desactivación con conversaciones** (`Cliente.asesorId`): 409 informativo, o reasignar/desasignar en
  la misma transacción que la desactivación.
- **Auditoría** de cada operación y evento de tiempo real para la bandeja cuando se mueven conversaciones.
- **Corrección** del parseo de `activo` en `GET /api/users` (`z.coerce.boolean()` convierte `"false"` en `true`).
- **Flujos:** informar cuántos flujos referencian al usuario y hacer que el efecto `asignar_asesor` no
  rompa la ejecución si el asesor está inactivo.
- **Frontend:** pantalla `/settings/users` (tabla, alta/edición, desactivación con diálogo de
  conversaciones, restablecimiento de contraseña), ítem de sidebar y guard por subrol.
- **Docs:** `product.md`, `domain.md`, `data-model.md`, `api-contract.md` y ADR `0016`.

Fuera de alcance (otros features):

- Invitación por email, "olvidé mi contraseña" y cambio obligatorio en el primer login.
- Que un usuario edite su propio perfil o contraseña.
- Borrado físico de usuarios (se desactivan; auditoría y `asesorId` los referencian).
- Crear o promover `superadmin` desde un tenant, o cambiar `rol` (siempre `admin`).
- Reasignar conversación por conversación dentro del diálogo (se hace desde la bandeja).
- Editar automáticamente los flujos que referencian al usuario (solo se informa).
- Caché en memoria de la lista de revocación (posible optimización posterior).

## Criterios de aceptación

1. `GET /api/users` conserva su contrato actual (admins activos del tenant, para el selector de
   asignación) y parsea bien `?activo=false`. La pantalla usa `GET /api/users/manage`, que acepta
   `activo` (`true|false|todos`), `subrol` y `q` (nombre/email). Ninguno devuelve `passwordHash` ni al
   superadmin.
2. `GET /api/users/:id` devuelve un usuario del propio tenant; un id de otro tenant o inexistente → 404.
3. `POST /api/users` crea `{ nombre, email, password, subrol }` con `subrol` **obligatorio**, `rol`
   fijado a `admin` en el service y `tenantId` del token. El body es `.strict()`: `tenantId`, `rol` o
   `activo` → 400. Email duplicado en **cualquier** tenant → 409 genérico que no revela el tenant.
   Valida las cuotas `usuarios` y `administradores` en la misma transacción que el alta (429 si se excede).
4. `PATCH /api/users/:id` edita `nombre`, `email` y `subrol` (`.strict()`, al menos un campo; `subrol`
   no admite `null`). Cambiar `subrol` revoca las sesiones del usuario.
5. Solo gestionan usuarios `director` y el admin sin subrol. `manager`, `coordinator` y `secretary` →
   403 en `GET /manage`, `GET /:id` y en todos los endpoints de escritura. `GET /api/users` (selector)
   sigue abierto a todo admin.
6. **Anti-escalamiento:**
   - un `director` no puede editar, desactivar ni restablecer la contraseña de un propietario;
   - nadie puede cambiarse su propio subrol ni desactivarse a sí mismo (409);
   - no se puede desactivar ni degradar al **último gestor activo** del tenant (409).
7. `PATCH /api/users/:id/estado` con `{ activo: false }`, sin `conversaciones` y con `Cliente` asignados
   al usuario → 409 con `details: { code: 'USER_HAS_ASSIGNED_CONVERSATIONS', asignadas: N, flujos: M }`,
   sin ningún cambio.
8. Con `conversaciones: { accion: 'reasignar', destinoId }`, el destino se valida con
   `assertAssignableAdmin` (mismo tenant, `admin` activo y distinto del usuario que se desactiva) y se le
   reasignan todas. Con `{ accion: 'desasignar' }` quedan con `asesorId: null`. Mover, desactivar y
   revocar ocurren en **una sola transacción**; al terminar no queda ningún `Cliente` del tenant con
   `asesorId` igual al usuario desactivado.
9. `{ activo: true }` reactiva validando las cuotas (429 si no hay cupo). Reactivar no restaura
   conversaciones.
10. `POST /api/users/:id/password` fija una contraseña nueva (bcrypt, mínimo 8 caracteres) y revoca las
    sesiones del usuario.
11. **Revocación inmediata:** tras desactivar, cambiar subrol o restablecer contraseña, una petición con
    un JWT emitido antes → 401, el handshake de socket con ese JWT se rechaza y los sockets vivos del
    usuario se desconectan. Los tokens sin revocación siguen válidos (no hay logout masivo al desplegar).
    El usuario desactivado no puede volver a iniciar sesión (ya lo cubre `auth.service`).
12. El conteo `flujos` del criterio 7 cuenta los flujos del tenant cuyo efecto `asignar_asesor.asesorId`
    o `handoff.notificarAsesorId` apunta al usuario. El efecto `asignar_asesor` con un asesor inactivo
    no lanza: registra `warn` y deja la conversación sin asignar (igual que ya hace `handoff`).
13. Cada operación registra auditoría (`user.created`, `user.updated`, `user.subrol_changed`,
    `user.deactivated`, `user.reactivated`, `user.password_reset`, `user.conversations_moved`), y la
    bandeja de los demás usuarios se actualiza en tiempo real cuando se mueven conversaciones.
14. **Frontend:** `/settings/users` aparece en el sidebar y es accesible solo para gestores (ítem +
    guard). Tabla con nombre, email, subrol y estado; alta y edición en `Sheet`; desactivación con
    `AlertDialog` que, ante el 409, ofrece reasignar (con selector de admin activo) o mover a la bandeja
    sin asignar; restablecimiento de contraseña en `Dialog`. Usa shadcn/ui y los tokens semánticos y queda
    prolijo en light y dark.
15. **Aislamiento multi-tenant:** toda query pasa por el repositorio tenant-safe y `tenantId` nace del
    token. El test de aislamiento cubre: `GET /:id`, `PATCH /:id`, `/estado` y `/password` sobre un
    usuario de otro tenant → 404; `tenantId`/`rol` en el body rechazados; reasignar a un usuario de otro
    tenant → 404; una revocación en el tenant A no afecta a usuarios del tenant B.
    `pnpm --filter @sofiapp/api typecheck` (`tsc --noEmit`) y `pnpm --filter @sofiapp/api test` en
    verde; `pnpm --filter @sofiapp/web build` y `lint` en verde.

## Dependencias

- **AUTH-01** (login, JWT en cookie httpOnly): se añade el chequeo de revocación al middleware.
- **AUTH-02** (subroles): se usan los subroles como base del gate y de la jerarquía.
- **INF-02** (repositorio scoped, `requireTenant`): toda query pasa por él.
- **HU-OMNI-02** (asignación de conversaciones, `assertAssignableAdmin`, `assignConversation`).
- **Planes y uso** (`assertWithinQuota` en `features/usage/usage.service.ts`).
- **ADR 0006 / 0011** (subrol con efecto en permisos; un admin sin subrol conserva acceso total).
