import { apiClient } from '../../api/apiClient.js';
import type { ContactCardDTO } from '@/features/inbox/types';
import type {
  BorradoOpcionDTO,
  ContactPatchPayload,
  NotaDTO,
  NotasPage,
  OpcionDTO,
  OpcionesPorTipo,
  TipoOpcion,
} from './types.js';

// Rutas SIN el prefijo `/api`: lo aporta el `baseURL` del apiClient (regla del CLAUDE.md frontend).

export async function updateContact(
  id: string,
  payload: ContactPatchPayload,
): Promise<ContactCardDTO> {
  const { data } = await apiClient.patch<ContactCardDTO>(`/clientes/${id}`, payload);
  return data;
}

export async function fetchNotas(clienteId: string, page = 1): Promise<NotasPage> {
  const { data } = await apiClient.get<NotasPage>(`/clientes/${clienteId}/notas`, {
    params: { page, limit: 20 },
  });
  return data;
}

export async function createNota(clienteId: string, texto: string): Promise<NotaDTO> {
  const { data } = await apiClient.post<NotaDTO>(`/clientes/${clienteId}/notas`, { texto });
  return data;
}

// ─── Catálogos de interés / objeción / rol (HU-CRM-02) ──────────────────────────

/**
 * Los tres catálogos de una sola petición, **incluidas las opciones archivadas**: son las que
 * permiten seguir mostrando la etiqueta de un contacto cuya opción ya se retiró del desplegable.
 */
export async function fetchContactOptions(): Promise<OpcionesPorTipo> {
  const { data } = await apiClient.get<OpcionesPorTipo>('/opciones-contacto');
  return data;
}

export async function createContactOption(
  tipo: TipoOpcion,
  label: string,
  color?: string,
): Promise<OpcionDTO> {
  const { data } = await apiClient.post<OpcionDTO>('/opciones-contacto', { tipo, label, color });
  return data;
}

export async function updateContactOption(
  id: string,
  cambios: { label?: string; color?: string; activo?: boolean },
): Promise<OpcionDTO> {
  const { data } = await apiClient.patch<OpcionDTO>(`/opciones-contacto/${id}`, cambios);
  return data;
}

export async function deleteContactOption(id: string): Promise<BorradoOpcionDTO> {
  const { data } = await apiClient.delete<BorradoOpcionDTO>(`/opciones-contacto/${id}`);
  return data;
}
