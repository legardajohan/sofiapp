# ADR 0016 — Gestión de usuarios por subrol y revocación de sesiones

**Estado:** aceptado (la §1 y la jerarquía de la §2 quedan reemplazadas por [ADR 0017](0017-roles-de-empresa.md); la revocación de sesión sigue vigente) · **Fecha:** 2026-11-10 · **Contexto:** AUTH-03 (gestión de usuarios por tenant)

## Contexto

AUTH-03 da a cada empresa una pantalla para crear, editar, activar/desactivar usuarios y asignarles
subrol. Hay que resolver tres cosas que el modelo de AUTH-01/AUTH-02 no cubría.

1. **Quién gestiona.** Todos los usuarios de un tenant son `admin`. `authorize(['admin'])` dejaría a
   cualquier `secretary` darse a sí misma, o a otro, el subrol `director`: gestionar usuarios es
   otorgar permisos.
2. **El JWT es stateless (8h).** `authenticateJWT` solo verificaba la firma. Un usuario desactivado,
   o degradado de `director` a `secretary`, seguía operando con sus permisos viejos hasta que vencía
   el token. `login` y `/me` ya miraban `activo`, pero el resto de rutas no.
3. **Conversaciones huérfanas.** Desactivar a alguien con conversaciones asignadas (`Cliente.asesorId`)
   las dejaba apuntando a un usuario que ya no puede atenderlas.

## Decisión

### 1. Gate de gestión por subrol (tercera excepción al criterio 4 de AUTH-02)

- `SUBROLES_GESTION_USUARIOS = ['director']` en `middlewares/authorize-subrol.middleware.ts`, aplicado
  con `authorizeSubrol` en todas las rutas de gestión (`GET /api/users/manage`, `GET /:id`, `POST /`,
  `PATCH /:id`, `PATCH /:id/estado`, `POST /:id/password`).
- **Un `admin` sin `subrol` conserva acceso** (misma convención que ADR 0006/0011). En gestión de
  usuarios tiene nombre propio: el **propietario**, que es el primer usuario que nace con el tenant.
- `manager` queda **fuera**. Ve datos sensibles y reportes, pero no reparte permisos.
- `GET /api/users` (el selector de asignación de la bandeja) **sigue abierto** a todo admin: elegir a
  quién asignar no es gestionar.

### 2. Jerarquía y guardas (en el service, no en la ruta)

- **Propietario > director > resto.** Un director no edita, desactiva ni restablece la contraseña de
  un propietario (403).
- Nadie se cambia su propio subrol, se desactiva a sí mismo ni restablece su propia contraseña por
  esta vía (409).
- No se puede desactivar ni degradar al **último gestor activo** del tenant (409). Con las guardas
  anteriores es defensa en profundidad: solo se alcanza si quien actúa quedó inactivo en BD sin que
  se revocara su sesión.
- **El `subrol` es obligatorio al crear.** Un admin sin subrol tiene acceso total, y no debe nacer
  así porque se olvidó un campo. El esquema Mongo lo sigue declarando opcional, porque el propietario
  no lo tiene.

### 3. Revocación por lista, no por consulta al usuario

- Colección nueva `session_revocations` `{ tenantId, userId, revokedAt, expiraEn }`, scoped por
  tenant, con índice único `{ tenantId, userId }` y TTL sobre `expiraEn`.
- Desactivar, cambiar el subrol o restablecer la contraseña hace upsert de `revokedAt = ahora`.
- `authenticateJWT` (ahora asíncrono) y el handshake de Socket.IO rechazan un token cuyo
  `iat * 1000 <= revokedAt`. **Sin documento, la sesión es válida.**
- Tras confirmar la transacción se publica `session:revoke` en el bus interno, y cada proceso web
  desconecta los sockets vivos del room `asesor:<userId>`, siempre que su `tenantId` coincida con el
  del aviso.
- El superadmin (`tenantId: null`) no se consulta.
- TTL de 7 días, que debe ser **≥ `JWT_EXPIRES_IN`**. Pasado ese plazo ningún token previo a la
  revocación sigue vigente y el documento sobra.

### 4. Desactivar exige decidir sobre las conversaciones

- Si el usuario tiene `Cliente` asignados y el body no trae `conversaciones`, la respuesta es `409`
  con `{ code: 'USER_HAS_ASSIGNED_CONVERSATIONS', asignadas, flujos }`.
- Con `{ accion: 'reasignar', destinoId }` o `{ accion: 'desasignar' }`, mover, desactivar y revocar
  ocurren en **una transacción**. Separadas, podría asignársele una conversación nueva entre medias.
- `Cliente` no tiene estado cerrada/archivada, así que cuentan **todas** las asignadas.

## Alternativas

- **Consultar `User` en cada petición** (`activo`, `subrol` desde BD). Daba frescura total y además
  quitaba el `subrol` del token, pero 37 suites de test firman JWT para usuarios que no existen en BD
  y todas se romperían. Además añade una lectura sobre la colección más consultada. Se descartó en
  favor de la lista de revocación, que es casi vacía y donde la ausencia equivale a válido.
- **`sessionVersion` en el usuario y en el JWT.** Tenía el mismo problema: también obliga a leer
  `User` en cada petición.
- **Bajar `JWT_EXPIRES_IN`** a minutos con refresh token. Es un cambio mayor del transporte
  (ADR 0002) para un problema que la lista resuelve con un índice.
- **Incluir a `manager` como gestor.** Se descartó: ampliaría quién puede otorgar permisos sin una
  necesidad concreta.

## Consecuencias

- Cada petición autenticada de un usuario de tenant hace una lectura indexada extra sobre
  `session_revocations`. Si llega a pesar, se puede cachear en memoria unos segundos (no va en el MVP).
- Un token emitido en el mismo segundo que la revocación se trata como previo (falla cerrado).
- Tras un cambio de subrol, el usuario recibe 401 en su siguiente petición y vuelve a iniciar sesión
  con los permisos nuevos.
- Los flujos con un `asignar_asesor` o un `handoff.notificarAsesorId` que apunte a un usuario
  inactivo no se editan solos. El runtime registra `warn` y deja la conversación sin asignar, y el 409
  informa cuántos flujos lo referencian.
- Sigue pendiente: invitación por email, cambio de la propia contraseña y cambio obligatorio en el
  primer login.
