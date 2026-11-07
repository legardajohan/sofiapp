import { Clock } from 'lucide-react';
import { textoReapertura } from '@/features/send-window/lib/ventana-cerrada.js';

interface Props {
  apertura: string | null;
  zonaHoraria: string | undefined;
}

/**
 * Aviso de que la empresa no envía mensajes a esta hora (HU-CONF-01). Mismo lugar y forma que
 * `WindowClosedBanner`, pero en tono neutro: estar fuera de horario es una regla de la empresa, no
 * un error que el asesor deba arreglar.
 */
export function SendWindowBanner({ apertura, zonaHoraria }: Props): React.ReactElement {
  return (
    <div
      role="status"
      className="flex items-center gap-2 border-t border-border bg-muted px-4 py-2.5 text-xs text-secondary-foreground"
    >
      <Clock className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span>
        Fuera del horario de envío de tu empresa. {textoReapertura(apertura, zonaHoraria)}
      </span>
    </div>
  );
}
