import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  /**
   * Abre el envío de plantilla (HT-WA-04). Sin él —un asesor, que no puede enviar plantillas— el
   * aviso solo informa.
   */
  onEnviarPlantilla?: () => void;
}

/** Aviso cuando la ventana de servicio de 24 h está cerrada (regla de Meta, HT-WA-01). */
export function WindowClosedBanner({ onEnviarPlantilla }: Props): React.ReactElement {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-border bg-destructive-subtle px-4 py-2.5 text-xs text-destructive">
      <span className="flex min-w-0 flex-1 items-center gap-2">
        <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span>
          La ventana de 24&nbsp;h está cerrada. Solo puedes reabrir la conversación con una
          plantilla aprobada.
        </span>
      </span>
      {onEnviarPlantilla ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={onEnviarPlantilla}
          className="h-7 shrink-0 border-destructive/30 bg-background text-xs transition-transform duration-150 ease-out motion-safe:active:scale-[0.98]"
        >
          Enviar plantilla
        </Button>
      ) : null}
    </div>
  );
}
