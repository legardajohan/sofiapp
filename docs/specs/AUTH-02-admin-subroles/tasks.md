# AUTH-02 — Tasks (checklist ejecutable)

> Claude Code: ejecuta en orden, marca cada casilla al completarla y no cierres el feature hasta
> tener typecheck + tests + build + lint en verde. Recuerda: **no se cambia la lógica de
> autorización**, solo los valores de rol y la nueva metadata `subrol`.

## Implementación — Backend (patrón: types → model → auth → middleware → routes)

- [x] `features/users/user.types.ts`: `UserRol` → `'superadmin' | 'admin'`; agregar
      `export type AdminSubrol = 'director' | 'manager' | 'coordinator' | 'secretary';`; agregar
      `subrol?: AdminSubrol` a `IUser`, `IUserDocument` (hereda) y `IUserResponse`.
- [x] `features/users/user.model.ts`: `rol.enum` → `['superadmin', 'admin']`; agregar campo
      `subrol: { type: String, enum: ['director','manager','coordinator','secretary'] }` (**sin**
      `required`).
- [x] `features/auth/auth.types.ts`: importar `AdminSubrol`; agregar `subrol?` a `ISessionUser` y
      `ISessionUserSource`; en `mapUserToSession` copiar `subrol: user.subrol`.
- [x] `features/auth/auth.service.ts`: incluir `subrol: user.subrol` en el objeto de `jwt.sign(...)`.
- [x] `types/express.d.ts`: `SafeUser.rol` → `'superadmin' | 'admin'`; agregar `subrol?: AdminSubrol`
      (importando el tipo desde `../features/users/user.types.js`).
- [x] `middlewares/authenticate-jwt.middleware.ts`: copiar `subrol: payload['subrol'] as SafeUser['subrol']`
      al construir `req.user`.
- [x] `features/conversation/conversation.routes.ts`: `authorize(['coordinador','asesor'])` →
      `authorize(['admin'])`.
- [x] `features/message/message.routes.ts`: `authorize(['asesor','coordinador','admin'])` →
      `authorize(['admin'])`.

## Implementación — Frontend (store → api → populate → nav → user → router)

- [x] `stores/authStore.ts`: `UserRol` → `'superadmin' | 'admin'`; agregar
      `export type AdminSubrol = 'director' | 'manager' | 'coordinator' | 'secretary';` y `subrol?`
      en `AuthUser`.
- [x] `features/auth/api.ts`: agregar `subrol?: AdminSubrol` a `ISessionUser`.
- [x] `features/auth/LoginPage.tsx` y `components/AuthBootstrap.tsx`: incluir `subrol: session.subrol`
      en las llamadas `setUser({...})`.
- [x] `components/layout/nav-config.ts`: importar `BookText` de `lucide-react`; agregar al grupo
      `Configuración` el item `{ label: 'Base de Conocimiento', to: '/settings/knowledge', icon: BookText, roles: ['admin'] }`;
      **conservar** el item `WhatsApp` (`/settings/channels/whatsapp`, `roles: ['admin']`) ya
      existente; cambiar los `roles` de Bandeja omnicanal, Clientes y Campañas (grupo `Operación`) a
      `['admin']`.
- [x] `components/layout/NavUser.tsx`: reducir `ROL_LABEL` a `superadmin`/`admin`; agregar
      `SUBROL_LABEL` (director→Director, manager→Gerente, coordinator→Coordinador, secretary→Secretaria);
      renderizar el subrol junto al rol (líneas ~76 y ~94) solo si `user.subrol` existe.
- [x] `router.tsx`: guard de `/inbox` `roles={['coordinador','asesor']}` → `roles={['admin']}`.

## Implementación — Documentación de negocio

- [x] `docs/product.md`: tabla de roles → solo Superadministrador y Administrador; describir los
      subroles de admin (Director/Gerente/Coordinador/Secretaria) como metadata sin impacto en
      permisos; ajustar menciones de "asesor/coordinador" en §5 (estados) y fases.
- [x] `docs/domain.md`: glosario "Usuario del panel" (Superadmin, Admin + subroles) y menciones de
      asesor/coordinador en transiciones de estado.
