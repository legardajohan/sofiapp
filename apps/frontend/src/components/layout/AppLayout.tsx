import { Outlet } from 'react-router-dom';
import { AppSidebar } from '@/components/layout/AppSidebar';
import { NotificationBell } from '@/features/notifications/components/NotificationBell';
import { useNotificationsRealtime } from '@/features/notifications/hooks/useNotificationsRealtime';
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { Toaster } from '@/components/ui/sonner';

export function AppLayout(): React.ReactElement {
  // Dueño de la conexión Socket.IO a nivel de sesión (HU-NOTIF-01): se monta una vez aquí, no en
  // `/inbox`, para que las notificaciones lleguen desde cualquier pantalla.
  useNotificationsRealtime();

  return (
    <SidebarProvider>
      <AppSidebar />
      {/* `min-w-0` permite que el contenedor encoja: sin él, una tabla ancha no hace scroll
          interno y se sobrepone al sidebar (regla de min-width de flexbox). */}
      <SidebarInset className="min-w-0">
        <header className="flex h-14 shrink-0 items-center justify-between border-b px-4">
          {/* Antes ausente: sin ella el sidebar no se puede abrir en mobile (se comporta como Sheet). */}
          <SidebarTrigger />
          <NotificationBell />
        </header>
        <main className="min-w-0 flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </SidebarInset>
      <Toaster />
    </SidebarProvider>
  );
}
