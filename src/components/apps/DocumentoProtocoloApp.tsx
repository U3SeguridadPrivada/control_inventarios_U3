'use client';
import { useEffect, useState, useMemo, useRef } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/src/lib/api';
import { Button } from '@/src/components/ui/button';
import { Select } from '@/src/components/ui/select';
import {
  ArrowLeft, Printer, Plus, Trash2, ArrowUp, ArrowDown,
  FileText, ZoomIn, ZoomOut, RotateCcw, Loader2, CheckCircle2
} from 'lucide-react';
import { toast } from 'sonner';
import { COMPANY } from '@/src/lib/company';
import {
  bloqueVacio, ETIQUETA_BLOQUE, limpiarContenido, mover, paginarFragmentos, seccionVacia,
  type Bloque, type ContenidoDoc, type ProtocoloRegistro, type SeccionDoc, type TipoBloque,
} from '@/src/lib/documentoProtocolo';
import { cn } from '@/src/lib/utils';

const NAVY = '#0f172a';
const BLUE = '#1e3a8a';
const ACCENT = '#2563eb';
const TIPOS_BLOQUE: TipoBloque[] = ['parrafo', 'subtitulo', 'lista', 'nota', 'tabla', 'campos', 'firma'];

/**
 * Componente de texto editable directamente en pantalla (Inline ContentEditable).
 * Tipografía Sans-Serif moderna y formal en toda la aplicación.
 */
function EditableText({
  value,
  onChange,
  className,
  style,
  placeholder = 'Escribe aquí...',
  isTitle = false,
}: {
  value: string;
  onChange: (val: string) => void;
  className?: string;
  style?: React.CSSProperties;
  placeholder?: string;
  isTitle?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (ref.current && ref.current.innerText !== value) {
      ref.current.innerText = value;
    }
  }, [value]);

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

/* ------------------------------------------------------------------ vista editable de bloques */

