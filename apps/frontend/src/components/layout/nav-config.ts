import {
  ArrowRightLeft,
  BarChart3,
  BookText,
  Bot,
  Building2,
  Columns3,
  CreditCard,
  FileStack,
  Inbox,
  LineChart,
  MessageCircleQuestion,
  MessageSquareText,
  Megaphone,
  Package,
  PieChart,
  PackageSearch,
  Clock,
  ScanSearch,
  Sparkles,
  Tags,
  Target,
  UserCheck,
  Users,
  UserX,
  Workflow,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { AdminSubrol, UserRol } from '@/stores/authStore';
import { SUBROLES_REPORTES } from '@/lib/roles';

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
  /**
   * Restringe el ítem a estos subroles (ADR 0006/0011). Un usuario **sin** subrol lo ve igual:
   * mismo criterio que el backend. Es solo ocultar; la ruta y el API deciden.
   */
  subroles?: readonly AdminSubrol[];
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
      { label: 'Leads', to: '/leads', icon: Target, roles: ['admin'] },
      { label: 'Flujos', to: '/flows', icon: Workflow, roles: ['admin'] },
      { label: 'Etapas del embudo', to: '/etapas', icon: Columns3, roles: ['admin'] },
      { label: 'Etiquetas', to: '/etiquetas', icon: Tags, roles: ['admin'] },
      {
        label: 'Clientes',
        to: '/clientes',
        icon: Users,
        roles: ['admin'],
        disabled: true,
      },
      { label: 'Campañas', to: '/campanas', icon: Megaphone, roles: ['admin'] },
    ],
  },
  {
    label: 'Reportes',
    items: [
      {
        label: 'Productividad por asesor',
        to: '/reports/advisors',
        icon: BarChart3,
        roles: ['admin'],
        subroles: SUBROLES_REPORTES,
      },
      {
        label: 'Tasa de escalamiento',
        to: '/reports/handoff-rate',
        icon: PieChart,
        roles: ['admin'],
        subroles: SUBROLES_REPORTES,
      },
      {
        label: 'Productos más consultados',
        to: '/reports/top-products',
        icon: PackageSearch,
        roles: ['admin'],
        subroles: SUBROLES_REPORTES,
      },
      {
        label: 'Horas pico',
        to: '/reports/peak-hours',
        icon: Clock,
        roles: ['admin'],
        subroles: SUBROLES_REPORTES,
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
        label: 'Plantillas',
        to: '/settings/templates',
        icon: FileStack,
        roles: ['admin'],
      },
      {
        label: 'Base de Conocimiento',
        to: '/settings/knowledge',
        icon: BookText,
        roles: ['admin'],
        children: [
          { label: 'Documentos', to: '/settings/knowledge', icon: BookText },
          {
            label: 'Preguntas frecuentes',
            to: '/settings/knowledge/faqs',
            icon: MessageCircleQuestion,
          },
          {
            label: 'Fuentes / Contexto',
            to: '/settings/knowledge/context',
            icon: ScanSearch,
          },
        ],
      },
      {
        // Con hijos, como "Conocimiento": la transferencia a un asesor es comportamiento del
        // asistente, no una sección aparte. Agruparla aquí evita que "Configuración" siga
        // creciendo a lo ancho con conceptos que en la cabeza del admin son el mismo.
        label: 'Asistente IA',
        to: '/settings/assistant',
        icon: Bot,
        roles: ['admin'],
        children: [
          { label: 'Comportamiento', to: '/settings/assistant', icon: Bot },
          {
            label: 'Transferencia a un asesor',
            to: '/settings/assistant/handoff',
            icon: ArrowRightLeft,
          },
        ],
      },
      { label: 'Usuarios', to: '/usuarios', icon: Users, roles: ['admin'], disabled: true },
      { label: 'Catálogo', to: '/catalogo', icon: Package, roles: ['admin'], disabled: true },
    ],
  },
];

function visiblePara(item: NavItem, rol: UserRol, subrol?: AdminSubrol): boolean {
  if (!item.roles.includes(rol)) return false;
  return !item.subroles || !subrol || item.subroles.includes(subrol);
}

export function navGroupsForRole(rol: UserRol, subrol?: AdminSubrol): NavGroup[] {
  return navGroups
    .map((group) => ({ ...group, items: group.items.filter((item) => visiblePara(item, rol, subrol)) }))
    .filter((group) => group.items.length > 0);
}
