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
  createdAt, updatedAt
}
// Índices: { slug: 1 } unique
```

## plans
```js
{
  _id: ObjectId,
  nombre: String,                 // ej. "Básico", "Pro"
  limites: { usuarios: Number, mensajesMes: Number, campanasMes: Number },
  precio: Number,
  activo: Boolean,
  createdAt, updatedAt
}
```

## users  (usuarios del panel)
```js
{
  _id: ObjectId,
  tenantId: ObjectId | null,      // null SOLO para Superadmin (global)
  nombre: String,
  email: String,
  passwordHash: String,           // select:false
  rol: "superadmin" | "admin" | "coordinador" | "asesor",
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
  asesorId: ObjectId?,            // ref User (asesor asignado)
  // datos verticales específicos del tenant (ej. colegio, grado en Pre-ICFES)
  customFields: { [key: String]: Mixed },
  tags: [String],
  ultimoMensajeAt: ISODate?,      // para ordenar la bandeja
  // bandeja única (HU-OMNI-01)
  noLeidos: Number,               // default 0; contador de no leídos, reseteado por PATCH /read
  iaHabilitada: Boolean,          // default true; toggle de Sofi (IA) por conversación
  createdAt, updatedAt
}
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
  metaMessageId: String?,         // idempotencia con Meta
  createdAt: ISODate
}
// Índices: { tenantId: 1, clienteId: 1, createdAt: 1 }   (hilo de conversación)
//          { metaMessageId: 1 }  (dedupe de webhooks)
```

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

## campaigns  (remarketing)
```js
{
  _id: ObjectId,
  tenantId: ObjectId,
  nombre: String,
  filtros: {                      // segmentación dinámica
    nivelInteres: [String]?, estadoComercial: [String]?,
    interesItemId: ObjectId?, tags: [String]?, customFields: Object?
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

## kb_documents  (base de conocimiento — RAG, HU-KB-01)
```js
{
  _id: ObjectId,
  tenantId: ObjectId,
  titulo: String,                 // requerido; único por tenant (re-subir = nueva versión)
  contenido: String,              // texto crudo (fuente para re-indexar)
  version: Number,                // incremental por documento (versionado del conocimiento por empresa)
  estadoIndexacion: "pendiente" | "procesando" | "indexado" | "fallido",  // default "pendiente"
  chunkCount: Number,             // nº de fragmentos indexados (0 hasta indexar)
  error: String?,                 // motivo si estadoIndexacion = "fallido"
  createdAt, updatedAt
}
// Índices: { tenantId: 1, titulo: 1 } unique
//          { tenantId: 1, createdAt: -1 }
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
          └──N Flow ──N FlowState ──1 Cliente
Plan 1──N Tenant
User(superadmin) tenantId=null  (global)
```
