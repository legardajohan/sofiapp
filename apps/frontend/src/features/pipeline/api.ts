import axios from 'axios';
import { apiClient } from '../../api/apiClient.js';
import type { LeadDTO } from '../leads/types.js';
import type {
  EstadoPendiente,
  PendienteDTO,
  PendientesPage,
  PipelineDTO,
  PipelineFiltros,
  RangoPdfPendientes,
} from './types.js';

// Rutas SIN el prefijo `/api`: lo aporta el `baseURL` del apiClient (regla del CLAUDE.md frontend).

/** El embudo agrupado por etapa. Los filtros ausentes no viajan. */
export async function fetchPipeline(filtros: PipelineFiltros): Promise<PipelineDTO> {
  const { data } = await apiClient.get<PipelineDTO>('/pipeline', { params: filtros });
  return data;
}

/**
 * Mueve un lead de etapa. Ruta propia (`/stage`) y no el `PATCH /leads/:id` genérico: el body es
 * `.strict()`, así que una llave de más es un `400` en vez de un cambio por la puerta de atrás.
 */
export async function moveLeadStage(id: string, estado: string): Promise<LeadDTO> {
  const { data } = await apiClient.patch<LeadDTO>(`/leads/${id}/stage`, { estado });
  return data;
}

/**
 * Una página de la columna «Pendientes» (HU-PDF-01): los abiertos en orden de agenda, o el
 * historial de cerrados (A1).
 */
export async function fetchPendientes(
  estado: EstadoPendiente,
  page: number,
  limit = 20,
): Promise<PendientesPage> {
  const { data } = await apiClient.get<PendientesPage>('/pendientes', {
    params: { estado, page, limit },
  });
  return data;
}

/** Marca el pendiente como cumplido y lo archiva en el historial. */
export async function cerrarPendiente(id: string): Promise<PendienteDTO> {
  const { data } = await apiClient.post<PendienteDTO>(`/pendientes/${id}/cerrar`);
  return data;
}

/** Lo devuelve a la columna con su programación intacta. */
export async function reabrirPendiente(id: string): Promise<PendienteDTO> {
  const { data } = await apiClient.post<PendienteDTO>(`/pendientes/${id}/reabrir`);
  return data;
}

/**
 * El reporte de pendientes en PDF, como `Blob`.
 *
 * Con `responseType: 'blob'` también el cuerpo de un error llega como `Blob`, así que el `message`
 * del backend —«No hay pendientes en el rango seleccionado.»— quedaría ilegible. Aquí se reescribe
 * `response.data` con el JSON ya parseado para que `errorMessage` lo lea igual que en cualquier otra
 * llamada.
 *
 * Timeout propio: un reporte grande tarda más que los 10 s de una petición normal.
 */
export async function downloadPendientesPdf(rango: RangoPdfPendientes): Promise<Blob> {
  try {
    const { data } = await apiClient.get<Blob>('/pendientes/pdf', {
      params: rango,
      responseType: 'blob',
      timeout: 60000,
    });
    return data;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.data instanceof Blob) {
      try {
        error.response.data = JSON.parse(await error.response.data.text()) as unknown;
      } catch {
        // No era JSON: se deja el error tal cual y `errorMessage` usará su texto por defecto.
      }
    }
    throw error;
  }
}
