# ADR 0017 — Roles de empresa: Administrador, Coordinador y Asesor

**Estado:** aceptado · **Fecha:** 2026-11-10 · **Contexto:** AUTH-04 (reestructuración de roles,
fase 1). Reemplaza a ADR 0006 y 0011 y a la §1 de ADR 0016.

> **Reemplazado en parte por [ADR 0018](0018-usuario-principal-y-accesos-iguales.md) (AUTH-05):** los
> gates de datos sensibles, reportes y configuración pasan a los tres roles, y el alcance del
> Coordinador en la gestión de usuarios incluye a los asesores sin coordinador. El modelo de roles
> de este ADR sigue vigente.

## Contexto

AUTH-02 dejó a todos los usuarios de una empresa como `rol: 'admin'` con un `subrol` de cuatro
valores (`director`, `manager`, `coordinator`, `secretary`). Los ADR 0006, 0011 y 0016 lo fueron
convirtiendo en permisos (datos sensibles, reportes, gestión de usuarios), siempre con la regla "un
admin sin subrol conserva acceso total". El negocio pide otra cosa:

- Tres roles con jerarquía: **Administrador > Coordinador > Asesor**.
- El Coordinador es opcional y solo actúa sobre **su equipo**: los asesores que él crea o que el
  Administrador le asigna.
- El usuario que crea el superadmin al dar de alta una empresa es Administrador.

## Decisión

### 1. Modelo

- `rol` no cambia (`superadmin | admin`): distingue plataforma de empresa, y las 61 llamadas a
  `authorize(['admin'])` siguen valiendo.
- `subrol` se reemplaza por **`rolEmpresa: 'administrador' | 'coordinador' | 'asesor'`**, obligatorio
  para `rol: 'admin'`. El campo se renombra (en lugar de cambiar sus valores) para que el compilador
  marque cada uso viejo.
- **`coordinadorId: ObjectId | null`** en el usuario, solo para asesores. Expresa el equipo actual; quién
  lo creó queda en la auditoría. Índices `{ tenantId, coordinadorId }` y `{ tenantId, rolEmpresa, activo }`.
- Desaparece la regla "sin subrol = acceso total".

### 2. Traducción única del modelo viejo

`resolverRolEmpresa` (`features/users/user.rol-empresa.ts`) es la **única** tabla:

| Antes | Ahora |
|---|---|
| sin subrol (propietario) | administrador |
| `director` | administrador |
| `manager` (Gerente) | administrador |
| `coordinator` | coordinador (sin equipo) |
| `secretary` | asesor |

La usan la migración, `authenticateJWT`, el handshake del socket, el mapper y el login. Un JWT emitido
antes del despliegue y el documento migrado dan siempre el mismo rol: nadie pierde la sesión al
desplegar y nadie gana permisos (`coordinator` y `secretary` no veían datos sensibles ni reportes, y
como coordinador y asesor tampoco en esta fase). `manager` gana la gestión de usuarios: es decisión de
negocio.

### 3. Matriz de permisos (fase 1)

| Capacidad | Administrador | Coordinador | Asesor |
|---|---|---|---|
| Gestión de usuarios | Todos | Solo asesores de su equipo (crea, edita nombre/email, activa/desactiva, contraseña) | — |
| Mover asesores entre coordinadores | Sí | — | — |
| Datos sensibles, notas, pendientes, resumen IA | Sí | — (AUTH-05) | — |
| Reportes | Sí | — (AUTH-05) | — |
| Configuración y campañas (escritura y pantallas de configuración) | Sí | — | — |
| Lecturas operativas (etiquetas, etapas, campos y opciones de contacto, semáforos, plantillas) | Sí | Sí | Sí |
| Crear etiqueta desde la bandeja | Sí | Sí | Sí |

Constantes en `middlewares/authorize-rol-empresa.middleware.ts` (`ROLES_DATOS_SENSIBLES`,
`ROLES_REPORTES`, `ROLES_GESTION_USUARIOS`, `ROLES_CONFIGURACION`) y gemelas en `lib/roles.ts`.

El coordinador no gana datos sensibles ni reportes hasta **AUTH-05**: mientras no exista el filtro de
visibilidad por equipo, dárselos le enseñaría los de toda la empresa.

### 4. Jerarquía y guardas (en el service)

- El coordinador solo carga usuarios con `rolEmpresa: 'asesor'` y `coordinadorId` = él; cualquier otro
  da **404**, igual que uno inexistente (no se revela que existe).
- Nadie se cambia su propio rol, se desactiva ni restablece su propia contraseña por esta vía (409).
- No se puede desactivar ni degradar al **último Administrador activo** (409).
- Un `coordinadorId` tiene que apuntar a un coordinador **activo del mismo tenant** (404).
- Desactivar a un coordinador con equipo, o cambiarle el rol, exige decidir qué pasa con sus asesores:
  409 `USER_HAS_DEPENDENCIES` con `{ asignadas, flujos, asesores }`, que sustituye al
  `USER_HAS_ASSIGNED_CONVERSATIONS` de AUTH-03. Se resuelve con `equipo: reasignar | liberar` (y
  `conversaciones`), todo en una transacción.
- Mover un asesor de equipo no revoca su sesión: el equipo se lee de la BD, no del token.

### 5. Cuotas

La cuota `administradores` del plan cuenta solo a los usuarios activos con `rolEmpresa:
'administrador'`. `usuarios` sigue contando a todos los activos.

### 6. Despliegue

1. `migrate:roles-empresa` (dry-run) y revisión del reporte por tenant.
2. `migrate:roles-empresa --apply`: fija `rolEmpresa` sin tocar `subrol`. Es seguro antes del deploy
   porque el código viejo ignora `rolEmpresa`.
3. Deploy.
4. Pasado `JWT_EXPIRES_IN`, `migrate:roles-empresa --unset-legacy` borra `subrol`.

## Alternativas

- **Mantener el campo `subrol` con valores nuevos.** Menos diff, pero el nombre engañaría y el
  compilador no avisaría de los usos que mezclan valores viejos y nuevos.
- **Convertir `rol` en `superadmin | administrador | coordinador | asesor`.** Habría que tocar todas las
  rutas con `authorize(['admin'])` sin ganar nada: la distinción plataforma/empresa sigue siendo útil.
- **`creadoPor` en vez de `coordinadorId`.** Mezcla historia con estado: el Administrador tiene que
  poder mover asesores sin reescribir quién los creó.
- **Logout masivo al desplegar.** Innecesario con la traducción de claims.

## Consecuencias

- Hasta AUTH-05, cualquier usuario sigue viendo todas las conversaciones, leads y clientes del tenant.
  Lo que cambia en esta fase es quién gestiona, configura y ve datos sensibles y reportes.
- Las pantallas operativas ocultan a quien no es Administrador la gestión de catálogos (opciones y
  campos de contacto, etapas, semáforos), porque el backend la rechaza.
- `docs/adr/0006`, `0011` y la §1 de `0016` quedan reemplazadas por este ADR. La revocación de sesión
  de 0016 sigue vigente.
- El catálogo `perfilesPermitidos` / `admin-profile` de los planes queda obsoleto; se retira en otra
  historia.
