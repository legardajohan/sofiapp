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
| GET | `/api/conversations` | admin | Bandeja (paginada); `?filtro`, `?asignadoA=<userId>\|sin_asignar`, `?estado=<key del catálogo>` (ya no es un enum cerrado: las etapas son un catálogo por tenant, ver `GET /api/estados`; una clave que no exista en el tenant → **página vacía**, no `400`), `?etiqueta=<tagId>` combinables (HU-OMNI-01/02/04). Cada conversación incluye `tags` y `leadId` ya resueltos en lote. |
| PATCH | `/api/conversations/:id/assign` | admin | Asigna/reasigna/desasigna (`{ asignadoA: <userId>\|null }`); sin restricción de propiedad (HU-OMNI-02). |
| GET | `/api/conversations/:id/assignments` | admin | Historial paginado de reasignaciones de la conversación (HU-OMNI-02). |
| GET | `/api/leads` | admin | Listado de leads del tenant (paginado, `createdAt` descendente). Filtros combinables y opcionales: `?estado=<estadoComercial>`, `?asesor=<userId>` (filtra `responsableId`; no existe el rol "Asesor", ver AUTH-02), `?semaforo=verde|naranja|rojo|azul` (etiqueta de sistema de la **conversación**, resuelta por slug; si el administrador la borró → página vacía, no el listado sin filtrar), `?desde=` y `?hasta=` sobre `createdAt` en `YYYY-MM-DD` (**`hasta` es inclusive**: cubre el día entero; `desde > hasta` → `400`). Cada fila trae `responsable`, `semaforos` (**todas** las etiquetas de semáforo de la conversación, en orden canónico; vacío si no tiene) y `resumen` ya resueltos, más `conversacionId` para abrir la conversación (HU-CRM-03). |
| GET | `/api/estados` | admin | Catálogo de etapas del pipeline del tenant, en orden. Incluye las archivadas (`activo: false`), que ya no se ofrecen para filtrar pero siguen resolviendo su etiqueta en los leads que las llevan (HU-CRM-03). |
| POST | `/api/estados` | admin | Crea una etapa propia: `{ label, color? }`. La `key` se deriva del `label` y es estable (no cambia al renombrar); la etapa se añade al final del pipeline. Nombre repetido → `409`. |
| PATCH | `/api/leads/:id` | admin | Cambia la etapa del lead: `{ estado }` con la `key` del catálogo. **Se conserva de HU-CRM-03**; comparte service con `/stage`, así que gana sus mismas validaciones. Ver la fila siguiente. |
| PATCH | `/api/leads/:id/stage` | admin | **Ruta canónica del cambio de etapa** (HU-PIPE-01): `{ estado }` con la `key` del catálogo, body `.strict()` (una llave de más → `400`). Una clave que no exista **o esté archivada** (`activo: false`) → `400` sin escribir: a diferencia del filtro del listado, aquí escribiría una etapa que el tablero no pinta. Entre etapas activas la transición es **libre**, incluido retroceder. Reenviar la etapa que el lead ya tiene → `200` **sin escritura, sin historial y sin evento**. Lead de otro tenant → `404`, nunca `403`. Registra un `AuditEvent` `lead.estado` y emite `lead:stage-changed` al room del tenant. |
| GET | `/api/leads/:id/historial-etapa` | admin | Historial paginado de cambios de etapa del lead (`{ data, page, limit, total }`), más reciente primero, con el actor resuelto a `{ id, nombre }` y `de`/`a` como `key`. Solo eventos de etapa: no cuela `lead.create` ni `lead.delete`. Incluye los `lead.update` grabados antes de HU-PIPE-01, que no se migran. Lead de otro tenant → `404`. |
| GET | `/api/pipeline` | admin | El embudo agrupado por etapa (HU-PIPE-01): `{ columnas: [{ etapa, total, leads }], limit }`, una columna por etapa **activa** en orden de pipeline. Una etapa sin leads aparece igual con `total: 0`. Filtros: `?asesor`, `?semaforo`, `?desde`, `?hasta` (los mismos del listado) y `?limit=` **por columna** (default 20, máx 50). **No admite `?estado=`** → `400`: el tablero ya agrupa por etapa. Cada columna trae su primera página; recorrer el resto es trabajo de `GET /api/leads`. |
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
| POST | `/api/messages/send` | admin | Envío outbound por canal; delega en `sendOutbound` (texto libre, 422 si la ventana de 24 h está cerrada). |
| POST | `/api/messages/template` | admin | Envía una plantilla HSM aprobada (`{ clienteId, templateId, parametros[] }`); permitido dentro y fuera de la ventana de 24 h (HT-WA-02). |
| GET | `/api/templates` | admin | Catálogo de plantillas HSM del tenant, paginado (`?page&limit&status&category`) (HT-WA-02). |
| POST | `/api/templates` | admin | Crea una plantilla en Meta y la persiste localmente en `PENDING` (HT-WA-02). |
| POST | `/api/templates/sync` | admin | Sincroniza el catálogo local con el estado real en Meta (HT-WA-02). |
| GET/POST | `/api/catalog-items` | admin | Catálogo del tenant. |
| GET/POST | `/api/campaigns` | admin | Campañas de remarketing. |
| GET | `/api/clientes/filter` | admin | Conteo/listado para segmentar campañas. |
| GET/POST | `/api/webhooks/meta` | público | Verificación + recepción de eventos de Meta. |

## 7. Tiempo real (Socket.IO)

- Namespace autenticado por JWT.
- *Rooms* por `tenantId` y por `asesorId` para que cada usuario solo reciba sus conversaciones.
- Eventos: `message:new`, `conversation:updated` (room `tenant:<id>`, refresca la bandeja de todos
  los admins), `conversation:assigned` (room `asesor:<destinatario>` **únicamente**, dispara el
  toast de notificación — HU-OMNI-02) y `lead:stage-changed` (room `tenant:<id>`: el embudo es una
  vista compartida, así que cualquier administrador con el tablero abierto ve moverse la tarjeta —
  HU-PIPE-01. Solo se emite en un cambio **efectivo** de etapa).
