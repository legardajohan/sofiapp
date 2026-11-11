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

/**
 * HU-PDF-02 A1 — minutos de anticipación del aviso: «Recordarme 5/10 minutos antes». `0` = avisa a
 * la hora del pendiente.
 */
export const ANTICIPACIONES_AVISO = [0, 5, 10] as const;
export type AnticipacionAviso = (typeof ANTICIPACIONES_AVISO)[number];
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
  /**
   * HU-PDF-02 — instante UTC en que avisa el recordatorio: `programadoDia` + (`programadoHora` ??
   * 08:00) en `programadoTz`. `null` en notas normales y en pendientes anteriores a la historia
   * hasta que el barrido del worker lo rellena.
   */
  recordatorioAt?: Date | null;
  /** Zona IANA con que se agendó (la del navegador de quien la programó). */
  programadoTz?: string | null;
  /** `recordatorioAt` para el que ya se avisó. Distinto de `recordatorioAt` ⇒ falta avisar. */
  notificadoPara?: Date | null;
  /** Cuántas veces se pospuso. > 0 con el aviso en el futuro ⇒ estado POSPUESTO. */
  vecesPospuesto?: number;
  /** HU-PDF-02 A1 — minutos de anticipación del aviso (0, 5 o 10). Ausente = 0. */
  avisoAntesMin?: number;
  /**
   * Instante en que se avisa: `recordatorioAt − avisoAntesMin`. El barrido y la pila usan este; el
   * estado VENCIDO sigue usando `recordatorioAt` (la hora real del compromiso).
   */
  avisoAt?: Date | null;
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
  /** HU-PDF-02 A1 — minutos de anticipación del aviso; `0` si no se pidió o no es pendiente. */
  avisoAntesMin: number;
  createdAt: string;
  updatedAt: string;
}
