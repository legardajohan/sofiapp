import { Schema, model } from 'mongoose';
import type { IActividadAsesorDocument, IActividadCursorDocument } from './activity.types.js';

/** ~13 meses: el rango máximo de un reporte es 366 días, más margen para el mes en curso. */
const RETENCION_S = 400 * 24 * 60 * 60;

const ActividadAsesorSchema = new Schema<IActividadAsesorDocument>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    hora: { type: Date, required: true },
    segundosActivos: { type: Number, required: true, default: 0 },
    primerLatido: { type: Date, required: true },
    ultimoLatido: { type: Date, required: true },
  },
  { collection: 'actividad_asesores' },
);

// Una cubeta por asesor y hora: el upsert de cada latido cae siempre en la misma.
ActividadAsesorSchema.index({ tenantId: 1, userId: 1, hora: 1 }, { unique: true });
// Lectura de los reportes: "todo el tenant en este rango", y opcionalmente un asesor.
ActividadAsesorSchema.index({ tenantId: 1, hora: 1, userId: 1 });
ActividadAsesorSchema.index({ hora: 1 }, { expireAfterSeconds: RETENCION_S });

export const ActividadAsesor = model<IActividadAsesorDocument>('ActividadAsesor', ActividadAsesorSchema);

const ActividadCursorSchema = new Schema<IActividadCursorDocument>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    ultimoLatido: { type: Date, required: true },
  },
  { collection: 'actividad_cursores' },
);

ActividadCursorSchema.index({ tenantId: 1, userId: 1 }, { unique: true });

export const ActividadCursor = model<IActividadCursorDocument>('ActividadCursor', ActividadCursorSchema);
