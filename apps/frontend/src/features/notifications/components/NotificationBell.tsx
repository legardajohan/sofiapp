import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, BellRing, Sparkles, UserCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { PopoverTrigger } from '@/components/ui/popover';
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

const RING_MS = 700;

/**
 * Disparador de la campana (HU-NOTIF-01). Va dentro de un `<Popover>` que arma el padre, junto al
 * usuario en el footer del sidebar. Con notificaciones sin leer cambia de estado: ícono `BellRing`,
 * color primario y contador; y al llegar una nueva (el contador sube) se sacude una vez.
 */
export function NotificationBellButton(): React.ReactElement {
  const { data: unreadData } = useUnreadCount();
  const unreadCount = unreadData ?? 0;
  const [ringing, setRinging] = useState(false);
  // `undefined` hasta la primera lectura: el valor con el que carga la página no cuenta como "nueva".
  const previous = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (unreadData === undefined) return;
    const before = previous.current;
    previous.current = unreadData;
    if (before === undefined || unreadData <= before) return;
    setRinging(true);
    const timer = window.setTimeout(() => setRinging(false), RING_MS);
    return () => window.clearTimeout(timer);
  }, [unreadData]);

  const hasUnread = unreadCount > 0;
  const Icono = hasUnread ? BellRing : Bell;

  return (
    <PopoverTrigger asChild>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={hasUnread ? `Notificaciones, ${unreadCount} sin leer` : 'Notificaciones'}
        className={cn(
          'relative h-9 w-9 shrink-0 transition-[transform,color] duration-150 ease-out active:scale-95',
          hasUnread && 'text-primary',
        )}
      >
        <Icono className={cn('h-[1.2rem] w-[1.2rem]', ringing && 'bell-ring')} />
        {hasUnread && (
          <Badge
            variant="destructive"
            className="absolute -right-0.5 -top-0.5 h-4 min-w-4 justify-center rounded-full px-1 text-[10px] leading-none tabular-nums"
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </Badge>
        )}
      </Button>
    </PopoverTrigger>
  );
}

/** Contenido del panel. `onNavigate` cierra el popover del padre al abrir una conversación. */
export function NotificationPanel({ onNavigate }: { onNavigate: () => void }): React.ReactElement {
  const navigate = useNavigate();
  const setActiveId = useInboxStore((s) => s.setActiveId);

  const { data: unreadCount = 0 } = useUnreadCount();
  const { data: bandeja, isLoading } = useNotifications();
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();

  const notificaciones = bandeja?.data ?? [];

  function abrir(n: NotificationDTO): void {
    if (!n.leidaAt) markRead.mutate(n.id);
    onNavigate();
    navigate('/inbox');
    setActiveId(n.conversacionId);
  }

  return (
    <>
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
    </>
  );
}
