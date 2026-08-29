import { useQuery } from '@tanstack/react-query';
import { fetchHistorialSemaforo } from '../api.js';
import type { HistorialSemaforoDTO } from '../types.js';
import type { Paginated } from '../../inbox/types.js';

/**
 * Historial de cambios de semáforo de un lead (HU-CRM-04).
 *
 * `enabled` es lo que hace que la sección sea barata: el historial vive en un acordeón cerrado y
 * la consulta no se paga hasta que alguien lo abre. Es información de consulta puntual, no parte
 * de la lectura principal de la ficha.
 */
export function useHistorialSemaforo(leadId: string | null, abierto: boolean) {
  return useQuery<Paginated<HistorialSemaforoDTO>>({
    queryKey: ['historial-semaforo', leadId],
    queryFn: () => fetchHistorialSemaforo(leadId as string),
    enabled: abierto && leadId !== null,
  });
}