- [x] `docs/data-model.md`: `users.rol` (línea 53) → `"superadmin" | "admin"`; documentar `subrol?`
      opcional. Aclarar la semántica de `asesorId` **sin renombrarlo**: comentario `:99`
      (`// ref User (usuario admin asignado)`), índice `:110` (`{ tenantId, asesorId }`) y diagrama
      ER `:273`.
- [x] `docs/domain.md`: aclarar que el "asesor asignado" (`asesorId`) es un usuario `admin` asignado
      a la conversación/cliente; el término `asesor` describe la función, no un rol de login.
- [x] `docs/api-contract.md`: columna de autorización (`asesor+`/`coordinador+`) alineada a
      `admin`/`superadmin`.
- [x] `README.md`: línea resumen de roles a `superadmin · admin (+ subroles internos)`.
- [x] (extra, fuera del checklist original) `apps/frontend/CLAUDE.md` §"Autorización en UI" y
      `.claude/skills/sofiapp-feature-scaffold/SKILL.md`: alineados al mapa de roles nuevo, por
      consistencia con la instrucción de negocio del usuario.

## Tests (Vitest)

- [x] `tests/unit/auth.service.test.ts`: reemplazados los usuarios con `rol: 'asesor'`/`'coordinador'`
      por `rol: 'admin'`; agregados 2 casos nuevos que verifican que `subrol` se firma en el JWT y
      aparece en la sesión (con y sin subrol).
- [x] `tests/unit/socket.gateway.test.ts`: reemplazado `rol: 'asesor'` por `rol: 'admin'`.
- [x] `features/kb/kb.routes.test.ts`: los 2 casos que usaban `makeToken(..., 'asesor')` esperando 403
      se re-expresan con `rol: 'superadmin'` (rol válido pero sin acceso a rutas de tenant),
      preservando la intención "rol no-admin → 403".
- [x] Aserción explícita agregada en `kb.routes.test.ts`: un `admin` **con** `subrol: 'coordinator'`
      obtiene 200 en una ruta protegida por `authorize(['admin'])`, igual que sin `subrol`.
- [x] `conversation.service.test.ts`: confirmado en verde sin cambios de lógica (usa `asesorId` como
      user id, sin tokens de rol de por medio).

## Verificación final

- [x] `pnpm --filter @sofiapp/api typecheck` en verde.
- [x] `pnpm --filter @sofiapp/api test` en verde — **125/125 tests, 23 archivos**, incluye
      `tests/isolation/conversation.isolation.test.ts` y `tests/isolation/message.isolation.test.ts`
      (aislamiento multi-tenant intacto: `subrol` no participa del scoping).
- [x] `pnpm --filter @sofiapp/web build` en verde.
- [x] `pnpm --filter @sofiapp/web lint` en verde (0 warnings/errores).
- [x] Checklist de PR de `docs/multi-tenancy.md` §9: no se agregaron queries nuevas ni rutas nuevas;
      las únicas rutas tocadas (`conversation.routes.ts`, `message.routes.ts`) conservan
      `authenticateJWT → requireTenant → authorize → validate → asyncHandler` intacto, solo cambió
      el argumento de `authorize`.
- [x] Grep de cierre: sin literales `'coordinador'`/`'asesor'` como rol en `apps/backend/src`,
      `apps/backend/tests` ni `apps/frontend/src` (se conservan `asesorId` y la room `asesor:<id>`,
      a propósito).
- [ ] Verificación visual (opcional, Playwright): no ejecutada en esta sesión — pendiente si se
      desea confirmar visualmente el sidebar/NavUser con un servidor levantado.

## Definición de "hecho"

El sistema opera solo con `superadmin` y `admin`; los admin pueden portar un `subrol` opcional que
viaja del token al frontend y se muestra en `NavUser` sin afectar ningún permiso. La Bandeja
omnicanal, Clientes y Campañas quedan accesibles para admin; el sidebar expone Base de Conocimiento.
La documentación de negocio refleja el nuevo mapa de roles. Todo verde en typecheck/test/build/lint y
el invariante multi-tenant intacto. Deja listo el terreno para una futura gestión de usuarios que
**asigne** el `subrol` (fuera de alcance aquí).
