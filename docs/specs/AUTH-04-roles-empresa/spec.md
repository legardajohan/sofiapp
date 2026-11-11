# AUTH-04 — Roles de empresa: Administrador, Coordinador y Asesor (spec)

> **Spec-Driven Development.** Este archivo es el **QUÉ** (objetivo, alcance y criterios de
> aceptación). El **CÓMO** vive en `plan.md` y la ejecución en `tasks.md`. Es la **fase 1** de la
> reestructuración de roles aprobada el 2026-11-10: reemplaza los cuatro subroles de AUTH-02 por tres
> roles con jerarquía y prepara la relación coordinador → asesores. La visibilidad por usuario
> (cada uno ve solo lo suyo o lo de su equipo) es **AUTH-05**; transferencias y reportes, la fase 3.

**Estado:** implementado

## Objetivo

Que dentro de cada empresa existan solo tres roles, **Administrador > Coordinador > Asesor**, que el
Coordinador gestione únicamente a los asesores de su equipo, que el Administrador reparta asesores
entre coordinadores, y que los datos existentes migren sin que nadie pierda acceso ni sesión.

Decisiones de negocio (validadas con el usuario):

1. **Administrador** hereda todo lo que hoy tienen el propietario (admin sin subrol) y el `director`.
2. **Coordinador** es opcional: una empresa puede no tener ninguno. Solo actúa sobre los asesores de
   su equipo, que son los que él crea o los que el Administrador le asigna.
3. **Asesor:** permisos operativos, sin gestión de usuarios, reportes, configuración ni datos sensibles.
4. El usuario que crea el superadmin al dar de alta una empresa nace **Administrador**.
5. Migración: sin subrol, `director` y `manager` → `administrador`; `coordinator` → `coordinador`
   (sin equipo); `secretary` → `asesor`.
6. La cuota `administradores` del plan cuenta solo a los usuarios con rol **Administrador**.
7. Configuración (WhatsApp, KB, asistente, transferencia, plantillas, horarios, flujos, etapas,
   etiquetas, campos y opciones de contacto, semáforos, perfiles) y campañas: **solo Administrador**.

**Por fases.** En AUTH-04 los datos sensibles (notas, pendientes, correo y documento en claro) y los
reportes quedan **solo para el Administrador**. El Coordinador los gana en AUTH-05, cuando exista el
filtro de visibilidad por equipo. Dárselos antes le enseñaría los de **toda** la empresa.

## Alcance

Incluye:

- **Modelo `User`:** `rolEmpresa: 'administrador' | 'coordinador' | 'asesor'` (obligatorio en usuarios
  de empresa) y `coordinadorId: ObjectId | null` (solo asesores), con índices que empiezan por
  `tenantId`. `subrol` deja de usarse.
- **JWT y sesión:** claim `rolEmpresa`. Los tokens vigentes con `subrol` se traducen con la tabla de la
  decisión 5 (sin logout masivo al desplegar). Cambiar `rolEmpresa` revoca las sesiones (AUTH-03).
- **Gates:** `authorize-rol-empresa.middleware.ts` sustituye a `authorize-subrol.middleware.ts`. Ya no
  existe la regla "sin subrol = acceso total".
- **Configuración y campañas:** escritura solo para el Administrador, y también la lectura de las
  pantallas que son puramente de configuración. Las lecturas que usa la operación siguen abiertas.
- **Gestión de usuarios por rol:** el Administrador gestiona a todos; el Coordinador crea, edita,
  activa/desactiva y restablece la contraseña solo de los asesores de su equipo.
- **Equipos:** el Administrador asigna o mueve un asesor entre coordinadores, o lo deja sin coordinador.
  Desactivar o degradar a un coordinador con equipo exige decidir qué pasa con sus asesores (409).
- **Migración** `seed/migrate-roles-empresa.ts` (idempotente, `--dry-run`, limpieza de `subrol` en un
  segundo paso) + **alta de empresa** y **seed demo** con los roles nuevos.
