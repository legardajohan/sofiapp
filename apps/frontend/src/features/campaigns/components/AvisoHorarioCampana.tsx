import { Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cuandoAbre } from '@/features/send-window/lib/formato.js';
import type { HorarioCampana } from '@/features/send-window/hooks/useHorarioCampana.js';

interface Props {
  horario: HorarioCampana;
  onUsar: (fecha: Date) => void;
}

/**
 * Aviso del programador cuando la hora elegida cae fuera del horario de campañas (HU-CONF-01). Ofrece
 * la siguiente apertura con un clic, que casi siempre es lo que se quería (un AM/PM al revés).
 */
export function AvisoHorarioCampana({ horario, onUsar }: Props): React.ReactElement | null {
  if (!horario.cerrada) return null;
  const zona = horario.zonaHoraria ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-border bg-muted px-3 py-2.5 text-sm text-secondary-foreground motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-150"
    >
      <Clock className="size-4 shrink-0" aria-hidden="true" />
      <span className="min-w-0 flex-1">
        A esa hora no salen campañas: está fuera del horario de envío de tu empresa.
      </span>
      {horario.apertura ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 bg-background text-xs"
          onClick={() => onUsar(horario.apertura!)}
        >
          Usar {cuandoAbre(horario.apertura, zona)}
        </Button>
      ) : null}
    </div>
  );
}
