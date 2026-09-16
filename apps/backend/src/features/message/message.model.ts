import { Schema, model } from 'mongoose';
import type { IMessageDocument } from './message.types.js';

const MessageSchema = new Schema<IMessageDocument>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    clienteId: { type: Schema.Types.ObjectId, ref: 'Cliente', required: true },
    canal: { type: String, enum: ['whatsapp'], required: true },
    direccion: { type: String, enum: ['inbound', 'outbound'], required: true },
    sender: { type: String, enum: ['user', 'bot', 'agent'], required: true },
    // Fase `expand` de la migración del enum a español (HU-OMNI-06): se ESCRIBE solo en español,
    // pero el enum acepta todavía los 6 valores en inglés para que los documentos anteriores a
    // `migrate:tipo-mensaje` sigan siendo válidos si algo los reescribe (p. ej. `updateDeliveryStatus`
    // sobre un mensaje viejo). La fase `contract` —PR aparte, cuando no queden documentos legacy—
    // deja solo los 9 de arriba. Ver `docs/specs/HU-OMNI-06-mensajeria-multimedia/plan.md` §1.
    tipo: {
      type: String,
      enum: [
        'texto',
        'enlace',
        'imagen',
        'video',
        'audio',
        'documento',
        'sticker',
        'plantilla',
        'otro',
        // legacy — solo lectura/compatibilidad, no se escriben nunca
        'text',
        'image',
        'template',
        'document',
        'other',
      ],
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
