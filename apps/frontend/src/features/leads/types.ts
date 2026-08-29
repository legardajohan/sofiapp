import type { EstadoComercial, ResumenDTO } from '../inbox/types.js';
import type { SemaforoDTO } from '../semaforos/types.js';

/** Referencia ya resuelta por el backend: la tarjeta pinta nombres, nunca ids. */
export interface RefDTO {
  id: string;
  nombre: string | null;
}

export interface LeadDTO {
  id: string;
  nombre: string;
  telefono: string;
  correo: string | null;
  estado: EstadoComercial;
  /** Semáforo comercial ya resuelto a etiqueta y color. `null` = sin clasificar. */
  semaforo: SemaforoDTO | null;
  contacto: { id: string; nombre: string | null; telefono: string };
  responsable: RefDTO | null;
  /** De dónde nació el lead: la trazabilidad que pide la Definición de Hecho de HU-CRM-01. */
  origen: {
    conversacionId: string;
    convertidoPor: RefDTO | null;
    convertidoAt: string;
  };
  createdAt: string;
}

export interface CreateLeadPayload {
  nombre: string;
  telefono: string;
  correo?: string;
  clienteId: string;
}

/** Enum cerrado, igual que en el backend (`lead.types.ts`). El motivo es obligatorio al borrar. */
export type MotivoEliminacion = 'duplicado' | 'spam' | 'prueba' | 'sin_respuesta' | 'no_interesado';

/**
 * El orden es el de la lista: primero lo que es basura evidente (duplicado, spam, prueba) y luego
 * los dos casos de cliente real que no llegó a nada. Así el asesor encuentra antes el motivo
 * frecuente sin leer las cinco opciones.
 */
export const MOTIVOS_ELIMINACION: { valor: MotivoEliminacion; label: string }[] = [
  { valor: 'duplicado', label: 'Contacto duplicado' },
  { valor: 'spam', label: 'Spam' },
  { valor: 'prueba', label: 'Conversación de prueba' },
  { valor: 'sin_respuesta', label: 'El cliente no respondió' },
  { valor: 'no_interesado', label: 'No está interesado' },
];

// ─── Listado (HU-CRM-03) ────────────────────────────────────────────────────────

/**
 * Fila del listado. No es `LeadDTO`: la tabla necesita el semáforo, el resumen y el último
 * mensaje —que el detalle de HU-CRM-01 no trae— y no necesita el `origen` completo.
 */
export interface LeadListItemDTO {
  id: string;
  nombre: string;
  telefono: string;
  correo: string | null;
  estado: EstadoComercial;
  responsable: RefDTO | null;
  /** Con esto se abre la conversación en la bandeja. */
  conversacionId: string;
  /**
   * Semáforo del lead, resuelto desde el catálogo del tenant. `null` = sin clasificar.
   *
   * Es UNO, no un array: desde HU-CRM-04 es un campo del lead. Antes eran las etiquetas de
   * la conversación, que sí podían ser varias.
   */
  semaforo: SemaforoDTO | null;
  resumen: ResumenDTO | null;
  ultimoMensajeAt: string | null;
  createdAt: string;
}

/** Estado de los filtros. Vive en la URL, no en el store: la vista se comparte por enlace. */
export interface LeadsFiltros {
  page: number;
  /** `key` de un estado del catálogo del tenant (HU-CRM-03), no una unión cerrada. */
  estado?: string;
  asesor?: string;
  /** `key` de un semáforo del catálogo del tenant, ya no un slug cerrado. */
  semaforo?: string;
  /** `YYYY-MM-DD`, tal cual lo produce un `<input type="date">`. */
  desde?: string;
  hasta?: string;
}

/** Una entrada del historial de semáforo del lead (HU-CRM-04). */
export interface HistorialSemaforoDTO {
  id: string;
  /** `key` del semáforo anterior. `null` = el lead no estaba clasificado. */
  de: string | null;
  a: string | null;
  actor: RefDTO | null;
  /** ISO. */
  at: string;
}
