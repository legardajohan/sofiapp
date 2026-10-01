import { useState } from 'react';
import { NavUser } from '@/components/layout/NavUser';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import {
  NotificationBellButton,
  NotificationPanel,
} from '@/features/notifications/components/NotificationBell';

/**
 * Footer del sidebar: usuario + campana de notificaciones en la misma fila (HU-NOTIF-01).
 * El clic en el usuario abre su menú de siempre; el clic en la campana abre el panel hacia
 * ARRIBA, alineado al borde izquierdo de la fila (el ancla es la fila entera, no el botón).
 * Con el sidebar colapsado a íconos la campana se apila sobre el avatar.
 */
export function SidebarUserBar(): React.ReactElement {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <div className="flex items-center gap-1 group-data-[collapsible=icon]:flex-col-reverse">
          <div className="min-w-0 flex-1 group-data-[collapsible=icon]:flex-none">
            <NavUser />
          </div>
          <NotificationBellButton />
        </div>
      </PopoverAnchor>
      <PopoverContent side="top" align="start" sideOffset={8} collisionPadding={8} className="w-80 p-0">
        <NotificationPanel onNavigate={() => setOpen(false)} />
      </PopoverContent>
    </Popover>
  );
}
