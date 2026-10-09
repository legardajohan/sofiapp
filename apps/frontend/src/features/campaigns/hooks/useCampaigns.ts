import { useEffect } from 'react';
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import { toast } from 'sonner';
import { motivo } from '@/features/leads/lib/errors';
import { getSocket } from '../../../lib/socket.js';
import {
  cancelCampaign,
  createCampaign,
  fetchCampaign,
  fetchCampaigns,
  fetchRecipients,
  launchCampaign,
  pauseCampaign,
  previewSegmento,
  rescheduleCampaign,
  resumeCampaign,
  scheduleCampaign,
} from '../api.js';
import type {
  CampaignDTO,
  CampaignDetalleDTO,
  CampaignRecipientDTO,
  CreateCampaignPayload,
  EstadoCampana,
  EstadoDestinatario,
  PagedDTO,
  RescheduleCampaignPayload,
  ScheduleCampaignPayload,
  SegmentPreviewDTO,
  SegmentoFiltros,
  TotalesCampana,
} from '../types.js';

const CAMPAIGNS_KEY = ['campaigns'] as const;

export function useCampaigns(
  filtros: { page: number; estado?: EstadoCampana },
): UseQueryResult<PagedDTO<CampaignDTO>> {
  return useQuery({
    queryKey: [...CAMPAIGNS_KEY, filtros],
    queryFn: () => fetchCampaigns({ page: filtros.page, limit: 20, estado: filtros.estado }),
    // Cambiar de página o de filtro no debe vaciar la tabla: se conserva lo anterior mientras llega.
    placeholderData: keepPreviousData,
  });
}

export function useCampaign(id: string | undefined): UseQueryResult<CampaignDetalleDTO> {
  return useQuery({
    queryKey: ['campaign', id],
    queryFn: () => fetchCampaign(id as string),
    enabled: Boolean(id),
  });
}

export function useRecipients(
  id: string | undefined,
  filtros: { page: number; estado?: EstadoDestinatario },
): UseQueryResult<PagedDTO<CampaignRecipientDTO>> {
  return useQuery({
    queryKey: ['campaign-recipients', id, filtros],
    queryFn: () =>
      fetchRecipients(id as string, { page: filtros.page, limit: 20, estado: filtros.estado }),
    enabled: Boolean(id),
    placeholderData: keepPreviousData,
  });
}

/**
 * Conteo del segmento y cupo del día.
 *
 * `enabled` a discreción del llamador: el wizard lo activa solo mientras el paso del segmento está
 * abierto, y le pasa los filtros ya debounced. Sin eso sería una petición por tecla pulsada.
 */
export function useSegmentPreview(
  filtros: SegmentoFiltros,
  enabled: boolean,
): UseQueryResult<SegmentPreviewDTO> {
  return useQuery({
    queryKey: ['campaign-segment', filtros],
    queryFn: () => previewSegmento(filtros),
    enabled,
    placeholderData: keepPreviousData,
  });
}

function useInvalidarCampanas(): () => void {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: CAMPAIGNS_KEY });
    void qc.invalidateQueries({ queryKey: ['campaign'] });
  };
}

export function useCreateCampaign(): UseMutationResult<
  CampaignDTO,
  unknown,
  CreateCampaignPayload
> {
  const invalidar = useInvalidarCampanas();
  return useMutation({
    mutationFn: (payload: CreateCampaignPayload) => createCampaign(payload),
    onSuccess: (campana) => {
      invalidar();
      // El mensaje dice lo que pasó, no lo que se pidió: crear y lanzar son la misma petición.
      const texto =
        campana.estado === 'en_curso'
          ? `«${campana.nombre}» empezó a enviarse`
          : campana.estado === 'programada'
            ? `«${campana.nombre}» quedó programada`
            : `«${campana.nombre}» se guardó como borrador`;
      toast.success(texto);
    },
    onError: (error) => toast.error(motivo(error, 'No se pudo crear la campaña.')),
  });
}

/** «el jueves 12 de nov. a las 9:00», para que el toast confirme la hora que quedó, no solo que quedó. */
function cuando(iso: string | null): string {
  if (!iso) return '';
  const fecha = new Date(iso);
  const dia = fecha.toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'short' });
  const hora = fecha.toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit' });
  return ` para el ${dia} a las ${hora}`;
}

