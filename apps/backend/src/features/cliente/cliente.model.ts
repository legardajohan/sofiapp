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
    tags: [{ type: String }],
    nivelInteres: { type: String, enum: ['frio', 'tibio', 'caliente'] },
    objecionPrincipal: { type: String, enum: ['precio', 'tiempo', 'confianza', 'otra'] },
    rolContacto: { type: String, enum: ['decisor', 'usuario', 'desconocido'] },
    interesItemId: { type: Schema.Types.ObjectId, ref: 'CatalogItem' },
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
  },
  { timestamps: true },
);

ClienteSchema.index({ tenantId: 1, metaUserId: 1 }, { unique: true });
ClienteSchema.index({ tenantId: 1, estadoComercial: 1 });
ClienteSchema.index({ tenantId: 1, ultimoMensajeAt: -1 });

export const Cliente = model<IClienteDocument>('Cliente', ClienteSchema);
