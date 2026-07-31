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
    customFields: { type: Schema.Types.Mixed, default: {} },
    // Etiquetas de empresa (HU-OMNI-04). Sustituyen al antiguo `tags: [String]` de texto libre;
    // la migración vive en `scripts/migrate-cliente-tags.ts`.
    tagIds: [{ type: Schema.Types.ObjectId, ref: 'Tag' }],
    nivelInteres: { type: String, enum: ['frio', 'tibio', 'caliente'] },
    objecionPrincipal: { type: String, enum: ['precio', 'tiempo', 'confianza', 'otra'] },
    rolContacto: { type: String, enum: ['decisor', 'usuario', 'desconocido'] },
    interesItemId: { type: Schema.Types.ObjectId, ref: 'CatalogItem' },
    // Datos sensibles cifrados en reposo (HU-CRM-02). Deliberadamente SIN índice: un valor cifrado
    // con IV aleatorio no es comparable ni buscable, así que indexarlo solo gastaría espacio.
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
