import { ChevronsUpDown, LogOut, Monitor, Moon, Sun } from 'lucide-react';
import { logout as logoutRequest } from '@/features/auth/api';
import { useAuthStore, type AdminSubrol, type UserRol } from '@/stores/authStore';
import { useTheme, type Theme } from '@/components/theme/ThemeProvider';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar';

const ROL_LABEL: Record<UserRol, string> = {
  superadmin: 'Superadministrador',
  admin: 'Administrador',
};

const SUBROL_LABEL: Record<AdminSubrol, string> = {
  director: 'Director',
  manager: 'Gerente',
  coordinator: 'Coordinador',
  secretary: 'Secretaria',
};

function roleLabel(user: { rol: UserRol; subrol?: AdminSubrol }): string {
  const base = ROL_LABEL[user.rol];
  return user.subrol ? `${base} · ${SUBROL_LABEL[user.subrol]}` : base;
}

function initialsFor(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}

const THEME_OPTIONS: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Claro', icon: Sun },
  { value: 'dark', label: 'Oscuro', icon: Moon },
  { value: 'system', label: 'Sistema', icon: Monitor },
];

export function NavUser(): React.ReactElement | null {
  const user = useAuthStore((s) => s.user);
  const storeLogout = useAuthStore((s) => s.logout);
  const { theme, setTheme } = useTheme();
  const { isMobile } = useSidebar();
  if (!user) return null;

  const displayName = user.nombre ?? user.sub;

  // Cierra la sesión también en el servidor (invalida las cookies httpOnly/CSRF) y
  // luego limpia el store + redirige. Resiliente: si el back falla, igual sale local.
  async function handleLogout(): Promise<void> {
    try {
      await logoutRequest();
    } catch {
      /* best-effort: la cookie puede estar ya inválida */
    }
    storeLogout();
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton size="lg">
              <Avatar className="h-8 w-8 rounded-lg">
                <AvatarFallback className="rounded-lg">{initialsFor(displayName)}</AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">{displayName}</span>
                <span className="truncate text-xs text-muted-foreground">{roleLabel(user)}</span>
              </div>
              <ChevronsUpDown className="ml-auto size-4" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-lg"
            side={isMobile ? 'bottom' : 'right'}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuLabel className="p-0 font-normal">
              <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                <Avatar className="h-8 w-8 rounded-lg">
                  <AvatarFallback className="rounded-lg">{initialsFor(displayName)}</AvatarFallback>
                </Avatar>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">{displayName}</span>
                  <span className="truncate text-xs text-muted-foreground">{roleLabel(user)}</span>
                </div>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <div className="flex items-center justify-between px-2 py-1.5">
              <span className="text-sm">Tema</span>
              <div className="flex items-center gap-1">
                {THEME_OPTIONS.map((option) => (
                  <Button
                    key={option.value}
                    type="button"
                    variant="ghost"
                    size="icon"
                    className={cn('h-7 w-7', theme === option.value && 'bg-accent text-accent-foreground')}
                    aria-label={option.label}
                    aria-pressed={theme === option.value}
                    onClick={(e) => {
                      e.stopPropagation();
                      setTheme(option.value);
                    }}
                  >
                    <option.icon className="h-4 w-4" />
                  </Button>
                ))}
              </div>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => void handleLogout()}>
              <LogOut />
              Cerrar sesión
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
