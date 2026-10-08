'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronDown, LogOut } from 'lucide-react';
import { useAuth } from '@/src/context/AuthContext';
import { useShell } from '@/src/context/ShellContext';
import {
  NAV_TOP, NAV_GROUPS, NAV_BOTTOM, getActiveGroupId, getActiveItemId, navLabel,
  type NavItem, type NavGroup,
} from '@/src/config/nav';
import { cn } from '@/src/lib/utils';
import { Avatar } from '@/src/components/ui/avatar';

const ROLE_LABELS: Record<string, string> = {
  admin: 'Administrador',
  editor: 'Editor',
  viewer: 'Visualizador',
};

function NavLink({ item, active, collapsed }: { item: NavItem; active: boolean; collapsed: boolean }) {
  const Icon = item.icon;
  const label = navLabel(item);
  return (
    <Link
      href={item.href}
      title={collapsed ? label : item.title}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'group relative flex items-center rounded-lg text-[13px] font-medium transition-colors duration-150',
        collapsed ? 'mx-auto h-10 w-10 justify-center' : 'h-10 gap-3 px-3',
        active
          ? 'bg-primary text-primary-foreground shadow-xs'
          : 'text-slate-600 hover:bg-muted hover:text-foreground'
      )}
    >
      <Icon className="h-[18px] w-[18px] flex-shrink-0" strokeWidth={active ? 2.2 : 1.8} />
      {!collapsed && <span className="truncate">{label}</span>}
    </Link>
  );
}

