import {
  LayoutDashboard, Package, ArrowDownToLine, ArrowUpFromLine,
  Users, UserMinus, ShieldCheck, UserPlus, Lock, LucideIcon,
  Mail, CalendarDays, MapPin, ShoppingCart, Contact2, FileSpreadsheet,
  Landmark, KeyRound, Settings, UserSearch, MessageCircle,
} from 'lucide-react';

export interface NavItem {
  id: string;
  href: string;
  title: string;
  shortLabel: string;
  icon: LucideIcon;
  isAdminOnly?: boolean;
}

export interface NavGroup {
  id: string;
  title: string;
  shortLabel: string;
  icon: LucideIcon;
  items: NavItem[];
  isAdminOnly?: boolean;
}

export const NAV_TOP: NavItem[] = [
  { id: 'dashboard', href: '/', title: 'Dashboard General', shortLabel: 'Inicio', icon: LayoutDashboard },
];

export const NAV_GROUPS: NavGroup[] = [
  {
    id: 'inventario',
    title: 'Inventario',
    shortLabel: 'Inventario',
    icon: Package,
    items: [
      { id: 'inventario', href: '/inventario', title: 'Inventario de Almacén', shortLabel: 'Almacén', icon: Package },
      { id: 'entradas', href: '/entradas', title: 'Entradas de Uniformes', shortLabel: 'Entradas', icon: ArrowDownToLine },
      { id: 'salidas', href: '/salidas', title: 'Salidas de Uniformes', shortLabel: 'Salidas', icon: ArrowUpFromLine },
      { id: 'uniformes-campo', href: '/uniformes-campo', title: 'Uniformes en Campo', shortLabel: 'En Campo', icon: ShieldCheck },
    ],
  },
  {
    id: 'personal',
    title: 'Personal',
    shortLabel: 'Personal',
    icon: Users,
    items: [
      { id: 'guardias', href: '/guardias', title: 'Gestión de Guardias', shortLabel: 'Guardias', icon: Users },
      { id: 'reclutamiento', href: '/reclutamiento', title: 'Reclutamiento de Personal', shortLabel: 'Reclutar', icon: UserSearch },
      { id: 'bajas', href: '/bajas', title: 'Procesos de Bajas', shortLabel: 'Bajas', icon: UserMinus },
    ],
  },
  {
    id: 'ventas',
    title: 'Ventas',
    shortLabel: 'Ventas',
    icon: ShoppingCart,
    items: [
      { id: 'clientes', href: '/clientes', title: 'Clientes y Prospectos', shortLabel: 'Clientes', icon: Contact2 },
      { id: 'cotizaciones', href: '/cotizaciones', title: 'Cotizador', shortLabel: 'Cotizar', icon: FileSpreadsheet },
      { id: 'ventas', href: '/ventas', title: 'Ventas y Reportes', shortLabel: 'Ventas', icon: ShoppingCart },
    ],
  },
  {
    id: 'administracion',
    title: 'Administración',
    shortLabel: 'Admin',
    icon: Lock,
    isAdminOnly: true,
    items: [
      { id: 'usuarios', href: '/usuarios', title: 'Gestión de Usuarios', shortLabel: 'Usuarios', icon: Lock, isAdminOnly: true },
      { id: 'nuevo-usuario', href: '/usuarios/nuevo', title: 'Crear Nuevo Usuario', shortLabel: 'Nuevo', icon: UserPlus, isAdminOnly: true },
      { id: 'roles', href: '/roles', title: 'Roles y Permisos', shortLabel: 'Roles', icon: KeyRound, isAdminOnly: true },
    ],
  },
];

export const NAV_BOTTOM: NavItem[] = [
  { id: 'calendario', href: '/calendario', title: 'Agenda e Incidencias', shortLabel: 'Agenda', icon: CalendarDays },
  { id: 'finanzas', href: '/finanzas', title: 'Cuentas y Dashboard Financiero', shortLabel: 'Finanzas', icon: Landmark },
  { id: 'correo', href: '/correo', title: 'Correo', shortLabel: 'Correo', icon: Mail },
  { id: 'whatsapp', href: '/whatsapp', title: 'WhatsApp en Vivo', shortLabel: 'WhatsApp', icon: MessageCircle },
  { id: 'mapa-operaciones', href: '/mapa-operaciones', title: 'Mapa de Operaciones', shortLabel: 'Mapa', icon: MapPin },
  { id: 'ajustes', href: '/ajustes', title: 'Ajustes del Sitio', shortLabel: 'Ajustes', icon: Settings, isAdminOnly: true },
];

export const ALL_NAV_ITEMS: NavItem[] = [
  ...NAV_TOP,
  ...NAV_GROUPS.flatMap((g) => g.items),
  ...NAV_BOTTOM,
];

export function getPageTitle(pathname: string): string {
  if (pathname === '/') return 'Dashboard General';
  const match = ALL_NAV_ITEMS.find((item) => item.href !== '/' && pathname.startsWith(item.href));
  return match?.title ?? 'Panel';
}

export function getActiveGroupId(pathname: string): string | null {
  if (pathname === '/') return null;
  const group = NAV_GROUPS.find((g) => g.items.some((item) => pathname === item.href || pathname.startsWith(`${item.href}/`)));
  return group?.id ?? null;
}
