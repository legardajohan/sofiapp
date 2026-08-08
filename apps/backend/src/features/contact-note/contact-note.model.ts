import { Schema, model } from 'mongoose';
import type { IContactNoteDocument } from './contact-note.types.js';

const ContactNoteSchema = new Schema<IContactNoteDocument>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    clienteId: { type: Schema.Types.ObjectId, ref: 'Cliente', required: true },
    autorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    // Texto de la nota. El cifrado en reposo está desactivado (ver `field-crypto.util`), así que se
    // guarda en claro; el nombre conserva el sufijo para no migrar los documentos existentes.
    // Nunca indexado: no es buscable por diseño.
    textoEnc: { type: String, required: true },
  },
  { timestamps: true, collection: 'contact_notes' },
);

// Único índice del feature: es exactamente la consulta de la tarjeta (notas de un contacto, más
// reciente primero, paginadas).
ContactNoteSchema.index({ tenantId: 1, clienteId: 1, createdAt: -1 });

export const ContactNote = model<IContactNoteDocument>('ContactNote', ContactNoteSchema);
