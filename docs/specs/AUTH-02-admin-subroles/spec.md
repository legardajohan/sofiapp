# AUTH-02 — Subroles internos de Admin y simplificación de roles (spec)

> **Spec-Driven Development.** Este archivo es el **QUÉ** (objetivo, alcance y criterios de
> aceptación). El **CÓMO** vive en `plan.md` y la ejecución en `tasks.md`. Es un ajuste transversal
> de bajo riesgo pero amplio: toca el modelo de usuario, el token, el store del frontend y la
> documentación de negocio, sin cambiar ninguna regla de autorización.

**Estado:** implementado

## Objetivo

Reducir el conjunto de roles del sistema a únicamente `superadmin` y `admin` (eliminando
`coordinador` y `asesor` de tipos, enums y guards), y agregar un campo **opcional** `subrol` sobre
los usuarios `admin` como **metadata visible** (`director | manager | coordinator | secretary`) que
viaja en el JWT y llega al frontend. Los subroles **no** alteran permisos: todo `admin` ve
exactamente las mismas pantallas y endpoints. Las features de Operación que hoy estaban restringidas
a `coordinador`/`asesor` (Bandeja omnicanal, Clientes, Campañas) se **reasignan a `admin`** para
mantener la coherencia "todo admin ve lo mismo". Se actualiza además la documentación de negocio para
reflejar el nuevo mapa de roles.

## Alcance

Ajuste vertical backend + frontend + docs. No introduce endpoints nuevos ni cambia el modelo de
datos multi-tenant.

Incluye:

- **Modelo de usuario:** tipo `AdminSubrol`, campo `subrol?` opcional en `IUser`, `IUserDocument`,
  `IUserResponse` y en el schema Mongoose (`enum`, **no** `required`).
- **JWT / sesión:** `subrol` firmado en el token (login), decodificado en `SafeUser` (`req.user`) y
  expuesto en las respuestas de `POST /api/auth/login` y `GET /api/auth/me`.
- **Frontend:** `subrol?` en el store de sesión (`AuthUser`) y en el DTO de API (`ISessionUser`);
  render del subrol en `NavUser` traducido al español (Director, Gerente, Coordinador, Secretaria).
- **Roles a dos valores:** `UserRol` = `superadmin | admin` en backend (`user.types.ts`,
  `express.d.ts`) y frontend (`authStore.ts`), y en el enum Mongoose (`user.model.ts`).
- **Reasignación de Operación a `admin`:** `nav-config.ts`, guard `/inbox` (`router.tsx`) y los
  `authorize()` de `conversation.routes.ts` / `message.routes.ts` pasan a `['admin']`.
- **Sidebar:** agregar el ítem **Base de Conocimiento** (`/settings/knowledge`, `roles: ['admin']`)
  al grupo `Configuración` (la ruta/página/guard ya existen), y **conservar** el ítem **WhatsApp**
  (`/settings/channels/whatsapp`, `roles: ['admin']`) que ya existe en ese grupo (verificar que
  sigue visible para admin tras la reasignación de roles).
- **`asesorId` (semántica, sin renombrar):** el campo `asesorId` (FK a usuario en `Cliente`/
  conversaciones) **conserva su nombre** pero se redefine como *usuario (admin) asignado a la
  conversación/cliente*; se actualizan comentarios y docs (`data-model.md`, `domain.md`) y los tests
  que creaban usuarios/tokens con rol `asesor` pasan a usar `admin`. Sin migración de datos.
- **Docs de negocio:** `docs/product.md`, `docs/domain.md`, `docs/data-model.md`, `README.md`,
  `docs/api-contract.md` actualizados al mapa `superadmin | admin` (+ subroles como metadata).
- **Tests:** actualizar los que usaban tokens `coordinador`/`asesor`; añadir aserción de que `subrol`
  no altera el acceso.

Fuera de alcance (otros features):

- Endpoint/CRUD para **asignar** o **editar** el `subrol` de un usuario (aquí solo se persiste,
  firma y muestra; la asignación queda para gestión de usuarios — `HU-SAAS-*`/`AUTH-*` futuro).
- Cualquier cambio de **lógica** de autorización: `authenticate-jwt`, `authorize`, `RequireRole`,
  `RequireAuth` conservan su comportamiento; solo cambian los **valores** de rol que reciben.
