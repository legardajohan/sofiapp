# Modelo de Datos — SofiApp (MongoDB)

> Fuente de verdad de datos. Todos los esquemas (salvo `tenants` y el `User` global del
> Superadmin) llevan `tenantId` obligatorio e indexado. Tipos en notación conceptual; en código
> son schemas Mongoose tipados con `I<X>` / `I<X>Document`.

## Convenciones

- `_id`: `ObjectId`. `createdAt`/`updatedAt`: `ISODate` vía `{ timestamps: true }`.
- `tenantId`: `{ type: ObjectId, ref: 'Tenant', required: true, index: true }`.
- Índices compuestos `{ tenantId, <campo> }` para rendimiento y para reforzar el aislamiento.
- Campos sensibles (`passwordHash`, tokens) con `select: false` y/o cifrados at-rest.

---

## tenants
```js
{
  _id: ObjectId,
  nombre: String,                 // requerido
  slug: String,                   // único, referencia interna (ej. "acme")
  nit: String,                    // identificador fiscal (CO: NIT). opcional
  contacto: { email: String, telefono: String },
  estado: "activo" | "suspendido" | "prueba",   // default "prueba"
  planId: ObjectId,               // ref Plan
  // configuración de captura por IA específica del tenant
  camposCaptura: [ { key: String, label: String, tipo: "string"|"number"|"enum", opciones: [String] } ],
  kbVersion: Number,              // default 1. Contador de cambios de contenido en la KB; invalida
                                   // la caché exacta de respuestas de IA (HU-KB-03)
  createdAt, updatedAt
}
// Índices: { slug: 1 } unique
```

## plans  (catálogo GLOBAL — sin tenantId, como tenants)
```js
{
  _id: ObjectId,
  nombre: String,                 // único. ej. "Básico", "Estándar", "Pro"
  limites: {
    usuarios: Number,             // total acumulado de usuarios del tenant
    mensajesMes: Number,          // mensajes OUTBOUND por periodo (YYYY-MM)
    leads: Number,                // total acumulado de clientes/leads del tenant
    campanasMes: Number           // campañas lanzadas por periodo
  },
  precio: Number,
  costoEstimado: Number?,         // para rentabilidad: margen = precio - costoEstimado
  activo: Boolean,                // default true
  createdAt, updatedAt
}
// Índices: { nombre: 1 } unique
```

## tenant_usage  (contadores de consumo por empresa y periodo — HU-SAAS-02)
```js
{
  _id: ObjectId,
  tenantId: ObjectId,             // required, index
  periodo: String,                // 'YYYY-MM' (UTC). El cambio de periodo reinicia los contadores.
  mensajesMes: Number,            // default 0. $inc atómico en cada envío outbound
  campanasMes: Number,            // default 0. $inc atómico al lanzar una campaña
  createdAt, updatedAt
}
// Índices: { tenantId: 1, periodo: 1 } unique
// NOTA: usuarios y leads NO se guardan aquí; se derivan con countDocuments scoped al consultar.
```

## users  (usuarios del panel)
```js
{
  _id: ObjectId,
  tenantId: ObjectId | null,      // null SOLO para Superadmin (global)
  nombre: String,
  email: String,
  passwordHash: String,           // select:false
  rol: "superadmin" | "admin",
  subrol: "director" | "manager" | "coordinator" | "secretary" | null,  // opcional, solo admin; metadata, no afecta permisos (AUTH-02)
  activo: Boolean,                // default true
  createdAt, updatedAt
}
// Índices: { email: 1 } unique  (email único GLOBAL para usuarios de panel; login resuelve el tenant — ADR 0003)
//          { tenantId: 1, email: 1 }  (NO único; lookups scoped por tenant)
//          { rol: 1 }  (para localizar al/los superadmin)
```

## meta_integrations  (conexión BSP por tenant; resuelve el webhook)
```js
{
  _id: ObjectId,
  tenantId: ObjectId,
  canal: "whatsapp" | "instagram" | "messenger",
  wabaId: String,
  phoneNumberId: String,          // ÍNDICE ÚNICO GLOBAL — lookup pre-auth del webhook
  accessTokenEnc: String,         // cifrado at-rest (AES-256-GCM). select:false
  igBusinessId: String?,          // si canal = instagram
  fbPageId: String?,              // si canal = messenger
  activo: Boolean,
  createdAt, updatedAt
}
// Índices: { phoneNumberId: 1 } unique  (global, NO tenant-scoped: lo usa el webhook)
//          { tenantId: 1, canal: 1 }
```

