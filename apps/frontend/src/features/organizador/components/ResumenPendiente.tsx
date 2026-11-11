import { CalendarClock } from 'lucide-react';
import { etiquetaProgramacion } from '@/lib/agenda';
import type { PendienteGestionable } from '../types.js';

/** Qué se está gestionando: cliente, nota y programación. Encabeza los dos modales. */
export function ResumenPendiente({ pendiente }: { pendiente: PendienteGestionable }): React.ReactElement {
  return (
    <div className="space-y-1 rounded-md border border-border bg-muted/40 px-3 py-2.5">
      <p className="text-sm font-medium text-foreground">{pendiente.clienteNombre}</p>
      <p className="line-clamp-3 whitespace-pre-line text-sm text-muted-foreground">
        {pendiente.descripcion}
      </p>
      <p className="flex items-center gap-1.5 pt-0.5 text-xs tabular-nums text-muted-foreground">
        <CalendarClock className="size-3.5 shrink-0" aria-hidden="true" />
        {etiquetaProgramacion(pendiente.programadoDia, pendiente.programadoHora)}
      </p>
    </div>
  );
}
