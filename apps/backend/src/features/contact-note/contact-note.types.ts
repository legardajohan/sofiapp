import type { Document, Types } from 'mongoose';

/**
 * Nota de seguimiento sobre un contacto (HU-CRM-02). Colección propia y no un subdocumento de
 * `Cliente` por la misma razón que `messages`: el documento del contacto no debe crecer sin techo,
 * y paginar y auditar notas sueltas desde un array embebido es incómodo.
 *
 * El texto se persiste **cifrado**: es prosa libre donde acaba cualquier cosa (condiciones de pago,
 * datos de un tercero, un motivo personal) y no hay forma de enmascararla selectivamente. Por eso
 * la nota es sensible entera y su acceso se cierra a nivel de ruta, no de campo.
 */
export interface IContactNote {
  tenantId: Types.ObjectId;
  clienteId: Types.ObjectId;
  autorId: Types.ObjectId;
  textoEnc: string;
}

export interface IContactNoteDocument extends IContactNote, Document {}

/** Forma lean con los timestamps que pone Mongoose y que no viven en `IContactNote`. */
export interface IContactNoteLean extends IContactNote {
  _id: Types.ObjectId;
  createdAt: Date;
}

export interface INotaResponse {
  id: string;
  texto: string;
  /** Autor resuelto, no un ObjectId suelto: la tarjeta muestra "Ana Gómez". */
  autor: { id: string; nombre: string | null };
  createdAt: string;
}
