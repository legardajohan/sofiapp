import type { Document, Types } from 'mongoose';
import type { EstadoComercial } from '../cliente/cliente.types.js';

/**
 * De dónde nació el lead. Hoy solo se convierte desde una conversación, pero el discriminador
 * queda explícito para que añadir `formulario` o `importacion` (fuera de alcance en HU-CRM-01) no
 * obligue a migrar los documentos existentes.
 */
export type TipoOrigenLead = 'conversacion';

export interface IOrigenLead {
  tipo: TipoOrigenLead;
  /**
   * Conversación de la que nació. Hoy coincide con `clienteId` porque una conversación ES un
   * `Cliente` (ver `docs/domain.md`), pero responden preguntas distintas: `clienteId` es "con quién
   * hablo" y esto es "de dónde salió". Separarlos deja el origen intacto el día que la conversación
   * deje de ser un `Cliente`.
   */
  conversacionId: Types.ObjectId;
  convertidoPor: Types.ObjectId;
  convertidoAt: Date;
}

export interface ILead {
  tenantId: Types.ObjectId;
  nombre: string;
  /** Normalizado a solo dígitos: la unicidad no puede depender del formato que teclee el asesor. */
  telefono: string;
  correo?: string;
  /** El contacto (`Cliente`) al que pertenece el lead. */
  clienteId: Types.ObjectId;
  origen: IOrigenLead;
  responsableId: Types.ObjectId;
  /**
   * Reutiliza la unión de `Cliente`: el lead NO introduce un pipeline propio ni etapas nuevas
   * (`docs/product.md` §5 descarta Kanban). Ver la nota de producto en la spec de HU-CRM-01.
   */
  estado: EstadoComercial;
}

export interface ILeadDocument extends ILead, Document {}

/** Forma lean con los campos que Mongoose no incluye en `ILead`. */
export interface ILeadLean extends ILead {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateLeadDTO {
  nombre: string;
  telefono: string;
  correo?: string;
  clienteId: string;
}

/**
 * Por qué se borra un lead. Es un enum cerrado y **obligatorio**, no texto libre: el borrado es
 * definitivo y sin el motivo el `AuditEvent` no explicaría nada al revisarlo meses después.
 *
 * Los tres primeros son leads que nunca debieron existir. Los dos últimos son clientes reales que
 * no llegaron a nada, y ahí borrar es una **alternativa** a `estado: 'perdido'`, no su sustituto:
 * se borra cuando no hay nada que conservar y se marca `perdido` cuando el histórico interesa. La
 * decisión es del asesor; el motivo registrado es lo que la deja explicada.
 */
export const MOTIVOS_ELIMINACION_LEAD = [
  'duplicado',
  'spam',
  'prueba',
  'sin_respuesta',
  'no_interesado',
] as const;

export type MotivoEliminacionLead = (typeof MOTIVOS_ELIMINACION_LEAD)[number];

/** Referencia mínima ya resuelta: la tarjeta muestra nombres, nunca ObjectIds. */
export interface IRefResponse {
  id: string;
  nombre: string | null;
}

export interface ILeadResponse {
  id: string;
  nombre: string;
  telefono: string;
  correo: string | null;
  estado: EstadoComercial;
  contacto: { id: string; nombre: string | null; telefono: string };
  responsable: IRefResponse | null;
  origen: {
    conversacionId: string;
    convertidoPor: IRefResponse | null;
    convertidoAt: string;
  };
  createdAt: string;
}