function NavGroupSection({
  group, isOpen, onToggle, activeId, collapsed,
}: {
  group: NavGroup; isOpen: boolean; onToggle: () => void; activeId: string | null; collapsed: boolean;
}) {
  const { isAdmin, puedeVer } = useAuth();
  const Icon = group.icon;
  const items = group.items.filter((item) => (!item.isAdminOnly || isAdmin) && puedeVer(item.id));
  const groupActive = items.some((item) => item.id === activeId);

  if (items.length === 0) return null;

  if (collapsed) {
    return (
      <div className="space-y-1">
        <button
          onClick={onToggle}
          title={group.title}
          aria-expanded={isOpen}
          className={cn(
            'mx-auto flex h-10 w-10 items-center justify-center rounded-lg transition-colors duration-150',
            groupActive && !isOpen ? 'bg-primary/10 text-primary' : 'text-slate-600 hover:bg-muted hover:text-foreground'
          )}
        >
          <Icon className="h-[18px] w-[18px]" strokeWidth={groupActive ? 2.2 : 1.8} />
        </button>
        {isOpen && (
          <div className="space-y-1 rounded-xl bg-muted/60 py-1">
            {items.map((item) => (
              <NavLink key={item.id} item={item} active={item.id === activeId} collapsed />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <button
        onClick={onToggle}
        aria-expanded={isOpen}
        className="flex h-8 w-full items-center justify-between rounded-lg px-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground"
      >
        <span className="flex items-center gap-2">
          {group.title}
          {groupActive && !isOpen && <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-primary" />}
        </span>
        <ChevronDown className={cn('h-3.5 w-3.5 transition-transform duration-200', isOpen && 'rotate-180')} />
      </button>
      {isOpen && (
        <div className="mt-0.5 space-y-0.5">
          {items.map((item) => (
            <NavLink key={item.id} item={item} active={item.id === activeId} collapsed={false} />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Barra lateral de escritorio. Expandida muestra icono y nombre de cada modulo;
 * contraida queda en una columna de iconos. En movil la navegacion la resuelve
 * MobileNav con una barra de pestañas inferior.
 */
export default function Sidebar() {
  const pathname = usePathname();
  const { user, isAdmin, puedeVer, logout } = useAuth();
  const { collapsed } = useShell();
  const [openGroupId, setOpenGroupId] = useState<string | null>(() => getActiveGroupId(pathname));
  const activeId = getActiveItemId(pathname);

  // Al cambiar de ruta solo queda abierto el grupo de la seccion actual: evita
  // que se acumulen grupos desplegados y el menu tenga que hacer scroll.
  useEffect(() => {
    setOpenGroupId(getActiveGroupId(pathname));
  }, [pathname]);

  const groups = NAV_GROUPS.filter((g) => !g.isAdminOnly || isAdmin);
  const topItems = NAV_TOP.filter((item) => (!item.isAdminOnly || isAdmin) && puedeVer(item.id));
  const bottomItems = NAV_BOTTOM.filter((item) => (!item.isAdminOnly || isAdmin) && puedeVer(item.id));

  return (
    <aside
      className={cn(
        'sticky top-0 hidden h-screen flex-shrink-0 flex-col border-r border-border bg-sidebar transition-[width] duration-200 md:flex print:hidden',
        collapsed ? 'w-[4.5rem]' : 'w-60'
      )}
    >
      <div className={cn('flex h-16 flex-shrink-0 items-center border-b border-border/70', collapsed ? 'justify-center' : 'gap-2.5 px-4')}>
        <img src="/logo_b.png" alt="U3" className="h-10 w-10 flex-shrink-0 scale-[1.35] object-contain" />
        {!collapsed && (
          <div className="min-w-0 leading-tight">
            <p className="truncate text-[15px] font-bold tracking-tight text-foreground">Suite U3</p>
            <p className="truncate text-[11px] text-muted-foreground">Seguridad Privada</p>
          </div>
        )}
      </div>

      {/* no-scrollbar: la barra nativa robaba ancho al abrir/cerrar grupos y
          recortaba las etiquetas; el scroll sigue funcionando con la rueda. */}
      <nav className={cn('no-scrollbar flex-1 space-y-3 overflow-y-auto overflow-x-hidden py-3', collapsed ? 'px-2' : 'px-3')}>
        <div className="space-y-0.5">
          {topItems.map((item) => (
            <NavLink key={item.id} item={item} active={item.id === activeId} collapsed={collapsed} />
          ))}
        </div>

        <div className={cn('space-y-1', collapsed && 'border-t border-border/70 pt-3')}>
          {groups.map((group) => (
            <NavGroupSection
              key={group.id}
              group={group}
              isOpen={openGroupId === group.id}
              onToggle={() => setOpenGroupId((cur) => (cur === group.id ? null : group.id))}
              activeId={activeId}
              collapsed={collapsed}
            />
          ))}
        </div>

        {bottomItems.length > 0 && (
          <div className="border-t border-border/70 pt-3">
            {!collapsed && (
              <p className="mb-1 flex h-6 items-center px-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Herramientas
              </p>
            )}
            <div className="space-y-0.5">
              {bottomItems.map((item) => (
                <NavLink key={item.id} item={item} active={item.id === activeId} collapsed={collapsed} />
              ))}
            </div>
          </div>
        )}
      </nav>

      <div className={cn('flex-shrink-0 border-t border-border/70', collapsed ? 'flex flex-col items-center gap-2 py-3' : 'p-3')}>
        {collapsed ? (
          <>
            <Avatar name={user?.username} size="sm" />
            <button
              onClick={logout}
              title="Cerrar sesión"
              aria-label="Cerrar sesión"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </>
        ) : (
          <div className="flex items-center gap-2.5 rounded-xl bg-muted/70 p-2">
            <Avatar name={user?.username} size="sm" />
            <div className="min-w-0 flex-1 leading-tight">
              <p className="truncate text-[13px] font-semibold text-foreground">{user?.username}</p>
              <p className="truncate text-[11px] text-muted-foreground">{ROLE_LABELS[user?.role ?? ''] ?? user?.role}</p>
            </div>
            <button
              onClick={logout}
              title="Cerrar sesión"
              aria-label="Cerrar sesión"
              className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-card hover:text-foreground"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
