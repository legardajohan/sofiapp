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
  customFields: { [key: String]: Mixed },   // SUPERADO por `atributos` (HU-CRM-02); ver nota abajo
  // datos sensibles registrados a mano por el asesor (HU-CRM-02) — EN CLARO (ver nota abajo)
  correoEnc: String?,             // sufijo `Enc` histórico; el cifrado en reposo está desactivado
  documentoEnc: String?,          // documento de identidad, igual
  atributos: [{                   // subdoc con _id: false; orden significativo (el que dio el asesor)
    key: String,                  // slug 1..40, /^[a-z0-9][a-z0-9_-]*$/; estable aunque cambie el label
    label: String,                // 1..60
    valor: String,                // 1..500; en claro (con `sensible` solo cambia quién puede leerlo)
    sensible: Boolean             // default false
  }],
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

> **El cifrado en reposo de estos campos está DESACTIVADO (HU-CRM-02).** `correoEnc`,
> `documentoEnc`, `textoEnc` de las notas y el `valor` de los atributos sensibles se guardan **en
> claro**. Dependían de `DATA_ENC_KEY`, una variable opcional, y sin ella cualquier guardado moría
> con un 500. Lo que protege el dato es el **control de acceso por subrol** (`authorizeSubrol` +
> enmascarado), que nunca dependió del cifrado; lo que se pierde es la protección ante un volcado de
> la base o un backup extraviado. Los valores escritos mientras estuvo activo llevan el prefijo
> `enc:v1:` y se siguen leyendo (`utils/field-crypto.util`), así que no hizo falta migrar.
>
> **Siguen sin indexarse ni buscarse.** No hay índice ni filtro sobre ellos: buscar por correo
> exigiría su propio feature (y volvería a chocar con el cifrado si se reactiva).

> **`atributos` supera a `customFields`.** `customFields` es un `Record<String, Mixed>` plano y no
> puede llevar el metadato `sensible` por campo sin anidar objetos (lo que rompería su propio tipo),
> ni conserva el orden. `atributos` sí. `customFields` **no se migra ni se elimina**: hoy vale `{}`
> en todos los documentos, así que no hay dato que mover; retirarlo del schema es una limpieza
> aparte.

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
- `{ tenantId: 1, createdAt: -1 }` — orden por defecto del listado (HU-CRM-03).
- `{ tenantId: 1, estado: 1, createdAt: -1 }` — `GET /api/leads?estado=`.
- `{ tenantId: 1, responsableId: 1, createdAt: -1 }` — `GET /api/leads?asesor=`.

> **Los tres índices del listado cierran con `createdAt: -1`**, que es como ordena la tabla, para
> que Mongo resuelva filtro y orden con el mismo índice en vez de ordenar en memoria. El filtro
> `?semaforo=` no lleva índice propio: no es un campo del lead, sino una etiqueta de la
> conversación, y resuelve por `clienteId` — ya cubierto por el índice de arriba.

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

