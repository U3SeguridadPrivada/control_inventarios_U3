'use client';
import { useEffect, useState, useMemo, useRef } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/src/lib/api';
import { Button } from '@/src/components/ui/button';
import { Select } from '@/src/components/ui/select';
import {
  ArrowLeft, Printer, Plus, Trash2, ArrowUp, ArrowDown,
  FileText, ZoomIn, ZoomOut, RotateCcw, Loader2, CheckCircle2,
  BookOpen, Search, ShieldCheck, ListOrdered, Sparkles, SlidersHorizontal, Building2
} from 'lucide-react';
import { toast } from 'sonner';
import { COMPANY } from '@/src/lib/company';
import {
  bloqueVacio, ETIQUETA_BLOQUE, limpiarContenido, mover, paginarFragmentos, seccionVacia,
  type Bloque, type ContenidoDoc, type FragmentoSeccion, type ProtocoloRegistro, type SeccionDoc, type TipoBloque,
} from '@/src/lib/documentoProtocolo';
import { cn } from '@/src/lib/utils';
import { useAuth } from '@/src/context/AuthContext';

const NAVY = '#0f172a';
const BLUE = '#1e3a8a';
const ACCENT = '#2563eb';
const TIPOS_BLOQUE: TipoBloque[] = ['parrafo', 'subtitulo', 'lista', 'nota', 'tabla', 'campos', 'firma'];

// U3 tiene dos reglamentos distintos: el del personal de escritorio y el del
// personal operativo en servicio. Cada uno es un registro propio en la API.
export type AmbitoReglamento = 'oficinas' | 'guardias';

const AMBITOS: { id: AmbitoReglamento; etiqueta: string; corta: string; codigo: string; icono: typeof BookOpen }[] = [
  { id: 'oficinas', etiqueta: 'Oficinistas', corta: 'Corporativo', codigo: 'U3-REG-OFI-2026-V1', icono: Building2 },
  { id: 'guardias', etiqueta: 'Guardias', corta: 'Guardias', codigo: 'U3-REG-OPE-2026-V1', icono: ShieldCheck },
];

function EditableText({
  value,
  onChange,
  className,
  style,
  placeholder = 'Escribe aquí...',
  isTitle = false,
  readOnly = false,
}: {
  value: string;
  onChange: (val: string) => void;
  className?: string;
  style?: React.CSSProperties;
  placeholder?: string;
  isTitle?: boolean;
  readOnly?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (ref.current && ref.current.innerText !== value) {
      ref.current.innerText = value;
    }
  }, [value]);

  if (readOnly) {
    return (
      <div className={cn('min-w-[20px] font-sans', className)} style={style}>
        {value}
      </div>
    );
  }

  return (
    <div
      ref={ref}
      contentEditable
      suppressContentEditableWarning
      data-placeholder={placeholder}
      onBlur={() => {
        const text = ref.current?.innerText ?? '';
        if (text !== value) {
          onChange(text);
        }
      }}
      onKeyDown={(e) => {
        if (isTitle && e.key === 'Enter') {
          e.preventDefault();
          ref.current?.blur();
        }
      }}
      className={cn(
        'outline-none transition-colors rounded px-1 -mx-1 hover:bg-slate-100 dark:hover:bg-slate-800 focus:bg-blue-50/80 dark:focus:bg-slate-800 focus:ring-1 focus:ring-blue-500/40 cursor-text min-w-[20px] font-sans',
        className
      )}
      style={style}
    />
  );
}