- **Cuota** `administradores` = usuarios activos con `rolEmpresa: 'administrador'`.
- **Frontend:** roles, guards y sidebar con los roles nuevos; pantalla `/settings/users` con selector de
  3 roles, columna y filtro de coordinador, y vista acotada para el Coordinador; etiquetas de rol en
  `AssigneeBadge`, `AssignMenu` y `ConversationList`.
- **Docs:** ADR `0017` (reemplaza a 0006, 0011 y a la parte de gestión de 0016), `product.md`,
  `domain.md`, `data-model.md`, `api-contract.md`, `apps/frontend/CLAUDE.md`.

Fuera de alcance (otros features):

- Visibilidad por usuario en conversaciones, leads, clientes, pipeline y pendientes, rooms de tiempo
  real por equipo, endpoint `/users/asignables`, datos sensibles y reportes para el Coordinador → **AUTH-05**.
- Estrategias de transferencia por rol o por coordinador, "Ver asignación", filtros de Tiempo activo y
  de Detalle por asesor, selector de usuarios en flujos → **fase 3**.
- Retirar el catálogo `perfilesPermitidos` / `admin-profile` de los planes (se documenta como obsoleto).
- Unificar `Lead.responsableId` y `Cliente.asesorId`.
- Cambiar `rol` (`superadmin | admin`) o crear superadmins desde un tenant.

## Criterios de aceptación

1. **Modelo.** Un usuario de empresa (`rol: 'admin'`) sin `rolEmpresa` no se puede guardar. Un
   `coordinadorId` solo se admite si `rolEmpresa === 'asesor'` y apunta a un **coordinador activo del
   mismo tenant**; en cualquier otro rol es `null`.
2. **Alta de empresa.** El usuario inicial que crea el superadmin nace con `rolEmpresa: 'administrador'`
   y `coordinadorId: null`, y se crea por el repositorio scoped dentro de la transacción del alta.
3. **JWT.** El login firma `rolEmpresa`. `authenticateJWT` y el handshake de Socket.IO aceptan tokens
   vigentes con el claim viejo `subrol` (o sin él) y los traducen con la tabla de la decisión 5. Ningún
   usuario pierde la sesión al desplegar y ninguno gana permisos que no tuviera.
4. **Gates.** `authorizeRolEmpresa(roles)` responde 403 `Acceso denegado.` a quien no tenga uno de los
   roles. Notas de contacto, pendientes, `POST /conversations/:id/summary` y los 5 endpoints de
   `/api/reports` → solo `administrador` (asesor y coordinador → 403). Correo, documento y atributos
   `sensible` se enmascaran para coordinador y asesor.
5. **Configuración.** Las escrituras de canal, KB, FAQ, asistente, transferencia, sandbox, horarios de
   envío, plantillas, flujos, etapas, etiquetas, campos de contacto, opciones de contacto, semáforos,
   perfiles, ajustes del tenant y campañas → 403 para coordinador y asesor. Las lecturas que consumen
   la bandeja, leads o la ficha del contacto (etiquetas, etapas, campos y opciones de contacto,
   semáforos, plantillas aprobadas, configuración de audio) siguen abiertas a todo usuario de empresa.
6. **Gestión — Administrador.** Gestiona a cualquier usuario del tenant (salvo a sí mismo en rol,
   estado y contraseña, como en AUTH-03). `POST /api/users` exige `rolEmpresa`; con `asesor` acepta
   `coordinadorId` opcional. No se puede desactivar ni degradar al **último Administrador activo** (409).
7. **Gestión — Coordinador.** `GET /manage` y `GET /:id` le devuelven solo asesores con
   `coordinadorId` igual a él (otro usuario → 404). Crea solo asesores (otro `rolEmpresa` → 403), que
   nacen con `coordinadorId` = él aunque el body no lo traiga (si trae otro → 403). Edita `nombre` y
   `email`, activa/desactiva y restablece la contraseña solo de su equipo. Cambiar `rolEmpresa` o
   `coordinadorId` → 403. Al desactivar, solo puede reasignar conversaciones a sí mismo o a un asesor
   activo de su equipo (otro destino → 404).