## clientes  (prospectos / leads)
```js
{
  _id: ObjectId,
  tenantId: ObjectId,
  // identidad por canal
  metaUserId: String,             // sender_id de Meta
  telefono: String,
  nombre: String?,
  canalOrigen: "whatsapp" | "instagram" | "messenger" | "formulario" | "web",
  // datos declarados (core genérico)
  rolContacto: "decisor" | "usuario" | "desconocido",   // inferido por IA
  interesItemId: ObjectId?,       // ref CatalogItem (producto/servicio de interés)
  // señales inferidas por IA
  nivelInteres: "frio" | "tibio" | "caliente" | null,
  objecionPrincipal: "precio" | "tiempo" | "confianza" | "otra" | null,
  // comercial
  estadoComercial: "nuevo" | "en_gestion" | "pago_pendiente" | "pagado" | "perdido",  // default "nuevo"
  asesorId: ObjectId?,            // ref User (usuario admin asignado a la conversación; el nombre del campo describe la función, no un rol de login — AUTH-02)
  // datos verticales específicos del tenant (ej. colegio, grado en Pre-ICFES)
  customFields: { [key: String]: Mixed },
  tagIds: [ObjectId],             // ref Tag (HU-OMNI-04). Sustituye al antiguo `tags: [String]`
  ultimoMensajeAt: ISODate?,      // para ordenar la bandeja
  // bandeja única (HU-OMNI-01)
  noLeidos: Number,               // default 0; contador de no leídos, reseteado por PATCH /read
  iaHabilitada: Boolean,          // default true; toggle de Sofi (IA) por conversación
  // ventana de servicio de WhatsApp (HT-WA-01): se recalcula a `now + 24h` en cada inbound.
  // Fuera de esta ventana `sendMessage` rechaza el envío de texto libre con 422 — solo se puede
  // responder con plantilla HSM aprobada (HT-WA-02).
  ventana24hExpiraEn: ISODate?,
  createdAt, updatedAt
}
// `asesorId` es el único campo persistido; `asignadoA` (HU-OMNI-02) es el alias público del
// contrato HTTP (query, body de PATCH /assign, DTO) — mismo valor, sin migración de datos.
// Índices: { tenantId: 1, estadoComercial: 1 }
//          { tenantId: 1, asesorId: 1 }
//          { tenantId: 1, ultimoMensajeAt: -1 }
//          { tenantId: 1, telefono: 1 }
//          { tenantId: 1, nivelInteres: 1 }   (segmentación de campañas)
```
> **Decisión:** el historial de conversación NO se embebe aquí (evita el límite de 16MB y el
> crecimiento ilimitado del documento en chats activos). Se modela en `messages`.

## messages  (historial de conversación, colección separada)
```js
{
  _id: ObjectId,
  tenantId: ObjectId,
  clienteId: ObjectId,            // ref Cliente
  canal: "whatsapp" | "instagram" | "messenger",
  direccion: "inbound" | "outbound",
  sender: "user" | "bot" | "agent",
  tipo: "text" | "image" | "template" | "audio" | "document" | "other",
  texto: String?,
  attachmentUrl: String?,         // DO Spaces (media recibida/enviada)
  metaMessageId: String?,         // idempotencia con Meta, SCOPED por tenant (ver índice)
  // estado de entrega de Meta, actualizado por los `statuses` del webhook (HT-WA-01)
  status: "sent" | "delivered" | "read" | "failed",   // default "sent"
  createdAt: ISODate
}
// Índices: { tenantId: 1, clienteId: 1, createdAt: 1 }   (hilo de conversación)
//          { tenantId: 1, metaMessageId: 1 } sparse      (dedupe de webhooks, POR TENANT — nunca
//                                                          global: HT-WA-01-V2 cerró una fuga de
//                                                          aislamiento donde el dedupe y el update
//                                                          de `status` no llevaban `tenantId`)
```

