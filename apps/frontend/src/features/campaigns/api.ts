import { apiClient } from '../../api/apiClient.js';
import type {
  CampaignDTO,
  CampaignDetalleDTO,
  CampaignMetricsDTO,
  CampaignsOverviewDTO,
  CampaignRecipientDTO,
  CreateCampaignPayload,
  EstadoCampana,
  EstadoDestinatario,
  PagedDTO,
  RescheduleCampaignPayload,
  ScheduleCampaignPayload,
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

/**
 * Subir una imagen tarda más que un JSON: el `timeout` general de 10 s cortaría una foto de 5 MB en
 * una conexión lenta a medio camino.
 */
const TIMEOUT_SUBIDA_MS = 60_000;

/**
 * Programa una campaña con su imagen (HU-MARK-03). Multipart porque la imagen es un archivo; los
 * campos con estructura (`filtros`, `parametros`) viajan como JSON dentro del formulario.
 */
export async function scheduleCampaign(payload: ScheduleCampaignPayload): Promise<CampaignDTO> {
  const form = new FormData();
  form.append('nombre', payload.nombre);
  form.append('filtros', JSON.stringify(payload.filtros));
  form.append('templateId', payload.templateId);
  form.append('parametros', JSON.stringify(payload.parametros));
  form.append('programadaPara', payload.programadaPara);
  if (payload.imagen) form.append('imagen', payload.imagen);

  const { data } = await apiClient.post<CampaignDTO>('/campaigns/schedule', form, {
    timeout: TIMEOUT_SUBIDA_MS,
  });
  return data;
}

export async function rescheduleCampaign({
  id,
  programadaPara,
  imagen,
}: RescheduleCampaignPayload): Promise<CampaignDTO> {
  const form = new FormData();
  if (programadaPara) form.append('programadaPara', programadaPara);
  if (imagen) form.append('imagen', imagen);

  const { data } = await apiClient.patch<CampaignDTO>(`/campaigns/${id}/schedule`, form, {
    timeout: TIMEOUT_SUBIDA_MS,
  });
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

/** Resultados de una campaña: envío, entrega, lectura, respuesta y conversión (HU-MARK-04). */
export async function fetchCampaignMetrics(id: string, zona: string): Promise<CampaignMetricsDTO> {
  const { data } = await apiClient.get<CampaignMetricsDTO>(`/campaigns/${id}/metrics`, {
    params: { zona },
  });
  return data;
}

/** Lo mismo, sumado sobre las campañas que arrancaron en el período. */
export async function fetchCampaignsOverview(params: {
  desde: string;
  hasta?: string;
  zona: string;
}): Promise<CampaignsOverviewDTO> {
  const { data } = await apiClient.get<CampaignsOverviewDTO>('/campaigns/metrics', { params });
  return data;
}
