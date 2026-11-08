import type { Document, Types } from 'mongoose';

/**
 * HU-REP-06 — Tiempo activo del asesor. Definición de «activo» y de cómo se acredita cada latido:
 * `docs/specs/HU-REP-06-tiempo-activo-asesor/spec.md`.
 */

/**
 * Cubeta de actividad: lo que un asesor estuvo activo dentro de UNA hora UTC.
 *
 * Por hora y no por segmentos inicio/fin: así el reporte reagrupa por día, semana o mes en la zona
 * que pida, sin tener que partir un segmento que cruza la medianoche local.
 */
export interface IActividadAsesor {
  tenantId: Types.ObjectId;
  userId: Types.ObjectId;
  /** Inicio de la hora UTC (minutos, segundos y ms a 0). */
  hora: Date;
  segundosActivos: number;
  primerLatido: Date;
  ultimoLatido: Date;
}

export interface IActividadAsesorDocument extends IActividadAsesor, Document {}

/**
 * El último latido aceptado de cada asesor. Es el punto que serializa las pestañas: cada latido
 * acredita desde el anterior, venga de la pestaña que venga, así que dos pestañas no suman el doble.
 */
export interface IActividadCursor {
  tenantId: Types.ObjectId;
  userId: Types.ObjectId;
  ultimoLatido: Date;
}

export interface IActividadCursorDocument extends IActividadCursor, Document {}

/** Tramo acreditado por un latido, ya partido por hora UTC. */
export interface ITramoActividad {
  hora: Date;
  segundos: number;
}

export interface IConfigCredito {
  intervaloMs: number;
  toleranciaMs: number;
}

export const HORA_MS = 60 * 60 * 1000;
