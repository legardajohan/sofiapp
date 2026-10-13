import { Schema, model } from 'mongoose';
import { MIMES_IMAGEN_CABECERA, PROPOSITOS_SUBIDA } from './media.types.js';
import type { IMediaUploadDocument } from './media.types.js';

/**
 * Subida en dos pasos de una imagen de cabecera (HT-WA-04).
 *
 * El navegador sube el archivo primero (con barra de progreso) y recibe un `uploadId`; el alta de
 * la plantilla, la campaña o el envío lo consumen después. Así el cliente nunca maneja una clave
 * de almacenamiento: solo un id opaco que, además, está atado al tenant que lo subió.
 */
const MediaUploadSchema = new Schema<IMediaUploadDocument>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    proposito: { type: String, enum: PROPOSITOS_SUBIDA, required: true },
    mediaKey: { type: String, required: true },
    mimeType: { type: String, enum: MIMES_IMAGEN_CABECERA, required: true },
    tamanoBytes: { type: Number, required: true },
    headerHandle: { type: String, default: null },
    usadaAt: { type: Date, default: null },
    expiraEn: { type: Date, required: true },
  },
  { timestamps: true },
);

// TTL: Mongo borra el documento al vencer. El objeto del bucket de una subida que nadie usó queda
// huérfano (deuda anotada en el spec); el de una subida consumida lo referencia su dueño.
MediaUploadSchema.index({ expiraEn: 1 }, { expireAfterSeconds: 0 });

export const MediaUpload = model<IMediaUploadDocument>('MediaUpload', MediaUploadSchema);
