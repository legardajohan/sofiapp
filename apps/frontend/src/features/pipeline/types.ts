import type { Paginated } from '@/features/inbox/types';
import type { EstadoPendiente } from '@/features/contacts/types';
import type { EstadoDTO } from '../estados/types.js';
import type { LeadListItemDTO, LeadsFiltros } from '../leads/types.js';

/** Una columna del embudo: la etapa y su primera página de leads (HU-PIPE-01). */
export interface PipelineColumnDTO {
  etapa: EstadoDTO;
  /**
   * Los leads que hay en la etapa con los filtros aplicados. **No es `leads.length`**: la columna
   * trae como mucho `limit` tarjetas, y la cabecera necesita el número real para no mentir.
   */
  total: number;
  leads: LeadListItemDTO[];
}

export interface PipelineDTO {
  columnas: PipelineColumnDTO[];
  /** El tope por columna que aplicó el backend: con él sabemos si estamos mostrando todo. */
  limit: number;
}

/**
 * Filtros del tablero: los mismos del listado menos `page` y `estado`.
 *
 * `estado` no está porque el tablero ya agrupa por etapa; mandarlo es un `400`. `page` tampoco:
 * cada columna trae su primera página y recorrer el resto es trabajo de la tabla.
 */
export type PipelineFiltros = Omit<LeadsFiltros, 'page' | 'estado'>;

/** Canal por el que llegó el contacto. Mismo conjunto que `Cliente.canalOrigen` en el backend. */
export type CanalOrigen = 'whatsapp' | 'instagram' | 'messenger' | 'formulario' | 'web';

/**
 * Un pendiente de la columna «Pendientes» (HU-PDF-01). Es una nota marcada como pendiente, ya
 * compuesta con su contacto, su lead y su etapa.
 */
export interface PendienteDTO {
  /** El id de la nota: el pendiente ES la nota. */
  id: string;
  clienteId: string;
  descripcion: string;
  autor: { id: string; nombre: string | null };
  createdAt: string;
  /** Día civil `YYYY-MM-DD` programado (HU-PDF-01 A1). */
  programadoDia: string;
  /** `HH:mm`, o `null` si es de todo el día. */
  programadoHora: string | null;
  estado: EstadoPendiente;
  cerradoAt: string | null;
  cerradoPor: { id: string; nombre: string | null } | null;
  /** HU-PDF-02: instante del recordatorio; es la `version` que pide cerrar con motivo. */
  recordatorioAt?: string | null;
  lead: {
    leadId: string | null;
    nombre: string | null;
    telefono: string;
    correo: string | null;
    canalOrigen: CanalOrigen | null;
    /** `null` = el contacto todavía no es lead: «Sin convertir». */
    etapa: { key: string; label: string; color: string } | null;
  };
}

export type PendientesPage = Paginated<PendienteDTO>;

/** Rango del PDF en días civiles (`YYYY-MM-DD`) y la zona del navegador para leerlos. */
export interface RangoPdfPendientes {
  desde: string;
  hasta: string;
  tz: string;
}

export type { EstadoPendiente };
