import { Schema, model } from 'mongoose';
import type { IClienteDocument } from './cliente.types.js';

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
