import { Schema, model } from 'mongoose';
import type { IAtributoPersonalizado, IClienteDocument } from './cliente.types.js';

/** Atributo personalizado del contacto (HU-CRM-02). `valor` va cifrado cuando `sensible`. */
const AtributoSchema = new Schema<IAtributoPersonalizado>(
  {
    key: { type: String, required: true },
    label: { type: String, required: true },
    valor: { type: String, required: true },
    sensible: { type: Boolean, default: false },
  },
  { _id: false },
);

const ClienteSchema = new Schema<IClienteDocument>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    metaUserId: { type: String, required: true },
    telefono: { type: String, required: true },
    nombre: { type: String },
    canalOrigen: {
      type: String,
      enum: ['whatsapp', 'instagram', 'messenger', 'formulario', 'web'],
      required: true,
    },
    estadoComercial: {
      type: String,
      enum: ['nuevo', 'en_gestion', 'pago_pendiente', 'pagado', 'perdido'],
      default: 'nuevo',
    },
    ventana24hExpiraEn: { type: Date },
    ultimoMensajeAt: { type: Date },
    // Bandeja (HU-OMNI-01): contador de no leídos y flag de Sofi (IA) por conversación.
    noLeidos: { type: Number, default: 0 },
    iaHabilitada: { type: Boolean, default: true },
    asesorId: { type: Schema.Types.ObjectId, ref: 'User' },
    // Handoff automático (HU-IA-03): cuándo y por qué Sofi transfirió la conversación a una
    // persona. Se persiste porque la bandeja tiene que distinguirlo de un vistazo, y resolverlo
    // por `audit_events` en cada fila del listado no es viable. Deliberadamente SIN índice: se
    // lee al proyectar la conversación, nadie filtra la bandeja por esto todavía.
    handoffAt: { type: Date, default: null },
    handoffMotivo: { type: String, default: null },
    // Qué condición propia del admin la disparó (HU-IA-07); `null` para las cuatro de fábrica.
    // Guarda el NOMBRE a propósito: si el admin la renombra o la borra, esta conversación tiene que
    // seguir diciendo por qué se transfirió entonces. `_id: false` como el resto de subdocs.
    handoffCondicion: {
      type: new Schema(
        { key: { type: String, required: true }, nombre: { type: String, required: true } },
        { _id: false },
      ),
      default: null,
    },
    customFields: { type: Schema.Types.Mixed, default: {} },
    // Etiquetas de empresa (HU-OMNI-04). Sustituyen al antiguo `tags: [String]` de texto libre;
    // la migración vive en `scripts/migrate-cliente-tags.ts`.
    tagIds: [{ type: Schema.Types.ObjectId, ref: 'Tag' }],
    // Claves del catálogo `contact_options` del tenant (HU-CRM-02). **Sin `enum`**: las tres listas
    // dejaron de ser estructura y pasaron a ser datos que cada empresa administra (CRUD desde la
    // ficha del contacto). Lo que antes garantizaba el enum lo garantiza ahora
    // `assertOpcionesValidas`, que comprueba contra las opciones ACTIVAS del tenant antes de
    // escribir. Se guarda la `key`, no un ObjectId: así renombrar la opción no toca los contactos y
    // archivarla no deja una referencia colgada.
    nivelInteres: { type: String },
    objecionPrincipal: { type: String },
    rolContacto: { type: String },
    interesItemId: { type: Schema.Types.ObjectId, ref: 'CatalogItem' },
    // Datos sensibles del contacto (HU-CRM-02). El cifrado en reposo está desactivado (ver
    // `utils/field-crypto.util`); el sufijo `Enc` se conserva para no migrar los documentos.
    // Deliberadamente SIN índice: no son buscables por diseño.
    correoEnc: { type: String },
    documentoEnc: { type: String },
    atributos: { type: [AtributoSchema], default: [] },
    // Resumen por IA de la conversación (HU-OMNI-03). Opcional; se genera bajo demanda.
    resumenIA: {
      type: new Schema(
        {
          texto: { type: String, required: true },
          generadoAt: { type: Date, required: true },
          mensajesHasta: { type: Date, required: true },
          modelo: { type: String, required: true },
        },
        { _id: false },
      ),
      required: false,
    },
    // Última clasificación de intención de compra (HU-IA-05). Opcional: solo existe cuando la IA
    // llegó a clasificar la conversación. SIN `enum` en `slug`/`nivelInteres`/`objecion`, por
    // coherencia con el resto del modelo; los tipos los garantiza `ISemaforoIA` y el único
    // productor es `ai-semaforo.service`. Deliberadamente SIN índice: se proyecta al abrir una
    // conversación, nadie filtra la bandeja por esto.
    semaforoIA: {
      type: new Schema(
        {
          slug: { type: String, required: true },
          confianza: { type: Number, required: true },
          motivo: { type: String, default: '' },
          nivelInteres: { type: String, required: true },
          objecion: { type: String, default: null },
          at: { type: Date, required: true },
          // `null` = la IA solo propuso. No lleva `required`: null ES un valor con significado.
          aplicado: { type: String, default: null },
        },
        { _id: false },
      ),
      required: false,
    },
    // Datos de contacto extraídos por IA bajo demanda (HU-OMNI-03). Cada campo admite `null`
    // cuando la conversación no lo menciona; nunca sobrescriben `nombre`/`telefono`.
    datosExtraidos: {
      type: new Schema(
        {
          nombreCompleto: { type: String, default: null },
          correo: { type: String, default: null },
          // Siempre presente: si la conversación no dicta uno, se guarda el número de WhatsApp.
          telefono: { type: String, required: true },
          telefonoOrigen: { type: String, enum: ['conversacion', 'whatsapp'], required: true },
          // Qué pide el cliente, en sus palabras (HU-IA-06). NO es el nivel de interés: eso vive
          // en `semaforoIA.nivelInteres` y es una escala cerrada del modelo.
          interes: { type: String, default: null },
          // Campos ya aplicados a la ficha. SIN `enum`, por coherencia con `semaforoIA`: el tipo lo
          // garantiza `CampoExtraido` y el único productor es `cliente.service`.
          confirmados: { type: [String], default: [] },
          confirmadoAt: { type: Date, default: null },
          confirmadoPor: { type: Schema.Types.ObjectId, ref: 'User', default: null },
          extraidoAt: { type: Date, required: true },
          modelo: { type: String, required: true },
        },
        { _id: false },
      ),
      required: false,
    },
  },
  { timestamps: true },
);

ClienteSchema.index({ tenantId: 1, metaUserId: 1 }, { unique: true });
ClienteSchema.index({ tenantId: 1, estadoComercial: 1 });
ClienteSchema.index({ tenantId: 1, ultimoMensajeAt: -1 });
ClienteSchema.index({ tenantId: 1, asesorId: 1 });
// Filtro de bandeja por etiqueta: un ObjectId suelto contra un array significa "contiene".
ClienteSchema.index({ tenantId: 1, tagIds: 1 });

export const Cliente = model<IClienteDocument>('Cliente', ClienteSchema);