> `estado` guarda la **`key` de una etapa del catálogo `estados`** del tenant (HU-CRM-03), no un
> enum: el schema no lleva `enum` y lo valida el service contra el catálogo de la empresa. Las cinco
> claves sembradas coinciden con el antiguo `ESTADOS_COMERCIALES`, así que los leads anteriores
> siguen resolviendo su etiqueta sin migración.
>
> El lead **no** introduce etapas ni pipeline propio: el embudo de HU-PIPE-01 se dibuja sobre este
> campo y sobre `estados`, sin colección nueva. El tablero Kanban, que `product.md` §5 había
> descartado, se reincorporó en esa historia — ver `docs/adr/0007-tablero-kanban-pipeline.md`.

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
  obligatorio: Boolean,           // V2: preset mínimo para que la IA responda; NO se puede eliminar
  oculto: Boolean,                // HU-KB-06: soft-delete de un preset eliminado (default false)
  proposito: String?,             // V2: guía de qué escribir (placeholder), típico de los presets
  error: String?,                 // motivo si estadoIndexacion = "fallido"
  estructura: Mixed?,             // HU-KB-07: conocimiento capturado campo a campo (JSON opaco)
  createdAt, updatedAt
}
// Índices: { tenantId: 1, titulo: 1 } unique
//          { tenantId: 1, createdAt: -1 }
// Contenido tope 10.000 caracteres (validación Zod; eran 3.000 hasta HU-KB-07). Editar (PATCH)
// re-versiona, limpia chunks y re-indexa solo si el contenido no está vacío. Los 5 presets se
// siembran vacíos al crear el tenant.
//
// HU-KB-06 — semántica de escritura:
//  · Guardar contenido equivalente al ya almacenado (comparación normalizada: trim + colapso de
//    whitespace, SIN bajar a minúsculas) es un NO-OP total: no re-versiona, no borra chunks, no
//    encola kb-index, no toca `updatedAt` ni `Tenant.kbVersion`.
//  · DELETE de un `obligatorio: true` → 400. DELETE de una de las 5 categorías predefinidas
//    (por título, no solo por `isPreset`) → soft-delete: borra sus chunks y marca `oculto: true`
//    con `contenido: ""`, sin borrar el documento. Un documento libre sí se borra de verdad.
//  · El listado SIGUE devolviendo los ocultos con su flag: el frontend los necesita para distinguir
//    "el preset nunca se creó" de "el admin lo eliminó" y no reponer la tarjeta. Re-crear ese
//    título es una re-alta sobre el mismo documento (`oculto: false`), nunca un duplicado.
//
// HU-KB-07 — campo `estructura` y su semántica de escritura:
//  · Forma: { schemaVersion: Number, schemaId: String, campos: { <id>: <valor> }, adicional: String }.
//    Cada valor lleva su propio discriminante `tipo` ("texto" | "lista" | "triestado" | "horario" |
//    "repetible"), de modo que se puede leer sin conocer el schema con que se guardó. `adicional` es
//    «Información adicional» y SIEMPRE está presente (puede ser "").
//  · El backend NO la interpreta ni deriva `contenido` a partir de ella: el frontend serializa y
//    envía ambos en el mismo POST/PATCH. Zod valida solo el sobre (las 4 claves) y un tope de 40.000
//    caracteres del JSON. Añadir campos nuevos NO requiere tocar el backend.
//  · `contenido` sigue siendo la fuente de verdad de indexación, chunkCount, versionado, isFirstFill
//    y retrieval. `estructura` lo es solo de la edición guiada del modal.
//  · Ausente en el DTO significa NO TOCAR, nunca borrar: guardar desde el modo legado no destruye la
//    estructura de un documento que ya la tenía. No hay camino de borrado.
//  · Contenido igual + estructura DISTINTA → se persiste solo `estructura`: sin $inc de version, sin
//    borrar chunks, sin encolar kb-index y sin bumpKbVersion (el texto que ve la IA no cambió).
//    `updatedAt` sí avanza, porque hubo escritura. Contenido igual + estructura igual sigue siendo el
//    NO-OP total de HU-KB-06.
//  · Retrocompatible: un documento sin `estructura` se comporta exactamente como antes de HU-KB-07.
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
> Acciones registradas hoy: `conversation.assign`, `lead.create`, `lead.delete` (HU-CRM-01),
> `lead.estado` (HU-PIPE-01: cambio de etapa del pipeline; acción propia para que el historial de
> etapa no tenga que colar las altas y las bajas — los cambios anteriores quedaron como
> `lead.update` y **no se migran**, se consultan);
> `cliente.update` y `contact-note.create` (HU-CRM-02).
>
> En `lead.delete` el `antes` no es un snapshot parcial sino el lead **entero** — al ser borrado
> duro, es la única copia que queda — y el `despues` lleva solo `{ motivo }`.
>
> **La bitácora nunca guarda un valor sensible.** Esta colección no tiene control de acceso por
> subrol, así que volcar aquí el antes/después de un campo sensible lo dejaría al alcance de quien
> no puede verlo en la ficha. En `cliente.update`, `correo`, `documento` y los
> atributos sensibles se guardan como la cadena `"[oculto]"` — queda constancia de **qué** cambió,
> nunca de **a qué**. `contact-note.create` registra el id de la nota y su `clienteId`, jamás el
> texto.

## contact_notes  (notas de seguimiento del contacto — HU-CRM-02)
```js
{
  _id: ObjectId,
  tenantId: ObjectId,             // required + index
  clienteId: ObjectId,            // ref Cliente — el contacto al que pertenece
  autorId: ObjectId,              // ref User — quién la escribió
  textoEnc: String,               // 1..2000; sufijo `Enc` histórico — se persiste en claro
  createdAt, updatedAt
}
// Índice: { tenantId: 1, clienteId: 1, createdAt: -1 }   (es exactamente la consulta de la tarjeta)
```
> **Colección propia, no un subdocumento de `clientes`.** Mismo motivo que `messages`: el documento
> del contacto no debe crecer sin techo, y paginar o auditar notas sueltas desde un array embebido
> es incómodo.

