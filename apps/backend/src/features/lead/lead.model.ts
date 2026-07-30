import { Schema, model } from 'mongoose';
import { ESTADOS_COMERCIALES } from '../cliente/cliente.types.js';
import type { ILeadDocument } from './lead.types.js';

const OrigenSchema = new Schema(
  {
    tipo: { type: String, enum: ['conversacion'], required: true },
    conversacionId: { type: Schema.Types.ObjectId, ref: 'Cliente', required: true },
    convertidoPor: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    convertidoAt: { type: Date, required: true },
  },
  { _id: false },
);

const LeadSchema = new Schema<ILeadDocument>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    nombre: { type: String, required: true, trim: true, maxlength: 120 },
    telefono: { type: String, required: true, trim: true },
    correo: { type: String, trim: true, lowercase: true },
    clienteId: { type: Schema.Types.ObjectId, ref: 'Cliente', required: true },
    origen: { type: OrigenSchema, required: true },
    responsableId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    estado: { type: String, enum: ESTADOS_COMERCIALES, default: 'nuevo' },
  },
  { timestamps: true },
);

// Un teléfono, un lead por empresa. Este índice —no la comprobación previa del service— es la
// única defensa real contra dos conversiones simultáneas de la misma conversación: entre el `find`
// y el `create` cabe otra petición. El service traduce el E11000 a un 409 accionable.
// Es único POR TENANT: dos empresas distintas pueden tener el mismo número.
LeadSchema.index({ tenantId: 1, telefono: 1 }, { unique: true });

// Responde "¿esta conversación ya se convirtió?" para la bandeja y la ficha, en lote.
LeadSchema.index({ tenantId: 1, clienteId: 1 });

export const Lead = model<ILeadDocument>('Lead', LeadSchema);
