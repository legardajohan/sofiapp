import {
  BookText,
  Building2,
  CreditCard,
  Inbox,
  LineChart,
  MessageSquareText,
  Megaphone,
  Package,
  Sparkles,
  UserCheck,
  Users,
  UserX,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { UserRol } from '@/stores/authStore';

export interface NavSubItem {
  label: string;
  to: string;
  icon: LucideIcon;
}

export interface NavItem {
  label: string;
  to: string;
  icon: LucideIcon;
  roles: UserRol[];
  disabled?: boolean;
  children?: NavSubItem[];
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const navGroups: NavGroup[] = [
  {
    label: 'Superadmin',
    items: [
      { label: 'Empresas', to: '/admin/tenants', icon: Building2, roles: ['superadmin'] },
      { label: 'Planes', to: '/admin/plans', icon: CreditCard, roles: ['superadmin'] },
      {
        label: 'Métricas globales',
        to: '/admin/metrics',
        icon: LineChart,
        roles: ['superadmin'],
        disabled: true,
      },
    ],
  },
  {
    label: 'Operación',
    items: [
      {
        label: 'Bandeja omnicanal',
        to: '/inbox',
        icon: Inbox,
        roles: ['admin'],
        children: [
          { label: 'Todos', to: '/inbox', icon: Inbox },
          { label: 'Míos', to: '/inbox?filtro=mios', icon: UserCheck },
          { label: 'Sin asignar', to: '/inbox?filtro=sin_asignar', icon: UserX },
          { label: 'Sofi activa', to: '/inbox?filtro=sofi', icon: Sparkles },
        ],
      },
      {
        label: 'Clientes',
        to: '/clientes',
        icon: Users,
        roles: ['admin'],
        disabled: true,
      },
      {
        label: 'Campañas',
        to: '/campanas',
        icon: Megaphone,
        roles: ['admin'],
        disabled: true,
      },
    ],
  },
  {
    label: 'Configuración',
    items: [
      {
        label: 'WhatsApp',
        to: '/settings/channels/whatsapp',
        icon: MessageSquareText,
        roles: ['admin'],
      },
      {
        label: 'Base de Conocimiento',
        to: '/settings/knowledge',
        icon: BookText,
        roles: ['admin'],
      },
      { label: 'Usuarios', to: '/usuarios', icon: Users, roles: ['admin'], disabled: true },
      { label: 'Catálogo', to: '/catalogo', icon: Package, roles: ['admin'], disabled: true },
    ],
  },
];

export function navGroupsForRole(rol: UserRol): NavGroup[] {
  return navGroups
    .map((group) => ({ ...group, items: group.items.filter((item) => item.roles.includes(rol)) }))
    .filter((group) => group.items.length > 0);
}
