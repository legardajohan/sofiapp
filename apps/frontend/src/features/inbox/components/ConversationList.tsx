import { Sparkles } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { initials, shortTime } from '../lib/format.js';
import type { ConversationDTO } from '../types.js';
import { InboxError } from './InboxError.js';

interface Props {
  conversations: ConversationDTO[];
  activeId: string | null;
  onSelect: (id: string) => void;
  isLoading: boolean;
  /** Motivo del fallo, o `null` si la carga fue bien. Tiene prioridad sobre el estado vacío. */
  error: string | null;
  onRetry: () => void;
}

export function ConversationList({
  conversations,
  activeId,
  onSelect,
  isLoading,
  error,
  onRetry,
}: Props): React.ReactElement {
  if (isLoading) {
    return (
      <div className="space-y-1 p-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 rounded-lg p-3">
            <Skeleton className="h-10 w-10 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3 w-1/2" />
              <Skeleton className="h-3 w-3/4" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  // El error va ANTES del estado vacío: si la petición falló no sabemos si hay conversaciones.
  if (error) return <InboxError message={error} onRetry={onRetry} />;

  if (conversations.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-1 p-8 text-center">
        <p className="text-sm font-medium text-foreground">Bandeja vacía</p>
        <p className="text-xs text-muted-foreground">No hay conversaciones en este filtro.</p>
      </div>
    );
  }

  return (
    <ul className="p-2">
      {conversations.map((c) => {
        const active = c.id === activeId;
        const unread = c.noLeidos > 0;
        return (
          <li key={c.id}>
            <button
              type="button"
              onClick={() => onSelect(c.id)}
              className={cn(
                'flex w-full items-center gap-3 rounded-lg p-3 text-left transition-colors duration-150 ease-out',
                'hover:bg-muted/60 active:scale-[0.99]',
                active && 'bg-sidebar-accent hover:bg-sidebar-accent',
              )}
            >
              <Avatar className="h-10 w-10">
                <AvatarFallback className="text-xs font-medium text-muted-foreground">
                  {initials(c.nombre, c.telefono)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      'truncate text-sm text-foreground',
                      unread ? 'font-semibold' : 'font-medium',
                    )}
                  >
                    {c.nombre ?? c.telefono}
                  </span>
                  {c.iaHabilitada && (
                    <Sparkles className="h-3.5 w-3.5 shrink-0 text-primary" aria-label="Sofi activa" />
                  )}
                  <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">
                    {shortTime(c.ultimoMensajeAt)}
                  </span>
                </div>
                <div className="mt-0.5 flex items-center gap-2">
                  <p
                    className={cn(
                      'truncate text-xs',
                      unread ? 'text-foreground' : 'text-muted-foreground',
                    )}
                  >
                    {c.preview ?? 'Sin mensajes'}
                  </p>
                  {unread && (
                    <span className="ml-auto flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground">
                      {c.noLeidos}
                    </span>
                  )}
                </div>
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
