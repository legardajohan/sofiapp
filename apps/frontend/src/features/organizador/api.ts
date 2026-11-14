import { apiClient } from '../../api/apiClient.js';
import { zonaDelNavegador } from '@/lib/agenda';
import type {
  ActividadPage,
  ActivosDTO,
  CerrarPendienteInput,
  ConteosDTO,
  EstadoOrganizador,
  FiltrosOrganizador,
  MotivosCierreDTO,
  OrganizadorPage,
  OrganizadorPendienteDTO,
  PendienteEventoDTO,
  PosponerPendienteInput,
} from './types.js';

// Rutas SIN el prefijo `/api`: lo aporta el `baseURL` del apiClient (regla del CLAUDE.md frontend).

export async function fetchPreferencia(): Promise<{ activo: boolean }> {
  const { data } = await apiClient.get<{ activo: boolean }>('/organizador/preferencias');
  return data;
}

export async function guardarPreferencia(activo: boolean): Promise<{ activo: boolean }> {
  const { data } = await apiClient.put<{ activo: boolean }>('/organizador/preferencias', { activo });
  return data;
}

export async function fetchOrganizador(
  estado: EstadoOrganizador,
  filtros: FiltrosOrganizador,
  page: number,
  limit = 20,
): Promise<OrganizadorPage> {
  const { data } = await apiClient.get<OrganizadorPage>('/organizador/pendientes', {
    params: { estado, ...filtros, page, limit },
  });
  return data;
}

export async function fetchConteos(filtros: FiltrosOrganizador): Promise<ConteosDTO> {
  const { data } = await apiClient.get<ConteosDTO>('/organizador/conteos', { params: filtros });
  return data;
}

/** Los vencidos sin gestionar del usuario: la pila de recordatorios y la campana. */
export async function fetchActivos(): Promise<ActivosDTO> {
  const { data } = await apiClient.get<ActivosDTO>('/organizador/activos');
  return data;
}

export async function fetchHistorialPendiente(id: string): Promise<PendienteEventoDTO[]> {
  const { data } = await apiClient.get<PendienteEventoDTO[]>(`/organizador/pendientes/${id}/historial`);
  return data;
}

export async function fetchActividad(
  filtros: Pick<FiltrosOrganizador, 'clienteId' | 'responsableId'>,
  page: number,
  limit = 20,
): Promise<ActividadPage> {
  const { data } = await apiClient.get<ActividadPage>('/organizador/historial', {
    params: { ...filtros, page, limit },
  });
  return data;
}

export async function cerrarConMotivo(
  id: string,
  input: CerrarPendienteInput,
): Promise<OrganizadorPendienteDTO> {
  const { data } = await apiClient.post<OrganizadorPendienteDTO>(
    `/organizador/pendientes/${id}/cerrar`,
    input,
  );
  return data;
}

/** La nueva fecha y hora viajan como reloj del navegador más su zona: el backend las pasa a UTC. */
export async function posponerPendiente(
  id: string,
  input: PosponerPendienteInput,
): Promise<OrganizadorPendienteDTO> {
  const { data } = await apiClient.post<OrganizadorPendienteDTO>(
    `/organizador/pendientes/${id}/posponer`,
    { ...input, tz: zonaDelNavegador() },
  );
  return data;
}

export async function fetchMotivos(): Promise<MotivosCierreDTO> {
  const { data } = await apiClient.get<MotivosCierreDTO>('/organizador/motivos-cierre');
  return data;
}

export async function crearMotivo(nombre: string): Promise<{ id: string; nombre: string }> {
  const { data } = await apiClient.post<{ id: string; nombre: string }>(
    '/organizador/motivos-cierre',
    { nombre },
  );
  return data;
}
