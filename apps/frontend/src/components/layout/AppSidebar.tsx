import { ChevronLeft } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { navGroupsForRole } from '@/components/layout/nav-config';
import { NavUser } from '@/components/layout/NavUser';
import { SidebarLogo } from '@/components/layout/SidebarLogo';
import { cn } from '@/lib/utils';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar';

function SidebarCollapseTrigger(): React.ReactElement {
  const { state, toggleSidebar } = useSidebar();
  const collapsed = state === 'collapsed';

  return (
    <button
      type="button"
      onClick={toggleSidebar}
      aria-label={collapsed ? 'Expandir menú' : 'Colapsar menú'}
      className="absolute right-0 top-full z-20 flex h-6 w-6 -translate-y-1/2 translate-x-1/2 items-center justify-center rounded-full border border-sidebar-border bg-sidebar text-sidebar-foreground shadow-sm transition-colors duration-150 ease-out hover:bg-sidebar-accent hover:text-sidebar-accent-foreground active:scale-95"
    >
      <ChevronLeft
        className={cn('h-3.5 w-3.5 transition-transform duration-200 ease-out', collapsed && 'rotate-180')}
      />
    </button>
  );
}

export function AppSidebar(): React.ReactElement | null {
  const user = useAuthStore((s) => s.user);
  if (!user) return null;

  const groups = navGroupsForRole(user.rol);

  return (
    <Sidebar collapsible="icon">
      <div className="relative border-b border-sidebar-border">
        <SidebarHeader>
          <SidebarLogo />
        </SidebarHeader>
        <SidebarCollapseTrigger />
      </div>
      <SidebarContent>
        {groups.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarMenu>
              {group.items.map((item) => (
                <SidebarMenuItem key={item.to}>
                  {item.disabled ? (
                    <SidebarMenuButton disabled tooltip={`${item.label} (próximamente)`}>
                      <item.icon />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  ) : (
                    <SidebarMenuButton asChild tooltip={item.label}>
                      <NavLink to={item.to}>
                        <item.icon />
                        <span>{item.label}</span>
                      </NavLink>
                    </SidebarMenuButton>
                  )}
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarFooter>
        <NavUser />
      </SidebarFooter>
    </Sidebar>
  );
}
