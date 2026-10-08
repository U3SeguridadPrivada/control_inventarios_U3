'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle, ChevronLeft, ChevronRight, FileText, Phone, Search, Shirt, StickyNote, Undo2, UserPlus, Check, AlertCircle,
} from 'lucide-react';
import { apiFetch } from '@/src/lib/api';
import { cn, fmtDate } from '@/src/lib/utils';
import { Avatar } from '@/src/components/ui/avatar';
import { ProgressRing } from '@/src/components/ui/progress-ring';

/** Tarjeta del perfil: esquinas amplias y relieve suave, sin borde (lenguaje del lienzo gris). */
export function TarjetaPerfil({ className, children }: { className?: string; children: React.ReactNode }) {
  return <section className={cn('rounded-[24px] bg-card shadow-soft', className)}>{children}</section>;
}

export function TituloTarjeta({ icon: Icon, title, subtitle, action }: { icon?: React.ElementType; title: React.ReactNode; subtitle?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <header className="flex items-start justify-between gap-3">
      <div className="flex min-w-0 items-start gap-2.5">
        {Icon && (
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-slate-600">
            <Icon className="h-4 w-4" />
          </span>
        )}
        <div className="min-w-0">
          <h2 className="text-[15px] font-bold leading-tight tracking-tight text-foreground">{title}</h2>
          {subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
        </div>
      </div>
      {action}
    </header>
  );
}

/** Pildora de cifra: la oscura destaca el dato principal, la clara el secundario. */
export function PildoraCifra({
  children, tone = 'ink', icon: Icon, title,
}: { children: React.ReactNode; tone?: 'ink' | 'light' | 'success' | 'danger' | 'warning'; icon?: React.ElementType; title?: string }) {
  const tones = {
    ink: 'bg-ink text-white',
    light: 'bg-card text-foreground ring-1 ring-inset ring-border',
    success: 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/15',
    danger: 'bg-red-50 text-red-700 ring-1 ring-inset ring-red-600/15',
    warning: 'bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-600/20',
  } as const;
  return (
    <span title={title} className={cn('inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-bold tabular-nums', tones[tone])}>
      {Icon && <Icon className="h-3.5 w-3.5" aria-hidden />}
      {children}
    </span>
  );
}

/** Fila de indicador: etiqueta a la izquierda y una o dos pildoras con cifras a la derecha. */
export function FilaIndicador({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl bg-muted/70 px-4 py-2.5">
      <span className="min-w-0 leading-tight">
        <span className="block text-[13px] font-semibold text-foreground">{label}</span>
        {hint && <span className="block text-[11px] text-muted-foreground">{hint}</span>}
      </span>
      <div className="flex items-center gap-1.5">{children}</div>
    </div>
  );
}

const DIAS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

/**
 * Calendario de circulos: marca los dias con movimiento en el expediente
 * (bitacora, uniformes, documentos) y el dia de alta del elemento.
 */
export function MiniCalendario({ actividad, alta }: { actividad: Record<string, number>; alta?: string | null }) {
  const hoy = new Date();
  const [cursor, setCursor] = useState(() => new Date(hoy.getFullYear(), hoy.getMonth(), 1));
  const navegado = useRef(false);
  const ultimoDia = useMemo(() => Object.keys(actividad).sort().pop() ?? null, [actividad]);

  // Un expediente antiguo no tiene movimientos este mes: se abre en el mes de su ultimo
  // movimiento para que el calendario no aparezca vacio. Si la persona ya navego, no se mueve.
  useEffect(() => {
    if (navegado.current || !ultimoDia) return;
    const prefijoHoy = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`;
    if (Object.keys(actividad).some((f) => f.startsWith(prefijoHoy))) return;
    setCursor(new Date(Number(ultimoDia.slice(0, 4)), Number(ultimoDia.slice(5, 7)) - 1, 1));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ultimoDia]);

  const anio = cursor.getFullYear();
  const mes = cursor.getMonth();
  const desfase = (new Date(anio, mes, 1).getDay() + 6) % 7; // semana que inicia en lunes
  const diasMes = new Date(anio, mes + 1, 0).getDate();
  const celdas: (number | null)[] = [...Array(desfase).fill(null), ...Array.from({ length: diasMes }, (_, i) => i + 1)];
  const iso = (d: number) => `${anio}-${String(mes + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const hoyIso = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`;
  const etiqueta = cursor.toLocaleDateString('es-MX', { month: 'long', year: 'numeric' });
  const movimientosMes = Object.entries(actividad).filter(([f]) => f.startsWith(`${anio}-${String(mes + 1).padStart(2, '0')}`)).reduce((a, [, n]) => a + n, 0);

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[15px] font-bold leading-tight tracking-tight text-foreground">{etiqueta.charAt(0).toUpperCase() + etiqueta.slice(1)}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{movimientosMes === 0 ? 'Sin movimientos' : `${movimientosMes} movimiento${movimientosMes === 1 ? '' : 's'} en el mes`}</p>
        </div>
        <div className="flex items-center gap-1">
          <button type="button" aria-label="Mes anterior" onClick={() => { navegado.current = true; setCursor(new Date(anio, mes - 1, 1)); }} className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-slate-600 transition-colors hover:bg-slate-200">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button type="button" aria-label="Mes siguiente" onClick={() => { navegado.current = true; setCursor(new Date(anio, mes + 1, 1)); }} className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-slate-600 transition-colors hover:bg-slate-200">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-7 gap-y-2 text-center">
        {DIAS.map((d, i) => (
          <span key={`${d}-${i}`} className="text-[11px] font-semibold uppercase text-muted-foreground">{d}</span>
        ))}
        {celdas.map((d, i) => {
          if (d === null) return <span key={`v-${i}`} />;
          const fecha = iso(d);
          const n = actividad[fecha] ?? 0;
          const esAlta = alta === fecha;
          return (
            <span key={fecha} className="flex items-center justify-center">
              <span
                title={esAlta ? 'Alta del elemento' : n > 0 ? `${n} movimiento${n === 1 ? '' : 's'}` : undefined}
                className={cn(
                  'flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold tabular-nums',
                  esAlta ? 'bg-ink text-white' : n > 0 ? 'bg-primary text-white' : 'bg-muted text-slate-600',
                  fecha === hoyIso && 'ring-2 ring-primary/40 ring-offset-2 ring-offset-card'
                )}
              >
                {d}
              </span>
            </span>
          );
        })}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] font-medium text-muted-foreground">
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-primary" /> Con movimiento</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-ink" /> Alta</span>
      </div>
    </div>
  );
}

export type TipoEvento = 'alta' | 'documento' | 'entrega' | 'reposicion' | 'extravio' | 'devolucion' | 'nota' | 'llamada';

export interface EventoLinea {
  id: string;
  fecha: string;
  tipo: TipoEvento;
  titulo: string;
  detalle?: string;
}

const ESTILO_EVENTO: Record<TipoEvento, { icon: React.ElementType; clase: string }> = {
  alta: { icon: UserPlus, clase: 'bg-ink text-white' },
  documento: { icon: FileText, clase: 'bg-primary/10 text-primary' },
  entrega: { icon: Shirt, clase: 'bg-emerald-50 text-emerald-700' },
  reposicion: { icon: Shirt, clase: 'bg-sky-50 text-sky-700' },
  extravio: { icon: AlertTriangle, clase: 'bg-red-50 text-red-600' },
  devolucion: { icon: Undo2, clase: 'bg-amber-50 text-amber-700' },
  nota: { icon: StickyNote, clase: 'bg-slate-100 text-slate-600' },
  llamada: { icon: Phone, clase: 'bg-sky-50 text-sky-700' },
};

/** Normaliza fechas de la base (con o sin hora) a una clave ISO comparable. */
export function claveFecha(valor?: string | null): string {
  if (!valor) return '';
  return String(valor).replace(' ', 'T');
}

/** Linea de tiempo vertical del expediente: cada evento con su punto, titulo y fecha. */
export function LineaTiempo({ eventos, limite = 40 }: { eventos: EventoLinea[]; limite?: number }) {
  const [verTodo, setVerTodo] = useState(false);
  const ordenados = useMemo(
    () => [...eventos].sort((a, b) => claveFecha(b.fecha).localeCompare(claveFecha(a.fecha))),
    [eventos]
  );
  const visibles = verTodo ? ordenados : ordenados.slice(0, limite);

  if (ordenados.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">Todavía no hay movimientos en el expediente.</p>;
  }

  return (
    <div>
      <ol className="relative space-y-1">
        <span aria-hidden className="absolute bottom-3 left-[15px] top-3 w-px bg-border" />
        {visibles.map((ev) => {
          const estilo = ESTILO_EVENTO[ev.tipo];
          const Icon = estilo.icon;
          return (
            <li key={ev.id} className="relative flex gap-3.5 py-2">
              <span className={cn('relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ring-4 ring-card', estilo.clase)}>
                <Icon className="h-3.5 w-3.5" aria-hidden />
              </span>
              <div className="min-w-0 flex-1 pt-0.5">
                <div className="flex items-start justify-between gap-3">
                  <p className="min-w-0 text-[13px] font-semibold leading-snug text-foreground">{ev.titulo}</p>
                  <time className="shrink-0 pt-0.5 text-[11px] font-medium tabular-nums text-muted-foreground">{fmtDate(ev.fecha.slice(0, 10))}</time>
                </div>
                {ev.detalle && <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{ev.detalle}</p>}
              </div>
            </li>
          );
        })}
      </ol>
      {ordenados.length > limite && (
        <button
          type="button"
          onClick={() => setVerTodo((v) => !v)}
          className="ml-[46px] mt-1 text-xs font-semibold text-primary transition-colors hover:text-primary/80"
        >
          {verTodo ? 'Mostrar menos' : `Ver los ${ordenados.length - limite} anteriores`}
        </button>
      )}
    </div>
  );
}

function estadoRoster(g: any): { tone: 'success' | 'warning' | 'neutral'; valor: number } {
  const ficha = !!g.ficha_tecnica_json;
  if (g.estado === 'Activo') return ficha ? { tone: 'success', valor: 100 } : { tone: 'warning', valor: 60 };
  if (g.estado === 'Baja Pendiente') return { tone: 'warning', valor: 50 };
  return { tone: 'neutral', valor: 100 };
}

/** Lista lateral de personal para saltar de un perfil a otro (solo en pantallas muy anchas). */
export function RosterGuardias({ actualId, className }: { actualId: number; className?: string }) {
  const { data: guardias = [], isLoading } = useQuery({ queryKey: ['guardias'], queryFn: () => apiFetch<any[]>('/api/guardias') });
  const [q, setQ] = useState('');
  const lista = useMemo(() => {
    const t = q.trim().toLowerCase();
    return guardias
      .filter((g: any) => !t || (g.nombre || '').toLowerCase().includes(t) || (g.numero_elemento || '').toLowerCase().includes(t))
      .slice(0, 80);
  }, [guardias, q]);

  return (
    <TarjetaPerfil className={cn('flex min-h-0 flex-col p-4', className)}>
      <TituloTarjeta
        title="Personal"
        subtitle={isLoading ? 'Cargando personal...' : `${guardias.length} elemento${guardias.length === 1 ? '' : 's'} registrado${guardias.length === 1 ? '' : 's'}`}
      />
      <div className="relative mt-3">
        <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar"
          aria-label="Buscar en el personal"
          className="h-9 w-full rounded-full bg-muted pl-9 pr-3 text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-4 focus:ring-primary/10"
        />
      </div>
      <ul className="mt-3 min-h-0 flex-1 space-y-1 overflow-y-auto pr-0.5">
        {isLoading && Array.from({ length: 4 }).map((_, i) => (
          <li key={`carga-${i}`} className="flex items-center gap-3 rounded-2xl px-2.5 py-2" aria-hidden>
            <span className="h-9 w-9 animate-pulse rounded-full bg-muted" />
            <span className="flex-1 space-y-1.5">
              <span className="block h-3 w-3/4 animate-pulse rounded bg-muted" />
              <span className="block h-2.5 w-1/2 animate-pulse rounded bg-muted" />
            </span>
          </li>
        ))}
        {lista.map((g: any) => {
          const activo = g.id === actualId;
          const est = estadoRoster(g);
          let foto: string | null = null;
          try { foto = g.ficha_tecnica_json ? JSON.parse(g.ficha_tecnica_json).fotoUrl || null : null; } catch { foto = null; }
          return (
            <li key={g.id}>
              <Link
                href={`/guardias/${g.id}`}
                aria-current={activo ? 'page' : undefined}
                className={cn('flex items-center gap-3 rounded-2xl px-2.5 py-2 transition-colors', activo ? 'bg-primary/[0.08]' : 'hover:bg-muted')}
              >
                <Avatar name={g.nombre} src={foto} size="sm" />
                <span className="min-w-0 flex-1 leading-tight">
                  <span className={cn('block truncate text-[13px] font-semibold', activo ? 'text-primary' : 'text-foreground')}>{g.nombre}</span>
                  <span className="block truncate text-[11px] text-muted-foreground">{g.numero_elemento ? `Elemento ${g.numero_elemento}` : g.estado}</span>
                </span>
                <ProgressRing value={est.valor} size={26} stroke={3} tone={est.tone === 'success' ? 'success' : est.tone === 'warning' ? 'warning' : 'ink'} trackClassName="stroke-slate-200">
                  {est.tone === 'success' ? <Check className="h-3 w-3 text-emerald-600" /> : est.tone === 'warning' ? <AlertCircle className="h-3 w-3 text-amber-600" /> : null}
                </ProgressRing>
              </Link>
            </li>
          );
        })}
        {!isLoading && lista.length === 0 && <li className="py-6 text-center text-xs text-muted-foreground">Sin coincidencias</li>}
      </ul>
    </TarjetaPerfil>
  );
}

/** Casilla del checklist de papeles clave; es un boton solo si se puede abrir. */
export function CasillaDocumento({ label, listo, onClick, title }: { label: string; listo: boolean; onClick?: () => void; title?: string }) {
  const contenido = (
    <>
      <span className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-full', listo ? 'bg-emerald-100 text-emerald-700' : 'bg-white text-slate-400 ring-1 ring-inset ring-border')}>
        {listo ? <Check className="h-3.5 w-3.5" /> : <AlertCircle className="h-3.5 w-3.5" />}
      </span>
      <span className="min-w-0 flex-1 text-left text-xs font-semibold leading-tight text-foreground">{label}</span>
    </>
  );
  const clase = cn('flex items-center gap-2.5 rounded-2xl bg-muted/70 p-3 transition-colors', onClick && 'hover:bg-slate-200/70');
  return onClick ? (
    <button type="button" onClick={onClick} title={title} className={clase}>{contenido}</button>
  ) : (
    <div className={clase}>{contenido}</div>
  );
}

/** Tarjeta de papel digitalizado: icono, nombre, fecha y acciones al costado. */
export function TarjetaDocumento({
  nombre, fecha, tono = 'primary', onAbrir, acciones,
}: { nombre: string; fecha?: string | null; tono?: 'primary' | 'warning'; onAbrir: () => void; acciones?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-muted/70 p-3">
      <button type="button" onClick={onAbrir} title="Abrir en el visor" className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', tono === 'warning' ? 'bg-amber-100 text-amber-700' : 'bg-primary/10 text-primary')}>
          <FileText className="h-[18px] w-[18px]" />
        </span>
        <span className="min-w-0 leading-tight">
          <span className="block truncate text-[13px] font-bold text-foreground" title={nombre}>{nombre}</span>
          <span className="block text-[11px] text-muted-foreground">{fecha ? fmtDate(String(fecha).slice(0, 10)) : 'Sin fecha'}</span>
        </span>
      </button>
      <div className="flex shrink-0 items-center gap-0.5">{acciones}</div>
    </div>
  );
}

/**
 * true cuando la ventana tiene al menos `px` de ancho. Sirve para montar piezas pesadas solo cuando
 * hay espacio para mostrarlas (por ejemplo la lista lateral de personal, que hace su propia consulta).
 */
export function useAnchoMinimo(px: number): boolean {
  const [cumple, setCumple] = useState(false);
  useEffect(() => {
    const consulta = window.matchMedia(`(min-width: ${px}px)`);
    const actualizar = () => setCumple(consulta.matches);
    actualizar();
    consulta.addEventListener('change', actualizar);
    return () => consulta.removeEventListener('change', actualizar);
  }, [px]);
  return cumple;
}
