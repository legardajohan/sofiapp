import type { EstadoComercial } from '../inbox/types.js';

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
export type MotivoEliminacion =
  | 'duplicado'
  | 'spam'
  | 'prueba'
  | 'sin_respuesta'
  | 'no_interesado';

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