## whatsapp_templates  (catálogo de plantillas HSM, espejo de Meta — HT-WA-02)
```js
{
  _id: ObjectId,
  tenantId: ObjectId,
  metaTemplateId: String,         // id devuelto por Meta al crear/sincronizar
  name: String,                   // nombre aprobado por Meta (snake_case)
  language: String,               // 'es', 'es_CO', 'en_US'
  category: "MARKETING" | "UTILITY" | "AUTHENTICATION",
  status: "APPROVED" | "PENDING" | "REJECTED" | "PAUSED" | "DISABLED",
  components: [{                  // tal y como los devuelve/espera la Graph API, íntegros
    type: "HEADER" | "BODY" | "FOOTER" | "BUTTONS",
    format: "TEXT" | "IMAGE" | "DOCUMENT" | "VIDEO",
    text: String?,
    buttons: [Mixed]?,
    example: { body_text: [[String]] }?,   // sets de ejemplo, para la vista previa
  }],
  parametrosBody: Number,         // nº de placeholders {{n}} del componente BODY, derivado al persistir
  syncedAt: ISODate,              // último sync (manual, POST /api/templates/sync) o alta
  obsoleta: Boolean,              // Meta dejó de devolverla en el último sync; NO se borra
  createdAt, updatedAt
}
// Índices: { tenantId: 1, name: 1, language: 1 } unique  (espejo local, coexisten homónimas entre tenants)
//          { tenantId: 1, status: 1 }
```
> **Por qué no es único global `metaTemplateId`:** dos tenants distintos conectan WABAs distintas
> y pueden tener plantillas homónimas; a diferencia de `MetaIntegration.phoneNumberId`, aquí el
> identificador de Meta no es único por construcción entre tenants.

## catalog_items  (catálogo genérico — antes "cursos")
```js
{
  _id: ObjectId,
  tenantId: ObjectId,
  nombre: String,
  descripcion: String?,
  precio: Number?,
  modalidad: String?,             // genérico/opcional (ej. "presencial","virtual")
  atributos: { [key: String]: Mixed },   // flexible por vertical
  fechaInicio: ISODate?,
  activo: Boolean,                // default true
  createdAt, updatedAt
}
// Índices: { tenantId: 1, activo: 1 }
```

## tags  (etiquetas de conversación — HU-OMNI-04)
```js
{
  _id: ObjectId,
  tenantId: ObjectId,             // required + index
  nombre: String,                 // 1..30, único por tenant ignorando mayúsculas/acentos
  color: String,                  // "#RRGGBB" elegido por el admin: es DATO, no un token de diseño
  semaforo: "azul" | "rojo" | "naranja" | "verde" | undefined,
  createdAt, updatedAt
}
```
Índices:
- `{ tenantId: 1, nombre: 1 }` **unique** con `collation { locale: 'es', strength: 2 }` —
  "Urgente", "urgente" y "URGENTE" colisionan dentro del mismo tenant.
- `{ tenantId: 1, semaforo: 1 }` **unique** con `partialFilterExpression: { semaforo: { $exists: true } }`.
  Parcial y **no** `sparse`: en un índice compuesto, `sparse` incluye el documento si existe
  *cualquiera* de sus campos, y `tenantId` existe siempre — con `sparse` esto significaría
  "una sola etiqueta sin semáforo por tenant".

`semaforo` es el identificador estable de las cuatro etiquetas de sistema (ver `docs/domain.md`
§ Semaforización). El admin puede renombrarlas y recolorearlas; el slug no cambia, y es por él que
CRM-04, IA-05 y MARK-01 las resuelven.

## leads  (oportunidades comerciales — HU-CRM-01)
```js
{
  _id: ObjectId,
  tenantId: ObjectId,             // required + index
  nombre: String,                 // 1..120
  telefono: String,               // normalizado a solo dígitos; único por tenant
  correo: String?,
  clienteId: ObjectId,            // ref Cliente — el contacto ("¿con quién hablo?")
  origen: {                       // trazabilidad; subdoc con _id: false
    tipo: "conversacion",
    conversacionId: ObjectId,     // ref Cliente — la conversación ("¿de dónde salió?")
    convertidoPor: ObjectId,      // ref User
    convertidoAt: ISODate
  },
  responsableId: ObjectId,        // ref User; por defecto, quien convirtió
  estado: "nuevo" | "en_gestion" | "pago_pendiente" | "pagado" | "perdido",   // default "nuevo"
  createdAt, updatedAt
}
```
Índices:
- `{ tenantId: 1, telefono: 1 }` **unique** — un teléfono, un lead por empresa. Es la única defensa
  real contra dos conversiones simultáneas (entre el `find` y el `create` cabe otra petición); el
  service traduce el `E11000` a un `409` que adjunta el `leadId` existente. Es único **por tenant**:
  dos empresas pueden tener el mismo número.
