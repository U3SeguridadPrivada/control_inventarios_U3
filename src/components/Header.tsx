'use client';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Mail, LogOut } from 'lucide-react';
import { useAuth } from '@/src/context/AuthContext';
import { apiFetch } from '@/src/lib/api';
import { getPageTitle } from '@/src/config/nav';

const ROLE_LABELS: Record<string, string> = {
  admin: 'Administrador',
  editor: 'Editor',
  viewer: 'Visualizador',
};

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
  const { user, logout } = useAuth();
  const now = useClock();

  const { data: mailUnread } = useQuery({
    queryKey: ['mensajesNoLeidos'],
    queryFn: () => apiFetch<{ count: number }>('/api/mensajes/no-leidos'),
    refetchInterval: 45_000,
  });

  const initials = user?.username?.slice(0, 2).toUpperCase() ?? 'U';
  const title = getPageTitle(pathname);

  return (
    <header className="sticky top-0 z-30 pt-[var(--safe-top)] h-[calc(4rem+var(--safe-top))] flex items-center justify-between gap-3 px-4 sm:px-6 bg-card border-b border-border">
      <div className="flex items-center gap-2.5 min-w-0">
        <img src="/logo_b.png" alt="U3" className="md:hidden w-7 h-7 object-contain flex-shrink-0" />
        <h1 className="text-base sm:text-lg font-semibold tracking-tight truncate">{title}</h1>
      </div>

      <div className="flex items-center gap-2 sm:gap-4 flex-shrink-0">
        <span className="hidden sm:inline text-xs text-muted-foreground tabular-nums">
          {now.toLocaleDateString('es-MX', { weekday: 'long', day: '2-digit', month: 'short' })} · {now.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
        </span>

        <a href="/correo" className="relative w-9 h-9 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-colors" title="Correo">
          <Mail className="w-4.5 h-4.5" />
          {!!mailUnread?.count && (
            <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-destructive text-white text-[10px] font-bold flex items-center justify-center">
              {mailUnread.count > 9 ? '9+' : mailUnread.count}
            </span>
          )}
        </a>

        <div className="flex items-center gap-2 pl-2 sm:pl-3 border-l border-border">
          <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-white font-bold text-[11px] flex-shrink-0">
            {initials}
          </div>
          <div className="hidden sm:flex flex-col leading-tight">
            <span className="text-xs font-medium truncate max-w-[120px]">{user?.username}</span>
            <span className="text-[10px] text-muted-foreground truncate">{ROLE_LABELS[user?.role ?? ''] ?? user?.role}</span>
          </div>
          {/* En movil el cierre de sesion vive en la hoja "Más" de la barra inferior. */}
          <button onClick={logout} title="Cerrar sesión" className="hidden sm:block p-1.5 rounded-md hover:bg-muted transition flex-shrink-0">
            <LogOut className="w-4 h-4 text-muted-foreground hover:text-foreground" />
          </button>
        </div>
      </div>
    </header>
  );
}