> **La nota es sensible entera, no por campos.** Es prosa libre donde acaba cualquier cosa
> (condiciones de pago, datos de un tercero, un motivo personal) y no hay forma de enmascararla
> selectivamente. Por eso su gate va a nivel de **ruta** (`authorizeSubrol`) y no de campo: un
> `coordinator`/`secretary` recibe `403` tanto al leerlas como al crearlas. Consecuencia de producto
> asumida a conciencia.

> **Solo se agrega.** No hay editar ni borrar: una nota es un asiento del historial. Tampoco hay
> adjuntos.

## contact_options  (catálogos de interés / objeción / rol — HU-CRM-02)
```js
{
  _id: ObjectId,
  tenantId: ObjectId,             // required + index
  tipo: "interes" | "objecion" | "rol",
  key: String,                    // 1..40, slug derivado del label AL CREARLA; NO cambia al renombrar
  label: String,                  // 1..60
  color: String,                  // "#RRGGBB": DATO del tenant, igual que en `tags`. default #475569
  orden: Number,                  // posición en el desplegable, la decide el admin (no alfabético)
  activo: Boolean,                // false = archivada
  esDefecto: Boolean,             // sembrada por el sistema; informativa, se edita como cualquier otra
  createdAt, updatedAt
}
```
Índices:
- `{ tenantId: 1, tipo: 1, key: 1 }` **unique**, incluidas las archivadas: si no, "crear" una con la
  clave de una archivada duplicaría el valor que los contactos ya llevan grabado.
- `{ tenantId: 1, tipo: 1, orden: 1 }` — la lectura del catálogo, siempre ordenada.

> **Estos tres campos dejaron de ser `enum` en `clientes`.** Eran un supuesto del vertical Pre-ICFES
> metido en el modelo: una inmobiliaria no objeta por "tiempo". Ahora son datos del tenant, y quien
> valida que una clave exista y esté activa es `assertOpcionesValidas`, no Mongoose.

> **`key` estable, `label` y `color` mutables.** `Cliente.nivelInteres` guarda la `key`, no una
> referencia: renombrar "Frío" a "Poco interés" o cambiarle el color debe conservar el vínculo con
> los contactos ya clasificados. Mismo criterio que `Tag.semaforo`.

> **Borrar archiva si está en uso.** Un `DELETE` de una opción que algún contacto tiene registrada
> la pone `activo: false` en vez de eliminarla, para que esas fichas sigan resolviendo su etiqueta en
> lugar de mostrar la clave cruda. La respuesta dice cuál de las dos cosas pasó.

> **El color de fábrica del interés es un semáforo térmico:** frío `#2563EB` (azul), tibio `#CA8A04`
> (ámbar), caliente `#DC2626` (rojo). Los hex salen de la misma gama que ofrece el selector de
> etiquetas, para que el CRM entero hable de "rojo" con un único rojo. La UI nunca los pinta crudos:
> pasan por `tagColors`, que garantiza 4.5:1 en claro y en oscuro.

## ai_usage_logs  (métricas de cada llamada a AIService — HT-AI-01)
```js
{
  _id: ObjectId,
  tenantId: ObjectId,
  method: "chat" | "extract" | "classify" | "summary",
  llmModel: String,               // p.ej. "gemini-1.5-flash" (env.GEMINI_MODEL)
  promptTokens: Number,
  completionTokens: Number,
  totalTokens: Number,
  cacheHit: Boolean,
  fromFaq: Boolean,                // respondida por cortocircuito de FAQ, sin generación (HU-KB-02)
  durationMs: Number,
  createdAt                        // { timestamps: { createdAt: true, updatedAt: false } }
}
// Índices: { tenantId: 1 }, { tenantId: 1, createdAt: -1 }
// TTL: { createdAt: 1 }, expireAfterSeconds: 7776000 (90 días) — ciclo de vida de MÉTRICAS
// operativas. La auditoría persistente vive aparte, en ai_response_contexts (sin TTL).
```
> Es la entidad "respuesta de IA" que expone `GET /api/ai/responses` y el `:id` de
> `GET /api/ai/responses/:id/context` (HU-KB-04): se crea una fila por cada llamada a
> `AIService.chat/extract/classify/summarize`, exista o no trace de auditoría asociado.