- `{ tenantId: 1, clienteId: 1 }` — responde "¿esta conversación ya se convirtió?" en lote, para la
  bandeja y la ficha del contacto (`leadId`).

> **Borrado duro, no archivado.** `DELETE /api/leads/:id?motivo=…` elimina el documento; no hay
> `deletedAt` ni bandera de baja. La razón es el índice único de arriba: un lead marcado como
> borrado seguiría ocupando su teléfono y bloquearía con un `409` la reconversión de su propia
> conversación. Lo que sobrevive es el `AuditEvent` `lead.delete`, que guarda el lead completo en
> `antes` y el motivo (`duplicado` | `spam` | `prueba` | `sin_respuesta` | `no_interesado`) en
> `despues`. Un lead legítimo que se pierde no se borra: se mueve a `estado: "perdido"`.

> **`clienteId` y `origen.conversacionId` coinciden hoy** y no es redundancia por descuido: una
> conversación **es** un `Cliente` (ver `domain.md`), pero los dos campos responden preguntas
> distintas y el día que la conversación deje de ser un `Cliente`, el origen sobrevive.

> **No confundir con la métrica de cuota.** `plans.limites.leads` y `QuotaMetric = 'leads'` cuentan
> documentos de **`clientes`** vía `countScoped`, no esta colección. HU-CRM-01 no toca cuotas.

> `estado` reutiliza la unión de `clientes.estadoComercial` (fuente única:
> `ESTADOS_COMERCIALES` en `cliente.types.ts`). El lead **no** introduce etapas ni pipeline propio;
> Kanban sigue descartado por `product.md` §5.

## campaigns  (remarketing)
```js
{
  _id: ObjectId,
  tenantId: ObjectId,
  nombre: String,
  filtros: {                      // segmentación dinámica
    nivelInteres: [String]?, estadoComercial: [String]?,
    interesItemId: ObjectId?, tagIds: [ObjectId]?, customFields: Object?
  },
  plantillaHSM: String,           // nombre de la plantilla aprobada por Meta
  estado: "borrador" | "en_curso" | "completada" | "fallida",
  totales: { destinatarios: Number, enviados: Number, fallidos: Number },
  iniciadaAt: ISODate?,
  createdAt, updatedAt
}
// Índices: { tenantId: 1, createdAt: -1 }
```

## campaign_recipients  (auditoría de envío por destinatario)
```js
{
  _id: ObjectId,
  tenantId: ObjectId,
  campaignId: ObjectId,
  clienteId: ObjectId,
  telefono: String,
  estado: "pendiente" | "enviado" | "fallido",
  error: String?,
  enviadoAt: ISODate?
}
// Índices: { tenantId: 1, campaignId: 1, estado: 1 }
```

## flows  (constructor visual — Fase 3)
```js
{
  _id: ObjectId,
  tenantId: ObjectId,
  nombre: String,
  nodos: [ {
    id: String,
    tipo: "mensaje" | "captura" | "condicion" | "espera" | "handoff" | "ia" | "api",
    posicion: { x: Number, y: Number },
    config: Object                // específico por tipo de nodo (a definir en spec de M06)
  } ],
  aristas: [ { id: String, from: String, to: String, condicion: String? } ],
  version: Number,
  estado: "borrador" | "publicado",
  activo: Boolean,                // solo UNA versión activa por tenant en producción
  createdAt, updatedAt
}
// Índices: { tenantId: 1, activo: 1 }
```

## flow_states  (estado de ejecución del runtime — Fase 3)
```js
{
  _id: ObjectId,
  tenantId: ObjectId,
  clienteId: ObjectId,
  flowId: ObjectId,
  nodoActualId: String,
  variables: Object,              // contexto de la conversación
  updatedAt: ISODate
}
// Índices: { tenantId: 1, clienteId: 1 } unique
```

