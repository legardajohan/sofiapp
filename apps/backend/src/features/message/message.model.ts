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
MessageSchema.index({ metaMessageId: 1 }, { sparse: true });

export const Message = model<IMessageDocument>('Message', MessageSchema);
