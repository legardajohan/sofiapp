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
    asesorId: { type: Schema.Types.ObjectId, ref: 'User' },
    customFields: { type: Schema.Types.Mixed, default: {} },
    tags: [{ type: String }],
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

export const Cliente = model<IClienteDocument>('Cliente', ClienteSchema);
