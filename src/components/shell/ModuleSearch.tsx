'use client';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, CornerDownLeft } from 'lucide-react';
import { useAuth } from '@/src/context/AuthContext';
import { ALL_NAV_ITEMS, NAV_GROUPS, navLabel, type NavItem } from '@/src/config/nav';
import { cn } from '@/src/lib/utils';

const normalizar = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/**
 * Buscador de modulos del encabezado: escribe unas letras y salta directo a la
 * seccion. Respeta los permisos del usuario igual que el menu lateral. Atajo:
 * Ctrl/Cmd + K.
 */
export default function ModuleSearch({ className }: { className?: string }) {
  const router = useRouter();
  const { isAdmin, puedeVer } = useAuth();
  const [abierto, setAbierto] = useState(false);
  const [consulta, setConsulta] = useState('');
  const [indice, setIndice] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const cajaRef = useRef<HTMLDivElement>(null);
  const listaId = useId();

  const visibles = useMemo(
    () => ALL_NAV_ITEMS.filter((item) => (!item.isAdminOnly || isAdmin) && puedeVer(item.id)),
    [isAdmin, puedeVer]
  );

  const grupoDe = (item: NavItem) => NAV_GROUPS.find((g) => g.items.some((i) => i.id === item.id))?.title ?? 'General';

  const resultados = useMemo(() => {
    const q = normalizar(consulta.trim());
    if (!q) return visibles;
    return visibles.filter((item) => normalizar(`${navLabel(item)} ${item.title} ${grupoDe(item)}`).includes(q));
  }, [consulta, visibles]);

  useEffect(() => setIndice(0), [consulta, abierto]);

  useEffect(() => {
    const atajo = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        setAbierto(true);
      }
    };
    const fuera = (e: MouseEvent) => {
      if (cajaRef.current && !cajaRef.current.contains(e.target as Node)) setAbierto(false);
    };
    window.addEventListener('keydown', atajo);
    document.addEventListener('mousedown', fuera);
    return () => {
      window.removeEventListener('keydown', atajo);
      document.removeEventListener('mousedown', fuera);
    };
  }, []);

  const ir = (item: NavItem) => {
    setAbierto(false);
    setConsulta('');
    inputRef.current?.blur();
    if (item.href.endsWith('.html')) window.location.href = item.href;
    else router.push(item.href);
  };

  const alTeclear = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setIndice((i) => Math.min(i + 1, Math.max(resultados.length - 1, 0)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setIndice((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && resultados[indice]) {
      e.preventDefault();
      ir(resultados[indice]);
    } else if (e.key === 'Escape') {
      setAbierto(false);
      inputRef.current?.blur();
    }
  };

  return (
    <div ref={cajaRef} className={cn('relative', className)}>
      <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <input
        ref={inputRef}
        value={consulta}
        onChange={(e) => { setConsulta(e.target.value); setAbierto(true); }}
        onFocus={() => setAbierto(true)}
        onKeyDown={alTeclear}
        role="combobox"
        aria-expanded={abierto}
        aria-controls={listaId}
        aria-activedescendant={abierto && resultados[indice] ? `${listaId}-${resultados[indice].id}` : undefined}
        aria-label="Buscar módulo"
        placeholder="Buscar módulo..."
        autoComplete="off"
        className="h-9 w-full rounded-full border border-border bg-muted/70 pl-9 pr-14 text-[13px] text-foreground transition-[border-color,box-shadow,background-color] placeholder:text-muted-foreground focus:border-primary/60 focus:bg-card focus:outline-none focus:ring-4 focus:ring-primary/10"
      />
      <kbd className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded border border-border bg-card px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground lg:block">
        Ctrl K
      </kbd>

      {abierto && (
        <ul
          id={listaId}
          role="listbox"
          className="absolute left-0 right-0 top-full z-50 mt-2 max-h-80 overflow-y-auto rounded-xl border border-border bg-card p-1.5 shadow-lg"
        >
          {resultados.length === 0 && <li className="px-3 py-6 text-center text-xs text-muted-foreground">Sin coincidencias</li>}
          {resultados.map((item, i) => {
            const Icon = item.icon;
            const activo = i === indice;
            return (
              <li key={item.id} id={`${listaId}-${item.id}`} role="option" aria-selected={activo}>
                <button
                  type="button"
                  onMouseEnter={() => setIndice(i)}
                  onClick={() => ir(item)}
                  className={cn('flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors', activo ? 'bg-primary/[0.07]' : 'hover:bg-muted')}
                >
                  <span className={cn('flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg', activo ? 'bg-primary text-primary-foreground' : 'bg-muted text-slate-600')}>
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1 leading-tight">
                    <span className="block truncate text-[13px] font-semibold text-foreground">{navLabel(item)}</span>
                    <span className="block truncate text-[11px] text-muted-foreground">{grupoDe(item)}</span>
                  </span>
                  {activo && <CornerDownLeft aria-hidden className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
