import type { CanalOrigen } from '../cliente/cliente.types.js';
import type { EstadoPendiente } from '../contact-note/contact-note.types.js';

/**
 * Pendientes del embudo (HU-PDF-01).
 *
 * Este feature **no estrena colección**: un pendiente es una nota de `contact_notes` con
 * `pendiente: true`. Es un slice de lectura —como `pipeline`— que compone esas notas con el
 * contacto, su lead, la etapa y el autor. De ahí que no tenga `.model.ts`.
 */

export const PENDIENTES_LIMIT_DEFECTO = 20;
export const PENDIENTES_LIMIT_MAXIMO = 50;
/** Rango máximo del PDF, en días civiles (ambos extremos incluidos). */
export const PENDIENTES_RANGO_MAX_DIAS = 366;
/**
 * Tope duro de filas del PDF. El documento se genera en el proceso web (ADR 0013); sin tope, un
 * rango enorme podría retener la petición y la memoria más de lo razonable.
 */
export const PENDIENTES_PDF_MAX = 5000;

export interface IEtapaPendienteResponse {
  key: string;
  label: string;
  color: string;
}

/** Datos del lead que muestra la tarjeta. Si el contacto no es lead, salen del contacto. */
export interface IPendienteLeadResponse {
  leadId: string | null;
  nombre: string | null;
  telefono: string;
  correo: string | null;
  /** `null` solo si el contacto ya no existe (nota huérfana). */
  canalOrigen: CanalOrigen | null;
  /** `null` = el contacto no se ha convertido en lead: la UI y el PDF dicen «Sin convertir». */
  etapa: IEtapaPendienteResponse | null;
}

export interface IPendienteResponse {
  /** Es el id de la nota: el pendiente ES la nota. */
  id: string;
  /** Para abrir la ficha del contacto en la bandeja. */
  clienteId: string;
  /** El texto de la nota (RN3). */
  descripcion: string;
  autor: { id: string; nombre: string | null };
  createdAt: string;
  /** Día civil programado `YYYY-MM-DD` (HU-PDF-01 A1). */
  programadoDia: string;
  /** `HH:mm`, o `null` si es de todo el día. */
  programadoHora: string | null;
  estado: EstadoPendiente;
  /** Solo en los cerrados. */
  cerradoAt: string | null;
  cerradoPor: { id: string; nombre: string | null } | null;
  lead: IPendienteLeadResponse;
}

/** Lo que necesita el render del PDF, ya resuelto. El render no toca Mongo. */
export interface IReportePendientes {
  empresa: string;
  /** Días civiles tal cual los eligió el usuario (`YYYY-MM-DD`). */
  desde: string;
  hasta: string;
  /** Zona IANA en la que se leen las fechas del reporte. */
  tz: string;
  generadoAt: Date;
  generadoPor: string;
  pendientes: IPendienteResponse[];
}
