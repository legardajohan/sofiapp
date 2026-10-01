import { Schema, model } from 'mongoose';
import type { INotificationDocument } from './notification.types.js';

// Colección tenant-scoped. Se accede SIEMPRE vía *Scoped.
const NotificationSchema = new Schema<INotificationDocument>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    tipo: { type: String, enum: ['handoff', 'assignment'], required: true },
    conversacionId: { type: Schema.Types.ObjectId, ref: 'Cliente', required: true },
    clienteResumen: { type: String, required: true },
    // `null` = Sofi (handoff automático, HU-IA-03).
    actorId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    actorNombre: { type: String, required: true },
    mensaje: { type: String, required: true },
    leidaAt: { type: Date, default: null },
  },
  { timestamps: true, collection: 'notifications' },
);

// Cubre el listado (`sort createdAt desc`) y el conteo de no leídas: mismo prefijo tenantId+userId.
NotificationSchema.index({ tenantId: 1, userId: 1, createdAt: -1 });

export const Notification = model<INotificationDocument>('Notification', NotificationSchema);
