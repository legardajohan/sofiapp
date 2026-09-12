import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { fetchLeads } from '../api.js';
import type { LeadsFiltros } from '../types.js';

/**
 * Listado de leads. `keepPreviousData` mantiene la tabla anterior mientras llega la nueva página:
 * sin él, pasar de página parpadearía a skeleton y la vista daría un salto.
 *
 * `enabled` existe desde HU-PIPE-01: la pantalla de leads tiene dos vistas y los hooks de ambas se
 * ejecutan siempre, así que sin esto abrir el embudo pediría además una página entera de la tabla
 * que nadie va a ver.
 */
export function useLeads(filtros: LeadsFiltros, enabled = true) {
  return useQuery({
    queryKey: ['leads', filtros],
    queryFn: () => fetchLeads(filtros),
    placeholderData: keepPreviousData,
    enabled,
  });
}