8. **Gestión — Asesor.** 403 en todos los endpoints de gestión. `GET /api/users` (selector) sigue abierto.
9. **Equipos.** `PATCH /api/users/:id` `{ coordinadorId }` (solo Administrador) mueve un asesor a otro
   coordinador activo o lo libera con `null`; se audita como `user.coordinator_changed` y no revoca
   sesiones. Pasar un asesor a coordinador o administrador pone su `coordinadorId` en `null`.
10. **Dependencias al desactivar o degradar.** Desactivar a un usuario, o cambiar el rol de un
    coordinador con equipo, sin resolver lo pendiente → 409 con
    `details: { code: 'USER_HAS_DEPENDENCIES', asignadas, flujos, asesores }` y sin cambios. El body
    resuelve con `conversaciones` (como en AUTH-03) y, si `asesores > 0`, con
    `equipo: { accion: 'reasignar', coordinadorDestinoId } | { accion: 'liberar' }`. Todo ocurre en una
    transacción; al terminar ningún asesor apunta a un coordinador inactivo o que ya no es coordinador.
11. **Cuotas.** `administradores` cuenta solo `rolEmpresa: 'administrador'` activos y se valida al crear,
    reactivar o promover a Administrador (429). `usuarios` cuenta a todos los activos.
12. **Migración.** `migrate-roles-empresa.ts` sin flags (dry-run) no escribe y reporta por tenant cuántos
    usuarios pasan a cada rol y qué configuraciones de transferencia o flujos apuntan a un usuario que
    queda como Administrador o Coordinador. Con `--apply` fija `rolEmpresa` y `coordinadorId: null`;
    con `--unset-legacy` elimina `subrol`. Correrlo dos veces no cambia nada la segunda.
13. **Auditoría.** `user.created`, `user.updated`, `user.role_changed` (antes `user.subrol_changed`),
    `user.coordinator_changed`, `user.deactivated`, `user.reactivated`, `user.password_reset`,
    `user.conversations_moved` y `user.team_moved`, con `actorId` del token.
14. **Frontend.** El sidebar, los guards y las acciones usan `rolEmpresa`. `/settings/users` es visible
    para Administrador y Coordinador: el Administrador ve todos, elige entre 3 roles y el coordinador de
    un asesor; el Coordinador ve solo su equipo y crea asesores sin elegir rol ni coordinador. Columnas
    Nombre, Email, Rol, Coordinador y Estado; filtros por rol, coordinador, estado y búsqueda. El diálogo
    de desactivación resuelve conversaciones y equipo en un mismo paso. La bandeja muestra el rol junto al
    nombre del asignado. shadcn/ui, tokens semánticos, prolijo en light y dark.
15. **Aislamiento multi-tenant y verificación.** Toda query pasa por el repositorio scoped y `tenantId`
    nace del token. Tests: un `coordinadorId` de otro tenant → 404; un coordinador no ve ni toca usuarios
    de otro tenant ni asesores de otro equipo; la migración solo toca usuarios del tenant que procesa.
    `pnpm --filter @sofiapp/api typecheck` (`tsc --noEmit`) y `test` en verde; `pnpm --filter @sofiapp/web
    build` y `lint` en verde.

## Dependencias

- **AUTH-03** (gestión de usuarios, revocación de sesión, 409 de conversaciones): se implementa sobre su misma rama, `feat/AUTH-03`.
- **AUTH-02** (subroles) y **ADR 0006 / 0011 / 0016**: se reemplazan con el ADR 0017.
- **INF-02** (repositorio scoped, `requireTenant`).
- **Planes y uso** (`assertWithinQuota`, cuota `administradores`).
- **SAAS — alta de empresa** (`tenant.service.ts`).
