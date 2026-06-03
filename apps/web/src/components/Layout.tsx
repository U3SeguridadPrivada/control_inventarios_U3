import { Link, useLocation } from "wouter";
import {
  LayoutDashboard,
  Package,
  ArrowDownToLine,
  ArrowUpFromLine,
  Users,
  UserMinus,
  ShieldCheck,
  UserPlus,
  LogOut,
} from "lucide-react";
import React from "react";
import { useAuth } from "../context/AuthContext";

const NAV_ITEMS = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/inventario", label: "Inventario", icon: Package },
  { href: "/entradas", label: "Entradas", icon: ArrowDownToLine },
  { href: "/salidas", label: "Salidas", icon: ArrowUpFromLine },
  { href: "/uniformes-campo", label: "Uniformes en Campo", icon: ShieldCheck },
  { href: "/guardias", label: "Guardias", icon: Users },
  { href: "/bajas", label: "Bajas", icon: UserMinus },
];

const ROLE_LABELS: Record<string, string> = {
  admin: 'Administrador',
  editor: 'Editor',
  viewer: 'Visualizador',
};

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { user, logout, isAdmin } = useAuth();

  const initials = user?.username?.slice(0, 2).toUpperCase() ?? 'U';

  return (
    <div className="flex min-h-screen w-full bg-background text-foreground">
      {/* Sidebar */}
      <aside
        className="w-64 flex-shrink-0 flex flex-col justify-between"
        style={{ background: "var(--color-sidebar)" }}
      >
        <div>
          {/* Logo */}
          <div className="h-16 flex items-center px-6" style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
            <div className="flex items-center gap-3 w-full">
              <img src="/logo_b.png" alt="Logo U3" className="w-10 h-10 object-contain flex-shrink-0" />
              <span className="font-bold text-xs text-white tracking-tight leading-tight break-words">CONTROL DE <br />INVENTARIO U3</span>
            </div>
          </div>

          {/* Navigation */}
          <nav className="p-3 space-y-0.5 mt-2">
            <p
              className="px-3 mb-2 text-[10px] font-semibold uppercase tracking-widest"
              style={{ color: "rgba(255,255,255,0.35)" }}
            >
              Módulos
            </p>
            {NAV_ITEMS.map((item) => {
              const active = location === item.href;
              const Icon = item.icon;
              return (
                <Link key={item.href} href={item.href}>
                  <div
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-all text-sm ${active
                      ? "font-semibold text-white"
                      : "font-normal"
                      }`}
                    style={
                      active
                        ? { background: "var(--color-primary)" }
                        : { color: "rgba(255,255,255,0.6)" }
                    }
                    onMouseEnter={e => {
                      if (!active) {
                        (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.07)";
                        (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.9)";
                      }
                    }}
                    onMouseLeave={e => {
                      if (!active) {
                        (e.currentTarget as HTMLElement).style.background = "";
                        (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.6)";
                      }
                    }}
                  >
                    <Icon className="w-4 h-4 flex-shrink-0" />
                    <span>{item.label}</span>
                  </div>
                </Link>
              );
            })}

            {/* Opción solo para admin */}
            {isAdmin && (
              <>
                <p
                  className="px-3 mt-4 mb-2 text-[10px] font-semibold uppercase tracking-widest"
                  style={{ color: "rgba(255,255,255,0.35)" }}
                >
                  Administración
                </p>
                {[
                  { href: '/usuarios', label: 'Usuarios', icon: Users },
                  { href: '/usuarios/nuevo', label: 'Crear usuario', icon: UserPlus },
                ].map(item => {
                  const active = location === item.href;
                  const Icon = item.icon;
                  return (
                    <Link key={item.href} href={item.href}>
                      <div
                        className={`flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-all text-sm ${active ? 'font-semibold text-white' : 'font-normal'}`}
                        style={active ? { background: "var(--color-primary)" } : { color: "rgba(255,255,255,0.6)" }}
                        onMouseEnter={e => { if (!active) { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.07)"; (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.9)"; } }}
                        onMouseLeave={e => { if (!active) { (e.currentTarget as HTMLElement).style.background = ""; (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.6)"; } }}
                      >
                        <Icon className="w-4 h-4 flex-shrink-0" />
                        <span>{item.label}</span>
                      </div>
                    </Link>
                  );
                })}
              </>
            )}
          </nav>
        </div>

        {/* User Card */}
        <div className="p-4" style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
          <div
            className="flex items-center gap-3 p-3 rounded-lg"
            style={{ background: "rgba(255,255,255,0.06)" }}
          >
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0"
              style={{ background: "var(--color-primary)" }}
            >
              {initials}
            </div>
            <div className="flex flex-col overflow-hidden flex-1 min-w-0">
              <span className="text-sm font-medium text-white truncate">{user?.username}</span>
              <span className="text-xs truncate" style={{ color: "rgba(255,255,255,0.45)" }}>
                {ROLE_LABELS[user?.role ?? ''] ?? user?.role}
              </span>
            </div>
            <button
              onClick={logout}
              title="Cerrar sesión"
              className="flex-shrink-0 p-1.5 rounded-md hover:bg-white/10 transition"
            >
              <LogOut className="w-4 h-4 text-white/60 hover:text-white/90" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-screen overflow-y-auto">
        <div className="p-8 pb-16 flex-1">
          {children}
        </div>
      </main>
    </div>
  );
}