export function useScheduleCampaign(): UseMutationResult<
  CampaignDTO,
  unknown,
  ScheduleCampaignPayload
> {
  const invalidar = useInvalidarCampanas();
  return useMutation({
    mutationFn: (payload: ScheduleCampaignPayload) => scheduleCampaign(payload),
    onSuccess: (campana) => {
      invalidar();
      toast.success(`«${campana.nombre}» quedó programada${cuando(campana.programadaPara)}`);
    },
    onError: (error) => toast.error(motivo(error, 'No se pudo programar la campaña.')),
  });
}

export function useRescheduleCampaign(): UseMutationResult<
  CampaignDTO,
  unknown,
  RescheduleCampaignPayload
> {
  const invalidar = useInvalidarCampanas();
  return useMutation({
    mutationFn: (payload: RescheduleCampaignPayload) => rescheduleCampaign(payload),
    onSuccess: (campana) => {
      invalidar();
      toast.success(`«${campana.nombre}» se reprogramó${cuando(campana.programadaPara)}`);
    },
    onError: (error) => toast.error(motivo(error, 'No se pudo reprogramar la campaña.')),
  });
}

/** Las cuatro transiciones comparten forma, así que comparten fábrica de hook. */
function useTransicion(
  accion: (id: string) => Promise<CampaignDTO>,
  exito: (c: CampaignDTO) => string,
  fallo: string,
): UseMutationResult<CampaignDTO, unknown, string> {
  const invalidar = useInvalidarCampanas();
  return useMutation({
    mutationFn: accion,
    onSuccess: (campana) => {
      invalidar();
      toast.success(exito(campana));
    },
    onError: (error) => toast.error(motivo(error, fallo)),
  });
}

export const useLaunchCampaign = (): UseMutationResult<CampaignDTO, unknown, string> =>
  useTransicion(
    launchCampaign,
    (c) => `«${c.nombre}» empezó a enviarse`,
    'No se pudo lanzar la campaña.',
  );

export const usePauseCampaign = (): UseMutationResult<CampaignDTO, unknown, string> =>
  useTransicion(pauseCampaign, (c) => `«${c.nombre}» está en pausa`, 'No se pudo pausar la campaña.');

export const useResumeCampaign = (): UseMutationResult<CampaignDTO, unknown, string> =>
  useTransicion(
    resumeCampaign,
    (c) => `«${c.nombre}» volvió a enviarse`,
    'No se pudo reanudar la campaña.',
  );

export const useCancelCampaign = (): UseMutationResult<CampaignDTO, unknown, string> =>
  useTransicion(
    cancelCampaign,
    (c) => `«${c.nombre}» se canceló`,
    'No se pudo cancelar la campaña.',
  );

interface ProgresoEvento {
  campaignId: string;
  estado: EstadoCampana;
  totales: TotalesCampana;
}

/**
 * Avance en vivo de las campañas.
 *
 * El worker publica un evento por lote al room del tenant. Se escribe **en la caché** en vez de
 * refetchear: durante un envío grande llegan eventos cada pocos segundos, y una petición por cada
 * uno convertiría la pantalla abierta en un goteo constante contra el backend.
 */
export function useCampaignRealtime(): void {
  const qc = useQueryClient();

  useEffect(() => {
    const socket = getSocket();

    const onProgreso = (evt: ProgresoEvento): void => {
      qc.setQueryData<CampaignDetalleDTO>(['campaign', evt.campaignId], (previo) =>
        previo ? { ...previo, estado: evt.estado, totales: evt.totales } : previo,
      );
      // El listado no se parchea fila a fila: son varias claves de query (una por filtro y página)
      // y reconstruirlas a mano sería más frágil que pedirlas de nuevo cuando toque.
      void qc.invalidateQueries({ queryKey: CAMPAIGNS_KEY });
      void qc.invalidateQueries({ queryKey: ['campaign-recipients', evt.campaignId] });
    };

    socket.on('campaign:progress', onProgreso);
    return () => {
      socket.off('campaign:progress', onProgreso);
    };
  }, [qc]);
}
