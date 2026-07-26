# Contrato de API — SofiApp

## 1. Convenciones REST

- Prefijo `/api`. Recursos en plural y kebab/lowercase: `/api/clientes`, `/api/catalog-items`,
  `/api/campaigns`, `/api/users`.
- Rutas del Superadmin (cross-tenant) bajo `/api/admin/*`.
- Webhooks bajo `/api/webhooks/*` (públicos).
- Verbos: `GET` (leer), `POST` (crear), `PATCH` (actualizar parcial), `DELETE` (borrar).
- Respuestas: JSON. Documentos mapeados a DTO seguro (`mapXToResponse`), `_id` como string.

## 2. Autenticación

- JWT firmado (HS256), `expiresIn: 8h`. **SPA (navegador):** se entrega en cookie `httpOnly`
  `Secure` `SameSite` (no accesible por JS). **Móvil / clientes no-navegador (Fase 4):** se acepta
  por header `Authorization: Bearer <token>`. Decisión registrada en
  `docs/adr/0002-auth-token-transport.md`.
- **CSRF:** al usar cookie, las rutas mutadoras exigen protección CSRF *double-submit*: el backend
  emite una cookie legible `csrfToken` y valida el header `X-CSRF-Token` en POST/PUT/PATCH/DELETE.
  Las peticiones por `Bearer` no requieren CSRF (no usan cookie ambiental).
- Endpoints públicos: `POST /api/auth/login`, `POST /api/auth/refresh`, `POST /api/webhooks/meta`,
  `GET /api/webhooks/meta` (verificación de Meta).
- El `tenantId` y el `rol` viajan en el payload del JWT. El cliente nunca los envía aparte.

## 3. Pipeline de toda ruta tenant-aware

```
authenticateJWT → requireTenant → authorize([roles]) → validate(schema) → asyncHandler(controller)
```
Rutas Superadmin: `authenticateJWT → authorize(['superadmin']) → validate → asyncHandler` (sin `requireTenant`).

## 4. Formato de error (único, desde `errorHandler`)

```jsonc
// AppError (negocio) → status explícito
{ "message": "Cliente no encontrado." }

// ZodError (validación) → 400
{ "message": "Error de validación.", "errors": [ { "path": "body.email", "message": "Email inválido." } ] }

// No controlado → 500
{ "message": "Error interno del servidor." }
```
Los controllers **no** hacen `try/catch`: lanzan `AppError(msg, code)` desde el service o dejan
propagar; `asyncHandler` + `errorHandler` resuelven.

## 5. Paginación y filtros

- Query params: `?page=1&limit=20&sort=-ultimoMensajeAt`.
- Respuesta paginada:
```jsonc
{ "data": [ /* ... */ ], "page": 1, "limit": 20, "total": 137 }
```
- Filtros validados con Zod; el `tenantId` se inyecta en el repositorio, nunca llega por query.

## 6. Endpoints núcleo (resumen no exhaustivo)

| Método | Ruta | Rol | Descripción |
|---|---|---|---|
| POST | `/api/auth/login` | público | Login, devuelve sesión + cookie JWT. |
| POST | `/api/auth/refresh` | público | Renueva el token. |
| GET/POST | `/api/admin/tenants` | superadmin | Listar/crear empresas. |
| PATCH | `/api/admin/tenants/:id` | superadmin | Activar/suspender, asignar plan. |
| GET/POST | `/api/admin/plans` | superadmin | Catálogo global de planes (listar/crear). |
| PATCH | `/api/admin/plans/:id` | superadmin | Editar límites/precio/estado de un plan. |
| PATCH | `/api/admin/tenants/:id/plan` | superadmin | Asignar un plan (activo) a una empresa. |
| GET | `/api/admin/tenants/:id/usage` | superadmin | Consumo vs límite por métrica (periodo actual). |
| GET | `/api/admin/metrics` | superadmin | Métricas globales cross-tenant. |
| GET | `/api/users` | admin | Admins activos del tenant (`?activo&rol`); alimenta el selector de asignación (HU-OMNI-02). |
| GET | `/api/conversations` | admin | Bandeja (paginada); `?filtro`, `?asignadoA=<userId>\|sin_asignar`, `?estado=<estadoComercial>` combinables (HU-OMNI-01/02). |
| PATCH | `/api/conversations/:id/assign` | admin | Asigna/reasigna/desasigna (`{ asignadoA: <userId>\|null }`); sin restricción de propiedad (HU-OMNI-02). |
| GET | `/api/conversations/:id/assignments` | admin | Historial paginado de reasignaciones de la conversación (HU-OMNI-02). |
| GET | `/api/clientes` | admin | Listar prospectos (filtrado, paginado). |
| PATCH | `/api/clientes/:id` | admin | Editar datos / asignar / cambiar estado. |
| PATCH | `/api/clientes/:id/estado` | admin | Transición de `estadoComercial`. |
| GET | `/api/clientes/:id/messages` | admin | Hilo de conversación. |
| POST | `/api/messages/send` | admin | Envío outbound por canal. |
| GET/POST | `/api/catalog-items` | admin | Catálogo del tenant. |
| GET/POST | `/api/campaigns` | admin | Campañas de remarketing. |
| GET | `/api/clientes/filter` | admin | Conteo/listado para segmentar campañas. |
| GET/POST | `/api/webhooks/meta` | público | Verificación + recepción de eventos de Meta. |

## 7. Tiempo real (Socket.IO)

- Namespace autenticado por JWT.
- *Rooms* por `tenantId` y por `asesorId` para que cada usuario solo reciba sus conversaciones.
- Eventos: `message:new`, `conversation:updated` (room `tenant:<id>`, refresca la bandeja de todos
  los admins) y `conversation:assigned` (room `asesor:<destinatario>` **únicamente**, dispara el
  toast de notificación — HU-OMNI-02).
