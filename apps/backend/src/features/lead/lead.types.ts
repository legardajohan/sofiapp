import type { Document, Types } from 'mongoose';
import type { EstadoComercial, IResumenResponse } from '../cliente/cliente.types.js';
import type { ITagResponse, SemaforoSlug } from '../tag/tag.types.js';

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

// ─── Listado (HU-CRM-03) ────────────────────────────────────────────────────────

/**
 * Filtros del listado, ya validados y coercidos por Zod. Todos son opcionales y combinables.
 *
 * Ojo con dos de ellos, que NO son campos del lead:
 * - `asesor` es un userId que filtra `responsableId`. No existe el rol "Asesor" (AUTH-02): todo
 *   usuario de un tenant es `admin` y "asesor" es la función, no el rol.
 * - `semaforo` es el slug de una etiqueta de sistema aplicada a la CONVERSACIÓN (`Cliente.tagIds`),
 *   no algo que el lead guarde. Se resuelve pasando por el cliente; ver `listLeads`.
 */
export interface ListLeadsQuery {
  page: number;
  limit: number;
  /** `key` de un estado del catálogo del tenant (HU-CRM-03). Ya no es un enum cerrado. */
  estado?: string;
  asesor?: string;
  semaforo?: SemaforoSlug;
  desde?: Date;
  hasta?: Date;
}

/**
 * Proyección de listado. **No** es `ILeadResponse`: responden preguntas distintas.
 *
 * El detalle contesta "cuéntame todo de este lead" y trae el `origen` resuelto a nombres. La tabla
 * contesta "dame veinte leads que pueda escanear", así que necesita el semáforo, el resumen y el
 * `ultimoMensajeAt` —que el detalle no tiene— y no necesita el origen completo, que costaría una
 * resolución de usuarios extra por página para pintar algo que la tabla no muestra.
 */
export interface ILeadListItemResponse {
  id: string;
  nombre: string;
  telefono: string;
  correo: string | null;
  estado: EstadoComercial;
  responsable: IRefResponse | null;
  /** `origen.conversacionId`: con esto la UI abre la conversación en la bandeja. */
  conversacionId: string;
  /**
   * Etiquetas de semáforo de la conversación, con su color. Vacío si no tiene ninguna.
   *
   * **La primera es la aplicada más recientemente**: es la que la tabla muestra como principal y
   * el resto queda detrás de un `+N`. Es un array y no una sola etiqueta porque nada impide
   * aplicar varias a la misma conversación, y quedarse con una escondía el resto.
   */
  semaforos: ITagResponse[];
  /** Resumen IA de la conversación (HU-OMNI-03). `null` si nunca se generó. */
  resumen: IResumenResponse | null;
  ultimoMensajeAt: string | null;
  createdAt: string;
}