function BloqueVistaEditable({
  bloque,
  onChange,
  onMover,
  onEliminar,
  primero,
  ultimo,
  readOnly,
}: {
  bloque: Bloque;
  onChange: (b: Bloque) => void;
  onMover: (delta: number) => void;
  onEliminar: () => void;
  primero: boolean;
  ultimo: boolean;
  readOnly?: boolean;
}) {
  return (
    <div className="group/bloque relative my-2 first:mt-0 font-sans">
      {!readOnly && (
        <div className="absolute -right-2 -top-3 hidden group-hover/bloque:flex items-center gap-1 bg-slate-900 text-white shadow-md rounded px-1.5 py-0.5 z-20 print:hidden text-[10px]">
          <button type="button" onClick={() => onMover(-1)} disabled={primero} title="Subir" className="p-0.5 hover:text-blue-300 disabled:opacity-30">
            <ArrowUp className="w-3 h-3" />
          </button>
          <button type="button" onClick={() => onMover(1)} disabled={ultimo} title="Bajar" className="p-0.5 hover:text-blue-300 disabled:opacity-30">
            <ArrowDown className="w-3 h-3" />
          </button>
          <button type="button" onClick={onEliminar} title="Eliminar bloque" className="p-0.5 text-red-400 hover:text-red-300">
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      )}

      {bloque.tipo === 'parrafo' && (
        <EditableText
          value={bloque.texto}
          onChange={(texto) => onChange({ ...bloque, texto })}
          readOnly={readOnly}
          className="text-[12px] leading-relaxed text-justify text-slate-700 font-sans"
        />
      )}

      {bloque.tipo === 'subtitulo' && (
        <EditableText
          value={bloque.texto}
          onChange={(texto) => onChange({ ...bloque, texto })}
          readOnly={readOnly}
          className="text-[12.5px] font-bold pt-1.5 pb-0.5 text-[#0f172a] uppercase tracking-wide border-b border-slate-200"
          isTitle
        />
      )}

      {bloque.tipo === 'nota' && (
        <div className="border-l-4 border-blue-600 bg-slate-50 dark:bg-slate-800/40 px-3.5 py-2.5 my-2 text-[11.5px] leading-relaxed text-justify text-slate-700 font-sans">
          <EditableText
            value={bloque.texto}
            onChange={(texto) => onChange({ ...bloque, texto })}
            readOnly={readOnly}
          />
        </div>
      )}

      {bloque.tipo === 'firma' && (
        <div className="mt-8 pt-4 border-t-2 border-slate-300 text-center font-sans">
          <EditableText
            value={bloque.texto}
            onChange={(texto) => onChange({ ...bloque, texto })}
            readOnly={readOnly}
            className="text-[11.5px] font-semibold text-slate-800 whitespace-pre-line text-center uppercase tracking-wider"
          />
        </div>
      )}

      {bloque.tipo === 'lista' && (
        <ol
          className={cn(
            'text-[12px] leading-relaxed text-slate-700 space-y-1.5 my-1.5 font-sans pl-5',
            bloque.estilo === 'upper-roman' && 'list-[upper-roman]',
            bloque.estilo === 'lower-alpha' && 'list-[lower-alpha]',
            bloque.estilo === 'decimal' && 'list-decimal',
            bloque.estilo === 'none' && 'list-none pl-0',
            bloque.estilo === 'glosario' && 'list-none pl-0'
          )}
        >
          {bloque.items.map((item, idx) => {
            if (bloque.estilo === 'glosario') {
              const [termino, ...resto] = item.split(':');
              const def = resto.join(':');
              return (
                <li key={idx} className="group/item relative text-justify">
                  {!readOnly && (
                    <div className="absolute -left-6 top-0 hidden group-hover/item:flex items-center gap-0.5 print:hidden">
                      <button
                        type="button"
                        onClick={() => {
                          const items = bloque.items.filter((_, i) => i !== idx);
                          onChange({ ...bloque, items: items.length ? items : [''] });
                        }}
                        className="text-red-400 hover:text-red-600 text-xs"
                      >
                        ×
                      </button>
                    </div>
                  )}
                  {resto.length > 0 ? (
                    <div>
                      <EditableText
                        value={termino}
                        onChange={(val) => {
                          const items = [...bloque.items];
                          items[idx] = `${val}:${def}`;
                          onChange({ ...bloque, items });
                        }}
                        readOnly={readOnly}
                        className="inline font-bold text-slate-900"
                      />
                      <span className="font-bold text-slate-900">:</span>{' '}
                      <EditableText
                        value={def.trimStart()}
                        onChange={(val) => {
                          const items = [...bloque.items];
                          items[idx] = `${termino}: ${val}`;
                          onChange({ ...bloque, items });
                        }}
                        readOnly={readOnly}
                        className="inline"
                      />
                    </div>
                  ) : (
                    <EditableText
                      value={item}
                      onChange={(val) => {
                        const items = [...bloque.items];
                        items[idx] = val;
                        onChange({ ...bloque, items });
                      }}
                      readOnly={readOnly}
                    />
                  )}
                </li>
              );
            }

            return (
              <li key={idx} className="group/item relative text-justify">
                {!readOnly && (
                  <div className="absolute -left-6 top-0 hidden group-hover/item:flex items-center gap-0.5 print:hidden">
                    <button
                      type="button"
                      onClick={() => {
                        const items = bloque.items.filter((_, i) => i !== idx);
                        onChange({ ...bloque, items: items.length ? items : [''] });
                      }}
                      className="text-red-400 hover:text-red-600 text-xs"
                    >
                      ×
                    </button>
                  </div>
                )}
                <EditableText
                  value={item}
                  onChange={(val) => {
                    const items = [...bloque.items];
                    items[idx] = val;
                    onChange({ ...bloque, items });
                  }}
                  readOnly={readOnly}
                />
              </li>
            );
          })}
          {!readOnly && (
            <button
              type="button"
              onClick={() => onChange({ ...bloque, items: [...bloque.items, 'Nuevo elemento'] })}
              className="text-[10px] text-blue-600 hover:underline flex items-center gap-0.5 mt-1 print:hidden"
            >
              <Plus className="w-2.5 h-2.5" /> Agregar elemento
            </button>
          )}
        </ol>
      )}

      {bloque.tipo === 'tabla' && (
        <div className="my-3 overflow-x-auto border border-slate-300 rounded font-sans">
          <table className="w-full text-left text-[11.5px] border-collapse font-sans">
            <thead>
              <tr className="bg-slate-800 text-white font-semibold">
                {bloque.encabezados.map((enc, cIdx) => (
                  <th key={cIdx} className="p-2 border border-slate-600">
                    <EditableText
                      value={enc}
                      onChange={(val) => {
                        const encabezados = [...bloque.encabezados];
                        encabezados[cIdx] = val;
                        onChange({ ...bloque, encabezados });
                      }}
                      readOnly={readOnly}
                      className="text-white font-semibold"
                    />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {bloque.filas.map((fila, rIdx) => (
                <tr key={rIdx} className="border-b border-slate-200 hover:bg-slate-50">
                  {fila.map((celda, cIdx) => (
                    <td key={cIdx} className="p-2 border border-slate-200 text-slate-700 align-top text-justify">
                      <EditableText
                        value={celda}
                        onChange={(val) => {
                          const filas = bloque.filas.map((f, i) =>
                            i === rIdx ? f.map((c, j) => (j === cIdx ? val : c)) : f
                          );
                          onChange({ ...bloque, filas });
                        }}
                        readOnly={readOnly}
                      />
                    </td>
                  ))}
                  {!readOnly && (
                    <td className="w-6 p-1 text-center print:hidden">
                      <button
                        type="button"
                        onClick={() => {
                          const filas = bloque.filas.filter((_, i) => i !== rIdx);
                          onChange({ ...bloque, filas });
                        }}
                        className="text-red-400 hover:text-red-600 text-xs"
                      >
                        ×
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          {!readOnly && (
            <div className="p-1.5 bg-slate-50 border-t border-slate-200 flex gap-3 text-[10px] print:hidden">
              <button
                type="button"
                onClick={() =>
                  onChange({
                    ...bloque,
                    filas: [...bloque.filas, Array(bloque.encabezados.length).fill('')],
                  })
                }
                className="text-blue-600 hover:underline flex items-center gap-0.5"
              >
                <Plus className="w-2.5 h-2.5" /> Agregar fila
              </button>
            </div>
          )}
        </div>
      )}

      {bloque.tipo === 'campos' && (
        <div className="my-3 space-y-2 font-sans bg-slate-50/70 p-3 rounded border border-slate-200">
          {bloque.items.map((item, idx) => (
            <div key={idx} className="text-[11.5px] font-mono text-slate-800">
              <EditableText
                value={item}
                onChange={(val) => {
                  const items = [...bloque.items];
                  items[idx] = val;
                  onChange({ ...bloque, items });
                }}
                readOnly={readOnly}
              />
            </div>
          ))}
          {!readOnly && (
            <button
              type="button"
              onClick={() => onChange({ ...bloque, items: [...bloque.items, 'Campo: ___________________________'] })}
              className="text-[10px] text-blue-600 hover:underline flex items-center gap-0.5 pt-1 print:hidden"
            >
              <Plus className="w-2.5 h-2.5" /> Agregar campo
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function SeccionVistaEditable({
  seccion,
  onChange,
  onEliminar,
  readOnly,
  desde = 0,
  hasta = seccion.bloques.length,
  continuacion = false,
  ultimo = true,
}: {
  seccion: SeccionDoc;
  onChange: (s: SeccionDoc) => void;
  onEliminar: () => void;
  readOnly?: boolean;
  /** Rango de bloques que se pinta en esta hoja; el resto sigue en la siguiente. */
  desde?: number;
  hasta?: number;
  continuacion?: boolean;
  ultimo?: boolean;
}) {
  const [tipoNuevoBloque, setTipoNuevoBloque] = useState<TipoBloque>('parrafo');

  const setBloque = (idx: number, b: Bloque) =>
    onChange({ ...seccion, bloques: seccion.bloques.map((item, i) => (i === idx ? b : item)) });

  const agregarBloque = () =>
    onChange({ ...seccion, bloques: [...seccion.bloques, bloqueVacio(tipoNuevoBloque)] });

  const eliminarBloque = (idx: number) =>
    onChange({ ...seccion, bloques: seccion.bloques.filter((_, i) => i !== idx) });

  const moverBloque = (idx: number, delta: number) =>
    onChange({ ...seccion, bloques: mover(seccion.bloques, idx, delta) });

  return (
    <div id={continuacion ? undefined : seccion.id} className="mb-6 last:mb-0 font-sans">
      {/* Encabezado de la sección; en la continuación va en versión compacta. */}
      {continuacion ? (
        <div className="border-b border-slate-300 pb-1 mb-3 flex items-baseline gap-2 text-slate-500">
          {seccion.numero && (
            <span className="text-[10px] font-bold tracking-widest text-blue-800 uppercase">{seccion.numero}</span>
          )}
          <span className="text-[11px] font-semibold uppercase tracking-tight truncate">{seccion.titulo}</span>
          <span className="text-[10px] italic shrink-0 ml-auto">continúa</span>
        </div>
      ) : (
        <div className="border-b-2 border-slate-900 pb-1 mb-3 flex items-end justify-between gap-2">
          <div className="flex-1">
            {seccion.numero && (
              <EditableText
                value={seccion.numero}
                onChange={(numero) => onChange({ ...seccion, numero })}
                readOnly={readOnly}
                className="text-[11px] font-bold tracking-widest text-blue-800 uppercase"
                isTitle
              />
            )}
            <EditableText
              value={seccion.titulo}
              onChange={(titulo) => onChange({ ...seccion, titulo })}
              readOnly={readOnly}
              className="text-[15px] font-extrabold text-[#0f172a] uppercase tracking-tight"
              isTitle
            />
          </div>
          {!readOnly && (
            <button
              type="button"
              onClick={onEliminar}
              title="Eliminar capítulo"
              className="text-red-400 hover:text-red-600 p-1 print:hidden"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}

      {/* Lista de bloques de contenido de este fragmento */}
      <div className="space-y-1">
        {seccion.bloques.slice(desde, hasta).map((b, i) => {
          const idx = desde + i;
          return (
            <BloqueVistaEditable
              key={idx}
              bloque={b}
              onChange={(nb) => setBloque(idx, nb)}
              onMover={(delta) => moverBloque(idx, delta)}
              onEliminar={() => eliminarBloque(idx)}
              primero={idx === 0}
              ultimo={idx === seccion.bloques.length - 1}
              readOnly={readOnly}
            />
          );
        })}
      </div>

      {!readOnly && ultimo && (
        <div className="mt-3 pt-2 border-t border-dashed border-slate-200 flex items-center gap-2 print:hidden">
          <Select
            value={tipoNuevoBloque}
            onChange={(e) => setTipoNuevoBloque(e.target.value as TipoBloque)}
            className="h-7 text-xs w-44"
          >
            {TIPOS_BLOQUE.map((t) => (
              <option key={t} value={t}>
                {ETIQUETA_BLOQUE[t]}
              </option>
            ))}
          </Select>
          <Button type="button" size="sm" variant="outline" onClick={agregarBloque} className="h-7 text-xs">
            <Plus className="w-3 h-3 mr-1" /> Agregar bloque
          </Button>
        </div>
      )}
    </div>
  );
}

export default function DocumentoReglamentoApp({
  ambitoInicial = 'oficinas',
}: { ambitoInicial?: AmbitoReglamento } = {}) {
  const { isEditor, isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const [ambito, setAmbito] = useState<AmbitoReglamento>(ambitoInicial);
  const [zoom, setZoom] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');
  const [contenidoLocal, setContenidoLocal] = useState<ContenidoDoc | null>(null);
  const [cambiosPendientes, setCambiosPendientes] = useState(false);

  const { data: registro, isLoading, error } = useQuery({
    queryKey: ['reglamento-documento', ambito],
    queryFn: () => apiFetch<ProtocoloRegistro>(`/api/reglamento?ambito=${ambito}`),
  });

  useEffect(() => {
    if (registro?.contenido && !cambiosPendientes) {
      setContenidoLocal(registro.contenido as ContenidoDoc);
    }
  }, [registro, cambiosPendientes]);

  // Cambiar de reglamento descarta el borrador en pantalla, nunca lo mezcla con el otro documento.
  const cambiarAmbito = (nuevo: AmbitoReglamento) => {
    if (nuevo === ambito) return;
    if (cambiosPendientes && !window.confirm('Tienes cambios sin guardar en este reglamento. ¿Cambiar de documento y descartarlos?')) {
      return;
    }
    setCambiosPendientes(false);
    setContenidoLocal(null);
    setSearchTerm('');
    setAmbito(nuevo);
  };

  const updateMutation = useMutation({
    mutationFn: (payload: any) =>
      apiFetch(`/api/reglamento?ambito=${ambito}`, {
        method: 'PUT',
        body: JSON.stringify({ ...payload, ambito }),
      }),
    onSuccess: () => {
      setCambiosPendientes(false);
      queryClient.invalidateQueries({ queryKey: ['reglamento-documento', ambito] });
      toast.success('Reglamento guardado correctamente');
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Error al guardar');
    },
  });

  const ambitoMeta = AMBITOS.find((a) => a.id === ambito) ?? AMBITOS[0];
  const secciones = contenidoLocal?.secciones ?? [];

  const seccionesFiltradas = useMemo(() => {
    if (!searchTerm.trim()) return secciones;
    const term = searchTerm.toLowerCase();
    return secciones.filter((s) => {
      const matchTitulo = s.titulo.toLowerCase().includes(term) || (s.numero ?? '').toLowerCase().includes(term);
      const matchBloques = s.bloques.some((b) => {
        if ('texto' in b && typeof b.texto === 'string') return b.texto.toLowerCase().includes(term);
        if ('items' in b && Array.isArray(b.items)) return b.items.some((i) => i.toLowerCase().includes(term));
        if ('encabezados' in b && Array.isArray(b.encabezados)) {
          return (
            b.encabezados.some((h) => h.toLowerCase().includes(term)) ||
            (b.filas || []).some((f) => f.some((c) => c.toLowerCase().includes(term)))
          );
        }
        return false;
      });
      return matchTitulo || matchBloques;
    });
  }, [secciones, searchTerm]);

  const hojas = useMemo(() => paginarFragmentos(seccionesFiltradas), [seccionesFiltradas]);

  const handleUpdateSeccion = (idx: number, sec: SeccionDoc) => {
    if (!contenidoLocal) return;
    const nuevas = secciones.map((s, i) => (i === idx ? sec : s));
    setContenidoLocal({ ...contenidoLocal, secciones: nuevas });
    setCambiosPendientes(true);
  };

  const handleEliminarSeccion = (idx: number) => {
    if (!contenidoLocal) return;
    const nuevas = secciones.filter((_, i) => i !== idx);
    setContenidoLocal({ ...contenidoLocal, secciones: nuevas });
    setCambiosPendientes(true);
  };

  const handleAgregarCapitulo = () => {
    if (!contenidoLocal) return;
    const nueva = seccionVacia();
    nueva.numero = `Capítulo ${secciones.length}`;
    nueva.titulo = 'Nuevo Capítulo de Reglamento';
    setContenidoLocal({ ...contenidoLocal, secciones: [...secciones, nueva] });
    setCambiosPendientes(true);
  };

  const handleGuardar = () => {
    if (!contenidoLocal || !registro) return;
    const limpio = limpiarContenido(contenidoLocal);
    updateMutation.mutate({
      titulo: registro.titulo,
      descripcion: registro.descripcion,
      contenido: limpio,
      prioridad: registro.prioridad,
    });
  };

  const handleImprimir = () => {
    window.print();
  };

  const canEdit = isEditor || isAdmin;

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 text-muted-foreground">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p className="text-sm font-medium">Cargando Reglamento Oficial U3...</p>
      </div>
    );
  }

  if (error || !registro) {
    return (
      <div className="p-8 text-center bg-card rounded-xl border border-border">
        <p className="text-red-500 font-medium">
          No se pudo cargar el reglamento de {ambitoMeta.etiqueta.toLowerCase()}.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-2 mt-4">
          {AMBITOS.filter((a) => a.id !== ambito).map((a) => (
            <Button key={a.id} variant="outline" onClick={() => cambiarAmbito(a.id)}>
              <BookOpen className="w-4 h-4 mr-2" /> Ver reglamento de {a.etiqueta.toLowerCase()}
            </Button>
          ))}
          <Link href="/">
            <Button variant="outline">
              <ArrowLeft className="w-4 h-4 mr-2" /> Volver al Inicio
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-in fade-in duration-300 pb-16 font-sans">
      {/* Barra superior de herramientas fija y sobria */}
      <div className="bg-card border border-border rounded-xl p-3 sm:p-4 shadow-sm flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 sticky top-2 z-30 backdrop-blur-md bg-card/95 print:hidden">
        <div className="flex items-center gap-3">
          <Link href="/">
            <Button variant="ghost" size="sm" className="h-9 px-2 text-muted-foreground hover:text-foreground">
              <ArrowLeft className="w-4 h-4 mr-1" /> Inicio
            </Button>
          </Link>
          <div className="h-5 w-px bg-border hidden sm:block" />
          <div>
            <h1 className="text-base sm:text-lg font-bold tracking-tight text-foreground flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-primary" /> {registro.titulo}
            </h1>
            <p className="text-xs text-muted-foreground hidden sm:block">
              {secciones.length} capítulos y anexos · Formato Oficial U3 Seguridad Privada
            </p>
          </div>
        </div>

        {/* Selector de reglamento: oficinistas u operativo */}
        <div className="flex items-center gap-1 bg-muted/60 rounded-lg p-1 border border-border self-start md:self-auto">
          {AMBITOS.map((a) => {
            const Icono = a.icono;
            const activo = a.id === ambito;
            return (
              <button
                key={a.id}
                onClick={() => cambiarAmbito(a.id)}
                title={`Ver el reglamento de ${a.etiqueta.toLowerCase()}`}
                className={cn(
                  'flex items-center gap-1.5 px-3 h-8 rounded-md text-xs font-semibold transition-colors',
                  activo
                    ? 'bg-background text-foreground shadow-sm border border-border'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <Icono className="w-3.5 h-3.5" /> {a.etiqueta}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2 justify-end">
          {/* Buscador en vivo */}
          <div className="relative max-w-[200px] sm:max-w-[240px]">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Buscar artículo..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="h-8 pl-8 pr-3 text-xs rounded-lg border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary w-full"
            />
          </div>

          {/* Controles de Zoom */}
          <div className="hidden lg:flex items-center bg-muted/60 rounded-lg p-0.5 border border-border">
            <button
              onClick={() => setZoom((z) => Math.max(0.7, z - 0.1))}
              title="Alejar"
              className="p-1.5 hover:bg-background rounded text-muted-foreground hover:text-foreground"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="text-[11px] font-mono px-2 text-muted-foreground">
              {Math.round(zoom * 100)}%
            </span>
            <button
              onClick={() => setZoom((z) => Math.min(1.4, z + 0.1))}
              title="Acercar"
              className="p-1.5 hover:bg-background rounded text-muted-foreground hover:text-foreground"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setZoom(1)}
              title="Restablecer"
              className="p-1.5 hover:bg-background rounded text-muted-foreground hover:text-foreground border-l border-border"
            >
              <RotateCcw className="w-3 h-3" />
            </button>
          </div>

          {/* Botón Imprimir / PDF */}
          <Button onClick={handleImprimir} variant="outline" size="sm" className="h-8 text-xs">
            <Printer className="w-3.5 h-3.5 mr-1.5" /> Imprimir / PDF
          </Button>

          {/* Guardar cambios (si es editor/admin) */}
          {canEdit && (
            <Button
              onClick={handleGuardar}
              disabled={!cambiosPendientes || updateMutation.isPending}
              size="sm"
              className={cn('h-8 text-xs', cambiosPendientes && 'animate-pulse')}
            >
              {updateMutation.isPending ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Guardando...
                </>
              ) : cambiosPendientes ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5 mr-1.5 text-green-300" /> Guardar Cambios
                </>
              ) : (
                'Guardado'
              )}
            </Button>
          )}
        </div>
      </div>

      {/* Contenedor con Navegación Lateral (Índice) y Hojas de Papel */}
      <div className="flex flex-col xl:flex-row items-start gap-6">
        {/* Índice lateral interactivo */}
        <aside className="w-full xl:w-72 bg-card border border-border rounded-xl p-4 shadow-sm xl:sticky xl:top-20 max-h-[85vh] overflow-y-auto no-scrollbar print:hidden">
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-border">
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <ListOrdered className="w-4 h-4 text-primary" /> Índice del Reglamento
            </span>
            {canEdit && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleAgregarCapitulo}
                className="h-6 text-[11px] px-1.5 text-primary hover:text-primary/80"
              >
                <Plus className="w-3 h-3 mr-0.5" /> Capítulo
              </Button>
            )}
          </div>
          <nav className="space-y-1">
            {secciones.map((sec, idx) => (
              <a
                key={sec.id}
                href={`#${sec.id}`}
                className="block p-2 rounded-lg text-xs hover:bg-muted/70 transition-colors group"
              >
                <div className="font-semibold text-foreground group-hover:text-primary leading-tight">
                  {sec.numero ? `${sec.numero}: ` : ''}{sec.titulo}
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5">
                  {sec.bloques.length} {sec.bloques.length === 1 ? 'bloque' : 'bloques'}
                </div>
              </a>
            ))}
          </nav>
        </aside>

        {/* Visor de Páginas Tamaño Carta */}
        <main className="flex-1 w-full flex flex-col items-center overflow-x-auto pb-12">
          <div
            id="documento-print"
            className="hoja-carta-canvas hoja-zoom transition-transform duration-150 origin-top flex flex-col items-center space-y-8 print:space-y-0"
            style={{ transform: `scale(${zoom})` }}
          >
            {hojas.map((hojaSecciones, hojaIdx) => (
              <div
                key={hojaIdx}
                className={cn(
                  'hoja-carta w-[816px] min-h-[1056px] bg-white text-slate-900 shadow-xl rounded-sm p-12 sm:p-14 relative flex flex-col justify-between border border-slate-200'
                )}
                style={{
                  fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
                }}
              >
                {/* Membrete Oficial Superior */}
                <header className="border-b-2 border-slate-900 pb-3 mb-6 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <img
                      src={COMPANY.logoPublicPath || '/logo_b.png'}
                      alt={COMPANY.razonSocial}
                      className="w-12 h-12 object-contain"
                    />
                    <div>
                      <div className="text-[13px] font-extrabold tracking-wider text-[#0f172a] uppercase">
                        {COMPANY.razonSocial}
                      </div>
                      <div className="text-[10px] text-slate-500 font-medium tracking-tight">
                        Seguridad Patrimonial · Custodia · Control Operativo
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10.5px] font-bold text-blue-900 uppercase tracking-wider">
                      Reglamento Normativo · {ambitoMeta.etiqueta}
                    </div>
                    <div className="text-[9.5px] text-slate-500 font-mono">
                      CÓDIGO: {ambitoMeta.codigo}
                    </div>
                  </div>
                </header>

                {/* Contenido de la hoja */}
                <div className="flex-1 space-y-6">
                  {hojaIdx === 0 && (
                    <div className="text-center pb-4 mb-4 border-b border-slate-200">
                      <h2 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight uppercase">
                        {registro.titulo}
                      </h2>
                      <p className="text-[11.5px] text-slate-600 font-medium mt-1 max-w-xl mx-auto italic">
                        {contenidoLocal?.subtitulo || registro.descripcion}
                      </p>
                    </div>
                  )}

                  {hojaSecciones.map((frag) => {
                    const secOriginalIdx = secciones.findIndex((s) => s.id === frag.seccion.id);
                    return (
                      <SeccionVistaEditable
                        key={`${frag.seccion.id}-${frag.desde}`}
                        seccion={frag.seccion}
                        desde={frag.desde}
                        hasta={frag.hasta}
                        continuacion={frag.continuacion}
                        ultimo={frag.ultimo}
                        onChange={(ns) => handleUpdateSeccion(secOriginalIdx, ns)}
                        onEliminar={() => handleEliminarSeccion(secOriginalIdx)}
                        readOnly={!canEdit}
                      />
                    );
                  })}
                </div>

                {/* Pie de Página Oficial con Foliado */}
                <footer className="border-t border-slate-200 pt-3 mt-8 flex items-start justify-between gap-6 text-[9.5px] text-slate-500 font-sans">
                  <div className="leading-snug min-w-0 flex-1">
                    <span>{COMPANY.razonSocial} · Documento de Control y Régimen Interno</span>
                  </div>
                  <div className="font-mono whitespace-nowrap shrink-0">
                    Página {hojaIdx + 1} de {hojas.length}
                  </div>
                </footer>
              </div>
            ))}
          </div>
        </main>
      </div>
    </div>
  );
}
