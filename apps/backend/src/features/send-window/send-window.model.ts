import { Schema, model } from 'mongoose';
import {
  CATEGORIAS_ENVIO,
  MODOS_REGLA,
  TIPOS_EXCEPCION,
  ZONA_HORARIA_DEFECTO,
  type ISendWindowConfigDocument,
} from './send-window.types.js';

// Subdocumentos sin `_id`: se reemplazan enteros en cada PUT, nadie los referencia por id.
const FranjaSchema = new Schema(
  {
    dias: { type: [Number], required: true },
    desde: { type: String, required: true },
    hasta: { type: String, required: true },
  },
  { _id: false },
);

const FranjaDiaSchema = new Schema(
  {
    desde: { type: String, required: true },
    hasta: { type: String, required: true },
  },
  { _id: false },
);

const ReglaSchema = new Schema(
  {
    categoria: { type: String, enum: CATEGORIAS_ENVIO, required: true },
    modo: { type: String, enum: MODOS_REGLA, required: true },
    franjas: { type: [FranjaSchema], default: [] },
  },
  { _id: false },
);

const ExcepcionSchema = new Schema(
  {
    fecha: { type: String, required: true },
    tipo: { type: String, enum: TIPOS_EXCEPCION, required: true },
    franjas: { type: [FranjaDiaSchema], default: undefined },
    categorias: { type: [{ type: String, enum: CATEGORIAS_ENVIO }], default: undefined },
    motivo: { type: String },
    origen: { type: String, enum: ['manual', 'festivo'] },
  },
  { _id: false },
);

/**
 * Política de ventanas horarias de envío (HU-CONF-01). Un documento por tenant (`tenantId`
 * único); sin documento, el tenant se comporta como `activo: false`.
 */
const SendWindowConfigSchema = new Schema<ISendWindowConfigDocument>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, unique: true, index: true },
    activo: { type: Boolean, required: true, default: false },
    zonaHoraria: { type: String, required: true, default: ZONA_HORARIA_DEFECTO },
    reglas: { type: [ReglaSchema], default: [] },
    excepciones: { type: [ExcepcionSchema], default: [] },
    actualizadoPor: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    version: { type: Number, required: true, default: 0 },
  },
  { timestamps: true, collection: 'send_window_configs' },
);

export const SendWindowConfig = model<ISendWindowConfigDocument>('SendWindowConfig', SendWindowConfigSchema);
