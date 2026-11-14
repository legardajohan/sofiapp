import { Schema, model } from 'mongoose';
import { ESTADOS_PENDIENTE } from './contact-note.types.js';
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
    pendiente: { type: Boolean, default: false },
    // Programación y ciclo de vida del pendiente (HU-PDF-01 A1). Todos `null` en una nota normal.
    programadoDia: { type: String, default: null },
    programadoHora: { type: String, default: null },
    estadoPendiente: { type: String, enum: [...ESTADOS_PENDIENTE, null], default: null },
    cerradoAt: { type: Date, default: null },
    cerradoPorId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    // Recordatorio del Organizador (HU-PDF-02). Vive en la propia nota: no hay copia que sincronizar.
    recordatorioAt: { type: Date, default: null },
    programadoTz: { type: String, default: null },
    notificadoPara: { type: Date, default: null },
    vecesPospuesto: { type: Number, default: 0 },
    // HU-PDF-02 A1 — «Recordarme N minutos antes».
    avisoAntesMin: { type: Number, enum: [0, 5, 10], default: 0 },
    avisoAt: { type: Date, default: null },
  },
  { timestamps: true, collection: 'contact_notes' },
);

// Índice de la tarjeta: es exactamente la consulta de la tarjeta (notas de un contacto, más
// reciente primero, paginadas).
ContactNoteSchema.index({ tenantId: 1, clienteId: 1, createdAt: -1 });

// Pendientes abiertos en orden de agenda (columna) y rango por día programado (PDF). Parciales para
// que las notas normales —la mayoría— no paguen ninguno de los dos.
ContactNoteSchema.index(
  { tenantId: 1, estadoPendiente: 1, programadoDia: 1, programadoHora: 1, createdAt: 1, _id: 1 },
  { partialFilterExpression: { pendiente: true } },
);

// Historial: cerrados, el más recién cerrado primero.
ContactNoteSchema.index(
  { tenantId: 1, estadoPendiente: 1, cerradoAt: -1, _id: -1 },
  { partialFilterExpression: { pendiente: true } },
);

// HU-PDF-02 — barrido de vencidos y listados del Organizador por instante del aviso.
ContactNoteSchema.index(
  { tenantId: 1, estadoPendiente: 1, recordatorioAt: 1, _id: 1 },
  { partialFilterExpression: { pendiente: true } },
);

// HU-PDF-02 — «activos»: los avisos ya disparados de un usuario (pila y campana).
ContactNoteSchema.index(
  { tenantId: 1, autorId: 1, estadoPendiente: 1, avisoAt: 1 },
  { partialFilterExpression: { pendiente: true } },
);

// HU-PDF-02 A1 — barrido por instante de aviso.
ContactNoteSchema.index(
  { tenantId: 1, estadoPendiente: 1, avisoAt: 1 },
  { partialFilterExpression: { pendiente: true } },
);

export const ContactNote = model<IContactNoteDocument>('ContactNote', ContactNoteSchema);
