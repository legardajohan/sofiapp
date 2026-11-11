import {
  ArrowRightLeft,
  BarChart3,
  BookText,
  CalendarClock,
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
  FlaskConical,
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
import type { RolEmpresa, UserRol } from '@/stores/authStore';
import { ROLES_CONFIGURACION, ROLES_GESTION_USUARIOS, ROLES_REPORTES } from '@/lib/roles';

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
   * Restringe el ítem a estos roles de empresa (AUTH-04, ADR 0017). Es solo ocultar; la ruta y el
   * API deciden.
   */
  rolesEmpresa?: readonly RolEmpresa[];
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
      { label: 'Flujos', to: '/flows', icon: Workflow, roles: ['admin'], rolesEmpresa: ROLES_CONFIGURACION },
      { label: 'Etapas del embudo', to: '/etapas', icon: Columns3, roles: ['admin'], rolesEmpresa: ROLES_CONFIGURACION },
      { label: 'Etiquetas', to: '/etiquetas', icon: Tags, roles: ['admin'], rolesEmpresa: ROLES_CONFIGURACION },
      {
        label: 'Clientes',
        to: '/clientes',
        icon: Users,
        roles: ['admin'],
        disabled: true,
      },
      { label: 'Campañas', to: '/campanas', icon: Megaphone, roles: ['admin'], rolesEmpresa: ROLES_CONFIGURACION },
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
        rolesEmpresa: ROLES_REPORTES,
      },
      {
        label: 'Tasa de escalamiento',
        to: '/reports/handoff-rate',
        icon: PieChart,
        roles: ['admin'],
        rolesEmpresa: ROLES_REPORTES,
      },
      {
        label: 'Productos más consultados',
        to: '/reports/top-products',
        icon: PackageSearch,
        roles: ['admin'],
        rolesEmpresa: ROLES_REPORTES,
      },
      {
        label: 'Horas pico',
        to: '/reports/peak-hours',
        icon: Clock,
        roles: ['admin'],
        rolesEmpresa: ROLES_REPORTES,
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
        rolesEmpresa: ROLES_CONFIGURACION,
      },
      {
        label: 'Plantillas',
        to: '/settings/templates',
        icon: FileStack,
        roles: ['admin'],
        rolesEmpresa: ROLES_CONFIGURACION,
      },
      {
        label: 'Base de Conocimiento',
        to: '/settings/knowledge',
        icon: BookText,
        roles: ['admin'],
        rolesEmpresa: ROLES_CONFIGURACION,
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
        rolesEmpresa: ROLES_CONFIGURACION,
        children: [
          { label: 'Comportamiento', to: '/settings/assistant', icon: Bot },
          { label: 'Probar asistente', to: '/settings/assistant/test', icon: FlaskConical },
          {
            label: 'Transferencia a un asesor',
            to: '/settings/assistant/handoff',
            icon: ArrowRightLeft,
          },
        ],
      },
      {
        label: 'Horarios de envío',
        to: '/settings/send-hours',
        icon: CalendarClock,
        roles: ['admin'],
        rolesEmpresa: ROLES_CONFIGURACION,
      },
      // AUTH-04: el administrador gestiona a todos; el coordinador, solo a su equipo.
      {
        label: 'Usuarios',
        to: '/settings/users',
        icon: Users,
        roles: ['admin'],
        rolesEmpresa: ROLES_GESTION_USUARIOS,
      },
      { label: 'Catálogo', to: '/catalogo', icon: Package, roles: ['admin'], disabled: true },
    ],
  },
];

function visiblePara(item: NavItem, rol: UserRol, rolEmpresa?: RolEmpresa): boolean {
  if (!item.roles.includes(rol)) return false;
  return !item.rolesEmpresa || (!!rolEmpresa && item.rolesEmpresa.includes(rolEmpresa));
}

export function navGroupsForRole(rol: UserRol, rolEmpresa?: RolEmpresa): NavGroup[] {
  return navGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => visiblePara(item, rol, rolEmpresa)),
    }))
    .filter((group) => group.items.length > 0);
}
