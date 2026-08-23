import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { fetchLeads } from '../api.js';
import type { LeadsFiltros } from '../types.js';

/**
 * Listado de leads. `keepPreviousData` mantiene la tabla anterior mientras llega la nueva página:
 * sin él, pasar de página parpadearía a skeleton y la vista daría un salto.
 */
export function useLeads(filtros: LeadsFiltros) {
  return useQuery({
    queryKey: ['leads', filtros],
    queryFn: () => fetchLeads(filtros),
    placeholderData: keepPreviousData,
  });
}
