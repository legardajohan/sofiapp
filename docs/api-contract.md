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

// AppError con datos adjuntos → status explícito + las claves de `details`
{ "message": "Ya existe un lead con ese teléfono.", "leadId": "68f1a2..." }

// No controlado → 500
{ "message": "Error interno del servidor." }
```
Los controllers **no** hacen `try/catch`: lanzan `AppError(msg, code)` desde el service o dejan
propagar; `asyncHandler` + `errorHandler` resuelven.

`AppError` acepta un tercer argumento opcional `details: Record<string, unknown>`, para los errores
donde el cliente necesita algo más que el texto para poder reaccionar (HU-CRM-01: el `409` adjunta
el `leadId` que ya existe, y así la UI ofrece "Ver lead existente"). Se difunde **antes** de
`message`, de modo que una clave `message` dentro de `details` no puede pisar el mensaje real. Sin
`details` la respuesta sigue siendo exactamente `{ message }`.

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
| GET | `/api/conversations` | admin | Bandeja (paginada); `?filtro`, `?asignadoA=<userId>\|sin_asignar`, `?estado=<estadoComercial>`, `?etiqueta=<tagId>` combinables (HU-OMNI-01/02/04). Cada conversación incluye `tags` y `leadId` ya resueltos en lote. |
| PATCH | `/api/conversations/:id/assign` | admin | Asigna/reasigna/desasigna (`{ asignadoA: <userId>\|null }`); sin restricción de propiedad (HU-OMNI-02). |
| GET | `/api/conversations/:id/assignments` | admin | Historial paginado de reasignaciones de la conversación (HU-OMNI-02). |
| POST | `/api/leads` | admin | Convierte una conversación en lead (`{ nombre, telefono, correo?, clienteId }`) → `201`. Duplicado por teléfono en el tenant → `409` con el `leadId` existente (HU-CRM-01). |
| GET | `/api/leads/:id` | admin | Detalle del lead con contacto, responsable y autor de la conversión ya resueltos (HU-CRM-01). |
| DELETE | `/api/leads/:id?motivo=<motivo>` | admin | Borra el lead **definitivamente** → `204`. `motivo` es obligatorio y va en la query (un cuerpo en `DELETE` lo pierden proxies y clientes); enum: `duplicado`, `spam`, `prueba`, `sin_respuesta`, `no_interesado`. Otro valor o ausencia → `400`. Queda `AuditEvent` `lead.delete` con el lead completo en `antes` y el motivo en `despues`. El teléfono se libera: la conversación puede volver a convertirse (HU-CRM-01). |
| GET | `/api/clientes` | admin | Listar prospectos (filtrado, paginado). |
| PATCH | `/api/clientes/:id` | admin | Edita la ficha del contacto: `nombre`, `telefono`, `correo`, `documento`, `nivelInteres`, `objecionPrincipal`, `rolContacto`, `atributos` (HU-CRM-02). Campo ausente = sin cambio; `null` = borrar, **salvo `nombre` y `telefono`**, que no admiten `null` ni cadena vacía: uno identifica al contacto en la bandeja y el otro es por donde se le contacta, así que se corrigen pero no se borran → `400`. `telefono` va en el formato del webhook (solo dígitos con indicativo, 7–15, sin `+` ni separadores); **ojo:** en un contacto de WhatsApp `upsertByMetaUser` lo resincroniza desde Meta en cada mensaje entrante, así que editarlo ahí es una corrección temporal. `atributos` rechaza con `400` los que vengan sin `label`/`valor` y los repetidos (misma `key`, o mismo `label` ignorando mayúsculas y tildes); máximo 30. Schema `.strict()`: `telefono`, `estadoComercial`, `tagIds`, `asesorId`, `customFields` y demás tienen dueño en otro feature → `400`. Escribir `correo`/`documento`/atributos sensibles exige subrol `director`/`manager` (o `admin` sin subrol) → si no, `403` **sin escribir nada del body**. |
| PATCH | `/api/clientes/:id/estado` | admin | Transición de `estadoComercial`. |
| GET | `/api/clientes/:id/history` | admin | Ficha + resumen + datos extraídos + mensajes paginados (HU-OMNI-03). Los datos sensibles llegan en claro o enmascarados (`d••••@dominio.com`, `••••1234`, `••••••`) según el subrol; la respuesta incluye `puedeVerSensibles` (HU-CRM-02). |
| POST | `/api/clientes/:id/notas` | admin + subrol | Crea una nota de seguimiento (`{ texto }`, 1–2000) → `201`. El texto se guarda cifrado. Solo `director`/`manager` (o `admin` sin subrol); el resto recibe `403` (HU-CRM-02). |
| GET | `/api/clientes/:id/notas` | admin + subrol | Notas del contacto paginadas, más reciente primero, con el autor resuelto a `{ id, nombre }`. Mismo gate de subrol (HU-CRM-02). |
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
