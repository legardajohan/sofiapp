import {
  AlarmClock,
  CalendarPlus,
  CalendarSync,
  CircleCheck,
  RotateCcw,
  Timer,
  type LucideIcon,
} from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { fechaCompleta, fechaHora } from '@/features/contacts/lib/fecha';
import { etiquetaProgramacion } from '@/lib/agenda';
import { cn } from '@/lib/utils';
import { useHistorialPendiente } from '../hooks/useOrganizador.js';
import { ETIQUETA_EVENTO } from '../lib/organizador.js';
import type { OrganizadorPendienteDTO, PendienteEventoDTO, ProgramacionDTO, TipoEventoPendiente } from '../types.js';

const ICONO: Record<TipoEventoPendiente, LucideIcon> = {
  programado: CalendarPlus,
  reprogramado: CalendarSync,
  vencido: AlarmClock,
  pospuesto: Timer,
  cerrado: CircleCheck,
  reabierto: RotateCcw,
};

const TONO: Partial<Record<TipoEventoPendiente, string>> = {
  vencido: 'text-destructive',
  cerrado: 'text-success',
  pospuesto: 'text-primary',
};

function programacion(p: ProgramacionDTO | null): string | null {
  if (!p?.dia) return null;
  return etiquetaProgramacion(p.dia, p.hora);
}

/** Un evento del historial: qué pasó, quién, cuándo y con qué justificación. */
export function EventoPendiente({ evento }: { evento: PendienteEventoDTO }): React.ReactElement {
  const Icono = ICONO[evento.tipo];
  const antes = programacion(evento.antes);
  const despues = programacion(evento.despues);

  return (
    <li className="relative flex gap-3 pb-5 last:pb-0">
      {/* Hilo de la línea de tiempo: estructura, no adorno — une los eventos de un mismo pendiente. */}
      <span aria-hidden="true" className="absolute left-[11px] top-7 h-[calc(100%-1.75rem)] w-px bg-border last:hidden" />
      <span
        className={cn(
          'relative z-10 flex size-6 shrink-0 items-center justify-center rounded-full border border-border bg-card',
          TONO[evento.tipo] ?? 'text-muted-foreground',
        )}
      >
        <Icono className="size-3.5" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-sm">
          <span className="font-medium">{ETIQUETA_EVENTO[evento.tipo]}</span>
          <span className="text-muted-foreground"> · {evento.actor?.nombre ?? (evento.actor ? 'Usuario eliminado' : 'Sistema')}</span>
        </p>
        <time dateTime={evento.at} title={fechaCompleta(evento.at)} className="block text-xs tabular-nums text-muted-foreground">
          {fechaHora(evento.at)}
        </time>
        {evento.tipo === 'pospuesto' || evento.tipo === 'reprogramado' ? (
          <p className="text-xs tabular-nums text-foreground/80">
            {antes ?? 'Sin fecha'} <span className="text-muted-foreground">a</span> {despues ?? 'Sin fecha'}
          </p>
        ) : evento.tipo === 'programado' && despues ? (
          <p className="text-xs tabular-nums text-foreground/80">Para {despues.toLowerCase()}</p>
        ) : null}
        {evento.motivo && <p className="text-sm text-foreground/90">«{evento.motivo}»</p>}
        {evento.motivos.length > 0 && (
          <ul className="flex flex-wrap gap-1">
            {evento.motivos.map((m) => (
              <li key={m.key ?? m.motivoId ?? m.nombre} className="rounded-md bg-muted px-1.5 py-px text-xs">
                {m.nombre}
              </li>
            ))}
          </ul>
        )}
        {evento.otroMotivo && <p className="text-sm text-foreground/90">Otro motivo: {evento.otroMotivo}</p>}
        {evento.comentario && <p className="text-sm text-muted-foreground">{evento.comentario}</p>}
        {evento.tags.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Etiquetas: {evento.tags.map((t) => t.nombre).join(', ')}
          </p>
        )}
      </div>
    </li>
  );
}

interface Props {
  pendiente: OrganizadorPendienteDTO | null;
  onClose: () => void;
}

/** Historial completo de un pendiente (CA-11), en un panel lateral para no perder la tabla. */
export function HistorialPendienteSheet({ pendiente, onClose }: Props): React.ReactElement {
  const { data, isLoading, isError } = useHistorialPendiente(pendiente?.id ?? null);

  return (
    <Sheet open={pendiente !== null} onOpenChange={(abierto) => !abierto && onClose()}>
      <SheetContent className="flex w-full flex-col gap-4 sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Historial del pendiente</SheetTitle>
          <SheetDescription className="line-clamp-3 whitespace-pre-line">
            {pendiente?.descripcion}
          </SheetDescription>
        </SheetHeader>
        <div className="-mr-2 flex-1 overflow-y-auto pr-2">
          {isLoading ? (
            <div className="space-y-3" aria-busy="true">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : isError ? (
            <p role="alert" className="text-sm text-destructive">
              No se pudo cargar el historial.
            </p>
          ) : (data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Este pendiente aún no tiene actividad registrada.
            </p>
          ) : (
            <ol>
              {(data ?? []).map((e) => (
                <EventoPendiente key={e.id} evento={e} />
              ))}
            </ol>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
