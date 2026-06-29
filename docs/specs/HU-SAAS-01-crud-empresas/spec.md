# HU-SAAS-01 — CRUD de Empresas con Estado Activa/Inactiva (spec)

> **Spec-Driven Development.** Este es el QUÉ y el porqué. El CÓMO va en `plan.md`;
> la ejecución en `tasks.md`. Amplía INF-02 con la capa CRUD de tenants para el Superadmin.

## Objetivo

Permitir al superadministrador crear, editar, listar y cambiar el estado (activa / inactiva)
de las empresas tenant desde un panel web. Una empresa inactiva (`suspendido`) bloquea el
acceso de todos sus usuarios a la plataforma de forma inmediata.

## Alcance

**Incluye:**
- CRUD de `Tenant` vía rutas `/api/admin/tenants` (solo superadmin).
- Creación opcional del usuario `admin` inicial al dar de alta una empresa (atómica).
- Middleware `requireActiveTenant` que devuelve 403 a usuarios de tenants no activos.
- Panel frontend: tabla con buscador + chip de estado + switch; formulario de alta/edición.

**Fuera de alcance:**
- Login y emisión de JWT → `AUTH-01`.
- RBAC completo → `AUTH-02`.
- CRUD de `Plan` → feature posterior.
- `camposCaptura` del tenant → `M04` (motor IA).
- Integración WhatsApp → `M01`.

## Criterios de aceptación

1. `GET /api/admin/tenants?search=&page=&limit=` retorna lista paginada; `search` filtra por
   `nombre` o `slug` (case-insensitive).
2. `POST /api/admin/tenants` crea empresa; `slug` único validado (regex `^[a-z0-9-]+$`);
   campo `adminUser` opcional crea usuario con `rol: 'admin'` y el `tenantId` de la empresa.
3. La creación empresa + adminUser es atómica: si falla el User (ej. email duplicado),
   la empresa no persiste.
4. `PATCH /api/admin/tenants/:id` actualiza `nombre`, `nit`, `contacto`, `planId`; el `slug`
   no es editable tras la creación.
5. `PATCH /api/admin/tenants/:id/status` cambia `estado` entre `activo` y `suspendido`;
   devuelve 409 si el estado ya es el solicitado.
6. El middleware `requireActiveTenant` (inmediatamente tras `requireTenant`) devuelve HTTP 403
   cuando `tenant.estado !== 'activo'`.
7. `passwordHash` no se expone en ninguna respuesta; el password inicial se hashea con bcrypt.
8. Panel superadmin: tabla muestra nombre, slug, plan (si asignado), estado y fecha de
   creación; switch activa/suspende sin recargar la página.
9. Formulario valida: nombre ≥ 2 chars, slug `^[a-z0-9-]+$`, email contacto válido.
10. **Aislamiento:** rutas `/api/admin/tenants/*` usan `authorize(['superadmin'])` sin
    `requireTenant`; cualquier rol ≠ superadmin recibe 403. El superadmin nunca tiene acceso
    a datos de otros tenants por este feature (solo gestiona el catálogo de empresas).
11. `tsc --noEmit` sin errores.

## Dependencias

- `INF-01` (scaffolding del proyecto) — debe estar completo.
- `INF-02` (modelo Tenant, User, repositorio base, requireTenant) — debe estar completo;
  esta feature amplía esos modelos añadiendo la capa CRUD y el guard de tenant activo.
