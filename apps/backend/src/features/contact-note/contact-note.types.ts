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

/** Ciclo de vida de un pendiente (HU-PDF-01 A1). Cerrado = cumplido y archivado en el historial. */
export const ESTADOS_PENDIENTE = ['abierto', 'cerrado'] as const;
export type EstadoPendiente = (typeof ESTADOS_PENDIENTE)[number];

export interface IContactNote {
  tenantId: Types.ObjectId;
  clienteId: Types.ObjectId;
  autorId: Types.ObjectId;
  textoEnc: string;
  /**
   * La nota es además un **pendiente** del embudo (HU-PDF-01). Es un atributo y no una colección
   * aparte a propósito: así el pendiente comparte texto, vida y borrado con su nota y no hay copia
   * que pueda desincronizarse. Las notas anteriores a la historia no tienen el campo y cuentan como
   * `false`.
   */
  pendiente?: boolean;
  /**
   * Día programado como **día civil** `YYYY-MM-DD` (HU-PDF-01 A1), no como instante: «el 15 de
   * octubre» es el mismo día para quien lo agenda y para quien lo lee, y el rango del PDF se filtra
   * comparando cadenas sin depender de husos. Solo existe si `pendiente`.
   */
  programadoDia?: string | null;
  /** Hora de reloj `HH:mm` en la zona de quien lo agendó. `null` = pendiente de todo el día. */
  programadoHora?: string | null;
  /** Solo existe si `pendiente`. */
  estadoPendiente?: EstadoPendiente | null;
  cerradoAt?: Date | null;
  cerradoPorId?: Types.ObjectId | null;
}

export interface IContactNoteDocument extends IContactNote, Document {}

/** Forma lean con los timestamps que pone Mongoose y que no viven en `IContactNote`. */
export interface IContactNoteLean extends IContactNote {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export interface INotaResponse {
  id: string;
  texto: string;
  /** Autor resuelto, no un ObjectId suelto: la tarjeta muestra "Ana Gómez". */
  autor: { id: string; nombre: string | null };
  pendiente: boolean;
  /** Programación y estado del pendiente; todo `null` si la nota no es pendiente. */
  programadoDia: string | null;
  programadoHora: string | null;
  estadoPendiente: EstadoPendiente | null;
  cerradoAt: string | null;
  createdAt: string;
  updatedAt: string;
}