## ai_response_contexts  (trazabilidad de fuentes/contexto — HU-KB-04)
```js
{
  _id: ObjectId,
  tenantId: ObjectId,
  usageLogId: ObjectId,            // ref AiUsageLog — 1:1, la llamada que este trace documenta
  promptSnapshot: {
    method: "chat" | "extract" | "classify" | "summary",
    version: String,               // versión del PromptTemplate VIGENTE en el momento de generar
    systemPrompt: String,          // texto completo del prompt de sistema usado
  },
  retrievedChunks: [ { texto: String, documentId: String, score: Number } ],  // [] hasta Fase 3
  kbVersion: Number | null,        // Tenant.kbVersion en el momento de la llamada
  createdAt                        // { timestamps: { createdAt: true, updatedAt: false } }
}
// Índices: { tenantId: 1, usageLogId: 1 } unique
// SIN índice TTL: retención indefinida (auditoría). Política de expiración/compliance pendiente
// de una HU futura — ver docs/specs/HU-KB-04-contexto-ia/spec.md → Fuera de alcance.
```
> Se escribe fire-and-forget desde `AIService.chat()` (los tres caminos: hit de caché exacta, hit
> de FAQ y generación real), sin bloquear la respuesta al llamador. `retrievedChunks` se persiste
> vacío hasta que una HU de Fase 3 conecte `searchKnowledge()` (RAG) dentro de `chat()`; el modelo
> y el endpoint ya están listos para recibirlos sin cambios de esquema. `extract()`, `classify()`
> y `summarize()` no escriben `AiResponseContext` — solo `chat()` produce "respuestas" auditables
> en el sentido de esta HU.

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
          ├──N AiUsageLog ──1 AiResponseContext (usageLogId, 1:1, sin TTL — HU-KB-04)
          └──N Flow ──N FlowState ──1 Cliente
Plan 1──N Tenant            (Plan es catálogo GLOBAL, sin tenantId)
Tenant 1──N TenantUsage     (uno por periodo YYYY-MM)
User(superadmin) tenantId=null  (global)
```

## `estados`

Catálogo por tenant de las **etapas del pipeline de leads** (HU-CRM-03). Antes eran el enum fijo
`ESTADOS_COMERCIALES`, igual para todas las empresas — el mismo supuesto de vertical que ya se sacó
del modelo en `contact_options`.

| Campo | Tipo | Notas |
|---|---|---|
| `tenantId` | ObjectId | Requerido e indexado. |
| `key` | string (≤40) | Slug estable derivado del `label`. **Es lo que se graba en `Lead.estado`**, así que no cambia al renombrar. |
| `label` | string (≤60) | Nombre visible, editable. |
| `color` | string | `#RRGGBB` elegido por la empresa. La UI lo pasa por el helper de contraste, nunca lo pinta crudo. |
| `orden` | number | Posición en el pipeline. El orden cuenta una historia; alfabético la rompe. |
| `activo` | boolean | `false` = archivado: no se ofrece para filtrar, pero sigue resolviendo su etiqueta. |
| `esDefecto` | boolean | Sembrado al crear el tenant. Informativo. |
| `esSalida` | boolean | Etapa terminal del embudo (HU-PIPE-01). **Descriptivo, no restrictivo**: marca qué columnas cierran el recorrido para que la UI las señale, sin bloquear ninguna transición. |

Índices: `{ tenantId, key }` **único** (incluye los archivados, para no duplicar una clave que los
leads ya llevan grabada) y `{ tenantId, orden }` para la lectura del catálogo.

> Desde HU-PIPE-01 se siembra además **`declinado`** («Declinado», `esSalida: true`), que convive
> con `perdido`: `perdido` es la oportunidad que se enfrió y `declinado` la que dijo que no. Los
> tenants anteriores la reciben por `backfillEstadoDeclinado()`, un backfill dirigido — la siembra
> general ya no pasa por ellos porque llevan `estadosSeeded: true`.
>
> Las cinco claves sembradas (`nuevo`, `en_gestion`, `pago_pendiente`, `pagado`, `perdido`) son
> **exactamente** los valores del enum anterior, así que el paso de enum a catálogo no necesita
> migrar un solo documento. `Lead.estado` deja de tener `enum` en el schema: lo valida el service
> contra el catálogo del tenant.
