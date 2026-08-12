'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Calendar, Check, ChevronLeft, ChevronRight, X } from 'lucide-react';

/**
 * Selector de rango de fechas: atajos como filas (nadie pelea con una rejilla
 * para pedir "el mes pasado") y, tras una línea divisoria, un calendario propio
 * para el rango a medida. Se implementa a mano porque el calendario nativo de
 * <input type="date"> no admite estilos.
 */

export const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
export const DIAS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

export interface Preset { id: string; etiqueta: string; desde: string; hasta: string }

export const iso = (a: number, m: number, d: number) =>
  `${a}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
export const partes = (s: string) => s.split('-').map(Number) as [number, number, number];
export const fmtCorto = (s: string) => { const [a, m, d] = partes(s); return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${a}`; };
export const fmtLargo = (s: string) => { const [a, m, d] = partes(s); return `${d} de ${MESES[m - 1]} de ${a}`; };

/** Días del mes, precedidos por los huecos hasta el primer lunes. */
export function celdasDelMes(anio: number, mes: number) {
  const primero = new Date(Date.UTC(anio, mes, 1));
  const hueco = (primero.getUTCDay() + 6) % 7; // lunes = 0
  const dias = new Date(Date.UTC(anio, mes + 1, 0)).getUTCDate();
  return [...Array(hueco).fill(null), ...Array.from({ length: dias }, (_, i) => i + 1)];
}

