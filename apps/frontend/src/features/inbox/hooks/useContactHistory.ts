import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { extractContactData, fetchContactHistory, generateSummary } from '../api.js';
import type { ContactHistoryDTO } from '../types.js';

/** Ficha + historial + estado del resumen. Solo se consulta cuando el panel está abierto. */
export function useContactHistory(clienteId: string | null) {
  return useQuery<ContactHistoryDTO>({
    queryKey: ['contact-history', clienteId],
    queryFn: () => fetchContactHistory(clienteId as string),
    enabled: !!clienteId,
  });
}

/** Genera/actualiza el resumen y refresca la ficha para reflejar el nuevo texto y estado. */
export function useGenerateSummary(clienteId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => generateSummary(clienteId as string),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['contact-history', clienteId] }),
  });
}

/** Extrae los datos de contacto con IA y refresca la ficha para mostrarlos ya persistidos. */
export function useExtractContactData(clienteId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => extractContactData(clienteId as string),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['contact-history', clienteId] }),
  });
}
