import type { Document, Types } from 'mongoose';

/**
 * Organizador de pendientes (HU-PDF-02).
 *
 * El recordatorio NO es una entidad nueva: es la nota pendiente de HU-PDF-01 con un instante de
 * aviso (`contact_notes.recordatorioAt`). Este feature añade lo que la nota no puede guardar sin
 * crecer sin techo —el historial de eventos— más el catálogo de motivos de cierre del tenant y la
 * preferencia del switch por usuario.
 */

/**
 * Estados de la historia. **Derivados**, no almacenados: salen de `estadoPendiente`,
 * `recordatorioAt`, `vecesPospuesto` y la hora actual (ver `organizador.estado.ts`). Así un
 * pospuesto vuelve a VENCIDO solo, y nada queda desfasado si el worker estuvo caído.
 */
export const ESTADOS_ORGANIZADOR = ['pendiente', 'vencido', 'pospuesto', 'cerrado'] as const;
export type EstadoOrganizador = (typeof ESTADOS_ORGANIZADOR)[number];

/**
 * Motivos de cierre predefinidos. Viven en el código con una `key` estable —no en Mongo—, así que
 * todos los tenants los tienen sin sembrar nada. «Otros motivos» no es una key: es el campo `otro`.
 */
export const MOTIVOS_PREDEFINIDOS = [
  { key: 'contactado', nombre: 'Cliente contactado exitosamente' },
  { key: 'gestion-realizada', nombre: 'Gestión realizada' },
  { key: 'venta', nombre: 'Venta concretada' },
  { key: 'info-enviada', nombre: 'Información enviada al cliente' },
  { key: 'solucionada', nombre: 'Solicitud solucionada' },
  { key: 'no-interesado', nombre: 'Cliente no interesado' },
  { key: 'no-respondio', nombre: 'Cliente no respondió' },
  { key: 'cancelada', nombre: 'Actividad cancelada' },
  { key: 'sin-seguimiento', nombre: 'No se requiere seguimiento adicional' },
] as const;
export type MotivoKey = (typeof MOTIVOS_PREDEFINIDOS)[number]['key'];
export const MOTIVO_KEYS = MOTIVOS_PREDEFINIDOS.map((m) => m.key) as [MotivoKey, ...MotivoKey[]];

export const TIPOS_EVENTO = [
  'programado',
  'reprogramado',
  'vencido',
  'pospuesto',
  'cerrado',
  'reabierto',
] as const;
export type TipoEventoPendiente = (typeof TIPOS_EVENTO)[number];

/** De dónde salió el evento: útil para leer el historial y para depurar. */
export const ORIGENES_EVENTO = ['organizador', 'rapido', 'nota', 'sistema'] as const;
export type OrigenEventoPendiente = (typeof ORIGENES_EVENTO)[number];

export const ORGANIZADOR_LIMIT_DEFECTO = 20;
export const ORGANIZADOR_LIMIT_MAXIMO = 50;
/** Tope de la pila de recordatorios: más que esto en pantalla no se gestiona, se acumula. */
export const ACTIVOS_MAXIMO = 50;
/** Mismo tope que `PATCH /conversations/:id/tags`. */
export const ETIQUETAS_MAX_POR_CONTACTO = 20;

export interface IProgramacionSnapshot {
  dia: string | null;
  hora: string | null;
  recordatorioAt: Date | null;
}

export interface IMotivoSnapshot {
  key: MotivoKey | null;
  motivoId: Types.ObjectId | null;
  /** Nombre en el momento del cierre: sobrevive aunque el catálogo cambie. */
  nombre: string;
}

/** Historial de un pendiente. Append-only. **Nunca** guarda el texto de la nota. */
export interface IPendienteEvento {
  tenantId: Types.ObjectId;
  notaId: Types.ObjectId;
  clienteId: Types.ObjectId;
  /** Autor de la nota en el momento del evento: permite filtrar el feed por responsable. */
  responsableId: Types.ObjectId;
  tipo: TipoEventoPendiente;
  /** `null` = el sistema (barrido del worker). */
  actorId: Types.ObjectId | null;
  at: Date;
  antes: IProgramacionSnapshot | null;
  despues: IProgramacionSnapshot | null;
  /** Justificación de un aplazamiento. */
  motivo: string | null;
  motivos: IMotivoSnapshot[];
  /** Texto de «Otros motivos»: va al evento, no al catálogo. */
  otroMotivo: string | null;
  comentario: string | null;
  tagIds: Types.ObjectId[];
  origen: OrigenEventoPendiente;
}
export interface IPendienteEventoDocument extends IPendienteEvento, Document {}
export interface IPendienteEventoLean extends IPendienteEvento {
  _id: Types.ObjectId;
}

/** Motivo de cierre personalizado, compartido por todo el tenant (decisión D4). */
export interface IMotivoCierre {
  tenantId: Types.ObjectId;
  nombre: string;
  creadoPorId: Types.ObjectId;
}
export interface IMotivoCierreDocument extends IMotivoCierre, Document {}
export interface IMotivoCierreLean extends IMotivoCierre {
  _id: Types.ObjectId;
}

/** Switch «Activar Organizador y recordatorios», por usuario. Sin documento ⇒ activo. */
export interface IOrganizadorPreferencia {
  tenantId: Types.ObjectId;
  userId: Types.ObjectId;
  activo: boolean;
}
export interface IOrganizadorPreferenciaDocument extends IOrganizadorPreferencia, Document {}

// ── Respuestas ──────────────────────────────────────────────────────────────

export interface IUsuarioRef {
  id: string;
  nombre: string | null;
}

export interface IClienteRef {
  nombre: string | null;
  telefono: string;
}

export interface IOrganizadorPendienteResponse {
  /** = notaId: el pendiente ES la nota. */
  id: string;
  clienteId: string;
  cliente: IClienteRef;
  descripcion: string;
  programadoDia: string;
  programadoHora: string | null;
  recordatorioAt: string | null;
  /** HU-PDF-02 A1 — cuándo se avisa (antes de `recordatorioAt` si se pidió anticipación). */
  avisoAt: string | null;
  avisoAntesMin: number;
  estado: EstadoOrganizador;
  vecesPospuesto: number;
  responsable: IUsuarioRef;
  cerradoAt: string | null;
  cerradoPor: IUsuarioRef | null;
  /** Control optimista de cerrar/posponer: el `recordatorioAt` que vio el cliente. */
  version: string | null;
}

export interface IProgramacionResponse {
  dia: string | null;
  hora: string | null;
  recordatorioAt: string | null;
}

export interface IPendienteEventoResponse {
  id: string;
  notaId: string;
  clienteId: string;
  cliente: IClienteRef | null;
  tipo: TipoEventoPendiente;
  actor: IUsuarioRef | null;
  responsable: IUsuarioRef;
  at: string;
  antes: IProgramacionResponse | null;
  despues: IProgramacionResponse | null;
  motivo: string | null;
  motivos: { key: MotivoKey | null; motivoId: string | null; nombre: string }[];
  otroMotivo: string | null;
  comentario: string | null;
  tags: { id: string; nombre: string; color: string }[];
  origen: OrigenEventoPendiente;
}

export interface IMotivoCierreResponse {
  id: string;
  nombre: string;
}

export interface IMotivosCierreResponse {
  predefinidos: { key: MotivoKey; nombre: string }[];
  personalizados: IMotivoCierreResponse[];
}

export interface IActivosResponse {
  items: IOrganizadorPendienteResponse[];
  total: number;
}

export interface IPreferenciaResponse {
  activo: boolean;
}
