import type { Document, Types } from 'mongoose';
import type { EstadoComercial, IResumenResponse } from '../cliente/cliente.types.js';
import type { ISemaforoResponse } from '../semaforo/semaforo.types.js';

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
   * `key` de una etapa del catálogo `estados` del tenant (HU-CRM-03), no un enum: cada empresa
   * define las suyas. El tipo sigue apuntando a la unión de `Cliente` porque las cinco claves de
   * fábrica coinciden con ella y los leads anteriores no necesitaron migración.
   *
   * El lead sigue sin introducir un pipeline propio: el embudo de HU-PIPE-01 se dibuja sobre este
   * campo y sobre `estados`. Lo que ya NO vale es la razón que había aquí escrita —que producto
   * descartaba el Kanban—: se revirtió en `docs/adr/0007-tablero-kanban-pipeline.md`.
   */
  estado: EstadoComercial;
  /**
   * Semaforizacion comercial del lead (HU-CRM-04). Guarda la `key` de un semaforo del catalogo del
   * tenant (`semaforos`), no un enum: desde que el catalogo es CRUD, cada empresa define los suyos.
   * `null` = sin clasificar, que es como nace el lead — clasificarlo es una decision, no un default.
   *
   * Es la fuente de verdad del semaforo DEL LEAD. La etiqueta de semaforo de la conversacion
   * (HU-OMNI-04) se sincroniza desde aqui, nunca al reves.
   */
  semaforo: string | null;
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
  /** Semaforo ya resuelto a lo que la UI pinta. `null` = sin clasificar. */
  semaforo: ISemaforoResponse | null;
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
 * Ojo con `asesor`, que NO es un campo del lead: es un userId que filtra `responsableId`. No
 * existe el rol "Asesor" (AUTH-02): todo usuario de un tenant es `admin` y "asesor" es la funcion,
 * no el rol.
 *
 * `semaforo` SI es un campo del lead desde HU-CRM-04 (antes era una etiqueta de la conversacion).
 * Lo que no es, es un enum: es la `key` de un semaforo del catalogo del tenant.
 */
export interface ListLeadsQuery {
  page: number;
  limit: number;
  /** `key` de un estado del catálogo del tenant (HU-CRM-03). Ya no es un enum cerrado. */
  estado?: string;
  asesor?: string;
  semaforo?: string;
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
   * Semaforo del lead, ya resuelto a etiqueta y color desde el catalogo del tenant. `null` = sin
   * clasificar.
   *
   * Es UNO, no un array: desde HU-CRM-04 el semaforo es un campo del lead y por construccion solo
   * puede haber uno. Antes eran las etiquetas de la conversacion, que si podian ser varias.
   */
  semaforo: ISemaforoResponse | null;
  /** Resumen IA de la conversación (HU-OMNI-03). `null` si nunca se generó. */
  resumen: IResumenResponse | null;
  ultimoMensajeAt: string | null;
  createdAt: string;
}

/**
 * Una entrada del historial de etapa (HU-PIPE-01). Sale de `audit_events`, no de una colección
 * propia: es exactamente el uso para el que esa bitácora se creó.
 */
export interface IHistorialEstadoResponse {
  id: string;
  /** `key` de la etapa anterior. `null` solo si el evento antiguo no la registró. */
  de: string | null;
  a: string | null;
  actor: IRefResponse | null;
  at: string;
}

/**
 * Una entrada del historial de semáforo (HU-CRM-04). Mismo origen y misma forma que el de etapa
 * —`audit_events`, filtrado por su acción—, pero otro eje: aquí `de`/`a` son `key` de semáforo.
 */
export interface IHistorialSemaforoResponse {
  id: string;
  /** `key` del semáforo anterior. `null` = el lead no estaba clasificado. */
  de: string | null;
  a: string | null;
  actor: IRefResponse | null;
  at: string;
}
