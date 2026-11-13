import { Schema, model } from 'mongoose';
import { MOTIVO_KEYS, ORIGENES_EVENTO, TIPOS_EVENTO } from './organizador.types.js';
import type {
  IMotivoCierreDocument,
  IOrganizadorPreferenciaDocument,
  IPendienteEventoDocument,
} from './organizador.types.js';

const ProgramacionSchema = new Schema(
  {
    dia: { type: String, default: null },
    hora: { type: String, default: null },
    recordatorioAt: { type: Date, default: null },
  },
  { _id: false },
);

const MotivoSnapshotSchema = new Schema(
  {
    key: { type: String, enum: [...MOTIVO_KEYS, null], default: null },
    motivoId: { type: Schema.Types.ObjectId, ref: 'MotivoCierre', default: null },
    nombre: { type: String, required: true },
  },
  { _id: false },
);

const PendienteEventoSchema = new Schema<IPendienteEventoDocument>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    notaId: { type: Schema.Types.ObjectId, ref: 'ContactNote', required: true },
    clienteId: { type: Schema.Types.ObjectId, ref: 'Cliente', required: true },
    responsableId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    tipo: { type: String, enum: TIPOS_EVENTO, required: true },
    actorId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    at: { type: Date, required: true },
    antes: { type: ProgramacionSchema, default: null },
    despues: { type: ProgramacionSchema, default: null },
    motivo: { type: String, default: null },
    motivos: { type: [MotivoSnapshotSchema], default: [] },
    otroMotivo: { type: String, default: null },
    comentario: { type: String, default: null },
    tagIds: { type: [Schema.Types.ObjectId], ref: 'Tag', default: [] },
    origen: { type: String, enum: ORIGENES_EVENTO, required: true },
  },
  { collection: 'pendiente_eventos' },
);

// Historial de un pendiente, en orden cronológico.
PendienteEventoSchema.index({ tenantId: 1, notaId: 1, at: 1, _id: 1 });
// Feed de actividad del tenant, lo más reciente primero.
PendienteEventoSchema.index({ tenantId: 1, at: -1, _id: -1 });
// Idempotencia del barrido: un único `vencido` por nota e instante, aunque dos workers lleguen a la
// vez. Es la red de seguridad de la escritura condicional sobre `notificadoPara`.
PendienteEventoSchema.index(
  { tenantId: 1, notaId: 1, 'despues.recordatorioAt': 1 },
  { unique: true, partialFilterExpression: { tipo: 'vencido' } },
);

export const PendienteEvento = model<IPendienteEventoDocument>(
  'PendienteEvento',
  PendienteEventoSchema,
);

const MotivoCierreSchema = new Schema<IMotivoCierreDocument>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    nombre: { type: String, required: true, trim: true },
    creadoPorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true, collection: 'motivos_cierre' },
);

// «Llamada hecha» y «llamada hecha» son el mismo motivo: misma collation que las etiquetas.
MotivoCierreSchema.index(
  { tenantId: 1, nombre: 1 },
  { unique: true, collation: { locale: 'es', strength: 2 } },
);

export const MotivoCierre = model<IMotivoCierreDocument>('MotivoCierre', MotivoCierreSchema);

const OrganizadorPreferenciaSchema = new Schema<IOrganizadorPreferenciaDocument>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    activo: { type: Boolean, required: true, default: true },
  },
  { timestamps: true, collection: 'organizador_preferencias' },
);

OrganizadorPreferenciaSchema.index({ tenantId: 1, userId: 1 }, { unique: true });

export const OrganizadorPreferencia = model<IOrganizadorPreferenciaDocument>(
  'OrganizadorPreferencia',
  OrganizadorPreferenciaSchema,
);
