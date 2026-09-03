import { Schema, model } from 'mongoose';
import type { IFlowDocument, IFlowStateDocument } from './flow.types.js';

const PosicionSchema = new Schema({ x: { type: Number, required: true }, y: { type: Number, required: true } }, { _id: false });

const AristaSchema = new Schema(
  {
    id: { type: String, required: true },
    from: { type: String, required: true },
    to: { type: String, required: true },
    condicion: { type: String },
  },
  { _id: false },
);

// `config` queda como `Mixed`: la forma exacta por tipo de nodo (unión discriminada, con
// `.strict()` por rama) la exige `flow.validation.ts` en el borde, antes de llegar aquí. Mongoose
// no puede expresar una unión discriminada anidada en un array sin perder el resto de garantías del
// schema.
const NodoSchema = new Schema(
  {
    id: { type: String, required: true },
    tipo: { type: String, required: true, enum: ['mensaje', 'captura', 'condicion', 'intencion', 'kb', 'accion', 'handoff', 'espera'] },
    posicion: { type: PosicionSchema, required: true },
    config: { type: Schema.Types.Mixed, required: true },
  },
  { _id: false },
);

const FlowSchema = new Schema<IFlowDocument>(
  {
    // Sin `index: true` aquí a propósito: un índice plano `{ tenantId: 1 }` colisionaría de nombre
    // con el índice parcial único de más abajo (misma clave, mismo nombre autogenerado
    // `tenantId_1`). El compuesto `{ tenantId, activo }` ya cubre las consultas por tenant.
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
    nombre: { type: String, required: true, trim: true, maxlength: 120 },
    nodos: { type: [NodoSchema], required: true, default: [] },
    aristas: { type: [AristaSchema], required: true, default: [] },
    entrada: { type: String, required: true },
    version: { type: Number, required: true, default: 1 },
    estado: { type: String, required: true, enum: ['borrador', 'publicado'], default: 'borrador' },
    activo: { type: Boolean, required: true, default: false },
  },
  { timestamps: true },
);

FlowSchema.index({ tenantId: 1, activo: 1 });

// Como máximo un flujo activo por tenant, garantizado por la base y no solo por el service: dos
// activaciones concurrentes no pueden dejar dos flujos `activo: true` a la vez.
FlowSchema.index(
  { tenantId: 1 },
  { unique: true, partialFilterExpression: { activo: true } },
);

export const Flow = model<IFlowDocument>('Flow', FlowSchema);

const FlowStateSchema = new Schema<IFlowStateDocument>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    clienteId: { type: Schema.Types.ObjectId, ref: 'Cliente', required: true },
    flowId: { type: Schema.Types.ObjectId, ref: 'Flow', required: true },
    nodoActualId: { type: String, required: true },
    variables: { type: Schema.Types.Mixed, required: true, default: {} },
    esperandoRespuesta: { type: Boolean, required: true, default: false },
    ultimoMetaMessageId: { type: String },
    actualizadoAt: { type: Date, required: true, default: () => new Date() },
  },
  { timestamps: false },
);

// Uno por conversación: es la clave que resuelve "¿en qué nodo va este cliente?".
FlowStateSchema.index({ tenantId: 1, clienteId: 1 }, { unique: true });
FlowStateSchema.index({ tenantId: 1, flowId: 1 });

export const FlowState = model<IFlowStateDocument>('FlowState', FlowStateSchema);
