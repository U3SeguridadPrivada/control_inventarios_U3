'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LogOut, MoreHorizontal, X } from 'lucide-react';
import { useAuth } from '@/src/context/AuthContext';
import { NAV_MOBILE_PRIMARY, NAV_MOBILE_PRIMARY_IDS, NAV_GROUPS, NAV_BOTTOM, NAV_TOP, type NavItem } from '@/src/config/nav';
import { cn } from '@/src/lib/utils';

function isActive(pathname: string, href: string) {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}

function TabButton({
  active, label, children, ...rest
}: { active: boolean; label: string } & React.ComponentProps<'button'>) {
  return (
    <button
      {...rest}
      className={cn(
        'flex flex-col items-center justify-center gap-0.5 h-full min-w-0 flex-1 transition-colors',
        active ? 'text-primary' : 'text-muted-foreground'
      )}
    >
      {children}
      <span className="text-[10px] font-medium leading-none truncate max-w-full px-1">{label}</span>
    </button>
  );
}

function SheetLink({ item, active, onNavigate }: { item: NavItem; active: boolean; onNavigate: () => void }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      className={cn(
        'flex items-center gap-3 rounded-xl px-3 min-h-[48px] transition-colors',
        active ? 'bg-primary/10 text-primary font-medium' : 'text-foreground active:bg-muted'
      )}
    >
      <Icon className="w-5 h-5 flex-shrink-0" strokeWidth={active ? 2.25 : 1.9} />
      <span className="text-sm truncate">{item.title}</span>
    </Link>
  );
}

/**
 * Barra de pestañas inferior para movil, con una hoja "Más" que contiene el
 * resto del menu. Reemplaza al cajon lateral en pantallas chicas.
 */
export default function MobileNav() {
  const pathname = usePathname();
  const { isAdmin, user, logout } = useAuth();
  const [sheetOpen, setSheetOpen] = useState(false);

  // Cerrar la hoja al navegar y al volver atras con el gesto del sistema.
  useEffect(() => setSheetOpen(false), [pathname]);

  useEffect(() => {
    if (!sheetOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSheetOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', onKey);
    };
  }, [sheetOpen]);

  const visible = (item: NavItem) => !item.isAdminOnly || isAdmin;
  const primary = NAV_MOBILE_PRIMARY.filter(visible);
  const inPrimary = (item: NavItem) => (NAV_MOBILE_PRIMARY_IDS as readonly string[]).includes(item.id);

  const restGroups = NAV_GROUPS.filter((group) => !group.isAdminOnly || isAdmin)
    .map((group) => ({ ...group, items: group.items.filter(visible).filter((item) => !inPrimary(item)) }))
    .filter((group) => group.items.length > 0);
  const restLoose = [...NAV_TOP, ...NAV_BOTTOM].filter(visible).filter((item) => !inPrimary(item));

  const moreActive = !primary.some((item) => isActive(pathname, item.href));

  return (
    <>
      <nav
        data-mobile-nav
        aria-label="Navegación principal"
        className="md:hidden fixed inset-x-0 bottom-0 z-40 h-[calc(4rem+var(--safe-bottom))] pb-[var(--safe-bottom)] flex items-stretch bg-card/95 backdrop-blur border-t border-border"
      >
        {primary.map((item) => {
          const active = isActive(pathname, item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.id}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex flex-col items-center justify-center gap-0.5 min-w-0 flex-1 transition-colors',
                active ? 'text-primary' : 'text-muted-foreground'
              )}
            >
              <Icon className="w-[22px] h-[22px]" strokeWidth={active ? 2.3 : 1.9} />
              <span className="text-[10px] font-medium leading-none truncate max-w-full px-1">{item.shortLabel}</span>
            </Link>
          );
        })}
        <TabButton
          active={moreActive}
          label="Más"
          aria-expanded={sheetOpen}
          aria-haspopup="dialog"
          onClick={() => setSheetOpen(true)}
        >
          <MoreHorizontal className="w-[22px] h-[22px]" strokeWidth={moreActive ? 2.3 : 1.9} />
        </TabButton>
      </nav>

      {sheetOpen && (
        <div className="md:hidden fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Menú">
          <div className="absolute inset-0 bg-slate-900/45 backdrop-blur-sm" onClick={() => setSheetOpen(false)} />
          <div className="absolute inset-x-0 bottom-0 max-h-[85svh] flex flex-col rounded-t-2xl bg-card shadow-2xl animate-in slide-in-from-bottom duration-200">
            <div className="flex items-center justify-between gap-3 px-4 pt-3 pb-2 border-b border-border">
              <div className="min-w-0">
                <p className="text-sm font-semibold truncate">{user?.username}</p>
                <p className="text-[11px] text-muted-foreground">Menú completo</p>
              </div>
              <button
                onClick={() => setSheetOpen(false)}
                aria-label="Cerrar menú"
                className="w-9 h-9 rounded-lg flex items-center justify-center text-muted-foreground active:bg-muted"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto scroll-touch px-3 py-3 space-y-4 pb-[calc(0.75rem+var(--safe-bottom))]">
              {restLoose.length > 0 && (
                <div className="space-y-1">
                  {restLoose.map((item) => (
                    <SheetLink key={item.id} item={item} active={isActive(pathname, item.href)} onNavigate={() => setSheetOpen(false)} />
                  ))}
                </div>
              )}

              {restGroups.map((group) => (
                <div key={group.id} className="space-y-1">
                  <p className="px-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{group.title}</p>
                  {group.items.map((item) => (
                    <SheetLink key={item.id} item={item} active={isActive(pathname, item.href)} onNavigate={() => setSheetOpen(false)} />
                  ))}
                </div>
              ))}

              <button
                onClick={logout}
                className="flex items-center gap-3 w-full rounded-xl px-3 min-h-[48px] text-destructive active:bg-destructive/10"
              >
                <LogOut className="w-5 h-5 flex-shrink-0" />
                <span className="text-sm font-medium">Cerrar sesión</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
