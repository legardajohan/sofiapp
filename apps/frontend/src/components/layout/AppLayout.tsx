import { Outlet } from 'react-router-dom';
import { AppSidebar } from '@/components/layout/AppSidebar';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { Toaster } from '@/components/ui/sonner';

export function AppLayout(): React.ReactElement {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <main className="flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </SidebarInset>
      <Toaster />
    </SidebarProvider>
  );
}
