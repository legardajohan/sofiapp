import { useLocation, useNavigate } from 'react-router-dom';
import { CalendarClock, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { etiquetaProgramacion } from '@/lib/agenda';
import { useGestionPendienteStore } from '../useGestionPendienteStore.js';
import { desdeOrganizador, momentoAviso, nombreCliente, rutaConversacion } from '../lib/organizador.js';
import type { OrganizadorPendienteDTO } from '../types.js';

interface Props {
  recordatorio: OrganizadorPendienteDTO;
  /** Compacta en la campana; completa en la pila. */
  compacta?: boolean;
  /** Se llama antes de navegar o abrir un modal (la campana cierra su panel). */
  onAccion?: () => void;
}

/**
 * Un recordatorio vencido (HU-PDF-02 §4.1): cliente, nota, cuándo venció y las dos únicas formas de
 * resolverlo. No hay «descartar»: la única salida es cerrarlo o posponerlo (§4.2).
 */
export function RecordatorioCard({ recordatorio, compacta = false, onAccion }: Props): React.ReactElement {
  const navigate = useNavigate();
  const location = useLocation();
  const abrir = useGestionPendienteStore((s) => s.abrir);
  const cliente = nombreCliente(recordatorio.cliente);

  function accion(tipo: 'cerrar' | 'posponer'): void {
    onAccion?.();
    abrir(desdeOrganizador(recordatorio), tipo);
  }

  return (
    <article
      aria-label={`Recordatorio de ${cliente}`}
      className={cn('space-y-2', compacta ? 'px-4 py-3' : 'p-3')}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">{cliente}</p>
          <p className="flex items-center gap-1 text-xs tabular-nums text-warning">
            <CalendarClock className="size-3.5 shrink-0" aria-hidden="true" />
            <span className="truncate">
              {momentoAviso(recordatorio.recordatorioAt)} ·{' '}
              {etiquetaProgramacion(recordatorio.programadoDia, recordatorio.programadoHora)}
            </span>
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={`Abrir la conversación con ${cliente}`}
          title="Abrir conversación"
          className="size-7 shrink-0 text-muted-foreground hover:text-foreground motion-safe:active:scale-[0.92]"
          onClick={() => {
            onAccion?.();
            navigate(rutaConversacion(recordatorio.clienteId, location.pathname + location.search));
          }}
        >
          <MessageSquare className="size-4" aria-hidden="true" />
        </Button>
      </div>

      <p
        className={cn(
          'whitespace-pre-line text-sm leading-snug text-foreground/90',
          compacta ? 'line-clamp-2' : 'line-clamp-3',
        )}
      >
        {recordatorio.descripcion}
      </p>

      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          className="h-8 flex-1 motion-safe:active:scale-[0.97]"
          onClick={() => accion('cerrar')}
        >
          Cerrar pendiente
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8 flex-1 motion-safe:active:scale-[0.97]"
          onClick={() => accion('posponer')}
        >
          Posponer pendiente
        </Button>
      </div>
    </article>
  );
}
