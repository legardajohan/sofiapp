import { apiClient } from '../../api/apiClient.js';
import type {
  CampaignDTO,
  CampaignDetalleDTO,
  CampaignRecipientDTO,
  CreateCampaignPayload,
  EstadoCampana,
  EstadoDestinatario,
  PagedDTO,
  SegmentPreviewDTO,
  SegmentoFiltros,
} from './types.js';

// Las rutas NO llevan el prefijo `/api`: lo aporta el baseURL del apiClient.

/**
 * Cuánta gente cae en el segmento y cuánto cupo hay hoy para alcanzarla.
 *
 * Va por `POST` y no por query params porque los filtros son un objeto anidado con listas
 * (atributos con varios valores cada uno); serializarlo en la URL sería ilegible y frágil.
 */
export async function previewSegmento(filtros: SegmentoFiltros): Promise<SegmentPreviewDTO> {
  const { data } = await apiClient.post<SegmentPreviewDTO>('/campaigns/segmento/preview', {
    filtros,
  });
  return data;
}

export async function fetchCampaigns(params: {
  page?: number;
  limit?: number;
  estado?: EstadoCampana;
}): Promise<PagedDTO<CampaignDTO>> {
  const { data } = await apiClient.get<PagedDTO<CampaignDTO>>('/campaigns', { params });
  return data;
}

export async function fetchCampaign(id: string): Promise<CampaignDetalleDTO> {
  const { data } = await apiClient.get<CampaignDetalleDTO>(`/campaigns/${id}`);
  return data;
}

export async function fetchRecipients(
  id: string,
  params: { page?: number; limit?: number; estado?: EstadoDestinatario },
): Promise<PagedDTO<CampaignRecipientDTO>> {
  const { data } = await apiClient.get<PagedDTO<CampaignRecipientDTO>>(
    `/campaigns/${id}/destinatarios`,
    { params },
  );
  return data;
}

export async function createCampaign(payload: CreateCampaignPayload): Promise<CampaignDTO> {
  const { data } = await apiClient.post<CampaignDTO>('/campaigns', payload);
  return data;
}

/** Las cuatro transiciones comparten forma: `POST` sin cuerpo, el destino lo dice la ruta. */
async function transicion(id: string, accion: string): Promise<CampaignDTO> {
  const { data } = await apiClient.post<CampaignDTO>(`/campaigns/${id}/${accion}`);
  return data;
}

export const launchCampaign = (id: string): Promise<CampaignDTO> => transicion(id, 'launch');
export const pauseCampaign = (id: string): Promise<CampaignDTO> => transicion(id, 'pause');
export const resumeCampaign = (id: string): Promise<CampaignDTO> => transicion(id, 'resume');
export const cancelCampaign = (id: string): Promise<CampaignDTO> => transicion(id, 'cancel');
