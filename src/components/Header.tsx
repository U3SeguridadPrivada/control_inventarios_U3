'use client';
import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Mail, PanelLeftClose, PanelLeftOpen, ChevronRight } from 'lucide-react';
import { useAuth } from '@/src/context/AuthContext';
import { useShell } from '@/src/context/ShellContext';
import { apiFetch } from '@/src/lib/api';
import { getActiveGroup, getActiveItem, getPageTitle, navLabel } from '@/src/config/nav';
import { sendDeviceNotification } from '@/src/lib/deviceNotifications';
import { Avatar } from '@/src/components/ui/avatar';
import ModuleSearch from '@/src/components/shell/ModuleSearch';

function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(interval);
  }, []);
  return now;
}

export default function Header() {
  const pathname = usePathname();
  const { user } = useAuth();
  const { collapsed, toggle } = useShell();
  const now = useClock();
  const prevUnreadRef = useRef<number | null>(null);

  // Sin leer del buzón IMAP personal
  const { data: mailUnread } = useQuery({
    queryKey: ['correoNoLeidos'],
    queryFn: () => apiFetch<{ count: number }>('/api/correo/externo?action=unread'),
    refetchInterval: 180_000,
    retry: false,
    staleTime: 120_000,
  });

  // Notificar al dispositivo cuando aumenta el número de correos no leídos
  useEffect(() => {
    if (mailUnread?.count !== undefined) {
      if (prevUnreadRef.current !== null && mailUnread.count > prevUnreadRef.current) {
        const diff = mailUnread.count - prevUnreadRef.current;
        sendDeviceNotification('Nuevo correo en Suite U3', {
          body: `Tienes ${diff} nuevo(s) correo(s) sin leer en tu buzón.`,
          data: { url: '/correo' },
        });
      }
      prevUnreadRef.current = mailUnread.count;
    }
  }, [mailUnread?.count]);

  const grupo = getActiveGroup(pathname);
  const item = getActiveItem(pathname);
  const titulo = item ? navLabel(item) : getPageTitle(pathname);

  return (
    <header className="sticky top-0 z-30 flex h-[calc(4rem+var(--safe-top))] items-center justify-between gap-3 border-b border-border bg-card px-4 pt-[var(--safe-top)] sm:px-6 print:hidden">
      <div className="flex min-w-0 items-center gap-2.5">
        <button
          type="button"
          onClick={toggle}
          aria-label={collapsed ? 'Expandir menú lateral' : 'Contraer menú lateral'}
          title={collapsed ? 'Expandir menú' : 'Contraer menú'}
          className="hidden h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground md:flex"
        >
          {collapsed ? <PanelLeftOpen className="h-[18px] w-[18px]" /> : <PanelLeftClose className="h-[18px] w-[18px]" />}
        </button>
        <img src="/logo_b.png" alt="U3" className="h-8 w-8 flex-shrink-0 scale-125 object-contain md:hidden" />
        <nav aria-label="Ubicación" className="flex min-w-0 items-center gap-1.5 text-sm">
          {grupo && (
            <>
              <span className="hidden text-muted-foreground sm:inline">{grupo.title}</span>
              <ChevronRight aria-hidden className="hidden h-3.5 w-3.5 flex-shrink-0 text-muted-foreground/60 sm:block" />
            </>
          )}
          <span className="truncate text-[15px] font-semibold tracking-tight text-foreground">{titulo}</span>
        </nav>
      </div>

      <ModuleSearch className="hidden w-full max-w-sm flex-1 md:block" />

      <div className="flex flex-shrink-0 items-center gap-1.5 sm:gap-3">
        <span className="hidden text-xs text-muted-foreground tabular-nums xl:inline">
          {now.toLocaleDateString('es-MX', { weekday: 'short', day: '2-digit', month: 'short' }).replaceAll('.', '')}
          {' · '}
          {now.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false })} h
        </span>

        {/* Acceso a Correo */}
        <a
          href="/correo"
          className="relative flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          title="Correo corporativo"
          aria-label={mailUnread?.count ? `Correo, ${mailUnread.count} sin leer` : 'Correo'}
        >
          <Mail className="h-[18px] w-[18px]" />
          {!!mailUnread?.count && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-white ring-2 ring-card">
              {mailUnread.count > 9 ? '9+' : mailUnread.count}
            </span>
          )}
        </a>

        {/* En móvil el menú lateral no existe: la identidad se queda en el encabezado. */}
        <div className="md:hidden">
          <Avatar name={user?.username} size="sm" />
        </div>
      </div>
    </header>
  );
}
