import { NavLink } from 'react-router-dom';
import lockupSvg from '@/assets/sofiapp-lockup.svg';
import { useAuthStore } from '@/stores/authStore';
import { navGroupsForRole } from '@/components/layout/nav-config';
import { NavUser } from '@/components/layout/NavUser';
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
} from '@/components/ui/sidebar';

export function AppSidebar(): React.ReactElement | null {
  const user = useAuthStore((s) => s.user);
  if (!user) return null;

  const groups = navGroupsForRole(user.rol);

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2 py-1">
          <img src={lockupSvg} alt="SofiApp" className="h-6 w-auto" draggable={false} />
        </div>
      </SidebarHeader>
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
