import * as React from 'react';
import { CheckCircle2 } from 'lucide-react';

const PUNTOS = [
  'Inventario de almacén y uniformes en campo',
  'Expedientes y fichas técnicas del personal',
  'Ventas, cotizaciones y finanzas',
];

/**
 * Marco de las pantallas de acceso: panel de marca a la izquierda (solo en pantallas
 * anchas) y el formulario sobre fondo blanco a la derecha.
 */
export function AuthShell({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="grid min-h-[100svh] bg-card lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-primary p-12 text-white lg:flex">
        <img
          src="/logo_b.png"
          alt=""
          aria-hidden
          className="pointer-events-none absolute -bottom-32 -right-28 h-[640px] w-[640px] object-contain opacity-[0.07] brightness-0 invert"
        />
        <div className="relative flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-white">
            <img src="/logo_b.png" alt="U3" className="h-12 w-12 scale-[1.35] object-contain" />
          </span>
          <div className="leading-tight">
            <p className="text-lg font-bold tracking-tight">Suite U3</p>
            <p className="text-xs text-white/70">Seguridad Privada</p>
          </div>
        </div>

        <div className="relative max-w-md">
          <h2 className="text-[34px] font-bold leading-[1.15] tracking-tight">Operación, personal y finanzas en un solo lugar.</h2>
          <p className="mt-4 text-sm leading-relaxed text-white/75">
            Suite de gestión operativa de U3 Seguridad Privada: inventario, personal, ventas y finanzas.
          </p>
          <ul className="mt-8 space-y-3 text-sm">
            {PUNTOS.map((punto) => (
              <li key={punto} className="flex items-center gap-2.5 text-white/90">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-white/70" aria-hidden />
                {punto}
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-white/60">U3 Seguridad Privada · Uso interno</p>
      </aside>

      <main className="flex items-center justify-center px-5 py-10 pt-[calc(2.5rem+var(--safe-top))] pb-[calc(2.5rem+var(--safe-bottom))]">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <img src="/logo_b.png" alt="U3" className="h-12 w-12 scale-125 object-contain" />
            <div className="leading-tight">
              <p className="text-lg font-bold tracking-tight text-foreground">Suite U3</p>
              <p className="text-xs text-muted-foreground">Seguridad Privada</p>
            </div>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">{title}</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">{subtitle}</p>
          <div className="mt-8">{children}</div>
        </div>
      </main>
    </div>
  );
}
