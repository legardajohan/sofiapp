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
| GET | `/api/conversations/:id/overview` | admin | Cabecera + etiquetas + resumen + `semaforoIA` + permisos, en una lectura. Sin el hilo (HU-IA-04, HU-IA-05). |
| POST | `/api/conversations/:id/summary` | admin + subrol | Genera/regenera el resumen por IA. Solo `director`/`manager` (o `admin` sin subrol); el resto `403` (HU-IA-04). |
| POST | `/api/conversations/:id/semaforo` | admin | Aplica la sugerencia de semáforo que dejó la IA. **Sin cuerpo**: el destino es el que ya guardó (HU-IA-05). `409` si no hay propuesta pendiente, si la etiqueta se borró o si ya está aplicada. |
| GET | `/api/conversations/:id/classifications` | admin | Bitácora paginada de clasificaciones de intención de compra, con `de`, `a`, `confianza` y `motivo` (HU-IA-05). |
| GET\|PUT | `/api/ai/handoff-rules` | admin | Configuración de transferencia a un asesor del tenant (HU-IA-03). El `PUT` guarda la configuración **completa**. Desde HU-IA-07 el cuerpo lleva además `estrategiaDestino` (`primero` \| `menor_carga` \| `fijo`) y `condicionesExtras` (máx. 10 de `{ key, nombre, activa, palabras }`). `400` si: una condición tiene el nombre fuera de 2–40, se queda sin palabras, repite `key` o repite nombre (comparando sin mayúsculas ni tildes); o si `estrategiaDestino` y `asesorDestinoId` se contradicen — `fijo` exige un asesor y cualquier otra estrategia exige `null`, porque un cuerpo con las dos cosas describe dos destinos a la vez. Un tenant que guardó antes de HU-IA-07 lee `condicionesExtras: []` y la estrategia derivada de si tenía asesor fijo: **sin migración**. |
| GET | `/api/ai/handoff-rules/asesores/metricas` | admin | Cómo está repartido el trabajo, para decidir el destino (HU-IA-07). Una fila por **admin activo** del tenant —incluidos los que no tienen nada asignado, que son justo los que hay que ver—, con `activas` (conversaciones cuyo `estadoComercial` no es `pagado` ni `perdido`) y `porEstado` con los cinco estados, siempre presentes. **Totales, sin rango de fechas:** `estadoComercial` no registra fecha de cierre. Un usuario desactivado no aparece: no puede recibir conversaciones. |
| GET | `/api/leads` | admin | Listado de leads del tenant (paginado, `createdAt` descendente). Filtros combinables y opcionales: `?estado=<estadoComercial>`, `?asesor=<userId>` (filtra `responsableId`; no existe el rol "Asesor", ver AUTH-02), `?semaforo=<key del catálogo>` (**campo del lead** desde HU-CRM-04, ya no una etiqueta de la conversación; ver `GET /api/semaforos`. Una clave que no exista en el tenant → **página vacía**, no `400` ni el listado sin filtrar), `?desde=` y `?hasta=` sobre `createdAt` en `YYYY-MM-DD` (**`hasta` es inclusive**: cubre el día entero; `desde > hasta` → `400`). Cada fila trae `responsable`, `semaforo` (**uno**, resuelto a `{ id, key, label, color, … }` desde el catálogo del tenant; `null` si el lead está sin clasificar) y `resumen` ya resueltos (el `resumen` solo para subrol `director`/`manager` o `admin` sin subrol, igual que en la bandeja — HU-IA-04; para el resto llega `null`), más `conversacionId` para abrir la conversación (HU-CRM-03 · HU-CRM-04). |
| PATCH | `/api/leads/:id/status` | admin | Cambia el **semáforo comercial** del lead: `{ semaforo: <key del catálogo> \| null }`. `null` retira la clasificación; reenviar el que ya tiene es idempotente (`200` sin escritura ni entrada de historial). Clave fuera del catálogo → `400`; body con llaves de más (p. ej. `estado`) → `400` (schema `.strict()`); lead de otro tenant → `404`, nunca `403`. Registra un `AuditEvent` `lead.semaforo` y sincroniza —*best-effort*— la etiqueta de semáforo de su conversación (HU-CRM-04). |
| GET | `/api/leads/:id/historial` | admin | Historial paginado de cambios de semáforo del lead, más reciente primero, con el actor resuelto a `{ id, nombre }` y `de`/`a` como `key`. Devuelve **solo** eventos de semáforo, no el resto de la bitácora del lead (HU-CRM-04). |
| GET | `/api/semaforos` | admin | Catálogo de semaforización comercial del tenant, en orden. Incluye los archivados (`activo: false`), que ya no se ofrecen para clasificar pero siguen resolviendo su etiqueta en los leads que los llevan (HU-CRM-04). |
| POST | `/api/semaforos` | admin | Crea uno propio: `{ label, color? }`. La `key` se deriva del `label` y es estable; se añade al final. Nombre repetido (ignorando mayúsculas y tildes) → `409`. |
| PATCH | `/api/semaforos/:id` | admin | Renombra, recolorea o archiva: `{ label?, color?, activo? }`, al menos uno. `key` no se admite (`.strict()` → `400`): es lo que los leads llevan grabado. Archivar uno de los **cuatro base** → `409`. **No hay `DELETE`**: borrar una clave dejaría leads mostrando una clave cruda. |
| GET | `/api/estados` | admin | Catálogo de etapas del pipeline del tenant, en orden. Incluye las archivadas (`activo: false`), que ya no se ofrecen para filtrar pero siguen resolviendo su etiqueta en los leads que las llevan (HU-CRM-03). |
| POST | `/api/estados` | admin | Crea una etapa propia: `{ label, color? }`. La `key` se deriva del `label` y es estable (no cambia al renombrar); la etapa se añade al final del pipeline. Nombre repetido → `409`. |
| PATCH | `/api/leads/:id` | admin | Cambia la etapa del lead: `{ estado }` con la `key` del catálogo. Una clave que no exista en el tenant → `400` (a diferencia del filtro del listado, aquí escribiría un estado que nadie puede resolver). Lead de otro tenant → `404`, nunca `403`. Registra un evento de auditoría `lead.update` con el antes y el después (HU-CRM-03). |
| POST | `/api/leads` | admin | Convierte una conversación en lead (`{ nombre, telefono, correo?, clienteId }`) → `201`. Duplicado por teléfono en el tenant → `409` con el `leadId` existente (HU-CRM-01). |
| GET | `/api/leads/:id` | admin | Detalle del lead con contacto, responsable y autor de la conversión ya resueltos (HU-CRM-01). |
| DELETE | `/api/leads/:id?motivo=<motivo>` | admin | Borra el lead **definitivamente** → `204`. `motivo` es obligatorio y va en la query (un cuerpo en `DELETE` lo pierden proxies y clientes); enum: `duplicado`, `spam`, `prueba`, `sin_respuesta`, `no_interesado`. Otro valor o ausencia → `400`. Queda `AuditEvent` `lead.delete` con el lead completo en `antes` y el motivo en `despues`. El teléfono se libera: la conversación puede volver a convertirse (HU-CRM-01). |
| GET | `/api/clientes` | admin | Listar prospectos (filtrado, paginado). |
| PATCH | `/api/clientes/:id` | admin | Edita la ficha del contacto: `nombre`, `telefono`, `correo`, `documento`, `nivelInteres`, `objecionPrincipal`, `rolContacto`, `atributos` (HU-CRM-02). Campo ausente = sin cambio; `null` = borrar, **salvo `nombre` y `telefono`**, que no admiten `null` ni cadena vacía: uno identifica al contacto en la bandeja y el otro es por donde se le contacta, así que se corrigen pero no se borran → `400`. `telefono` va en el formato del webhook (solo dígitos con indicativo, 7–15, sin `+` ni separadores); **ojo:** en un contacto de WhatsApp `upsertByMetaUser` lo resincroniza desde Meta en cada mensaje entrante, así que editarlo ahí es una corrección temporal. `atributos` rechaza con `400` los que vengan sin `label`/`valor` y los repetidos (misma `key`, o mismo `label` ignorando mayúsculas y tildes); máximo 30. Schema `.strict()`: `telefono`, `estadoComercial`, `tagIds`, `asesorId`, `customFields` y demás tienen dueño en otro feature → `400`. Escribir `correo`/`documento`/atributos sensibles exige subrol `director`/`manager` (o `admin` sin subrol) → si no, `403` **sin escribir nada del body**. |
| PATCH | `/api/clientes/:id/estado` | admin | Transición de `estadoComercial`. |
| GET | `/api/clientes/:id/history` | admin | Ficha + resumen + datos extraídos + mensajes paginados (HU-OMNI-03). Los datos sensibles llegan en claro o enmascarados (`d••••@dominio.com`, `••••1234`, `••••••`) según el subrol; la respuesta incluye `puedeVerSensibles` (HU-CRM-02). |
| POST | `/api/clientes/:id/extract` | admin | Lee de la conversación **nombre, correo, teléfono e interés** con la IA y los guarda en `datosExtraidos` (HU-IA-06). El transcript se acota a los `EXTRACT_MAX_MENSAJES` mensajes de texto más recientes. **Fusiona, no reemplaza:** un campo que esta pasada no encuentre conserva el valor de la anterior, y un campo ya confirmado conserva el suyo. El correo llega en claro o enmascarado según el subrol. `422` si el hilo no tiene ningún mensaje de texto. Deja `AuditEvent` `cliente.extract` **solo si algún valor cambió**. También lo dispara el worker al final del ciclo de auto-reply, con `actorId: null`. |
| POST | `/api/clientes/:id/extract/confirm` | admin | Pasa a la ficha los datos extraídos: `{ campos: ["nombreCompleto"|"correo"|"telefono"|"interes"] }`, 1–4 sin repetidos, schema `.strict()`. El cuerpo dice **qué** campos, nunca con qué valor. **Merge no destructivo:** `nombreCompleto` → `nombre` y `correo` → `correoEnc` solo si el destino está vacío; `interes` y un `telefono` dictado en el chat entran como atributos (`interes`, `telefono-alterno`) solo si esa `key` no existe ya. **Nunca escribe `Cliente.telefono`** (lo resincroniza Meta en cada mensaje entrante). Responde `{ contacto, datosExtraidos, aplicados, omitidos }`: lo omitido es lo que ya tenía dato guardado, y solo lo **aplicado** se marca confirmado. `400` si un campo pedido no tiene valor o si es el teléfono de origen `whatsapp` (ya está en la ficha); `403` si el lote incluye `correo` sin subrol `director`/`manager` —y entonces **no se escribe nada del resto**, todo o nada—; `409` si no hay datos extraídos. Deja `AuditEvent` `cliente.extract-confirm`. |
| POST | `/api/clientes/:id/notas` | admin + subrol | Crea una nota de seguimiento (`{ texto }`, 1–2000) → `201`. El texto se guarda cifrado. Solo `director`/`manager` (o `admin` sin subrol); el resto recibe `403` (HU-CRM-02). |
| GET | `/api/clientes/:id/notas` | admin + subrol | Notas del contacto paginadas, más reciente primero, con el autor resuelto a `{ id, nombre }`. Mismo gate de subrol (HU-CRM-02). |
| GET | `/api/clientes/:id/messages` | admin | Hilo de conversación. |
| POST | `/api/messages/send` | admin | Envío outbound por canal; delega en `sendOutbound` (texto libre, 422 si la ventana de 24 h está cerrada). |
| POST | `/api/messages/template` | admin | Envía una plantilla HSM aprobada (`{ clienteId, templateId, parametros[] }`); permitido dentro y fuera de la ventana de 24 h (HT-WA-02). |
| GET | `/api/templates` | admin | Catálogo de plantillas HSM del tenant, paginado (`?page&limit&status&category`) (HT-WA-02). |
| POST | `/api/templates` | admin | Crea una plantilla en Meta y la persiste localmente en `PENDING` (HT-WA-02). |
| POST | `/api/templates/sync` | admin | Sincroniza el catálogo local con el estado real en Meta (HT-WA-02). |
| GET | `/api/flows` | admin | Lista los flujos del tenant (`{ id, nombre, version, estado, activo, updatedAt }`), más recientes primero (HU-FLOW-01-V2). |
| POST | `/api/flows` | admin | Crea un flujo (`{ nombre, nodos, aristas, entrada, activo? }`) → `201`. El grafo se valida completo en el borde (Zod `superRefine`): ids duplicados, nodo de entrada inexistente, aristas/`nodoDestino`/`ramaPorDefecto` a un id que no existe, o un nodo huérfano → `400`. `activo: true` desactiva el flujo activo anterior del tenant en la misma operación (HU-FLOW-01-V2). |
| GET | `/api/flows/:id` | admin | Detalle completo del flujo (nodos + aristas). Flujo de otro tenant → `404`, nunca `403` (HU-FLOW-01-V2). |
| PUT | `/api/flows/:id` | admin | Reemplaza el grafo completo y sube `version`; misma validación que `POST` y la misma exclusividad de `activo` (HU-FLOW-01-V2). |
| GET | `/api/flows/reminder` | admin | Configuración del recordatorio de inactividad del tenant: `{ activo, antelacionMinutos, texto, templateId }` (HU-FLOW-02). Registrada ANTES de `/:id` en el router — es una ruta literal, no un id. |
| PUT | `/api/flows/reminder` | admin | Actualiza la configuración. `antelacionMinutos` entero 15–1440; `activo: true` sin `texto` → `422` (regla de coherencia). El `tenantId` nace del token, nunca de la URL — no existe un `/:id/reminder` de superadmin (HU-FLOW-02). |
| GET/POST | `/api/catalog-items` | admin | Catálogo del tenant. |
| GET/POST | `/api/campaigns` | admin | Campañas de remarketing. |
| GET | `/api/clientes/filter` | admin | Conteo/listado para segmentar campañas. |
| POST | `/api/ai/answer` | admin | Pregunta suelta al chatbot con RAG sobre la KB del tenant (`{ mensaje }`, 1–2000) → `{ respuesta, fromFaq, cacheHit, chunksUsados }` (HU-IA-01). Es la puerta de **prueba y depuración**: el auto-reply real de WhatsApp llama a `AIService.chat()` dentro del worker `ai-reply`, sin salto HTTP. |
| GET | `/api/ai/assistant` | admin | Configuración vigente del asistente → `{ tono, systemPrompt, heredado, version }`. `heredado: true` mientras la empresa siga usando la plantilla global de fábrica (HU-IA-01). |
| PUT | `/api/ai/assistant` | admin | Guarda tono e instrucciones de la empresa (`{ tono }` 1–200, `{ systemPrompt }` 1–8000). Crea la plantilla `chat` del tenant si no existía y **sube su `version`**, lo que deja inalcanzables las respuestas cacheadas con el prompt anterior. Nunca modifica la global (HU-IA-01). |
| GET | `/api/ai/responses` | admin | Auditoría paginada de llamadas a la IA; `?method` (HU-KB-04). |
| GET | `/api/ai/responses/:id/context` | admin | Prompt, `kbVersion` y fragmentos de KB que sustentaron una respuesta. `contextAvailable: false` si la llamada no dejó trace (HU-KB-04). |
| GET | `/api/kb/faqs` | admin | Preguntas frecuentes del tenant, paginado, `?activo` opcional. Además de `total` (que sí responde al filtro) devuelve `activas` y `minimoActivas`, **de alcance tenant**: son el conteo contra el que se aplica el mínimo (HU-KB-02-V3). |
| POST | `/api/kb/faqs` | admin | Crea una FAQ y embebe su pregunta → `201`. **Nunca** limitada por el mínimo: al mínimo se sube escribiendo. `409` si la pregunta ya existe en el tenant. |
| PATCH | `/api/kb/faqs/:id` | admin | Edita pregunta, respuesta y/o `activo`. Solo re-embebe si cambia el **texto** de la pregunta. `409` con `{ activas, minimo }` si `activo: false` dejaría al tenant por debajo de `FAQ_MIN_ACTIVAS`; editar textos y reactivar nunca se bloquean (HU-KB-02-V3). |
| DELETE | `/api/kb/faqs/:id` | admin | Mismo `409` al eliminar una FAQ **activa** que rompería el mínimo. Eliminar una ya inactiva nunca se bloquea: no mueve el conteo. |
| POST | `/api/kb/faqs/test` | admin | Probador de calibración (`{ pregunta }`). Devuelve el mejor candidato **aunque no matchee**, con `umbral`, `margenMinimo`, `overlapMinimo` y el desglose de las tres señales del cortocircuito (HU-KB-02-V2). Solo lectura. |
| GET/POST | `/api/webhooks/meta` | público | Verificación + recepción de eventos de Meta. |

## 7. Tiempo real (Socket.IO)

- Namespace autenticado por JWT.
- *Rooms* por `tenantId` y por `asesorId` para que cada usuario solo reciba sus conversaciones.
- Eventos: `message:new`, `conversation:updated` (room `tenant:<id>`, refresca la bandeja de todos
  los admins) y `conversation:assigned` (room `asesor:<destinatario>` **únicamente**, dispara el
  toast de notificación — HU-OMNI-02).
