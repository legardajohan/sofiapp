import type { Paginated } from '@/features/inbox/types';

/** Estados del Organizador (HU-PDF-02). Los deriva el backend; aquí solo se pintan. */
export type EstadoOrganizador = 'pendiente' | 'vencido' | 'pospuesto' | 'cerrado';

export type MotivoKey =
  | 'contactado'
  | 'gestion-realizada'
  | 'venta'
  | 'info-enviada'
  | 'solucionada'
  | 'no-interesado'
  | 'no-respondio'
  | 'cancelada'
  | 'sin-seguimiento';

export interface UsuarioRef {
  id: string;
  nombre: string | null;
}

export interface OrganizadorPendienteDTO {
  /** = id de la nota. */
  id: string;
  clienteId: string;
  cliente: { nombre: string | null; telefono: string };
  descripcion: string;
  programadoDia: string;
  programadoHora: string | null;
  recordatorioAt: string | null;
  /** HU-PDF-02 A1 — cuándo se avisa: antes de `recordatorioAt` si se pidió anticipación. */
  avisoAt: string | null;
  avisoAntesMin: number;
  estado: EstadoOrganizador;
  vecesPospuesto: number;
  responsable: UsuarioRef;
  cerradoAt: string | null;
  cerradoPor: UsuarioRef | null;
  /** El `recordatorioAt` que hay que devolver al cerrar o posponer (control optimista). */
  version: string | null;
}

export type TipoEventoPendiente =
  | 'programado'
  | 'reprogramado'
  | 'vencido'
  | 'pospuesto'
  | 'cerrado'
  | 'reabierto';

export interface ProgramacionDTO {
  dia: string | null;
  hora: string | null;
  recordatorioAt: string | null;
}

export interface PendienteEventoDTO {
  id: string;
  notaId: string;
  clienteId: string;
  cliente: { nombre: string | null; telefono: string } | null;
  tipo: TipoEventoPendiente;
  /** `null` = el sistema. */
  actor: UsuarioRef | null;
  responsable: UsuarioRef;
  at: string;
  antes: ProgramacionDTO | null;
  despues: ProgramacionDTO | null;
  motivo: string | null;
  motivos: { key: MotivoKey | null; motivoId: string | null; nombre: string }[];
  otroMotivo: string | null;
  comentario: string | null;
  tags: { id: string; nombre: string; color: string }[];
  origen: 'organizador' | 'rapido' | 'nota' | 'sistema';
}

export interface MotivosCierreDTO {
  predefinidos: { key: MotivoKey; nombre: string }[];
  personalizados: { id: string; nombre: string }[];
}

export interface ActivosDTO {
  items: OrganizadorPendienteDTO[];
  total: number;
}

export type ConteosDTO = Record<EstadoOrganizador, number>;

export type OrganizadorPage = Paginated<OrganizadorPendienteDTO>;
export type ActividadPage = Paginated<PendienteEventoDTO>;

export interface FiltrosOrganizador {
  desde?: string;
  hasta?: string;
  clienteId?: string;
  responsableId?: string;
}

export interface CerrarPendienteInput {
  motivoKeys: MotivoKey[];
  motivoIds: string[];
  otro?: { texto: string };
  comentario?: string;
  tagIds: string[];
  version: string | null;
}

export interface PosponerPendienteInput {
  motivo: string;
  nuevoDia: string;
  nuevaHora: string;
  tagIds: string[];
  version: string | null;
}

/**
 * Lo mínimo que necesitan los modales de cerrar y posponer. Se arma igual desde el Organizador,
 * la pila de recordatorios, la campana y la columna Pendientes del embudo.
 */
export interface PendienteGestionable {
  id: string;
  clienteId: string;
  clienteNombre: string;
  descripcion: string;
  programadoDia: string;
  programadoHora: string | null;
  version: string | null;
}
