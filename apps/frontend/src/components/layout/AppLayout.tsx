import { Outlet } from 'react-router-dom';
import { AppSidebar } from '@/components/layout/AppSidebar';
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
        {/* Solo mobile (< md, el mismo corte que `useIsMobile`): ahí el sidebar es un Sheet y su botón
            de colapso interno no se alcanza, así que este trigger es la única forma de abrirlo. En
            escritorio el sidebar ya trae su propio botón de colapso/expansión. */}
        <header className="flex h-14 shrink-0 items-center border-b px-4 md:hidden">
          <SidebarTrigger />
        </header>
        <main className="min-w-0 flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </SidebarInset>
      <Toaster />
    </SidebarProvider>
  );
}
