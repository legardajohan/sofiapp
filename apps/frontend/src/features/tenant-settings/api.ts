import { apiClient } from '../../api/apiClient.js';

// Rutas SIN el prefijo `/api`: lo aporta el `baseURL` del apiClient.

/** Ajustes que el administrador edita sobre su propia empresa (HU-MARK-07). */
export interface AjustesTenantDTO {
  /** Zona IANA, p. ej. `America/Bogota`. Con ella se cuentan los días de las audiencias. */
  zonaHoraria: string;
}

export async function fetchAjustesTenant(): Promise<AjustesTenantDTO> {
  const { data } = await apiClient.get<AjustesTenantDTO>('/tenants/me/ajustes');
  return data;
}

export async function updateAjustesTenant(payload: AjustesTenantDTO): Promise<AjustesTenantDTO> {
  const { data } = await apiClient.patch<AjustesTenantDTO>('/tenants/me/ajustes', payload);
  return data;
}
