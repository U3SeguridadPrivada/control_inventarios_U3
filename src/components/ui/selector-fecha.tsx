'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import { MESES, DIAS, iso, partes, fmtLargo, celdasDelMes } from './rango-fechas';

/**
 * Selector de una sola fecha, con el mismo calendario que el de rango. Existe
 * porque el calendario nativo de <input type="date"> no admite estilos y rompe
 * la coherencia visual del formulario.
 */
export function SelectorFecha({
  value, onChange, min, max, className = '',
}: {
  value: string;
  onChange: (fecha: string) => void;
  min?: string | null;
  max?: string | null;
  className?: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const contenedor = useRef<HTMLDivElement>(null);
  const [anio, setAnio] = useState(() => partes(value)[0]);
  const [mes, setMes] = useState(() => partes(value)[1] - 1);

  // Si la fecha cambia desde fuera (al encadenar capturas), seguir su mes
  useEffect(() => {
    const [a, m] = partes(value);
    setAnio(a); setMes(m - 1);
  }, [value]);

  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => {
      if (contenedor.current && !contenedor.current.contains(e.target as Node)) setAbierto(false);
    };
    const escape = (e: KeyboardEvent) => { if (e.key === 'Escape') setAbierto(false); };
    document.addEventListener('mousedown', fuera);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('mousedown', fuera); document.removeEventListener('keydown', escape); };
  }, [abierto]);

  const celdas = useMemo(() => celdasDelMes(anio, mes), [anio, mes]);
  const hoy = new Date();
  const hoyISO = iso(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  const ayer = new Date(Date.now() - 86400000);
  const ayerISO = iso(ayer.getFullYear(), ayer.getMonth(), ayer.getDate());

  const deshabilitado = (f: string) => (!!min && f < min) || (!!max && f > max);
  const elegir = (f: string) => { if (!deshabilitado(f)) { onChange(f); setAbierto(false); } };
  const moverMes = (delta: number) => {
    const d = new Date(Date.UTC(anio, mes + delta, 1));
    setAnio(d.getUTCFullYear()); setMes(d.getUTCMonth());
  };

  const atajo = (etiqueta: string, fecha: string) => (
    <button type="button" onClick={() => elegir(fecha)} disabled={deshabilitado(fecha)}
      className={`flex-1 text-[11px] py-1.5 rounded-lg border transition-colors disabled:opacity-40 ${
        value === fecha ? 'border-primary bg-primary/10 text-primary font-semibold' : 'border-border text-muted-foreground hover:bg-muted'}`}>
      {etiqueta}
    </button>
  );

  return (
    <div className={`relative ${className}`} ref={contenedor}>
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        className="w-full flex items-center gap-2 h-10 rounded-xl border border-border bg-card px-3 text-sm hover:bg-muted/50 transition-colors"
      >
        <Calendar className="w-4 h-4 text-muted-foreground flex-shrink-0" />
        {/* Sin `capitalize`: pondría mayúscula en cada palabra ("12 De Agosto De 2026") */}
        <span className="flex-1 text-left">{fmtLargo(value)}</span>
      </button>

      {abierto && (
        <div className="absolute left-0 z-50 mt-2 w-[288px] rounded-2xl border border-border bg-card shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
          <div className="flex gap-1.5 p-2 border-b border-border">
            {atajo('Hoy', hoyISO)}
            {atajo('Ayer', ayerISO)}
          </div>
          <div className="p-3">
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
              {DIAS.map((d, i) => <span key={i} className="text-[10px] text-muted-foreground text-center font-medium py-1">{d}</span>)}
            </div>
            <div className="grid grid-cols-7 gap-0.5">
              {celdas.map((dia, i) => {
                if (dia === null) return <span key={`h${i}`} />;
                const f = iso(anio, mes, dia);
                const fuera = deshabilitado(f);
                const esHoy = f === hoyISO;
                return (
                  <button key={f} type="button" disabled={fuera} onClick={() => elegir(f)} title={fmtLargo(f)}
                    className={[
                      'h-8 text-[11px] rounded-lg transition-colors tabular-nums',
                      fuera ? 'text-muted-foreground/30 cursor-not-allowed'
                        : f === value ? 'bg-primary text-primary-foreground font-semibold'
                        : esHoy ? 'text-primary font-semibold hover:bg-muted'
                        : 'hover:bg-muted text-foreground',
                    ].join(' ')}>
                    {dia}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