## kb_documents  (base de conocimiento — RAG, HU-KB-01 · HU-KB-01-V2)
```js
{
  _id: ObjectId,
  tenantId: ObjectId,
  titulo: String,                 // requerido; único por tenant (re-subir = nueva versión)
  contenido: String,              // texto crudo (fuente para re-indexar); default "" (presets nacen vacíos)
  version: Number,                // incremental por documento (versionado del conocimiento por empresa)
  estadoIndexacion: "pendiente" | "procesando" | "indexado" | "fallido",  // default "pendiente"
  chunkCount: Number,             // nº de fragmentos indexados (0 hasta indexar)
  isPreset: Boolean,              // V2: documento base sembrado al crear el tenant (default false)
  proposito: String?,             // V2: guía de qué escribir (placeholder), típico de los presets
  error: String?,                 // motivo si estadoIndexacion = "fallido"
  createdAt, updatedAt
}
// Índices: { tenantId: 1, titulo: 1 } unique
//          { tenantId: 1, createdAt: -1 }
// Contenido tope 3.000 caracteres (validación Zod). Editar (PATCH) re-versiona, limpia chunks y
// re-indexa solo si el contenido no está vacío. Los 5 presets se siembran vacíos al crear el tenant.
```

## kb_chunks  (fragmentos + embeddings — Atlas Vector Search)
```js
{
  _id: ObjectId,
  tenantId: ObjectId,
  documentId: ObjectId,           // ref KbDocument
  version: Number,                // versión del documento a la que pertenece el chunk
  chunkIndex: Number,             // orden dentro del documento
  texto: String,                  // fragmento recuperable como contexto (RAG)
  embedding: [Number],            // vector de dimensión KB_EMBED_DIM (768; gemini-embedding-001 con outputDimensionality=768)
  createdAt
}
// Índices (Mongoose): { tenantId: 1, documentId: 1, version: 1 }
// Índice vectorial (Atlas Search, NO Mongoose — src/scripts/create-kb-vector-index.ts):
//   name: KB_VECTOR_INDEX, type: vectorSearch
//   fields: [ { vector, path: embedding, numDimensions: KB_EMBED_DIM, similarity: cosine },
//             { filter, path: tenantId },   // OBLIGATORIO: aísla el $vectorSearch por tenant
//             { filter, path: version } ]
```
> **Aislamiento del `$vectorSearch`:** la agregación no pasa por el `base.repository`. Se blinda en
> `features/kb/kb.repository.ts` (`vectorSearchScoped`), que inyecta SIEMPRE `filter: { tenantId }`
> del argumento + un `$match { tenantId }` defensivo. El campo `tenantId` como *filter* del índice
> es lo que hace posible ese aislamiento.

## audit_events  (auditoría genérica tenant-scoped — HU-OMNI-02)
```js
{
  _id: ObjectId,
  tenantId: ObjectId,
  actorId: ObjectId,              // ref User — quién hizo el cambio
  accion: String,                 // p.ej. "conversation.assign"
  entidad: String,                // p.ej. "cliente"
  entidadId: ObjectId,            // id de la entidad afectada
  antes: Mixed,                   // snapshot previo (p.ej. { asignadoA: <userId>|null })
  despues: Mixed,                 // snapshot posterior
  createdAt, updatedAt
}
// Índices: { tenantId: 1, entidad: 1, entidadId: 1, createdAt: -1 }
```
> Se estrena con `conversation.assign` (historial de reasignaciones, `GET
> /api/conversations/:id/assignments`); pensada para reutilizarse en futuros eventos auditables
> (cambios de `estadoComercial`, borrados, etc.).
>
> Acciones registradas hoy: `conversation.assign`, `lead.create` y `lead.delete`. En `lead.delete`
> el `antes` no es un snapshot parcial sino el lead **entero** — al ser borrado duro, es la única
> copia que queda — y el `despues` lleva solo `{ motivo }`.

---

## Relaciones (resumen)

```
Tenant 1──┬──N User
          ├──N MetaIntegration   (phoneNumberId único GLOBAL)
          ├──N Cliente ──N Message
          │        └──1 CatalogItem (interesItemId)
          │        └──1 User (asesorId)
          ├──N CatalogItem
          ├──N Campaign ──N CampaignRecipient ──1 Cliente
          ├──N KbDocument ──N KbChunk   (RAG: embeddings + Atlas Vector Search)
          ├──N AuditEvent ──1 User (actorId)   (auditoría genérica — HU-OMNI-02)
          └──N Flow ──N FlowState ──1 Cliente
Plan 1──N Tenant            (Plan es catálogo GLOBAL, sin tenantId)
Tenant 1──N TenantUsage     (uno por periodo YYYY-MM)
User(superadmin) tenantId=null  (global)
```
