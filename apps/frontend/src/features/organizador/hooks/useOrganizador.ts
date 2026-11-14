import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import { toast } from 'sonner';
import axios from 'axios';
import { PENDIENTES_KEY } from '@/features/contacts/hooks/useNotas';
import { errorMessage, esSinPermiso } from '@/features/contacts/lib/errors';
import { puedeVerDatosSensibles } from '@/lib/roles';
import { useAuthStore } from '@/stores/authStore';
import {
  cerrarConMotivo,
  crearMotivo,
  fetchActividad,
  fetchActivos,
  fetchConteos,
  fetchHistorialPendiente,
  fetchMotivos,
  fetchOrganizador,
  fetchPreferencia,
  guardarPreferencia,
  posponerPendiente,
} from '../api.js';
import type {
  CerrarPendienteInput,
  EstadoOrganizador,
  FiltrosOrganizador,
  PosponerPendienteInput,
} from '../types.js';

/** Raíz de todas las claves del Organizador: un solo `invalidate` refresca pila, campana y tabla. */
export const ORGANIZADOR_KEY = ['organizador'] as const;

const ACTIVOS_KEY = [...ORGANIZADOR_KEY, 'activos'] as const;
const PREFERENCIA_KEY = [...ORGANIZADOR_KEY, 'preferencia'] as const;

/** Mismo criterio que las notas: un 403 no se reintenta, significa «estos datos no son para ti». */
const reintento = (fallos: number, error: unknown): boolean => !esSinPermiso(error) && fallos < 1;

/** ¿El usuario puede usar el Organizador? Mismo gate que leer notas (RN8 de HU-PDF-01). */
export function usePuedeUsarOrganizador(): boolean {
  const user = useAuthStore((s) => s.user);
  return puedeVerDatosSensibles(user);
}

export function usePreferenciaOrganizador() {
  const puede = usePuedeUsarOrganizador();
  return useQuery({
    queryKey: PREFERENCIA_KEY,
    queryFn: fetchPreferencia,
    enabled: puede,
    staleTime: 5 * 60 * 1000,
    retry: reintento,
  });
}

export function useGuardarPreferencia() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: guardarPreferencia,
    // Optimista: el switch responde al instante; si falla, vuelve a su sitio.
    onMutate: async (activo: boolean) => {
      await qc.cancelQueries({ queryKey: PREFERENCIA_KEY });
      const previa = qc.getQueryData<{ activo: boolean }>(PREFERENCIA_KEY);
      qc.setQueryData(PREFERENCIA_KEY, { activo });
      return { previa };
    },
    onError: (error, _activo, ctx) => {
      if (ctx?.previa) qc.setQueryData(PREFERENCIA_KEY, ctx.previa);
      toast.error(errorMessage(error, 'No se pudo guardar la preferencia.'));
    },
    onSuccess: (data) => {
      qc.setQueryData(PREFERENCIA_KEY, data);
      // Al reactivar, los vencidos sin gestionar tienen que aparecer ya (CA-13).
      if (data.activo) void qc.invalidateQueries({ queryKey: ACTIVOS_KEY });
    },
  });
}

/**
 * ¿Hay que mostrar avisos? Solo con permiso y con el switch encendido. Mientras la preferencia
 * carga se asume `true` (es el valor por defecto): así un recordatorio no espera a una segunda
 * consulta para aparecer.
 */
export function useAvisosActivos(): boolean {
  const puede = usePuedeUsarOrganizador();
  const { data } = usePreferenciaOrganizador();
  return puede && (data?.activo ?? true);
}

/**
 * Los recordatorios vencidos sin gestionar del usuario. La verdad está en el servidor: se piden al
 * montar, al volver a la pestaña, al reconectar y cada minuto. El socket solo adelanta el aviso;
 * si se perdió, este refresco lo trae igual (CA-04).
 */
export function useRecordatoriosActivos() {
  const habilitado = useAvisosActivos();
  return useQuery({
    queryKey: ACTIVOS_KEY,
    queryFn: fetchActivos,
    enabled: habilitado,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    retry: reintento,
  });
}