export function RangoFechas({
  desde, hasta, onChange, min, max, presets = [], className = '',
}: {
  desde: string;
  hasta: string;
  onChange: (desde: string, hasta: string) => void;
  /** Límites de lo que existe; fuera de aquí los días se deshabilitan. */
  min?: string | null;
  max?: string | null;
  presets?: Preset[];
  className?: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const [inicioSel, setInicioSel] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const contenedor = useRef<HTMLDivElement>(null);

  const [anio, setAnio] = useState(() => partes(desde || max || iso(new Date().getFullYear(), new Date().getMonth(), 1))[0]);
  const [mes, setMes] = useState(() => partes(desde || max || iso(new Date().getFullYear(), new Date().getMonth(), 1))[1] - 1);

  // Cerrar al hacer clic fuera o con Escape
  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => {
      if (contenedor.current && !contenedor.current.contains(e.target as Node)) { setAbierto(false); setInicioSel(null); }
    };
    const escape = (e: KeyboardEvent) => { if (e.key === 'Escape') { setAbierto(false); setInicioSel(null); } };
    document.addEventListener('mousedown', fuera);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('mousedown', fuera); document.removeEventListener('keydown', escape); };
  }, [abierto]);

  const celdas = useMemo(() => celdasDelMes(anio, mes), [anio, mes]);
  const presetActivo = presets.find((p) => p.desde === desde && p.hasta === hasta);

  // Extremos provisionales mientras se elige el segundo día del rango
  const provisionalA = inicioSel && hover ? (inicioSel <= hover ? inicioSel : hover) : null;
  const provisionalB = inicioSel && hover ? (inicioSel <= hover ? hover : inicioSel) : null;

  const deshabilitado = (f: string) => (!!min && f < min) || (!!max && f > max);

  const clicDia = (f: string) => {
    if (deshabilitado(f)) return;
    if (!inicioSel) { setInicioSel(f); setHover(f); return; }
    const a = inicioSel <= f ? inicioSel : f;
    const b = inicioSel <= f ? f : inicioSel;
    setInicioSel(null);
    setHover(null);
    onChange(a, b);
    setAbierto(false);
  };

  const moverMes = (delta: number) => {
    const d = new Date(Date.UTC(anio, mes + delta, 1));
    setAnio(d.getUTCFullYear());
    setMes(d.getUTCMonth());
  };

  return (
    <div className={`relative ${className}`} ref={contenedor}>
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        className="flex items-center gap-2 bg-card border border-border rounded-xl px-3 py-2 text-xs hover:bg-muted transition-colors"
      >
        <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
        <span className="font-medium">
          {presetActivo ? presetActivo.etiqueta : `${fmtCorto(desde)} – ${fmtCorto(hasta)}`}
        </span>
        <ChevronRight className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${abierto ? 'rotate-90' : ''}`} />
      </button>

      {abierto && (
        <div className="absolute right-0 z-50 mt-2 w-[300px] rounded-2xl border border-border bg-card shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
          {presets.length > 0 && (
            <div className="p-1.5">
              {presets.map((p) => {
                const activo = p.desde === desde && p.hasta === hasta;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => { onChange(p.desde, p.hasta); setAbierto(false); const [a, m] = partes(p.desde); setAnio(a); setMes(m - 1); }}
                    className="w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg text-xs hover:bg-muted transition-colors text-left"
                  >
                    <span className={activo ? 'font-semibold text-foreground' : 'text-muted-foreground'}>{p.etiqueta}</span>
                    {activo && <Check className="w-4 h-4 text-primary flex-shrink-0" strokeWidth={3} />}
                  </button>
                );
              })}
            </div>
          )}

          <div className="border-t border-border p-3">
            <div className="flex items-center justify-between mb-2">
              <button type="button" onClick={() => moverMes(-1)} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-muted transition-colors" aria-label="Mes anterior">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <p className="text-xs font-semibold capitalize">{MESES[mes]} {anio}</p>
              <button type="button" onClick={() => moverMes(1)} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-muted transition-colors" aria-label="Mes siguiente">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-7 gap-0.5 mb-1">
              {DIAS.map((d, i) => (
                <span key={i} className="text-[10px] text-muted-foreground text-center font-medium py-1">{d}</span>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-0.5" onMouseLeave={() => inicioSel && setHover(inicioSel)}>
              {celdas.map((dia, i) => {
                if (dia === null) return <span key={`h${i}`} />;
                const f = iso(anio, mes, dia);
                const fuera = deshabilitado(f);
                const enRango = (f >= desde && f <= hasta) || (!!provisionalA && f >= provisionalA && f <= provisionalB!);
                const extremo = f === desde || f === hasta || f === inicioSel;
                return (
                  <button
                    key={f}
                    type="button"
                    disabled={fuera}
                    onClick={() => clicDia(f)}
                    onMouseEnter={() => inicioSel && setHover(f)}
                    title={fmtLargo(f)}
                    className={[
                      'h-8 text-[11px] rounded-lg transition-colors tabular-nums',
                      fuera ? 'text-muted-foreground/30 cursor-not-allowed'
                        : extremo ? 'bg-primary text-primary-foreground font-semibold'
                        : enRango ? 'bg-primary/10 text-foreground'
                        : 'hover:bg-muted text-foreground',
                    ].join(' ')}
                  >
                    {dia}
                  </button>
                );
              })}
            </div>

            <p className="text-[10px] text-muted-foreground mt-2 text-center">
              {inicioSel
                ? `Inicio ${fmtCorto(inicioSel)} · elige el día final`
                : min && max ? `Hay datos del ${fmtCorto(min)} al ${fmtCorto(max)}` : 'Elige el día inicial'}
            </p>
          </div>

          {inicioSel && (
            <button
              type="button"
              onClick={() => { setInicioSel(null); setHover(null); }}
              className="w-full flex items-center justify-center gap-1.5 border-t border-border py-2 text-[11px] text-muted-foreground hover:bg-muted transition-colors"
            >
              <X className="w-3 h-3" /> Cancelar la selección
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** Atajos derivados de los datos que existen: todo el histórico y cada mes. */
export function presetsDeRango(min: string | null, max: string | null): Preset[] {
  if (!min || !max) return [];
  const lista: Preset[] = [{ id: 'todo', etiqueta: 'Todo el histórico', desde: min, hasta: max }];
  const [aMin, mMin] = partes(min);
  const [aMax, mMax] = partes(max);
  const meses: { a: number; m: number }[] = [];
  for (let a = aMin, m = mMin; a < aMax || (a === aMax && m <= mMax); m === 12 ? (m = 1, a++) : m++) {
    meses.push({ a, m });
  }
  for (const { a, m } of meses.reverse()) {
    const primero = iso(a, m - 1, 1);
    const ultimo = iso(a, m - 1, new Date(Date.UTC(a, m, 0)).getUTCDate());
    lista.push({
      id: `${a}-${m}`,
      etiqueta: `${MESES[m - 1].charAt(0).toUpperCase() + MESES[m - 1].slice(1)} ${a}`,
      desde: primero < min ? min : primero,
      hasta: ultimo > max ? max : ultimo,
    });
  }
  return lista;
}
