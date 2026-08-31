'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronDown } from 'lucide-react';
import { useAuth } from '@/src/context/AuthContext';
import { NAV_TOP, NAV_GROUPS, NAV_BOTTOM, getActiveGroupId, getActiveItemId, type NavItem, type NavGroup } from '@/src/config/nav';
import { cn } from '@/src/lib/utils';

function NavLink({ item, active, onNavigate, indented }: { item: NavItem; active: boolean; onNavigate?: () => void; indented?: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      title={item.title}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'group relative flex flex-col items-center gap-1 w-full py-2.5 px-1 rounded-xl text-center transition-colors',
        indented && 'py-2',
        active ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
      )}
    >
      {active && <span className="absolute left-0 top-1.5 bottom-1.5 w-1 rounded-full bg-primary" />}
      <Icon className="w-5 h-5 flex-shrink-0" strokeWidth={active ? 2.25 : 1.9} />
      <span className="w-full px-0.5 text-[10px] font-medium leading-tight tracking-tight truncate">{item.shortLabel}</span>
    </Link>
  );
}

function NavGroupAccordion({
  group, isOpen, onToggle, activeId, onNavigate,
}: {
  group: NavGroup; isOpen: boolean; onToggle: () => void; activeId: string | null; onNavigate?: () => void;
}) {
  const { isAdmin, puedeVer } = useAuth();
  const Icon = group.icon;
  const items = group.items.filter((item) => (!item.isAdminOnly || isAdmin) && puedeVer(item.id));
  const groupActive = items.some((item) => item.id === activeId);

  if (items.length === 0) return null;

  return (
    <div className="space-y-0.5">
      <button
        onClick={onToggle}
        title={group.title}
        aria-expanded={isOpen}
        className={cn(
          'w-full relative flex flex-col items-center gap-1 py-2.5 px-1 rounded-xl text-center transition-colors',
          groupActive && !isOpen ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
        )}
      >
        {groupActive && !isOpen && <span className="absolute left-0 top-1.5 bottom-1.5 w-1 rounded-full bg-primary" />}
        <Icon className="w-5 h-5 flex-shrink-0" strokeWidth={groupActive ? 2.25 : 1.9} />
        <span className="w-full px-0.5 text-[10px] font-medium leading-tight tracking-tight truncate">{group.shortLabel}</span>
        <ChevronDown className={cn('absolute right-1 top-3 w-3 h-3 transition-transform', isOpen && 'rotate-180')} />
      </button>
      {isOpen && (
        <div className="space-y-0.5 pb-1">
          {items.map((item) => (
            <NavLink key={item.id} item={item} active={item.id === activeId} onNavigate={onNavigate} indented />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Barra lateral de escritorio. En movil la navegacion la resuelve MobileNav
 * con una barra de pestañas inferior.
 */
export default function Sidebar() {
  const pathname = usePathname();
  const { isAdmin, puedeVer } = useAuth();
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
    <aside className="hidden md:flex md:flex-col w-[5.5rem] flex-shrink-0 h-screen sticky top-0 bg-card border-r border-border print:hidden">
      <div className="flex items-center justify-center h-16 flex-shrink-0">
        <img src="/logo_b.png" alt="U3" className="w-9 h-9 object-contain" />
      </div>

      {/* no-scrollbar: la barra nativa robaba ancho al abrir/cerrar grupos y
          recortaba las etiquetas; el scroll sigue funcionando con la rueda. */}
      <nav className="flex-1 overflow-y-auto overflow-x-hidden no-scrollbar px-1.5 space-y-2 pb-4">
        <div className="space-y-1">
          {topItems.map((item) => (
            <NavLink key={item.id} item={item} active={item.id === activeId} />
          ))}
        </div>

        <div className="space-y-1 pt-2 border-t border-border/70">
          {groups.map((group) => (
            <NavGroupAccordion
              key={group.id}
              group={group}
              isOpen={openGroupId === group.id}
              onToggle={() => setOpenGroupId((cur) => (cur === group.id ? null : group.id))}
              activeId={activeId}
            />
          ))}
        </div>

        <div className="space-y-1 pt-2 border-t border-border/70">
          {bottomItems.map((item) => (
            <NavLink key={item.id} item={item} active={item.id === activeId} />
          ))}
        </div>
      </nav>
    </aside>
  );
}