- **Renombrar** el campo `asesorId` → `responsableId`/similar o la room `asesor:<id>` del gateway
  de realtime (con migración de datos): fuera de alcance. En este feature `asesorId` **mantiene su
  nombre**; solo se aclara su semántica y se actualizan comentarios/docs/tests (ver Incluye). La room
  `asesor:<id>` (keyed por user id) tampoco se renombra.
- Introducir un tipo de rol compartido en `packages/shared` (se mantiene el patrón actual de
  declarar el tipo en cada app).

## Criterios de aceptación

1. `AdminSubrol` existe como `'director' | 'manager' | 'coordinator' | 'secretary'` y `subrol?` es
   **opcional** en `IUser`/`IUserDocument`/`IUserResponse`; un usuario sin `subrol` sigue siendo
   válido (backward compatible) y el schema Mongoose lo declara con `enum` y **sin** `required`.
2. En `login`, el JWT firmado incluye `subrol` cuando el usuario lo tiene; `authenticate-jwt` lo
   copia a `req.user` (`SafeUser.subrol?`) y `GET /api/auth/me` + `POST /api/auth/login` lo devuelven
   dentro del objeto de sesión.
3. El único conjunto de roles válido es `superadmin | admin`: `UserRol` (backend y frontend), la
   unión inline de `SafeUser` y el `enum` Mongoose ya **no** contienen `coordinador` ni `asesor`.
4. **Los subroles no cambian la autorización:** `authorize`, `RequireRole` y los middlewares
   conservan su lógica; ningún guard filtra por `subrol`. Todo usuario `admin` (con o sin `subrol`)
   accede a las mismas rutas y ve el mismo sidebar.
5. Las features de Operación (Bandeja omnicanal `/inbox`, Clientes, Campañas) y las rutas backend
   `conversation.routes`/`message.routes` quedan accesibles para `admin` (reasignadas desde
   `coordinador`/`asesor`); no queda ninguna referencia a los roles eliminados en `nav-config.ts`,
   `router.tsx`, `NavUser.tsx`, `conversation.routes.ts` ni `message.routes.ts`.
6. El sidebar muestra, para `admin` en `Configuración`, tanto **Base de Conocimiento**
   (`/settings/knowledge`) como **WhatsApp** (`/settings/channels/whatsapp`) — ambos con
   `roles: ['admin']` y ambas rutas ya existentes.
7. `NavUser` muestra el `subrol` traducido (Director/Gerente/Coordinador/Secretaria) junto al rol
   cuando existe, y no muestra nada extra cuando el usuario no tiene `subrol`.
8. La documentación de negocio (`product.md`, `domain.md`, `data-model.md`, `README.md`,
   `api-contract.md`) refleja únicamente `superadmin`/`admin` (+ subroles como metadata), sin
   describir `coordinador`/`asesor` como roles vigentes.
9. El campo `asesorId` **conserva su nombre** y su semántica queda documentada como *usuario (admin)
   asignado* (comentarios de `data-model.md:98,109,272` y `domain.md` actualizados); ningún test
   crea usuarios/tokens con rol `asesor`/`coordinador` (los que lo hacían usan `admin`), y los tests
   de conversación (`conversation.service.test`, que usan `asesorId` como user id) siguen en verde
   sin cambios de lógica.
10. **Aislamiento multi-tenant intacto:** el cambio no introduce ni modifica queries a Mongo; toda
    lectura/escritura de usuarios sigue pasando por el repositorio tenant-safe y `tenantId` sigue
    naciendo del token. `subrol` es metadata y no participa del scoping. Los tests de aislamiento
    existentes siguen en verde.
11. `pnpm --filter backend typecheck` y `pnpm --filter backend test` en verde; `pnpm --filter
    frontend build` y `pnpm --filter frontend lint` en verde (incluye la actualización de los tests
    que referenciaban `coordinador`/`asesor`).

## Dependencias

- **AUTH-01** (login, emisión y transporte del JWT en cookie httpOnly): este feature extiende el
  payload del token y las respuestas de `/login` y `/me`.
- **INF-02** (modelo de Tenant y middleware de resolución): el usuario y su `tenantId` provienen de
  ese contrato; no se altera.