function BloqueVistaEditable({
  bloque,
  onChange,
  onMover,
  onEliminar,
  primero,
  ultimo,
}: {
  bloque: Bloque;
  onChange: (b: Bloque) => void;
  onMover: (delta: number) => void;
  onEliminar: () => void;
  primero: boolean;
  ultimo: boolean;
}) {
  return (
    <div className="group/bloque relative my-2 first:mt-0 font-sans">
      {/* Herramientas sobrias de bloque */}
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

      {bloque.tipo === 'parrafo' && (
        <EditableText
          value={bloque.texto}
          onChange={(texto) => onChange({ ...bloque, texto })}
          className="text-[12px] leading-relaxed text-justify text-slate-700 font-sans"
        />
      )}

      {bloque.tipo === 'subtitulo' && (
        <EditableText
          value={bloque.texto}
          onChange={(texto) => onChange({ ...bloque, texto })}
          className="text-[12.5px] font-bold pt-1.5 pb-0.5 text-[#0f172a] uppercase tracking-wide border-b border-slate-200"
          isTitle
        />
      )}

      {bloque.tipo === 'nota' && (
        <div className="border-l-4 border-blue-600 bg-slate-50 dark:bg-slate-800/40 px-3.5 py-2.5 my-2 text-[11.5px] leading-relaxed text-justify text-slate-700 font-sans">
          <EditableText
            value={bloque.texto}
            onChange={(texto) => onChange({ ...bloque, texto })}
          />
        </div>
      )}

      {bloque.tipo === 'firma' && (
        <div className="pt-10 text-center space-y-1">
          <div className="pt-10 mx-auto w-64 border-t border-slate-400" />
          <EditableText
            value={bloque.texto}
            onChange={(texto) => onChange({ ...bloque, texto })}
            className="text-[11px] font-bold uppercase text-center text-[#0f172a] tracking-wider"
            isTitle
          />
          <p className="text-[10px] text-slate-500 font-medium">{COMPANY.razonSocial}</p>
        </div>
      )}

      {bloque.tipo === 'campos' && (
        <div className="space-y-2 py-1">
          {bloque.items.map((campo, i) => (
            <div key={i} className="flex items-end gap-3 text-[11.5px]">
              <EditableText
                value={campo}
                onChange={(val) => {
                  const nuevos = [...bloque.items];
                  nuevos[i] = val;
                  onChange({ ...bloque, items: nuevos });
                }}
                className="font-bold text-[#0f172a] whitespace-nowrap uppercase text-[10.5px] tracking-wide"
                isTitle
              />
              <span className="flex-1 border-b border-slate-300" />
            </div>
          ))}
        </div>
      )}

      {bloque.tipo === 'tabla' && (
        <div className="my-2 overflow-x-auto">
          <table className="w-full border-collapse text-[11px] font-sans">
            <thead>
              <tr className="bg-[#0f172a] text-white">
                {bloque.encabezados.map((h, i) => (
                  <th key={i} className="border border-slate-700 px-3 py-2 text-left font-bold uppercase text-[9.5px] tracking-wider">
                    <EditableText
                      value={h}
                      onChange={(val) => {
                        const nuevosH = [...bloque.encabezados];
                        nuevosH[i] = val;
                        onChange({ ...bloque, encabezados: nuevosH });
                      }}
                      isTitle
                    />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {bloque.filas.map((fila, i) => (
                <tr key={i} className={i % 2 ? 'bg-slate-50' : 'bg-white'}>
                  {fila.map((celda, j) => (
                    <td key={j} className="border border-slate-200 px-3 py-1.5 align-top text-slate-700 break-words">
                      <EditableText
                        value={celda}
                        onChange={(val) => {
                          const nuevasF = [...bloque.filas];
                          nuevasF[i] = [...nuevasF[i]];
                          nuevasF[i][j] = val;
                          onChange({ ...bloque, filas: nuevasF });
                        }}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {bloque.tipo === 'lista' && (
        <div className="space-y-1">
          {bloque.estilo === 'glosario' ? (
            <ul className="space-y-1 pl-5 list-disc text-[12px] leading-relaxed text-justify font-sans text-slate-700">
              {bloque.items.map((item, i) => (
                <li key={i} className="pl-1">
                  <EditableText
                    value={item}
                    onChange={(val) => {
                      const nuevos = [...bloque.items];
                      nuevos[i] = val;
                      onChange({ ...bloque, items: nuevos });
                    }}
                  />
                </li>
              ))}
            </ul>
          ) : (
            <ol className="space-y-1 pl-5 text-[12px] leading-relaxed text-justify font-sans text-slate-700" style={{ listStyleType: bloque.estilo || 'decimal' }}>
              {bloque.items.map((item, i) => (
                <li key={i} className="pl-1">
                  <EditableText
                    value={item}
                    onChange={(val) => {
                      const nuevos = [...bloque.items];
                      nuevos[i] = val;
                      onChange({ ...bloque, items: nuevos });
                    }}
                  />
                </li>
              ))}
            </ol>
          )}
          <div className="pl-5 pt-0.5 print:hidden">
            <button
              type="button"
              onClick={() => onChange({ ...bloque, items: [...bloque.items, 'Nuevo punto de procedimiento'] })}
              className="text-[10.5px] text-blue-600 hover:text-blue-800 flex items-center gap-1 font-semibold transition-colors"
            >
              <Plus className="w-3 h-3" /> Agregar elemento a la lista
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ vista editable de sección */

function SeccionVistaEditable({
  seccion,
  onChange,
  onMover,
  onEliminar,
  primera,
  ultima,
  desde = 0,
  hasta = seccion.bloques.length,
  continuacion = false,
  ultimoFragmento = true,
}: {
  seccion: SeccionDoc;
  onChange: (s: SeccionDoc) => void;
  onMover: (delta: number) => void;
  onEliminar: () => void;
  primera: boolean;
  ultima: boolean;
  /** Rango de bloques que se pinta en esta hoja; el resto sigue en la siguiente. */
  desde?: number;
  hasta?: number;
  continuacion?: boolean;
  ultimoFragmento?: boolean;
}) {
  const [nuevoTipo, setNuevoTipo] = useState<TipoBloque>('parrafo');

  const updateBloque = (idx: number, b: Bloque) => {
    const nuevos = [...seccion.bloques];
    nuevos[idx] = b;
    onChange({ ...seccion, bloques: nuevos });
  };

  const moverBloque = (idx: number, delta: number) => {
    onChange({ ...seccion, bloques: mover(seccion.bloques, idx, delta) });
  };

  const eliminarBloque = (idx: number) => {
    onChange({ ...seccion, bloques: seccion.bloques.filter((_, i) => i !== idx) });
  };

  const agregarBloque = () => {
    onChange({ ...seccion, bloques: [...seccion.bloques, bloqueVacio(nuevoTipo)] });
  };

  if (seccion.tipo === 'protocolo') {
    return (
      <article className="doc-protocolo group/seccion relative border border-slate-300 rounded-none overflow-hidden my-3 first:mt-0 bg-white shadow-xs font-sans">
        {/* Herramientas de sección */}
        <div className="absolute right-2 top-2 hidden group-hover/seccion:flex items-center gap-1 bg-slate-900 text-white border border-slate-700 shadow-md rounded px-1.5 py-0.5 z-20 print:hidden text-[10px]">
          <button type="button" onClick={() => onMover(-1)} disabled={primera} title="Subir sección" className="p-0.5 hover:text-blue-300 disabled:opacity-30">
            <ArrowUp className="w-3.5 h-3.5" />
          </button>
          <button type="button" onClick={() => onMover(1)} disabled={ultima} title="Bajar sección" className="p-0.5 hover:text-blue-300 disabled:opacity-30">
            <ArrowDown className="w-3.5 h-3.5" />
          </button>
          <button type="button" onClick={onEliminar} title="Eliminar protocolo" className="p-0.5 text-red-400 hover:text-red-300">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Encabezado ejecutivo de protocolo */}
        <header className="px-4 py-2.5 bg-[#0f172a] text-white flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <span className="bg-blue-600 text-white font-mono text-[10.5px] font-bold px-2 py-0.5 rounded-xs shrink-0 tracking-wider">
              <EditableText
                value={seccion.numero}
                onChange={(num) => onChange({ ...seccion, numero: num })}
                className="text-white focus:bg-white/20 hover:bg-white/10"
                isTitle
              />
            </span>
            <EditableText
              value={seccion.titulo}
              onChange={(tit) => onChange({ ...seccion, titulo: tit })}
              className="text-[13px] font-bold text-white truncate uppercase tracking-tight font-sans"
              isTitle
            />
            {continuacion && <span className="text-[10px] italic text-slate-300 shrink-0">continúa</span>}
          </div>
        </header>

        <div className="p-4 space-y-2">
          {seccion.bloques.slice(desde, hasta).map((bloque, n) => {
            const i = desde + n;
            return (
              <BloqueVistaEditable
                key={i}
                bloque={bloque}
                primero={i === 0}
                ultimo={i === seccion.bloques.length - 1}
                onChange={(b) => updateBloque(i, b)}
                onMover={(d) => moverBloque(i, d)}
                onEliminar={() => eliminarBloque(i)}
              />
            );
          })}

          <div className={cn('pt-2 border-t border-slate-200 items-center gap-2 print:hidden', ultimoFragmento ? 'flex' : 'hidden')}>
            <Select value={nuevoTipo} onChange={(e) => setNuevoTipo(e.target.value as TipoBloque)} className="h-7 w-auto text-xs py-0">
              {TIPOS_BLOQUE.map((t) => <option key={t} value={t}>{ETIQUETA_BLOQUE[t]}</option>)}
            </Select>
            <button
              type="button"
              onClick={agregarBloque}
              className="text-xs text-blue-600 hover:text-blue-800 font-bold flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" /> Agregar bloque
            </button>
          </div>
        </div>
      </article>
    );
  }

  return (
    <section className="doc-capitulo group/seccion relative pt-3 first:pt-0 font-sans">
      <div className="absolute right-0 top-2 hidden group-hover/seccion:flex items-center gap-1 bg-slate-900 text-white shadow-md rounded px-1.5 py-0.5 z-20 print:hidden text-[10px]">
        <button type="button" onClick={() => onMover(-1)} disabled={primera} title="Subir capítulo" className="p-0.5 hover:text-blue-300 disabled:opacity-30">
          <ArrowUp className="w-3.5 h-3.5" />
        </button>
        <button type="button" onClick={() => onMover(1)} disabled={ultima} title="Bajar capítulo" className="p-0.5 hover:text-blue-300 disabled:opacity-30">
          <ArrowDown className="w-3.5 h-3.5" />
        </button>
        <button type="button" onClick={onEliminar} title="Eliminar capítulo" className="p-0.5 text-red-400 hover:text-red-300">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Encabezado ejecutivo de capítulo */}
      <div className="border-l-4 border-[#1e3a8a] pl-3.5 py-1 mb-3 bg-slate-50 border-t border-r border-b border-slate-200">
        <EditableText
          value={seccion.numero}
          onChange={(num) => onChange({ ...seccion, numero: num })}
          className="text-[10px] font-extrabold tracking-widest uppercase text-blue-800 font-mono"
          isTitle
        />
        <EditableText
          value={seccion.titulo}
          onChange={(tit) => onChange({ ...seccion, titulo: tit })}
          className="text-base font-extrabold uppercase tracking-tight text-[#0f172a]"
          isTitle
        />
        {continuacion && <span className="text-[10px] italic text-slate-500">continúa</span>}
      </div>

      <div className="space-y-2">
        {seccion.bloques.slice(desde, hasta).map((bloque, n) => {
          const i = desde + n;
          return (
            <BloqueVistaEditable
              key={i}
              bloque={bloque}
              primero={i === 0}
              ultimo={i === seccion.bloques.length - 1}
              onChange={(b) => updateBloque(i, b)}
              onMover={(d) => moverBloque(i, d)}
              onEliminar={() => eliminarBloque(i)}
            />
          );
        })}

        <div className={cn('pt-2 border-t border-slate-200 items-center gap-2 print:hidden', ultimoFragmento ? 'flex' : 'hidden')}>
          <Select value={nuevoTipo} onChange={(e) => setNuevoTipo(e.target.value as TipoBloque)} className="h-7 w-auto text-xs py-0">
            {TIPOS_BLOQUE.map((t) => <option key={t} value={t}>{ETIQUETA_BLOQUE[t]}</option>)}
          </Select>
          <button
            type="button"
            onClick={agregarBloque}
            className="text-xs text-blue-600 hover:text-blue-800 font-bold flex items-center gap-1"
          >
            <Plus className="w-3.5 h-3.5" /> Agregar bloque
          </button>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ pantalla principal */

export default function DocumentoProtocoloApp({ protocoloId }: { protocoloId: number }) {
  const queryClient = useQueryClient();
  const [titulo, setTitulo] = useState('');
  const [contenido, setContenido] = useState<ContenidoDoc>({ version: '1.0', secciones: [] });
  const [zoom, setZoom] = useState(100);
  const [guardandoState, setGuardandoState] = useState<'guardado' | 'guardando' | 'error'>('guardado');
  const [dirty, setDirty] = useState(false);

  const { data: protocolo, isLoading } = useQuery({
    queryKey: ['protocolo', protocoloId],
    queryFn: () => apiFetch<ProtocoloRegistro>(`/api/protocolos/${protocoloId}`),
  });

  useEffect(() => {
    if (protocolo) {
      setTitulo(protocolo.titulo);
      setContenido(protocolo.contenido ?? { version: '1.0', secciones: [] });
    }
  }, [protocolo]);

  const guardarMutation = useMutation({
    mutationFn: (payload: any) => apiFetch(`/api/protocolos/${protocoloId}`, { method: 'PUT', body: JSON.stringify(payload) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['protocolo', protocoloId] });
      queryClient.invalidateQueries({ queryKey: ['protocolos'] });
      setGuardandoState('guardado');
      setDirty(false);
    },
    onError: (e: Error) => {
      setGuardandoState('error');
      toast.error('Error al guardar: ' + e.message);
    },
  });

  // Este visor sirve tanto el manual de planteles escolares como los reglamentos
  // internos, asi que el membrete sale del propio documento y solo cae en los
  // textos escolares cuando el documento realmente lo es.
  const docMeta = useMemo(() => {
    const escolar =
      Boolean(contenido.nivelEducativo) ||
      /escolar|plantel|primaria|educativ/i.test(`${titulo} ${protocolo?.descripcion ?? ''}`);

    return {
      escolar,
      area: contenido.area ?? (escolar ? 'Dirección de Operaciones · Seguridad Escolar' : 'Dirección de Operaciones · Documentación Normativa'),
      codigo: contenido.codigo ?? (escolar ? 'MAN-U3-ESC-PRIM-2026' : `U3-DOC-${protocoloId}-2026`),
      clasificacion: contenido.clasificacion ?? (escolar ? 'Documento Operativo' : 'Documento Normativo'),
      pie: escolar ? 'Documento Operativo de Seguridad Escolar' : 'Documento Normativo Institucional',
      etiquetaAlcance: escolar ? 'Nivel Educativo' : 'Ámbito de Aplicación',
    };
  }, [contenido.nivelEducativo, contenido.area, contenido.codigo, contenido.clasificacion, titulo, protocolo?.descripcion, protocoloId]);

  // Auto-guardado en segundo plano
  useEffect(() => {
    if (!protocolo || !dirty) return;
    setGuardandoState('guardando');
    const timer = setTimeout(() => {
      guardarMutation.mutate({
        titulo,
        categoria: protocolo.categoria,
        descripcion: protocolo.descripcion,
        prioridad: protocolo.prioridad,
        activo: protocolo.activo === 1,
        tipo: 'documento',
        pasos: [],
        contenido: limpiarContenido(contenido),
      });
    }, 1000);
    return () => clearTimeout(timer);
  }, [contenido, titulo, dirty]);

  const secciones = contenido.secciones;
  const fecha = new Date(protocolo?.actualizado_en ?? Date.now()).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });

  const hojasSecciones = useMemo(() => paginarFragmentos(secciones), [secciones]);
  // El indice ocupa una hoja; solo se parte en dos cuando el documento es largo.
  const SECCIONES_POR_INDICE = 16;
  const indicePartido = secciones.length > SECCIONES_POR_INDICE;
  const hojasPreliminares = indicePartido ? 3 : 2; // portada + hoja(s) de indice
  const totalHojas = hojasPreliminares + hojasSecciones.length;

  const updateSeccion = (idx: number, newSec: SeccionDoc) => {
    const nuevas = [...secciones];
    nuevas[idx] = newSec;
    setContenido({ ...contenido, secciones: nuevas });
    setDirty(true);
  };

  const moverSeccion = (idx: number, delta: number) => {
    setContenido({ ...contenido, secciones: mover(secciones, idx, delta) });
    setDirty(true);
  };

  const eliminarSeccion = (idx: number) => {
    if (confirm(`¿Eliminar esta sección?`)) {
      setContenido({ ...contenido, secciones: secciones.filter((_, i) => i !== idx) });
      setDirty(true);
    }
  };

  const agregarSeccion = () => {
    setContenido({ ...contenido, secciones: [...secciones, seccionVacia()] });
    setDirty(true);
  };

  if (isLoading) return <div className="p-8 text-center text-slate-500 font-sans">Cargando documento...</div>;
  if (!protocolo) return <div className="p-8 text-center text-slate-500 font-sans font-medium">Protocolo no encontrado.</div>;

  return (
    <div className="space-y-5 font-sans">
      {/* Estilos globales para impresión oficial en hoja Carta (8.5in x 11in) */}
      <style>{`
        @media print {
          @page {
            size: letter portrait;
            margin: 0;
          }
          body {
            background: white !important;
            color: black !important;
            font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif !important;
          }
          .print\\:hidden, nav, header, sidebar, footer {
            display: none !important;
          }
          .hoja-carta-canvas {
            padding: 0 !important;
            background: transparent !important;
            border: none !important;
            box-shadow: none !important;
          }
          .hoja-carta {
            width: 100% !important;
            height: 278mm !important;
            min-height: 278mm !important;
            max-width: none !important;
            box-shadow: none !important;
            border: none !important;
            border-radius: 0 !important;
            padding: 14mm 16mm !important;
            margin: 0 !important;
            page-break-after: always !important;
            break-after: page !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            transform: none !important;
          }
          .hoja-carta:last-child {
            page-break-after: auto !important;
            break-after: auto !important;
          }
          .hoja-zoom {
            transform: none !important;
            transform-origin: top left !important;
          }
        }
      `}</style>

      {/* Barra superior ejecutiva */}
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-lg p-3.5 shadow-sm font-sans">
        <Link href="/protocolos" className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-slate-900">
          <ArrowLeft className="w-3.5 h-3.5" /> Volver a Protocolos
        </Link>

        {/* Estado de Auto-Guardado */}
        <div className="flex items-center gap-2 text-xs">
          {guardandoState === 'guardando' ? (
            <span className="inline-flex items-center gap-1.5 text-amber-700 bg-amber-50 px-3 py-1 rounded-full font-semibold">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Guardando cambios en la base de datos...
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-emerald-800 bg-emerald-50 px-3 py-1 rounded-full font-semibold">
              <CheckCircle2 className="w-3.5 h-3.5" /> Edición directa activa · Cambios guardados
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Controles de Zoom */}
          <div className="hidden sm:flex items-center gap-1 bg-slate-100 dark:bg-slate-800 px-2 py-1 border border-slate-300 text-xs text-slate-700 rounded-md">
            <button
              onClick={() => setZoom((z) => Math.max(60, z - 10))}
              title="Disminuir zoom"
              className="p-0.5 hover:bg-slate-200 rounded"
            >
              <ZoomOut className="w-3 h-3" />
            </button>
            <span className="w-10 text-center font-mono font-bold text-[11px]">{zoom}%</span>
            <button
              onClick={() => setZoom((z) => Math.min(130, z + 10))}
              title="Aumentar zoom"
              className="p-0.5 hover:bg-slate-200 rounded"
            >
              <ZoomIn className="w-3 h-3" />
            </button>
            {zoom !== 100 && (
              <button
                onClick={() => setZoom(100)}
                title="100%"
                className="p-0.5 hover:bg-slate-200 text-blue-600 ml-0.5 font-bold"
              >
                <RotateCcw className="w-3 h-3" />
              </button>
            )}
          </div>

          <Button size="sm" onClick={() => window.print()} className="bg-[#0f172a] hover:bg-slate-800 text-white font-bold text-xs rounded-md">
            <Printer className="w-3.5 h-3.5 mr-1.5" /> Imprimir / PDF
          </Button>
        </div>
      </div>

      {/* Visualizador de Hojas Carta Editables Directamente */}
      <div id="documento-print" className="hoja-carta-canvas bg-slate-200 dark:bg-slate-950 p-2 sm:p-6 space-y-6 overflow-x-auto font-sans">
        <div className="print:hidden flex items-center justify-between max-w-[816px] mx-auto text-xs text-slate-600 dark:text-slate-400 px-1 font-sans">
          <span className="font-semibold flex items-center gap-1.5">
            <FileText className="w-4 h-4 text-blue-600" /> Edición directa activa sobre la hoja · Haz clic en cualquier texto para modificarlo
          </span>
          <span className="bg-white border border-slate-300 px-2.5 py-0.5 font-mono font-bold text-[11px] rounded-xs shadow-xs">
            {totalHojas} Hojas Totales
          </span>
        </div>

        <div
          style={{ transform: `scale(${zoom / 100})`, transformOrigin: 'top center' }}
          className="hoja-zoom space-y-8 transition-transform duration-150"
        >
          {/* HOJA 1: PORTADA EJECUTIVA MODERNA FORMAL */}
          <div
            className="hoja-carta mx-auto bg-white text-slate-900 border border-slate-300 rounded-none p-12 sm:p-16 flex flex-col justify-between shadow-xl"
            style={{ width: '816px', minHeight: '1056px', maxWidth: '100%' }}
          >
            {/* Header Superior Corporativo */}
            <div className="bg-[#0f172a] text-white -mx-12 -mt-12 sm:-mx-16 sm:-mt-16 px-8 py-5 flex items-center justify-between mb-8">
              <div className="flex items-center gap-3">
                <img src={COMPANY.logoPublicPath} alt="U3" className="w-10 h-10 object-contain bg-white p-1 rounded" />
                <div>
                  <p className="text-[12px] font-extrabold uppercase tracking-widest">{COMPANY.razonSocial}</p>
                  <p className="text-[9.5px] text-slate-300 uppercase tracking-wider font-semibold">{docMeta.area}</p>
                </div>
              </div>
              <span className="bg-blue-600 text-white font-mono text-[9.5px] font-bold px-2.5 py-1 uppercase tracking-wider rounded-xs">
                {docMeta.codigo}
              </span>
            </div>

            {/* Cuerpo Principal de Portada */}
            <div className="my-auto py-6 space-y-8">
              <div className="space-y-4 max-w-xl">
                <div className="border-l-4 border-[#1e3a8a] pl-4 py-1">
                  <span className="text-[11px] font-extrabold uppercase tracking-widest text-blue-800 font-mono">DOCUMENTO RECTOR OFICIAL</span>
                  <EditableText
                    value={titulo}
                    onChange={(val) => { setTitulo(val); setDirty(true); }}
                    className="text-2xl sm:text-3xl font-extrabold uppercase leading-tight text-[#0f172a] tracking-tight mt-1"
                    isTitle
                  />
                </div>
                
                <EditableText
                  value={contenido.subtitulo ?? ''}
                  onChange={(val) => { setContenido({ ...contenido, subtitulo: val }); setDirty(true); }}
                  placeholder="Escribe el subtítulo institucional..."
                  className="text-[13px] text-slate-600 leading-relaxed font-medium pl-4"
                />
              </div>

              {/* Ficha Técnica Corporativa Estructurada */}
              <div className="max-w-lg border border-slate-200 bg-slate-50 p-5 rounded-none font-sans space-y-3">
                <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 border-b border-slate-200 pb-1.5">
                  Control Documental Institucional
                </p>
                <div className="grid grid-cols-2 gap-3 text-[11px]">
                  <div>
                    <span className="text-slate-500 text-[10px] uppercase font-bold block">{docMeta.etiquetaAlcance}</span>
                    <EditableText
                      value={(docMeta.escolar ? contenido.nivelEducativo : contenido.alcance) ?? ''}
                      onChange={(val) => {
                        setContenido(docMeta.escolar
                          ? { ...contenido, nivelEducativo: val }
                          : { ...contenido, alcance: val });
                        setDirty(true);
                      }}
                      placeholder="Escribe a quién aplica..."
                      className="font-bold text-[#0f172a]"
                      isTitle
                    />
                  </div>
                  <div>
                    <span className="text-slate-500 text-[10px] uppercase font-bold block">Versión Oficial</span>
                    <EditableText
                      value={contenido.version}
                      onChange={(val) => { setContenido({ ...contenido, version: val }); setDirty(true); }}
                      className="font-mono font-bold text-[#0f172a]"
                      isTitle
                    />
                  </div>
                  <div>
                    <span className="text-slate-500 text-[10px] uppercase font-bold block">Fecha de Emisión</span>
                    <span className="font-bold text-slate-800">{fecha}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 text-[10px] uppercase font-bold block">Clasificación</span>
                    <span className="font-bold text-slate-800 text-[10.5px] uppercase">{docMeta.clasificacion}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Pie de Portada */}
            <div className="border-t-2 border-[#0f172a] pt-3 flex items-start justify-between gap-6 text-[10px] text-slate-600 font-sans">
              <span className="font-bold leading-snug min-w-0 flex-1">{COMPANY.razonSocial} · {COMPANY.domicilio}</span>
              <span className="font-mono font-bold whitespace-nowrap shrink-0">Hoja 1 de {totalHojas}</span>
            </div>
          </div>

          {/* HOJA 2: ÍNDICE GENERAL (PARTE I) */}
          <div
            className="hoja-carta mx-auto bg-white text-slate-900 border border-slate-300 rounded-none p-10 sm:p-14 flex flex-col justify-between shadow-xl"
            style={{ width: '816px', minHeight: '1056px', maxWidth: '100%' }}
          >
            <div className="border-b-2 border-[#1e3a8a] pb-2.5 flex items-center justify-between text-[10px] text-slate-600 font-sans tracking-wider uppercase">
              <span className="font-extrabold text-[#0f172a]">{COMPANY.razonSocial}</span>
              <span className="font-semibold">Índice General{indicePartido ? ' · Parte I' : ''}</span>
            </div>

            <div className="my-auto py-2 space-y-3 font-sans">
              <div className="border-b border-slate-200 pb-2">
                <h2 className="text-lg font-extrabold uppercase tracking-tight text-[#0f172a]">Índice de Contenido{indicePartido ? ' (1 / 2)' : ''}</h2>
                <p className="text-[11px] text-slate-500">{indicePartido ? 'Capítulos Marco y Protocolos de Contingencia V.1 a V.10' : 'Capítulos y anexos del documento'}</p>
              </div>

              <div className="space-y-1 text-[11.5px] leading-relaxed">
                {secciones.slice(0, SECCIONES_POR_INDICE).map((seccion) => {
                  const pageNum = hojasPreliminares + 1 + hojasSecciones.findIndex((h) => h.some((x) => x.seccion.id === seccion.id));
                  const isCapitulo = seccion.tipo === 'capitulo';
                  return (
                    <div
                      key={seccion.id}
                      className={cn(
                        'py-1.5 border-b border-slate-100 flex items-baseline justify-between',
                        isCapitulo ? 'font-extrabold text-[#0f172a] pt-3.5 text-[12px] uppercase' : 'text-slate-700 pl-4 font-medium'
                      )}
                    >
                      <div className="flex items-baseline gap-2 min-w-0 pr-4">
                        {seccion.numero && (
                          <span className="font-mono text-blue-800 font-bold shrink-0 text-[11px]">{seccion.numero}</span>
                        )}
                        <span className="break-words">{seccion.titulo}</span>
                      </div>
                      <span className="font-mono text-[10.5px] font-bold text-slate-500 shrink-0 whitespace-nowrap">
                        Pág. {pageNum > hojasPreliminares ? pageNum : hojasPreliminares + 1}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="border-t border-slate-300 pt-2.5 flex items-center justify-between text-[9.5px] text-slate-600 font-sans">
              <span className="font-bold">{COMPANY.razonSocial}</span>
              <span className="font-mono font-bold">Hoja 2 de {totalHojas}</span>
            </div>
          </div>

          {/* HOJA 3: ÍNDICE GENERAL (PARTE II), solo en documentos largos */}
          {indicePartido && (
            <div
              className="hoja-carta mx-auto bg-white text-slate-900 border border-slate-300 rounded-none p-10 sm:p-14 flex flex-col justify-between shadow-xl"
              style={{ width: '816px', minHeight: '1056px', maxWidth: '100%' }}
            >
              <div className="border-b-2 border-[#1e3a8a] pb-2.5 flex items-center justify-between text-[10px] text-slate-600 font-sans tracking-wider uppercase">
                <span className="font-extrabold text-[#0f172a]">{COMPANY.razonSocial}</span>
                <span className="font-semibold">Índice General · Parte II</span>
              </div>
  
              <div className="my-auto py-2 space-y-3 font-sans">
                <div className="border-b border-slate-200 pb-2">
                  <h2 className="text-lg font-extrabold uppercase tracking-tight text-[#0f172a]">Índice de Contenido (2 / 2)</h2>
                  <p className="text-[11px] text-slate-500">Protocolos V.11 a V.21, Directorio, Señalización y Anexos</p>
                </div>
  
                <div className="space-y-1 text-[11.5px] leading-relaxed">
                  {secciones.slice(SECCIONES_POR_INDICE).map((seccion) => {
                    const pageNum = hojasPreliminares + 1 + hojasSecciones.findIndex((h) => h.some((x) => x.seccion.id === seccion.id));
                    const isCapitulo = seccion.tipo === 'capitulo';
                    return (
                      <div
                        key={seccion.id}
                        className={cn(
                          'py-1.5 border-b border-slate-100 flex items-baseline justify-between',
                          isCapitulo ? 'font-extrabold text-[#0f172a] pt-3.5 text-[12px] uppercase' : 'text-slate-700 pl-4 font-medium'
                        )}
                      >
                        <div className="flex items-baseline gap-2 min-w-0 pr-4">
                          {seccion.numero && (
                            <span className="font-mono text-blue-800 font-bold shrink-0 text-[11px]">{seccion.numero}</span>
                          )}
                          <span className="break-words">{seccion.titulo}</span>
                        </div>
                        <span className="font-mono text-[10.5px] font-bold text-slate-500 shrink-0 whitespace-nowrap">
                          Pág. {pageNum > hojasPreliminares ? pageNum : hojasPreliminares + 1}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
  
              <div className="border-t border-slate-300 pt-2.5 flex items-center justify-between text-[9.5px] text-slate-600 font-sans">
                <span className="font-bold">{COMPANY.razonSocial}</span>
                <span className="font-mono font-bold">Hoja 3 de {totalHojas}</span>
              </div>
            </div>
          )}

          {/* HOJAS 4 EN ADELANTE: SECCIONES DEL MANUAL */}
          {hojasSecciones.map((hojaSecs, idx) => {
            const numHoja = hojasPreliminares + 1 + idx;
            return (
              <div
                key={idx}
                className="hoja-carta mx-auto bg-white text-slate-900 border border-slate-300 rounded-none p-10 sm:p-14 flex flex-col justify-between shadow-xl"
                style={{ width: '816px', minHeight: '1056px', maxWidth: '100%' }}
              >
                {/* Encabezado superior de hoja */}
                <div className="border-b-2 border-[#1e3a8a] pb-2 mb-4 flex items-center justify-between text-[9.5px] text-slate-600 font-sans tracking-wider uppercase">
                  <span className="font-extrabold text-[#0f172a]">{COMPANY.razonSocial}</span>
                  <span className="truncate max-w-[340px] font-semibold text-slate-600">{titulo}</span>
                </div>

                {/* Contenido de las secciones asignadas a esta hoja */}
                <div className="flex-1 space-y-4">
                  {hojaSecs.map((frag) => {
                    const secIdx = secciones.findIndex((s) => s.id === frag.seccion.id);
                    return (
                      <SeccionVistaEditable
                        key={`${frag.seccion.id}-${frag.desde}`}
                        seccion={frag.seccion}
                        desde={frag.desde}
                        hasta={frag.hasta}
                        continuacion={frag.continuacion}
                        ultimoFragmento={frag.ultimo}
                        primera={secIdx === 0}
                        ultima={secIdx === secciones.length - 1}
                        onChange={(s) => updateSeccion(secIdx, s)}
                        onMover={(d) => moverSeccion(secIdx, d)}
                        onEliminar={() => eliminarSeccion(secIdx)}
                      />
                    );
                  })}
                </div>

                {/* Pie de página inferior de hoja */}
                <div className="border-t border-slate-300 pt-2.5 mt-6 flex items-start justify-between gap-6 text-[9.5px] text-slate-600 font-sans">
                  <span className="leading-snug min-w-0 flex-1">{docMeta.pie} · {COMPANY.razonSocial}</span>
                  <span className="font-mono font-bold whitespace-nowrap shrink-0">Hoja {numHoja} de {totalHojas}</span>
                </div>
              </div>
            );
          })}

          {/* Botón ejecuivo para agregar nueva sección */}
          <div className="max-w-[816px] mx-auto text-center pt-2 print:hidden font-sans">
            <Button onClick={agregarSeccion} variant="outline" className="bg-white border-slate-300 text-slate-800 hover:bg-slate-50 text-xs font-bold rounded-md">
              <Plus className="w-3.5 h-3.5 mr-1.5" /> Agregar Nueva Sección / Capítulo
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
