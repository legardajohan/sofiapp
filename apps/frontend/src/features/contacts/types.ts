import type { Paginated } from '@/features/inbox/types';

/** Atributo tal como lo edita el formulario: sin `oculto`, que es una marca de solo lectura. */
export interface AtributoInput {
  key: string;
  label: string;
  valor: string;
  sensible: boolean;
}

/** Lo que viaja al guardar un atributo: el campo del catálogo (`key`) y su valor. */
export interface AtributoPatch {
  key: string;
  valor: string;
}

/**
 * Parche de la ficha. `undefined` = no se toca; `null` = se borra. Es la misma semántica que aplica
 * el backend, así que el formulario solo manda lo que cambió.
 */
export interface ContactPatchPayload {
  nombre?: string | null;
  /** Solo dígitos con indicativo, sin `+` ni separadores: el mismo formato que escribe el webhook. */
  telefono?: string | null;
  correo?: string | null;
  documento?: string | null;
  // Claves del catálogo del tenant, no uniones cerradas: interés, objeción y rol son listas que
  // cada empresa administra desde el propio diálogo de edición (ver `OpcionDTO`).
  nivelInteres?: string | null;
  objecionPrincipal?: string | null;
  rolContacto?: string | null;
  /** Solo `key` y `valor`: la etiqueta y `sensible` los fija el catálogo de campos (HU-FLOW-05). */
  atributos?: AtributoPatch[];
  /** HU-MARK-01. */
  marketingOptOut?: boolean;
  /** HU-MARK-07. */
  bloqueado?: boolean;
}

// ─── Catálogos de interés / objeción / rol (HU-CRM-02) ──────────────────────────

export const TIPOS_OPCION = ['interes', 'objecion', 'rol'] as const;

export type TipoOpcion = (typeof TIPOS_OPCION)[number];

export interface OpcionDTO {
  id: string;
  tipo: TipoOpcion;
  /** Lo que se guarda en el contacto. No cambia al renombrar la opción. */
  key: string;
  label: string;
  /** `#RRGGBB` elegido por la empresa. Se pinta siempre a través de `tagColors`, nunca crudo. */
  color: string;
  orden: number;
  /** `false` = archivada: fuera del desplegable, pero aún resuelve su etiqueta en fichas antiguas. */
  activo: boolean;
  esDefecto: boolean;
}

export type OpcionesPorTipo = Record<TipoOpcion, OpcionDTO[]>;

/** El backend archiva en vez de borrar cuando algún contacto todavía usa la opción. */
export interface BorradoOpcionDTO {
  eliminada: boolean;
  enUso: number;
  opcion: OpcionDTO | null;
}

// ─── Campos personalizados por empresa (HU-FLOW-05) ─────────────────────────────

export const TIPOS_DATO_CAMPO = ['texto', 'numero', 'fecha', 'booleano'] as const;
export type TipoDatoCampo = (typeof TIPOS_DATO_CAMPO)[number];

export const TIPO_DATO_LABEL: Record<TipoDatoCampo, string> = {
  texto: 'Texto',
  numero: 'Número',
  fecha: 'Fecha',
  booleano: 'Sí / No',
};

/**
 * Un campo del catálogo de la empresa: lo comparten la ficha del contacto y el nodo `captura` de los
 * flujos, así que cada dato tiene UNA sola clave (`key`) en todos lados.
 */
export interface CampoContactoDTO {
  id: string;
  /** Lo que queda grabado en el contacto. No cambia al renombrar. */
  key: string;
  label: string;
  tipoDato: TipoDatoCampo;
  sensible: boolean;
  orden: number;
  /** `false` = archivado: no se ofrece para elegir, pero los contactos que lo tienen lo conservan. */
  activo: boolean;
}

export interface CrearCampoPayload {
  label: string;
  tipoDato: TipoDatoCampo;
  sensible?: boolean;
}

export interface NotaDTO {
  id: string;
  texto: string;
  autor: { id: string; nombre: string | null };
  /** La nota es además un pendiente del embudo (HU-PDF-01). */
  pendiente: boolean;
  /** Día civil `YYYY-MM-DD` del pendiente (HU-PDF-01 A1). `null` si la nota no es pendiente. */
  programadoDia: string | null;
  /** `HH:mm`, o `null` si es de todo el día. */
  programadoHora: string | null;
  estadoPendiente: EstadoPendiente | null;
  cerradoAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Ciclo de vida de un pendiente: cerrado = cumplido y archivado en el historial. */
export type EstadoPendiente = 'abierto' | 'cerrado';

/** Programación al crear una nota pendiente. Sin día, el backend la deja para hoy. */
export interface NuevaNota {
  texto: string;
  pendiente: boolean;
  programadoDia?: string;
  programadoHora?: string;
}

export type NotasPage = Paginated<NotaDTO>;

/** Lo que se puede cambiar de una nota existente. Al menos uno de los dos. */
export interface CambiosNota {
  texto?: string;
  pendiente?: boolean;
  programadoDia?: string;
  /** `null` quita la hora: el pendiente pasa a ser de todo el día. */
  programadoHora?: string | null;
}
