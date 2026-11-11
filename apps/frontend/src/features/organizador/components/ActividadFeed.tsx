import { EventoPendiente } from './HistorialPendienteSheet.js';
import { nombreCliente } from '../lib/organizador.js';
import type { PendienteEventoDTO } from '../types.js';

/**
 * Historial de actividades del tenant (HU-PDF-02 §3.2): todo lo que les pasó a los pendientes, lo
 * más reciente primero. Cada evento dice de qué cliente es, porque aquí se mezclan todos.
 */
export function ActividadFeed({ eventos }: { eventos: PendienteEventoDTO[] }): React.ReactElement {
  return (
    <ol className="space-y-1 rounded-lg border border-border bg-card p-4">
      {eventos.map((e) => (
        <li key={e.id} className="border-b border-border/60 pb-3 pt-2 last:border-b-0">
          <p className="mb-2 text-xs font-medium text-muted-foreground">{nombreCliente(e.cliente)}</p>
          <ol>
            <EventoPendiente evento={e} />
          </ol>
        </li>
      ))}
    </ol>
  );
}