export function useOrganizadorLista(
  estado: EstadoOrganizador,
  filtros: FiltrosOrganizador,
  page: number,
) {
  return useQuery({
    queryKey: [...ORGANIZADOR_KEY, 'lista', estado, filtros, page],
    queryFn: () => fetchOrganizador(estado, filtros, page),
    placeholderData: keepPreviousData,
    retry: reintento,
  });
}

export function useConteosOrganizador(filtros: FiltrosOrganizador) {
  return useQuery({
    queryKey: [...ORGANIZADOR_KEY, 'conteos', filtros],
    queryFn: () => fetchConteos(filtros),
    placeholderData: keepPreviousData,
    retry: reintento,
  });
}

export function useHistorialPendiente(id: string | null) {
  return useQuery({
    queryKey: [...ORGANIZADOR_KEY, 'historial', id],
    queryFn: () => fetchHistorialPendiente(id as string),
    enabled: !!id,
    retry: reintento,
  });
}

export function useActividad(
  filtros: Pick<FiltrosOrganizador, 'clienteId' | 'responsableId'>,
  page: number,
  habilitado: boolean,
) {
  return useQuery({
    queryKey: [...ORGANIZADOR_KEY, 'actividad', filtros, page],
    queryFn: () => fetchActividad(filtros, page),
    enabled: habilitado,
    placeholderData: keepPreviousData,
    retry: reintento,
  });
}

export function useMotivosCierre(habilitado: boolean) {
  return useQuery({
    queryKey: [...ORGANIZADOR_KEY, 'motivos'],
    queryFn: fetchMotivos,
    enabled: habilitado,
    staleTime: 5 * 60 * 1000,
  });
}

export function useCrearMotivo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: crearMotivo,
    onSuccess: () => void qc.invalidateQueries({ queryKey: [...ORGANIZADOR_KEY, 'motivos'] }),
    onError: (error) => toast.error(errorMessage(error, 'No se pudo crear el motivo.')),
  });
}

/**
 * Cerrar o posponer cambia el Organizador, la columna del embudo, la ficha (distintivo de la nota)
 * y, si se etiquetó, la bandeja.
 */
function invalidarTodo(qc: QueryClient, clienteId: string): void {
  void qc.invalidateQueries({ queryKey: ORGANIZADOR_KEY });
  void qc.invalidateQueries({ queryKey: PENDIENTES_KEY });
  void qc.invalidateQueries({ queryKey: ['contact-notas', clienteId] });
  void qc.invalidateQueries({ queryKey: ['conversations'] });
}

/** 409 = otra pestaña, otro clic u otro compañero ya lo gestionó. No es un error: se refresca. */
export function esYaGestionado(error: unknown): boolean {
  return axios.isAxiosError(error) && error.response?.status === 409;
}

export function useCerrarConMotivo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; clienteId: string; input: CerrarPendienteInput }) =>
      cerrarConMotivo(id, input),
    onSuccess: (_data, { clienteId }) => {
      invalidarTodo(qc, clienteId);
      toast.success('Pendiente cerrado.');
    },
    onError: (error, { clienteId }) => {
      if (esYaGestionado(error)) {
        invalidarTodo(qc, clienteId);
        toast.info('Este pendiente ya fue gestionado.');
        return;
      }
      toast.error(errorMessage(error, 'No se pudo cerrar el pendiente.'));
    },
  });
}

export function usePosponerPendiente() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; clienteId: string; input: PosponerPendienteInput }) =>
      posponerPendiente(id, input),
    onSuccess: (_data, { clienteId }) => {
      invalidarTodo(qc, clienteId);
      toast.success('Pendiente pospuesto.');
    },
    onError: (error, { clienteId }) => {
      if (esYaGestionado(error)) {
        invalidarTodo(qc, clienteId);
        toast.info('Este pendiente ya fue gestionado.');
        return;
      }
      toast.error(errorMessage(error, 'No se pudo posponer el pendiente.'));
    },
  });
}

