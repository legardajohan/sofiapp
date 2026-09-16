import { Schema, model } from 'mongoose';
import type { IMessageDocument } from './message.types.js';

const MessageSchema = new Schema<IMessageDocument>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    clienteId: { type: Schema.Types.ObjectId, ref: 'Cliente', required: true },
    canal: { type: String, enum: ['whatsapp'], required: true },
    direccion: { type: String, enum: ['inbound', 'outbound'], required: true },
    sender: { type: String, enum: ['user', 'bot', 'agent'], required: true },
    tipo: {
      type: String,
      enum: ['text', 'image', 'template', 'audio', 'document', 'other'],
      required: true,
    },
    texto: { type: String },
    attachmentUrl: { type: String },
    metaMessageId: { type: String },
    status: {
      type: String,
      enum: ['sent', 'delivered', 'read', 'failed'],
      default: 'sent',
    },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

MessageSchema.index({ tenantId: 1, clienteId: 1, createdAt: 1 });
MessageSchema.index({ tenantId: 1, metaMessageId: 1 }, { sparse: true });
// Consumo del tier de Meta en las últimas 24 h (HU-MARK-01): cuántos destinatarios únicos abrió el
// número con plantillas. Se consulta antes de cada lote de campaña, así que el filtro por `tipo` y
// el rango de `createdAt` tienen que resolverse con un índice y no recorriendo la colección.
MessageSchema.index({ tenantId: 1, tipo: 1, createdAt: -1 });

export const Message = model<IMessageDocument>('Message', MessageSchema);
