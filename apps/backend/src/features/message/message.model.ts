import { Schema, model } from 'mongoose';
import type { IMensajeMedia, IMessageDocument, IPreviewEnlace } from './message.types.js';

/**
 * Metadata del archivo, anidada y no plana. Son nueve campos que solo existen juntos: en plano, un
 * mensaje de texto —que es el 95 % del histórico— arrastraría nueve `undefined` y el schema pasaría
 * de diez a diecinueve campos de primer nivel.
 *
 * `_id: false`: es un value object del mensaje, no una entidad con vida propia.
 */
const MediaSchema = new Schema<IMensajeMedia>(
  {
    estado: { type: String, enum: ['pendiente', 'disponible', 'fallida'], required: true },
    mimeType: { type: String, required: true },
    mediaKey: { type: String },
    metaMediaId: { type: String },
    nombreArchivo: { type: String },
    tamanoBytes: { type: Number },
    sha256: { type: String },
    duracionSegundos: { type: Number },
    miniaturaKey: { type: String },
    intentos: { type: Number, default: 0 },
    error: { type: String },
    descargadaAt: { type: Date },
  },
  { _id: false },
);

const PreviewEnlaceSchema = new Schema<IPreviewEnlace>(
  {
    url: { type: String, required: true },
    dominio: { type: String, required: true },
  },
  { _id: false },
);

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
    // @deprecated HU-OMNI-06: solo documentos anteriores al feature y el seed de demo.
    attachmentUrl: { type: String },
    media: { type: MediaSchema },
    previewEnlace: { type: PreviewEnlaceSchema },
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
// Media que todavía no se ha descargado (HU-OMNI-06). PARCIAL a propósito: solo interesa lo
// pendiente —unas decenas de documentos en régimen normal— y un índice completo sobre `media.estado`
// pagaría por cada mensaje de texto del sistema a cambio de nada.
MessageSchema.index(
  { tenantId: 1, 'media.estado': 1, createdAt: 1 },
  { partialFilterExpression: { 'media.estado': 'pendiente' } },
);

export const Message = model<IMessageDocument>('Message', MessageSchema);
