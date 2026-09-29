import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, Sparkles, UserCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { useInboxStore } from '@/features/inbox/useInboxStore';
import { useMarkAllNotificationsRead, useMarkNotificationRead } from '../hooks/useMarkNotificationRead.js';
import { useNotifications } from '../hooks/useNotifications.js';
import { useUnreadCount } from '../hooks/useUnreadCount.js';
import { haceRelativo } from '../lib/format.js';
import type { NotificationDTO, NotificationTipo } from '../types.js';

// Mismo vocabulario de íconos que los filtros de la bandeja (nav-config.ts): Sparkles es Sofi,
// UserCheck es "asignado a un admin".
const ICONO_TIPO: Record<NotificationTipo, typeof Sparkles> = {
  handoff: Sparkles,
  assignment: UserCheck,
};

/**
 * Campanita del header (HU-NOTIF-01). Persiste lo que antes solo vivía como un toast efímero:
 * cada handoff de Sofi o reasignación entre admins queda aquí, se haya visto el toast o no.
 */
export function NotificationBell(): React.ReactElement {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const setActiveId = useInboxStore((s) => s.setActiveId);

  const { data: unreadCount = 0 } = useUnreadCount();
  const { data: bandeja, isLoading } = useNotifications();
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();

  const notificaciones = bandeja?.data ?? [];

  function abrir(n: NotificationDTO): void {
    if (!n.leidaAt) markRead.mutate(n.id);
    setOpen(false);
    navigate('/inbox');
    setActiveId(n.conversacionId);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={unreadCount > 0 ? `Notificaciones, ${unreadCount} sin leer` : 'Notificaciones'}
          className="relative shrink-0 transition-transform duration-150 ease-out active:scale-95"
        >
          <Bell className="h-[1.2rem] w-[1.2rem]" />
          {unreadCount > 0 && (
            <Badge
              variant="destructive"
              className="absolute -right-1 -top-1 h-4 min-w-4 justify-center rounded-full px-1 text-[10px] leading-none tabular-nums"
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between px-4 py-3">
          <span className="text-sm font-medium">Notificaciones</span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-auto px-2 py-1 text-xs"
            disabled={unreadCount === 0 || markAllRead.isPending}
            onClick={() => markAllRead.mutate()}
          >
            Marcar todas como leídas
          </Button>
        </div>
        <Separator />
        <ScrollArea className="h-80">
          {isLoading ? (
            <div className="px-4 py-6 text-center text-sm text-muted-foreground">Cargando…</div>
          ) : notificaciones.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-muted-foreground">
              Todavía no tienes notificaciones. Aquí aparecerán las conversaciones que Sofi te
              transfiera o que te reasigne un compañero.
            </div>
          ) : (
            notificaciones.map((n) => {
              const Icono = ICONO_TIPO[n.tipo];
              const sinLeer = !n.leidaAt;
              return (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => abrir(n)}
                  className={cn(
                    'flex w-full items-start gap-3 border-b px-4 py-3 text-left transition-colors hover:bg-accent',
                    sinLeer && 'bg-accent/40',
                  )}
                >
                  <Icono
                    className={cn('mt-0.5 h-4 w-4 shrink-0', sinLeer ? 'text-primary' : 'text-muted-foreground')}
                  />
                  <div className="min-w-0 flex-1">
                    <p className={cn('truncate text-sm', sinLeer && 'font-medium')}>{n.mensaje}</p>
                    <p className="truncate text-xs text-muted-foreground">{n.clienteResumen}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{haceRelativo(n.createdAt)}</p>
                  </div>
                  {sinLeer && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" aria-hidden />}
                </button>
              );
            })
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
