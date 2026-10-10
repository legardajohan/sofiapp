import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { getSocket } from '../../../lib/socket.js';
import type { TemplateStatusEvent } from '../types/index.js';

/** Qué decirle al admin según el veredicto. Los estados intermedios no merecen un aviso. */
function avisar(evt: TemplateStatusEvent, nombre: string | null): void {
  const quien = nombre ?? 'Una plantilla';
  if (evt.status === 'APPROVED') {
    toast.success(`Meta aprobó ${quien}`, { description: 'Ya puedes usarla en envíos y campañas.' });
  } else if (evt.status === 'REJECTED') {
    toast.error(`Meta rechazó ${quien}`, {
      description: evt.motivoRechazo?.mensaje ?? 'Revisa el motivo en el catálogo.',
    });
  } else if (evt.status === 'PAUSED' || evt.status === 'DISABLED') {
    toast.warning(`Meta pausó ${quien}`, { description: 'No se podrá enviar mientras siga así.' });
  }
}

/**
 * Estado de las plantillas en vivo (HT-WA-04, criterio 7).
 *
 * Meta responde horas después de crear la plantilla, por el webhook o por la sincronización de
 * respaldo. El evento solo trae el estado nuevo, así que se invalidan las listas —el catálogo y los
 * selectores de plantillas aprobadas de campañas e inbox— en vez de parchear cada clave a mano.
 */
export function useTemplateRealtime(): void {
  const qc = useQueryClient();

  useEffect(() => {
    const socket = getSocket();

    const onEstado = (evt: TemplateStatusEvent): void => {
      const listas = qc.getQueriesData<{ data?: Array<{ id: string; name: string }> }>({
        queryKey: ['whatsapp-templates'],
      });
      const nombre =
        listas.flatMap(([, d]) => d?.data ?? []).find((t) => t.id === evt.templateId)?.name ?? null;
      avisar(evt, nombre);

      void qc.invalidateQueries({ queryKey: ['whatsapp-templates'] });
      void qc.invalidateQueries({ queryKey: ['templates'] });
    };

    socket.on('template:status-updated', onEstado);
    return () => {
      socket.off('template:status-updated', onEstado);
    };
  }, [qc]);
}
