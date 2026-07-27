import { Sparkles } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { initials, shortTime } from '../lib/format.js';
import { AssigneeBadge } from './AssigneeBadge.js';
import { TagChip } from '@/features/tags/components/TagChip';
import type { ConversationDTO } from '../types.js';

interface Props {
  conversations: ConversationDTO[];
  activeId: string | null;
  onSelect: (id: string) => void;
  isLoading: boolean;
}

export function ConversationList({ conversations, activeId, onSelect, isLoading }: Props): React.ReactElement {
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
                'flex w-full items-start gap-3 rounded-lg p-3 text-left transition-colors duration-150 ease-out',
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
                      'min-w-0 flex-1 truncate text-xs',
                      unread ? 'text-foreground' : 'text-muted-foreground',
                    )}
                  >
                    {c.preview ?? 'Sin mensajes'}
                  </p>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <AssigneeBadge nombre={c.asignadoANombre} subrol={c.asignadoASubrol} />
                    {unread && (
                      <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground">
                        {c.noLeidos}
                      </span>
                    )}
                  </div>
                </div>

                {/* Los chips van en su propia línea: compartir fila con el preview obligaría a
                    recortar el texto del mensaje, que es lo que el asesor lee primero. */}
                {c.tags.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {c.tags.map((tag) => (
                      <TagChip key={tag.id} tag={tag} />
                    ))}
                  </div>
                )}
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
