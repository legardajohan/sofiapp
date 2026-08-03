import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { createLead } from '../api.js';
import { leadIdEnConflicto, motivo } from '../lib/errors.js';
import type { CreateLeadPayload, LeadDTO } from '../types.js';

interface Opciones {
  /** Se llama con el `leadId` ya existente cuando el backend responde 409. */
  onDuplicado: (leadId: string) => void;
}

export function useCreateLead(clienteId: string | null, { onDuplicado }: Opciones) {
  const qc = useQueryClient();

  return useMutation<LeadDTO, unknown, CreateLeadPayload>({
    mutationFn: (payload) => createLead(payload),
    onSuccess: (lead) => {
      // El `leadId` viaja dentro de la conversación y de la ficha, así que ambas se invalidan:
      // sin esto la cabecera seguiría ofreciendo convertir algo ya convertido.
      void qc.invalidateQueries({ queryKey: ['conversations'] });
      if (clienteId) void qc.invalidateQueries({ queryKey: ['contact-history', clienteId] });
      qc.setQueryData(['lead', lead.id], lead);
      toast.success('Lead creado');
    },
    onError: (error) => {
      const existente = leadIdEnConflicto(error);
      if (existente) {
        // El duplicado no es un fallo opaco: se nombra y se ofrece la salida.
        toast.error(motivo(error, 'Ya existe un lead con ese teléfono.'), {
          action: { label: 'Ver lead existente', onClick: () => onDuplicado(existente) },
        });
        return;
      }
      toast.error(motivo(error, 'No se pudo crear el lead.'), {
        description: 'Intenta de nuevo en unos segundos.',
      });
    },
  });
}
