import { apiClient } from '../../api/apiClient.js';
import type { LeadDTO } from '../leads/types.js';
import type { PipelineDTO, PipelineFiltros } from './types.js';

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
