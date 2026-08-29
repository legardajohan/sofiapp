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
    // Sin `enum`: las etapas son un catálogo por tenant (`estados`, HU-CRM-03), no estructura.
    // Aquí se graba el `key` del estado; quién valida que exista es el service, contra el catálogo
    // del tenant. Los leads sembrados con los 5 valores de fábrica siguen siendo válidos tal cual.
    estado: { type: String, required: true, default: 'nuevo', trim: true },
    // Sin `enum` por el mismo motivo que `estado`: los semaforos son un catalogo por tenant
    // (`semaforos`, HU-CRM-04), no estructura. Lo valida el service contra el catalogo.
    semaforo: { type: String, default: null, trim: true },
  },
  { timestamps: true },
);

// Un teléfono, un lead por empresa. Este índice —no la comprobación previa del service— es la
// única defensa real contra dos conversiones simultáneas de la misma conversación: entre el `find`
// y el `create` cabe otra petición. El service traduce el E11000 a un 409 accionable.
// Es único POR TENANT: dos empresas distintas pueden tener el mismo número.
LeadSchema.index({ tenantId: 1, telefono: 1 }, { unique: true });

// Responde "¿esta conversación ya se convirtió?" para la bandeja y la ficha, en lote.
// El filtro por semáforo de HU-CRM-03 también cae aquí: resuelve por `clienteId`.
LeadSchema.index({ tenantId: 1, clienteId: 1 });

// Índices del listado (HU-CRM-03). Los tres cierran con `createdAt: -1` —el orden por defecto de
// la tabla— para que Mongo resuelva filtro y orden con el mismo índice, sin ordenar en memoria.
LeadSchema.index({ tenantId: 1, createdAt: -1 });
LeadSchema.index({ tenantId: 1, estado: 1, createdAt: -1 });
LeadSchema.index({ tenantId: 1, responsableId: 1, createdAt: -1 });
// Cierra en `createdAt: -1` como los tres de arriba, para que `?semaforo=` resuelva filtro y orden
// con el mismo indice en vez de ordenar en memoria (HU-CRM-04).
LeadSchema.index({ tenantId: 1, semaforo: 1, createdAt: -1 });

export const Lead = model<ILeadDocument>('Lead', LeadSchema);
