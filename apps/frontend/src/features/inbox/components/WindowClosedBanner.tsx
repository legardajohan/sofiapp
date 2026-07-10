import { AlertTriangle } from 'lucide-react';

/** Aviso cuando la ventana de servicio de 24 h está cerrada (regla de Meta, HT-WA-01). */
export function WindowClosedBanner(): React.ReactElement {
  return (
    <div className="flex items-center gap-2 border-t border-border bg-destructive-subtle px-4 py-2.5 text-xs text-destructive">
      <AlertTriangle className="h-4 w-4 shrink-0" />
      <span>
        La ventana de 24&nbsp;h está cerrada. Solo puedes reabrir la conversación con una plantilla
        HSM aprobada.
      </span>
    </div>
  );
}
