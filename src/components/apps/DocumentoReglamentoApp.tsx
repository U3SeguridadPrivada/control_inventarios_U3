'use client';
import { useEffect, useState, useMemo, useRef, useLayoutEffect } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/src/lib/api';
import { Button } from '@/src/components/ui/button';
import { Select } from '@/src/components/ui/select';
import { Dialog, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/src/components/ui/dialog';
import {
  ArrowLeft, Printer, Plus, Trash2, ArrowUp, ArrowDown,
  ZoomIn, ZoomOut, RotateCcw, Loader2, CheckCircle2,
  BookOpen, Search, ShieldCheck, ListOrdered, Building2, Pencil, Eye, X,
  Timer, Undo2, Redo2, FilePlus2, Scissors, Copy, ChevronRight, AlertTriangle,
} from 'lucide-react';
import { toast } from 'sonner';
import DOMPurify from 'isomorphic-dompurify';
import { COMPANY } from '@/src/lib/company';
import {
  bloqueVacio, ETIQUETA_BLOQUE, limpiarContenido, mover, paginarFragmentos, seccionVacia,
  ALTO_HOJA, ANCHO_HOJA, ANCHO_CONTENIDO, MARGEN_HOJA, ALTO_UTIL_HOJA,
  type Bloque, type ContenidoDoc, type EstiloLista, type MedidasDoc, type ProtocoloRegistro,
  type SeccionDoc, type TipoBloque,
} from '@/src/lib/documentoProtocolo';
import { cn } from '@/src/lib/utils';
import { useAuth } from '@/src/context/AuthContext';
import BarraFormatoFlotante from '@/src/components/reglamento/BarraFormatoFlotante';

const TIPOS_BLOQUE: TipoBloque[] = ['parrafo', 'subtitulo', 'lista', 'nota', 'tabla', 'campos', 'firma', 'salto'];

const ESTILOS_LISTA: { id: EstiloLista; etiqueta: string }[] = [
  { id: 'decimal', etiqueta: '1. 2. 3.' },
  { id: 'lower-alpha', etiqueta: 'a) b) c)' },
  { id: 'upper-roman', etiqueta: 'I. II. III.' },
  { id: 'glosario', etiqueta: 'Glosario (Término: definición)' },
  { id: 'none', etiqueta: 'Sin numeración' },
];

// U3 tiene dos reglamentos distintos: el del personal de escritorio y el del
// personal operativo en servicio. Cada uno es un registro propio en la API.
export type AmbitoReglamento = 'oficinas' | 'guardias';

const AMBITOS: { id: AmbitoReglamento; etiqueta: string; corta: string; codigo: string; icono: typeof BookOpen }[] = [
  { id: 'oficinas', etiqueta: 'Oficinistas', corta: 'Corporativo', codigo: 'U3-REG-OFI-2026-V1', icono: Building2 },
  { id: 'guardias', etiqueta: 'Guardias', corta: 'Guardias', codigo: 'U3-REG-OPE-2026-V1', icono: ShieldCheck },
];

/**
 * Texto editable en la propia hoja con soporte de formato enriquecido
 * (negritas, subrayado, cursivas, tamaño, color y resaltado).
 */
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
    const el = ref.current;
    if (!el) return;
    if (document.activeElement === el) return;
    if (el.innerHTML !== value) {
      el.innerHTML = value || '';
    }
  }, [value]);

  if (readOnly) {
    return (
      <div
        className={cn('min-w-[20px] font-sans', className)}
        style={style}
        dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(value || '') }}
      />
    );
  }

  const confirmar = () => {
    // Normalizamos el contenido HTML quitando <br> huérfano al final
    const rawHtml = ref.current?.innerHTML ?? '';
    const limpio = rawHtml.replace(/<br\s*\/?>$/i, '').trim();
    if (limpio !== value) onChange(limpio);
  };

  const estaVacio = (value || '').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim() === '';

  return (
    <div
      ref={ref}
      contentEditable
      suppressContentEditableWarning
      data-placeholder={placeholder}
      data-vacio={estaVacio ? 'si' : 'no'}
      onInput={confirmar}
      onBlur={confirmar}
      onKeyDown={(e) => {
        if (isTitle && e.key === 'Enter') {
          e.preventDefault();
          ref.current?.blur();
        } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'u') {
          e.preventDefault();
          document.execCommand('underline', false);
          confirmar();
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

/** Punto de inserción entre dos bloques: elige el tipo y lo mete justo ahí. */
function BarraInsertar({
  onInsertar,
  etiqueta = 'Insertar aquí',
}: {
  onInsertar: (tipo: TipoBloque) => void;
  etiqueta?: string;
}) {
  const [tipo, setTipo] = useState<TipoBloque>('parrafo');

  return (
    <div className="group/insertar my-1 flex items-center gap-2 opacity-45 hover:opacity-100 transition-opacity print:hidden">
      <div className="h-px flex-1 bg-slate-300" />
      <Select
        value={tipo}
        onChange={(e) => setTipo(e.target.value as TipoBloque)}
        className="h-6 w-40 text-[10.5px] py-0 px-2 bg-white text-slate-700 border-slate-300"
      >
        {TIPOS_BLOQUE.map((t) => (
          <option key={t} value={t}>
            {ETIQUETA_BLOQUE[t]}
          </option>
        ))}
      </Select>
      <button
        type="button"
        onClick={() => onInsertar(tipo)}
        title={etiqueta}
        className="flex items-center gap-1 h-6 px-2 rounded border border-slate-300 bg-white text-[10.5px] font-semibold text-blue-700 hover:bg-blue-50 hover:border-blue-400"
      >
        <Plus className="w-3 h-3" /> {etiqueta}
      </button>
      <div className="h-px flex-1 bg-slate-300" />
    </div>
  );
}

/* --------------------------------------------------------- confirmaciones */

interface Confirmacion {
  titulo: string;
  mensaje: string;
  /** Lo que se va a perder, enumerado para que la decisión sea informada. */
  detalle?: string[];
  etiqueta: string;
  nota?: string;
  peligro?: boolean;
  onConfirmar: () => void;
}

/**
 * Reemplaza al `confirm()` del navegador, que se presenta como «localhost:3000
 * dice» y no dice de qué documento habla. Este avisa con el lenguaje y la
 * identidad de la suite, y enumera lo que se va a perder.
 */
function DialogoConfirmar({ datos, onCerrar }: { datos: Confirmacion; onCerrar: () => void }) {
  const botonRef = useRef<HTMLButtonElement>(null);

  // El foco arranca en Cancelar: si la acción borra, la tecla Enter no debe
  // confirmarla por inercia.
  useEffect(() => {
    botonRef.current?.focus();
  }, []);

  const confirmar = () => {
    datos.onConfirmar();
    onCerrar();
  };

  const Icono = datos.peligro ? Trash2 : AlertTriangle;

  return (
    <Dialog open onOpenChange={(abierto) => !abierto && onCerrar()} className="max-w-md">
      <div className="p-5 sm:p-6 space-y-4">
        <DialogHeader>
          <div className="flex items-start gap-3 text-left">
            <div
              className={cn(
                'w-10 h-10 rounded-xl flex items-center justify-center shrink-0',
                datos.peligro ? 'bg-destructive/10 text-destructive' : 'bg-amber-500/10 text-amber-600'
              )}
            >
              <Icono className="w-5 h-5" />
            </div>
            <div className="min-w-0 space-y-1">
              <DialogTitle>{datos.titulo}</DialogTitle>
              <DialogDescription>{datos.mensaje}</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {!!datos.detalle?.length && (
          <ul className="rounded-lg border border-border bg-muted/40 px-3 py-2 space-y-1 max-h-40 overflow-y-auto">
            {datos.detalle.map((linea, i) => (
              <li key={i} className="text-xs text-muted-foreground flex gap-2">
                <span className="text-muted-foreground/50">·</span>
                <span className="min-w-0">{linea}</span>
              </li>
            ))}
          </ul>
        )}

        {datos.nota && (
          <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
            <Undo2 className="w-3.5 h-3.5 shrink-0" /> {datos.nota}
          </p>
        )}

        <DialogFooter>
          <Button ref={botonRef} variant="outline" size="sm" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button
            variant={datos.peligro ? 'destructive' : 'default'}
            size="sm"
            onClick={confirmar}
          >
            {datos.etiqueta}
          </Button>
        </DialogFooter>
      </div>
    </Dialog>
  );
}

/* ------------------------------------------------------------ menú contextual */

interface OpcionMenu {
  id: string;
  etiqueta: string;
  icono?: React.ComponentType<{ className?: string }>;
  atajo?: string;
  peligro?: boolean;
  deshabilitado?: boolean;
  onClick?: () => void;
  submenu?: OpcionMenu[];
}

interface GrupoMenu {
  titulo?: string;
  opciones: OpcionMenu[];
}

/**
 * Menú del botón derecho sobre el documento. Se arma según dónde se hizo clic
 * (hoja, capítulo o bloque). Con Shift+clic derecho sale el menú del navegador,
 * que es el que hace falta para pegar o revisar la ortografía.
 */
function MenuContextual({
  x,
  y,
  grupos,
  onCerrar,
}: {
  x: number;
  y: number;
  grupos: GrupoMenu[];
  onCerrar: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x, y });
  const [submenuAbierto, setSubmenuAbierto] = useState<string | null>(null);

  // El menú nunca debe salirse de la ventana.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const caja = el.getBoundingClientRect();
    setPos({
      x: Math.max(8, Math.min(x, window.innerWidth - caja.width - 8)),
      y: Math.max(8, Math.min(y, window.innerHeight - caja.height - 8)),
    });
  }, [x, y, grupos]);

  useEffect(() => {
    const alTeclado = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCerrar();
    };
    window.addEventListener('click', onCerrar);
    window.addEventListener('resize', onCerrar);
    window.addEventListener('scroll', onCerrar, true);
    window.addEventListener('keydown', alTeclado);
    return () => {
      window.removeEventListener('click', onCerrar);
      window.removeEventListener('resize', onCerrar);
      window.removeEventListener('scroll', onCerrar, true);
      window.removeEventListener('keydown', alTeclado);
    };
  }, [onCerrar]);

  const pintarOpcion = (op: OpcionMenu) => {
    const Icono = op.icono;
    const tieneSubmenu = !!op.submenu?.length;
    return (
      <div
        key={op.id}
        className="relative"
        onMouseEnter={() => setSubmenuAbierto(tieneSubmenu ? op.id : null)}
      >
        <button
          type="button"
          disabled={op.deshabilitado}
          onClick={() => {
            if (tieneSubmenu) return;
            op.onClick?.();
            onCerrar();
          }}
          className={cn(
            'w-full flex items-center gap-2 px-2.5 py-1.5 text-[12px] rounded-md text-left transition-colors',
            op.deshabilitado
              ? 'text-slate-300 cursor-default'
              : op.peligro
                ? 'text-red-600 hover:bg-red-50'
                : 'text-slate-700 hover:bg-slate-100'
          )}
        >
          {Icono && <Icono className="w-3.5 h-3.5 shrink-0" />}
          <span className="flex-1 whitespace-nowrap">{op.etiqueta}</span>
          {op.atajo && <span className="text-[10px] font-mono text-slate-400 shrink-0">{op.atajo}</span>}
          {tieneSubmenu && <ChevronRight className="w-3.5 h-3.5 shrink-0 text-slate-400" />}
        </button>

        {tieneSubmenu && submenuAbierto === op.id && (
          <div className="absolute left-full top-0 -ml-1 bg-white border border-slate-200 rounded-lg shadow-xl p-1 min-w-[190px] z-10">
            {op.submenu!.map((sub) => (
              <button
                key={sub.id}
                type="button"
                onClick={() => {
                  sub.onClick?.();
                  onCerrar();
                }}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 text-[12px] rounded-md text-left text-slate-700 hover:bg-slate-100 whitespace-nowrap"
              >
                {sub.icono && <sub.icono className="w-3.5 h-3.5 shrink-0" />}
                {sub.etiqueta}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div
      ref={ref}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
      className="fixed z-[100] bg-white border border-slate-200 rounded-lg shadow-2xl p-1 min-w-[230px] print:hidden animate-in fade-in zoom-in-95 duration-100"
      style={{ left: pos.x, top: pos.y }}
    >
      {grupos.map((grupo, i) => (
        <div key={i}>
          {i > 0 && <div className="my-1 h-px bg-slate-200" />}
          {grupo.titulo && (
            <div className="px-2.5 pt-1 pb-0.5 text-[9.5px] font-bold uppercase tracking-widest text-slate-400 truncate">
              {grupo.titulo}
            </div>
          )}
          {grupo.opciones.map(pintarOpcion)}
        </div>
      ))}
      <div className="mt-1 pt-1 border-t border-slate-100 px-2.5 pb-0.5 text-[9.5px] text-slate-400">
        Shift + clic derecho para el menú del navegador
      </div>
    </div>
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
    <div
      className={cn(
        'group/bloque relative my-2 first:mt-0 font-sans',
        // El salto solo marca dónde corta la hoja; en papel no existe.
        bloque.tipo === 'salto' && 'print:hidden'
      )}
    >
      {!readOnly && (
        <div className="absolute -right-2 -top-3 flex items-center gap-1 bg-slate-900 text-white shadow-md rounded px-1.5 py-0.5 z-20 print:hidden text-[10px] opacity-30 group-hover/bloque:opacity-100 transition-opacity">
          <span className="hidden group-hover/bloque:inline pr-1 text-[9px] uppercase tracking-wide text-slate-300">
            {ETIQUETA_BLOQUE[bloque.tipo]}
          </span>
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
          placeholder="Escribe el párrafo del artículo..."
          className="text-[12px] leading-relaxed text-justify text-slate-700 font-sans"
        />
      )}

      {bloque.tipo === 'subtitulo' && (
        <EditableText
          value={bloque.texto}
          onChange={(texto) => onChange({ ...bloque, texto })}
          readOnly={readOnly}
          placeholder="Subtítulo del apartado"
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
            placeholder="Nota o advertencia destacada..."
          />
        </div>
      )}

      {bloque.tipo === 'firma' && (
        <div className="mt-12 pt-6 pb-4 font-sans print:mt-10">
          <div className="max-w-md mx-auto text-center flex flex-col items-center">
            <div className="text-[10px] uppercase tracking-widest font-bold text-slate-500 mb-2">
              Autorización y Registro Institucional
            </div>

            {/* Espacio amplio y despejado para plasmar la firma y sello oficial */}
            <div className="h-24 sm:h-28 w-full flex items-end justify-center pb-2">
              <span className="text-[9.5px] text-slate-300 uppercase tracking-widest font-mono select-none print:hidden">
                [ Espacio para firma de la dirección y sello oficial ]
              </span>
            </div>

            {/* Línea formal de firma */}
            <div className="w-72 sm:w-80 border-t-2 border-slate-900 dark:border-slate-200 mx-auto mb-3" />

            {/* Nombre y cargo de quien firma */}
            <EditableText
              value={bloque.texto}
              onChange={(texto) => onChange({ ...bloque, texto })}
              readOnly={readOnly}
              placeholder="Nombre y cargo de quien firma"
              className="text-[12px] font-extrabold text-slate-900 dark:text-slate-100 whitespace-pre-line text-center uppercase tracking-wide leading-relaxed"
            />
            <div className="text-[9.5px] text-blue-900 dark:text-blue-400 font-bold uppercase tracking-wider mt-1.5 flex items-center justify-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-blue-800 shrink-0" />
              <span>U3 Seguridad Privada · Representación y Validación Oficial</span>
            </div>
          </div>
        </div>
      )}

      {bloque.tipo === 'lista' && (
        <div className="my-1.5">
          {!readOnly && (
            <div className="flex items-center gap-2 mb-1 print:hidden opacity-45 hover:opacity-100 transition-opacity">
              <span className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold">Numeración</span>
              <Select
                value={bloque.estilo ?? 'decimal'}
                onChange={(e) => onChange({ ...bloque, estilo: e.target.value as EstiloLista })}
                className="h-6 w-52 text-[10.5px] py-0 px-2 bg-white text-slate-700 border-slate-300"
              >
                {ESTILOS_LISTA.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.etiqueta}
                  </option>
                ))}
              </Select>
            </div>
          )}
          <ol
            className={cn(
              'text-[12px] leading-relaxed text-slate-700 space-y-1.5 font-sans pl-5',
              bloque.estilo === 'upper-roman' && 'list-[upper-roman]',
              bloque.estilo === 'lower-alpha' && 'list-[lower-alpha]',
              (bloque.estilo === 'decimal' || !bloque.estilo) && 'list-decimal',
              bloque.estilo === 'none' && 'list-none pl-0',
              bloque.estilo === 'glosario' && 'list-none pl-0'
            )}
          >
            {bloque.items.map((item, idx) => {
              const controles = !readOnly && (
                <div className="absolute -left-6 top-0 flex items-center gap-0.5 print:hidden opacity-30 group-hover/item:opacity-100 transition-opacity">
                  <button
                    type="button"
                    title="Eliminar este punto"
                    onClick={() => {
                      const items = bloque.items.filter((_, i) => i !== idx);
                      onChange({ ...bloque, items: items.length ? items : [''] });
                    }}
                    className="text-red-400 hover:text-red-600 text-xs leading-none"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              );

              if (bloque.estilo === 'glosario') {
                const [termino, ...resto] = item.split(':');
                const def = resto.join(':');
                return (
                  <li key={idx} className="group/item relative text-justify">
                    {controles}
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
                          placeholder="Término"
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
                          placeholder="Definición"
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
                        placeholder="Término: definición"
                      />
                    )}
                  </li>
                );
              }

              return (
                <li key={idx} className="group/item relative text-justify">
                  {controles}
                  <EditableText
                    value={item}
                    onChange={(val) => {
                      const items = [...bloque.items];
                      items[idx] = val;
                      onChange({ ...bloque, items });
                    }}
                    readOnly={readOnly}
                    placeholder="Punto de la lista..."
                  />
                </li>
              );
            })}
            {!readOnly && (
              <button
                type="button"
                onClick={() => onChange({ ...bloque, items: [...bloque.items, ''] })}
                className="text-[10px] text-blue-600 hover:underline flex items-center gap-0.5 mt-1 print:hidden"
              >
                <Plus className="w-2.5 h-2.5" /> Agregar elemento
              </button>
            )}
          </ol>
        </div>
      )}

      {bloque.tipo === 'tabla' && (
        <div className="my-3 overflow-x-auto border border-slate-300 rounded font-sans">
          <table className="w-full text-left text-[11.5px] border-collapse font-sans">
            <thead>
              <tr className="bg-slate-800 text-white font-semibold">
                {bloque.encabezados.map((enc, cIdx) => (
                  <th key={cIdx} className="group/col relative p-2 border border-slate-600">
                    <EditableText
                      value={enc}
                      onChange={(val) => {
                        const encabezados = [...bloque.encabezados];
                        encabezados[cIdx] = val;
                        onChange({ ...bloque, encabezados });
                      }}
                      readOnly={readOnly}
                      placeholder="Encabezado"
                      className="text-white font-semibold"
                    />
                    {!readOnly && bloque.encabezados.length > 1 && (
                      <button
                        type="button"
                        title="Eliminar esta columna"
                        onClick={() =>
                          onChange({
                            ...bloque,
                            encabezados: bloque.encabezados.filter((_, i) => i !== cIdx),
                            filas: bloque.filas.map((f) => f.filter((_, i) => i !== cIdx)),
                          })
                        }
                        className="absolute top-0.5 right-0.5 text-red-300 hover:text-red-100 opacity-0 group-hover/col:opacity-100 transition-opacity print:hidden"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </th>
                ))}
                {!readOnly && <th className="w-6 border border-slate-600 print:hidden" />}
              </tr>
            </thead>
            <tbody>
              {bloque.filas.map((fila, rIdx) => (
                <tr key={rIdx} className="border-b border-slate-200 hover:bg-slate-50">
                  {bloque.encabezados.map((_, cIdx) => (
                    <td key={cIdx} className="p-2 border border-slate-200 text-slate-700 align-top text-justify">
                      <EditableText
                        value={fila[cIdx] ?? ''}
                        onChange={(val) => {
                          const filas = bloque.filas.map((f, i) =>
                            i === rIdx
                              ? bloque.encabezados.map((__, j) => (j === cIdx ? val : f[j] ?? ''))
                              : f
                          );
                          onChange({ ...bloque, filas });
                        }}
                        readOnly={readOnly}
                        placeholder="—"
                      />
                    </td>
                  ))}
                  {!readOnly && (
                    <td className="w-6 p-1 text-center print:hidden align-middle">
                      <button
                        type="button"
                        title="Eliminar esta fila"
                        onClick={() => onChange({ ...bloque, filas: bloque.filas.filter((_, i) => i !== rIdx) })}
                        className="text-red-400 hover:text-red-600"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          {!readOnly && (
            <div className="p-1.5 bg-slate-50 border-t border-slate-200 flex gap-4 text-[10px] print:hidden">
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
              <button
                type="button"
                onClick={() =>
                  onChange({
                    ...bloque,
                    encabezados: [...bloque.encabezados, `Columna ${bloque.encabezados.length + 1}`],
                    filas: bloque.filas.map((f) => [...f, '']),
                  })
                }
                className="text-blue-600 hover:underline flex items-center gap-0.5"
              >
                <Plus className="w-2.5 h-2.5" /> Agregar columna
              </button>
            </div>
          )}
        </div>
      )}

      {bloque.tipo === 'salto' && (
        <div className="my-1 flex items-center gap-2 select-none print:hidden" title="Aquí termina la hoja: lo que sigue empieza en una hoja nueva">
          <div className="h-px flex-1 border-t-2 border-dashed border-blue-300" />
          <span className="text-[9.5px] font-bold uppercase tracking-widest text-blue-500 whitespace-nowrap">
            Fin de hoja
          </span>
          <div className="h-px flex-1 border-t-2 border-dashed border-blue-300" />
        </div>
      )}

      {bloque.tipo === 'campos' && (
        <div className="my-6 p-5 sm:p-6 font-sans bg-slate-50/80 dark:bg-slate-900/40 rounded-xl border border-slate-300 dark:border-slate-700 shadow-xs">
          <div className="flex items-center justify-between pb-3 mb-5 border-b-2 border-slate-900 dark:border-slate-600">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-[#0f172a] dark:text-slate-200 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-blue-800 shrink-0" /> Cédula Oficial de Notificación y Aceptación
            </span>
            <span className="text-[9.5px] font-mono text-slate-500 font-semibold uppercase">
              U3 Seguridad Privada
            </span>
          </div>

          <div className="space-y-4">
            {bloque.items.map((item, idx) => {
              const esFirma = item.toLowerCase().includes('firma');

              if (esFirma) {
                return (
                  <div
                    key={idx}
                    className="group/item relative mt-8 pt-4 border-t border-dashed border-slate-300 dark:border-slate-700 text-center"
                  >
                    {!readOnly && (
                      <button
                        type="button"
                        title="Eliminar este campo"
                        onClick={() => {
                          const items = bloque.items.filter((_, i) => i !== idx);
                          onChange({ ...bloque, items: items.length ? items : [''] });
                        }}
                        className="absolute right-0 top-2 text-red-400 hover:text-red-600 opacity-30 group-hover/item:opacity-100 transition-opacity print:hidden"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <div className="text-[10px] uppercase font-bold text-slate-600 dark:text-slate-400 tracking-wider mb-2">
                      Firma Autógrafa de Conformidad del Trabajador
                    </div>
                    {/* Espacio amplio y despejado para plasmar la firma manuscrita */}
                    <div className="h-24 sm:h-28 flex items-end justify-center pb-2">
                      <span className="text-[9px] text-slate-300 uppercase tracking-widest font-mono select-none print:hidden">
                        [ Espacio para firma del colaborador ]
                      </span>
                    </div>
                    {/* Línea de firma centrada */}
                    <div className="w-72 sm:w-80 border-t-2 border-slate-900 dark:border-slate-300 mx-auto my-2" />
                    <EditableText
                      value={item}
                      onChange={(val) => {
                        const items = [...bloque.items];
                        items[idx] = val;
                        onChange({ ...bloque, items });
                      }}
                      readOnly={readOnly}
                      placeholder="Nombre y Firma del Colaborador"
                      className="text-center text-[11.5px] font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wide"
                    />
                    <div className="text-[9px] text-slate-500 uppercase tracking-wider mt-0.5">
                      Acepto de conformidad los términos y condiciones del presente reglamento
                    </div>
                  </div>
                );
              }

              return (
                <div key={idx} className="group/item relative">
                  {!readOnly && (
                    <button
                      type="button"
                      title="Eliminar este campo"
                      onClick={() => {
                        const items = bloque.items.filter((_, i) => i !== idx);
                        onChange({ ...bloque, items: items.length ? items : [''] });
                      }}
                      className="absolute -left-5 top-2.5 text-red-400 hover:text-red-600 opacity-30 group-hover/item:opacity-100 transition-opacity print:hidden"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                  <div className="p-3 bg-white dark:bg-slate-800/90 rounded-lg border border-slate-300/90 dark:border-slate-700 shadow-xs hover:border-slate-400 transition-colors">
                    <EditableText
                      value={item}
                      onChange={(val) => {
                        const items = [...bloque.items];
                        items[idx] = val;
                        onChange({ ...bloque, items });
                      }}
                      readOnly={readOnly}
                      placeholder="Nombre del campo: ___________"
                      className="text-[12px] font-medium text-slate-800 dark:text-slate-200 tracking-wide"
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {!readOnly && (
            <button
              type="button"
              onClick={() => onChange({ ...bloque, items: [...bloque.items, 'Campo: ___________________________'] })}
              className="text-[10.5px] text-blue-600 hover:underline flex items-center gap-0.5 pt-3 print:hidden font-semibold"
            >
              <Plus className="w-3 h-3" /> Agregar campo a la cédula
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function SeccionVistaEditable({
  seccion,
  onActualizar,
  onEliminar,
  onMoverSeccion,
  primeraSeccion,
  ultimaSeccion,
  readOnly,
  desde = 0,
  hasta = seccion.bloques.length,
  continuacion = false,
  ultimo = true,
  medicion = false,
}: {
  seccion: SeccionDoc;
  /** Recibe una función para que el cambio se aplique siempre sobre la última versión. */
  onActualizar: (fn: (s: SeccionDoc) => SeccionDoc) => void;
  onEliminar: () => void;
  onMoverSeccion: (delta: number) => void;
  primeraSeccion: boolean;
  ultimaSeccion: boolean;
  readOnly?: boolean;
  /** Rango de bloques que se pinta en esta hoja; el resto sigue en la siguiente. */
  desde?: number;
  hasta?: number;
  continuacion?: boolean;
  ultimo?: boolean;
  /** Copia oculta que el visor usa para medir el alto real de cada bloque. */
  medicion?: boolean;
}) {
  const setBloque = (idx: number, b: Bloque) =>
    onActualizar((s) => ({ ...s, bloques: s.bloques.map((item, i) => (i === idx ? b : item)) }));

  const insertarBloque = (idx: number, tipo: TipoBloque) =>
    onActualizar((s) => {
      const bloques = [...s.bloques];
      bloques.splice(Math.min(idx, bloques.length), 0, bloqueVacio(tipo));
      return { ...s, bloques };
    });

  const eliminarBloque = (idx: number) =>
    onActualizar((s) => ({ ...s, bloques: s.bloques.filter((_, i) => i !== idx) }));

  const moverBloque = (idx: number, delta: number) =>
    onActualizar((s) => ({ ...s, bloques: mover(s.bloques, idx, delta) }));

  return (
    <div
      id={medicion || continuacion ? undefined : seccion.id}
      data-seccion={seccion.id}
      className="mb-6 last:mb-0 font-sans"
    >
      {/* Encabezado de la sección; en la continuación va en versión compacta. */}
      {continuacion ? (
        <div data-medir-encabezado={medicion ? 'si' : undefined} className="border-b border-slate-300 pb-1 mb-3 flex items-baseline gap-2 text-slate-500">
          {seccion.numero && (
            <span className="text-[10px] font-bold tracking-widest text-blue-800 uppercase">{seccion.numero}</span>
          )}
          <span className="text-[11px] font-semibold uppercase tracking-tight truncate">{seccion.titulo}</span>
          <span className="text-[10px] italic shrink-0 ml-auto">continúa</span>
        </div>
      ) : (
        <div data-medir-encabezado={medicion ? 'si' : undefined} className="border-b-2 border-slate-900 pb-1 mb-3 flex items-end justify-between gap-2">
          <div className="flex-1">
            <EditableText
              value={seccion.numero ?? ''}
              onChange={(numero) => onActualizar((s) => ({ ...s, numero }))}
              readOnly={readOnly}
              placeholder="Capítulo N"
              className="text-[11px] font-bold tracking-widest text-blue-800 uppercase"
              isTitle
            />
            <EditableText
              value={seccion.titulo}
              onChange={(titulo) => onActualizar((s) => ({ ...s, titulo }))}
              readOnly={readOnly}
              placeholder="Título del capítulo"
              className="text-[15px] font-extrabold text-[#0f172a] uppercase tracking-tight"
              isTitle
            />
          </div>
          {!readOnly && (
            <div className="flex items-center gap-0.5 print:hidden opacity-40 hover:opacity-100 transition-opacity">
              <button
                type="button"
                onClick={() => onMoverSeccion(-1)}
                disabled={primeraSeccion}
                title="Subir capítulo"
                className="text-slate-400 hover:text-slate-700 p-1 disabled:opacity-25"
              >
                <ArrowUp className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => onMoverSeccion(1)}
                disabled={ultimaSeccion}
                title="Bajar capítulo"
                className="text-slate-400 hover:text-slate-700 p-1 disabled:opacity-25"
              >
                <ArrowDown className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={onEliminar}
                title="Eliminar capítulo"
                className="text-red-400 hover:text-red-600 p-1"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* Lista de bloques de contenido de este fragmento */}
      <div className="space-y-2">
        {seccion.bloques.slice(desde, hasta).map((b, i) => {
          const idx = desde + i;
          return (
            <div key={idx} data-bloque={idx} data-medir-bloque={medicion ? idx : undefined}>
              <BloqueVistaEditable
                bloque={b}
                onChange={(nb) => setBloque(idx, nb)}
                onMover={(delta) => moverBloque(idx, delta)}
                onEliminar={() => eliminarBloque(idx)}
                primero={idx === 0}
                ultimo={idx === seccion.bloques.length - 1}
                readOnly={readOnly}
              />
            </div>
          );
        })}

        {/* Solo una única barra de inserción al final del capítulo */}
        {!readOnly && ultimo && (
          <div className="pt-2">
            <BarraInsertar
              onInsertar={(tipo) => insertarBloque(seccion.bloques.length, tipo)}
              etiqueta="Agregar bloque al capítulo"
            />
          </div>
        )}
      </div>
    </div>
  );
}

/** Reparto de bloques por hoja, guardado por id para poder congelarlo al escribir. */
interface FragmentoLayout {
  seccionId: string;
  desde: number;
  hasta: number;
  continuacion: boolean;
  ultimo: boolean;
}

export default function DocumentoReglamentoApp({
  ambitoInicial = 'oficinas',
  protocoloId,
}: {
  ambitoInicial?: AmbitoReglamento;
  protocoloId?: number;
} = {}) {
  const { isEditor, isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const [ambito, setAmbito] = useState<AmbitoReglamento>(ambitoInicial);
  const [zoom, setZoom] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');
  const [contenidoLocal, setContenidoLocal] = useState<ContenidoDoc | null>(null);
  const [cambiosPendientes, setCambiosPendientes] = useState(false);
  /** Confirmación en curso. Sustituye a los avisos del navegador. */
  const [confirmacion, setConfirmacion] = useState<Confirmacion | null>(null);
  const [modoEdicion, setModoEdicion] = useState(true);
  const [escribiendo, setEscribiendo] = useState(false);
  const finEscrituraRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data: registro, isLoading, error } = useQuery({
    queryKey: protocoloId ? ['protocolo-documento', protocoloId] : ['reglamento-documento', ambito],
    queryFn: () =>
      apiFetch<ProtocoloRegistro>(protocoloId ? `/api/protocolos/${protocoloId}` : `/api/reglamento?ambito=${ambito}`),
  });

  // El documento del servidor solo se adopta cuando es una versión distinta de la
  // ya cargada. Antes se copiaba en cuanto no había cambios pendientes y, justo
  // después de guardar, pisaba con la copia vieja lo que se estuviera escribiendo.
  const versionCargada = useRef<string | null>(null);
  useEffect(() => {
    if (!registro?.contenido) return;
    const version = `${protocoloId ?? ambito}:${registro.id}:${registro.actualizado_en ?? ''}`;
    if (versionCargada.current === version) return;
    if (cambiosPendientes) return;
    versionCargada.current = version;
    contenidoRef.current = registro.contenido as ContenidoDoc;
    setContenidoLocal(registro.contenido as ContenidoDoc);
    // El documento que llega del servidor arranca su propio historial.
    historialRef.current = { pasado: [], futuro: [] };
    ultimoRegistroRef.current = 0;
    setPuedeDeshacer(false);
    setPuedeRehacer(false);
  }, [registro, ambito, protocoloId, cambiosPendientes]);

  // Cambiar de reglamento descarta el borrador en pantalla, nunca lo mezcla con el otro documento.
  const cambiarAmbito = (nuevo: AmbitoReglamento) => {
    if (nuevo === ambito) return;

    const aplicar = () => {
      setCambiosPendientes(false);
      contenidoRef.current = null;
      setContenidoLocal(null);
      versionCargada.current = null;
      reiniciarHistorial();
      setSearchTerm('');
      setAmbito(nuevo);
    };

    if (cambiosPendientes) {
      setConfirmacion({
        titulo: 'Tienes cambios sin guardar',
        mensaje: 'Si abres el otro reglamento ahora, lo que escribiste en este se pierde.',
        etiqueta: 'Descartar y cambiar',
        peligro: true,
        onConfirmar: aplicar,
      });
      return;
    }
    aplicar();
  };

  const updateMutation = useMutation({
    mutationFn: (payload: any) =>
      protocoloId
        ? apiFetch(`/api/protocolos/${protocoloId}`, {
            method: 'PUT',
            body: JSON.stringify({
              titulo: registro?.titulo,
              categoria: registro?.categoria,
              descripcion: registro?.descripcion,
              prioridad: registro?.prioridad,
              activo: registro?.activo,
              tipo: 'documento',
              pasos: [],
              contenido: payload.contenido,
            }),
          })
        : apiFetch(`/api/reglamento?ambito=${ambito}`, {
            method: 'PUT',
            body: JSON.stringify({ ...payload, ambito }),
          }),
    onSuccess: () => {
      setCambiosPendientes(false);
      queryClient.invalidateQueries({
        queryKey: protocoloId ? ['protocolo-documento', protocoloId] : ['reglamento-documento', ambito],
      });
      toast.success('Documento guardado correctamente');
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Error al guardar');
    },
  });

  const esReglamento = Boolean(
    registro &&
      (registro.categoria === 'Reglamento' ||
        registro.titulo?.toLowerCase().includes('reglamento') ||
        (!protocoloId && ambitoInicial))
  );

  const ambitoMeta = AMBITOS.find((a) => a.id === ambito) ?? AMBITOS[0];
  const codigoDocumento = esReglamento
    ? ambitoMeta.codigo
    : (registro?.contenido as any)?.codigo || `U3-PROT-${protocoloId ?? registro?.id ?? 'DOC'}-2026`;
  const secciones = useMemo(() => contenidoLocal?.secciones ?? [], [contenidoLocal]);

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

  // ------------------------------------------------------------- medición real
  // El reparto en hojas se calcula con el alto que de verdad ocupa cada bloque
  // ya pintado, medido sobre una copia oculta con el mismo ancho de columna que
  // la hoja. Estimarlo a partir del texto siempre se quedaba corto: la hoja se
  // pasaba de largo y el navegador la partía sola, sacando una página de más al
  // imprimir con el pie de página descolgado.
  const medidorRef = useRef<HTMLDivElement>(null);
  const membreteRef = useRef<HTMLElement>(null);
  const pieRef = useRef<HTMLElement>(null);
  const portadillaRef = useRef<HTMLDivElement>(null);
  const [medidas, setMedidas] = useState<Partial<MedidasDoc> | null>(null);
  const [altoUtil, setAltoUtil] = useState(ALTO_UTIL_HOJA);

  useEffect(() => {
    // Mientras se escribe no se remide: el reparto está congelado de todos modos.
    if (escribiendo) return;
    let cancelado = false;

    const medir = () => {
      if (cancelado || !medidorRef.current) return;
      const bloques: Record<string, number> = {};
      const encabezados: Record<string, number> = {};

      medidorRef.current.querySelectorAll<HTMLElement>('[data-medir-seccion]').forEach((nodo) => {
        const id = nodo.dataset.medirSeccion;
        if (!id) return;
        const esContinuacion = nodo.dataset.medirContinuacion === 'si';
        const marco = nodo.getBoundingClientRect();
        const items = Array.from(nodo.querySelectorAll<HTMLElement>('[data-medir-bloque]'));
        const cabecera = nodo.querySelector<HTMLElement>('[data-medir-encabezado]');

        // El encabezado se mide hasta donde empieza el primer bloque, así queda
        // incluida la separación que los navegadores colapsan entre ambos.
        const inicioBloques = items.length
          ? items[0].getBoundingClientRect().top
          : cabecera?.getBoundingClientRect().bottom ?? marco.bottom;
        encabezados[esContinuacion ? `${id}:cont` : id] = Math.max(0, inicioBloques - marco.top);

        if (esContinuacion) return;
        const seccion = secciones.find((x) => x.id === id);
        items.forEach((el, i) => {
          // El salto de página no se imprime: no ocupa alto aunque en pantalla
          // se dibuje su línea punteada.
          if (seccion?.bloques[i]?.tipo === 'salto') {
            bloques[`${id}:${i}`] = 0;
            return;
          }
          const arriba = el.getBoundingClientRect().top;
          const abajo = i + 1 < items.length ? items[i + 1].getBoundingClientRect().top : marco.bottom;
          bloques[`${id}:${i}`] = Math.max(0, abajo - arriba);
        });
      });

      const nuevas: Partial<MedidasDoc> = {
        bloques,
        encabezados,
        separacion: 24,
        // La portadilla del título solo resta espacio en la primera hoja.
        primeraHoja: portadillaRef.current ? portadillaRef.current.offsetHeight + 24 : 0,
      };
      setMedidas((prev) => (JSON.stringify(prev) === JSON.stringify(nuevas) ? prev : nuevas));

      // Hueco disponible entre el membrete y el pie. Se calcula restándolos de
      // la hoja y no midiendo el contenedor: ese crece con lo que se le mete y
      // el reparto se realimentaría a sí mismo hoja tras hoja.
      const membrete = membreteRef.current ? membreteRef.current.offsetHeight + 24 : 0;
      const pie = pieRef.current?.offsetHeight ?? 0;
      if (membrete > 0 && pie > 0) {
        const hueco = ALTO_HOJA - MARGEN_HOJA * 2 - membrete - pie - 8;
        if (hueco > 200) setAltoUtil((prev) => (Math.abs(prev - hueco) < 1 ? prev : hueco));
      }
    };

    const t = setTimeout(() => {
      // Medir antes de que carguen las tipografías da alturas de otra fuente.
      if (typeof document !== 'undefined' && document.fonts && document.fonts.status !== 'loaded') {
        document.fonts.ready.then(medir).catch(() => medir());
      } else {
        medir();
      }
    }, 120);

    return () => {
      cancelado = true;
      clearTimeout(t);
    };
  }, [secciones, escribiendo]);

  const layout = useMemo<FragmentoLayout[][]>(
    () =>
      paginarFragmentos(seccionesFiltradas, altoUtil, true, medidas ?? undefined).map((hoja) =>
        hoja.map((f) => ({
          seccionId: f.seccion.id,
          desde: f.desde,
          hasta: f.hasta,
          continuacion: f.continuacion,
          ultimo: f.ultimo,
        }))
      ),
    [seccionesFiltradas, altoUtil, medidas]
  );

  // Mientras se escribe, el reparto en hojas se congela: si el texto crecido
  // empujara el bloque a la hoja siguiente, ese bloque se desmontaría y el
  // cursor se perdería a media palabra. El texto sí se sigue viendo al día
  // porque el reparto guarda ids, no copias de las secciones.
  const layoutCongeladoRef = useRef<FragmentoLayout[][]>(layout);
  useEffect(() => {
    if (!escribiendo) layoutCongeladoRef.current = layout;
  }, [layout, escribiendo]);
  const hojas = escribiendo ? layoutCongeladoRef.current : layout;

  // Portada e Índice oficial del documento
  const SECCIONES_POR_INDICE = 16;
  const indicePartido = secciones.length > SECCIONES_POR_INDICE;
  const hojasPreliminares = indicePartido ? 3 : 2; // Portada + 1 o 2 hojas de índice
  const totalHojas = hojasPreliminares + hojas.length;
  const fechaEmision = new Date(registro?.actualizado_en ?? Date.now()).toLocaleDateString('es-MX', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  // Solo escribir congela el reparto en hojas. Antes bastaba con que cualquier
  // cosa del documento tomara el foco —un botón, por ejemplo—: al quedarse
  // enfocado tras el clic, el reparto no volvía a calcularse nunca y los bloques
  // nuevos se amontonaban todos en la última hoja.
  const esCampoDeTexto = (nodo: EventTarget | null) =>
    !!(nodo as HTMLElement | null)?.isContentEditable;

  const marcarFoco = (e: React.FocusEvent) => {
    if (!esCampoDeTexto(e.target)) return;
    if (finEscrituraRef.current) clearTimeout(finEscrituraRef.current);
    finEscrituraRef.current = null;
    setEscribiendo(true);
  };

  const marcarSalidaFoco = (e: React.FocusEvent) => {
    if (!esCampoDeTexto(e.target)) return;
    if (finEscrituraRef.current) clearTimeout(finEscrituraRef.current);
    // Pasar de un campo a otro dispara blur y focus seguidos: se espera un
    // instante para no recalcular las hojas en ese hueco.
    finEscrituraRef.current = setTimeout(() => setEscribiendo(false), 200);
  };

  useEffect(() => () => {
    if (finEscrituraRef.current) clearTimeout(finEscrituraRef.current);
  }, []);

  // ------------------------------------------------------------- deshacer
  // El deshacer del navegador solo alcanza al texto de un campo suelto y se
  // pierde en cuanto el bloque se repinta en otra hoja. El historial vive aquí,
  // sobre el documento entero, así Ctrl+Z también revierte insertar, borrar o
  // mover un bloque o un capítulo.
  const historialRef = useRef<{ pasado: ContenidoDoc[]; futuro: ContenidoDoc[] }>({ pasado: [], futuro: [] });
  const ultimoRegistroRef = useRef(0);
  const [puedeDeshacer, setPuedeDeshacer] = useState(false);
  const [puedeRehacer, setPuedeRehacer] = useState(false);
  const LIMITE_HISTORIAL = 100;
  /** Al escribir, las teclas seguidas se agrupan: deshacer no debe ir letra a letra. */
  const AGRUPAR_MS = 700;

  const sincronizarHistorial = () => {
    setPuedeDeshacer(historialRef.current.pasado.length > 0);
    setPuedeRehacer(historialRef.current.futuro.length > 0);
  };

  const reiniciarHistorial = () => {
    historialRef.current = { pasado: [], futuro: [] };
    ultimoRegistroRef.current = 0;
    sincronizarHistorial();
  };

  /** Espejo sincrónico del documento. React aplica `setState` más tarde, así que
   *  el historial y los cambios encadenados en un mismo clic necesitan leer aquí
   *  la última versión, no la copia que tenía el render en curso. */
  const contenidoRef = useRef<ContenidoDoc | null>(null);
  useEffect(() => {
    // Solo se copian versiones reales: vaciar el espejo es siempre una decisión
    // explícita (cambiar de reglamento), nunca un efecto de la carga.
    if (contenidoLocal) contenidoRef.current = contenidoLocal;
  }, [contenidoLocal]);

  const mutarContenido = (fn: (c: ContenidoDoc) => ContenidoDoc, agrupar = false) => {
    const actual = contenidoRef.current;
    if (!actual) return;

    const h = historialRef.current;
    const ahora = Date.now();
    // Si el cursor está dentro de un campo, el cambio viene de teclear: esas
    // pulsaciones se agrupan en un solo paso del historial.
    const tecleando = agrupar || !!(document.activeElement as HTMLElement | null)?.isContentEditable;
    const continuaLaMisma = tecleando && ahora - ultimoRegistroRef.current < AGRUPAR_MS && h.pasado.length > 0;
    if (!continuaLaMisma) {
      h.pasado.push(actual);
      if (h.pasado.length > LIMITE_HISTORIAL) h.pasado.shift();
      h.futuro = [];
    }
    ultimoRegistroRef.current = ahora;

    const siguiente = fn(actual);
    contenidoRef.current = siguiente;
    setContenidoLocal(siguiente);
    setCambiosPendientes(true);
    sincronizarHistorial();
  };

  /** El campo enfocado no se repinta mientras tiene el cursor, así que hay que
   *  soltarlo antes de reemplazar el documento o el cambio no se vería. */
  const soltarFoco = () => {
    const activo = document.activeElement as HTMLElement | null;
    if (activo?.isContentEditable) activo.blur();
  };

  const deshacer = () => {
    const h = historialRef.current;
    if (!h.pasado.length) return;
    soltarFoco();
    const anterior = h.pasado.pop()!;
    if (contenidoRef.current) h.futuro.push(contenidoRef.current);
    contenidoRef.current = anterior;
    setContenidoLocal(anterior);
    ultimoRegistroRef.current = 0;
    setCambiosPendientes(true);
    sincronizarHistorial();
  };

  const rehacer = () => {
    const h = historialRef.current;
    if (!h.futuro.length) return;
    soltarFoco();
    const siguiente = h.futuro.pop()!;
    if (contenidoRef.current) h.pasado.push(contenidoRef.current);
    contenidoRef.current = siguiente;
    setContenidoLocal(siguiente);
    ultimoRegistroRef.current = 0;
    setCambiosPendientes(true);
    sincronizarHistorial();
  };

  const actualizarSeccion = (id: string, fn: (s: SeccionDoc) => SeccionDoc) =>
    mutarContenido((c) => ({ ...c, secciones: c.secciones.map((s) => (s.id === id ? fn(s) : s)) }));

  const eliminarSeccion = (id: string) => {
    const sec = secciones.find((s) => s.id === id);
    if (!sec) return;
    const borrar = () => {
      mutarContenido((c) => ({ ...c, secciones: c.secciones.filter((s) => s.id !== id) }));
      toast.success('Capítulo eliminado · Ctrl+Z para revertir');
    };
    setConfirmacion({
      titulo: 'Eliminar capítulo',
      mensaje: `Se elimina «${sec.numero ? `${sec.numero}: ` : ''}${sec.titulo}» con todo lo que contiene.`,
      detalle: [`${sec.bloques.length} ${sec.bloques.length === 1 ? 'bloque' : 'bloques'} de contenido`],
      etiqueta: 'Eliminar capítulo',
      nota: 'Se puede revertir con Ctrl+Z mientras no guardes.',
      peligro: true,
      onConfirmar: borrar,
    });
  };

  const moverSeccion = (id: string, delta: number) =>
    mutarContenido((c) => {
      const i = c.secciones.findIndex((s) => s.id === id);
      if (i < 0) return c;
      return { ...c, secciones: mover(c.secciones, i, delta) };
    });

  const insertarBloqueEn = (seccionId: string, pos: number, tipo: TipoBloque) =>
    actualizarSeccion(seccionId, (s) => {
      const bloques = [...s.bloques];
      bloques.splice(Math.max(0, Math.min(pos, bloques.length)), 0, bloqueVacio(tipo));
      return { ...s, bloques };
    });

  const duplicarBloque = (seccionId: string, idx: number) =>
    actualizarSeccion(seccionId, (s) => {
      const original = s.bloques[idx];
      if (!original) return s;
      const bloques = [...s.bloques];
      bloques.splice(idx + 1, 0, JSON.parse(JSON.stringify(original)) as Bloque);
      return { ...s, bloques };
    });

  const moverBloqueEn = (seccionId: string, idx: number, delta: number) =>
    actualizarSeccion(seccionId, (s) => ({ ...s, bloques: mover(s.bloques, idx, delta) }));

  const eliminarBloqueEn = (seccionId: string, idx: number) =>
    actualizarSeccion(seccionId, (s) => ({ ...s, bloques: s.bloques.filter((_, i) => i !== idx) }));

  /** Agrega una hoja: un salto de página y un párrafo vacío donde escribir. */
  const agregarHojaTras = (frag: FragmentoLayout | undefined) => {
    if (!frag) return;
    actualizarSeccion(frag.seccionId, (s) => {
      const bloques = [...s.bloques];
      const pos = Math.min(frag.hasta, bloques.length);
      bloques.splice(pos, 0, { tipo: 'salto' }, { tipo: 'parrafo', texto: '' });
      return { ...s, bloques };
    });
    toast.success('Hoja nueva agregada después de esta');
  };

  /** Quita la hoja uniéndola con la anterior: borra el salto que la abría. */
  const quitarHoja = (frag: FragmentoLayout | undefined) => {
    if (!frag) return;
    const anterior = frag.desde - 1;
    if (anterior < 0) return;
    actualizarSeccion(frag.seccionId, (s) =>
      s.bloques[anterior]?.tipo === 'salto'
        ? { ...s, bloques: s.bloques.filter((_, i) => i !== anterior) }
        : s
    );
    toast.success('Hoja unida con la anterior');
  };

  /**
   * Borra la hoja entera con lo que tenga dentro. Es decisión de quien redacta:
   * se avisa qué se va y Ctrl+Z lo devuelve, pero no se le niega el borrado por
   * el hecho de que la hoja tenga contenido.
   */
  const eliminarHoja = (idxHoja: number) => {
    const fragmentos = hojas[idxHoja];
    if (!fragmentos?.length) return;

    // Se enumera lo que se va, capítulo por capítulo, para que la decisión sea
    // informada y no un «¿continuar?» a ciegas.
    const detalle = fragmentos.map((f) => {
      const sec = secciones.find((x) => x.id === f.seccionId);
      const cuantos = Math.max(0, Math.min(f.hasta, sec?.bloques.length ?? 0) - f.desde);
      const nombre = sec ? `${sec.numero ? `${sec.numero}: ` : ''}${sec.titulo}` : 'Capítulo';
      const completo = sec && f.desde === 0 && f.hasta >= sec.bloques.length;
      return `${nombre} — ${cuantos} ${cuantos === 1 ? 'bloque' : 'bloques'}${completo ? ' (el capítulo entero)' : ''}`;
    });

    const tocadas = new Set(fragmentos.map((f) => f.seccionId));

    const borrar = () => {
      mutarContenido((c) => {
        const secciones2 = c.secciones.map((sec) => {
          const frag = fragmentos.find((f) => f.seccionId === sec.id);
          if (!frag) return sec;
          const hasta = Math.min(frag.hasta, sec.bloques.length);
          // El salto que abría la hoja se va con ella; si no, quedaría una hoja
          // vacía en su lugar.
          const inicio = sec.bloques[frag.desde - 1]?.tipo === 'salto' ? frag.desde - 1 : frag.desde;
          return { ...sec, bloques: [...sec.bloques.slice(0, Math.max(0, inicio)), ...sec.bloques.slice(hasta)] };
        });
        // Un capítulo que cabía entero en la hoja desaparece con ella.
        return { ...c, secciones: secciones2.filter((sec) => !tocadas.has(sec.id) || sec.bloques.length > 0) };
      });
      toast.success('Hoja eliminada · Ctrl+Z para revertir');
    };

    setConfirmacion({
      titulo: `Eliminar la hoja ${hojasPreliminares + idxHoja + 1}`,
      mensaje: 'Se borra la hoja completa con todo lo que tiene dentro.',
      detalle,
      etiqueta: 'Eliminar hoja',
      nota: 'Se puede revertir con Ctrl+Z mientras no guardes.',
      peligro: true,
      onConfirmar: borrar,
    });
  };

  /** Solo se puede quitar la hoja que abrió un salto, no la que abre un capítulo. */
  const hojaAbiertaPorSalto = (frag: FragmentoLayout | undefined) => {
    if (!frag || frag.desde < 1) return false;
    const seccion = secciones.find((x) => x.id === frag.seccionId);
    return seccion?.bloques[frag.desde - 1]?.tipo === 'salto';
  };

  const handleAgregarCapitulo = () => {
    const nueva = seccionVacia();
    const capitulos = secciones.filter((s) => (s.numero ?? '').toLowerCase().startsWith('capítulo')).length;
    nueva.numero = `Capítulo ${capitulos + 1}`;
    nueva.titulo = 'Nuevo Capítulo de Reglamento';
    mutarContenido((c) => ({ ...c, secciones: [...c.secciones, nueva] }));
    toast.success('Capítulo agregado al final del documento');
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
  const editable = canEdit && modoEdicion;

  // ------------------------------------------------------- menú del botón derecho
  const [menuCtx, setMenuCtx] = useState<{ x: number; y: number; grupos: GrupoMenu[] } | null>(null);

  const abrirMenuContextual = (e: React.MouseEvent) => {
    // Sin Shift el menú es el del editor; con Shift, el del navegador (pegar,
    // ortografía), que sigue haciendo falta.
    if (!editable || e.shiftKey) return;

    const objetivo = e.target as HTMLElement;
    const nodoBloque = objetivo.closest('[data-bloque]') as HTMLElement | null;
    const nodoSeccion = objetivo.closest('[data-seccion]') as HTMLElement | null;
    const nodoHoja = objetivo.closest('[data-hoja]') as HTMLElement | null;

    const seccionId = nodoSeccion?.dataset.seccion;
    const seccion = seccionId ? secciones.find((x) => x.id === seccionId) : undefined;
    const idxBloque = nodoBloque ? Number(nodoBloque.dataset.bloque) : -1;
    const idxHoja = nodoHoja ? Number(nodoHoja.dataset.hoja) : -1;
    const fragmentos = idxHoja >= 0 ? hojas[idxHoja] : undefined;

    const grupos: GrupoMenu[] = [];

    if (seccion && idxBloque >= 0 && seccion.bloques[idxBloque]) {
      const tiposPara = (pos: number): OpcionMenu[] =>
        TIPOS_BLOQUE.map((t) => ({
          id: `tipo-${pos}-${t}`,
          etiqueta: ETIQUETA_BLOQUE[t],
          onClick: () => insertarBloqueEn(seccion.id, pos, t),
        }));

      grupos.push({
        titulo: `${ETIQUETA_BLOQUE[seccion.bloques[idxBloque].tipo]} · bloque ${idxBloque + 1}`,
        opciones: [
          { id: 'ins-arriba', etiqueta: 'Insertar arriba', icono: Plus, submenu: tiposPara(idxBloque) },
          { id: 'ins-abajo', etiqueta: 'Insertar abajo', icono: Plus, submenu: tiposPara(idxBloque + 1) },
          { id: 'duplicar', etiqueta: 'Duplicar bloque', icono: Copy, onClick: () => duplicarBloque(seccion.id, idxBloque) },
          {
            id: 'subir-bloque',
            etiqueta: 'Subir bloque',
            icono: ArrowUp,
            deshabilitado: idxBloque === 0,
            onClick: () => moverBloqueEn(seccion.id, idxBloque, -1),
          },
          {
            id: 'bajar-bloque',
            etiqueta: 'Bajar bloque',
            icono: ArrowDown,
            deshabilitado: idxBloque >= seccion.bloques.length - 1,
            onClick: () => moverBloqueEn(seccion.id, idxBloque, 1),
          },
          {
            id: 'borrar-bloque',
            etiqueta: 'Eliminar bloque',
            icono: Trash2,
            peligro: true,
            onClick: () => eliminarBloqueEn(seccion.id, idxBloque),
          },
        ],
      });
    }

    if (seccion) {
      const posSeccion = secciones.findIndex((x) => x.id === seccion.id);
      grupos.push({
        titulo: `${seccion.numero || 'Capítulo'} · ${seccion.titulo}`,
        opciones: [
          {
            id: 'subir-cap',
            etiqueta: 'Subir capítulo',
            icono: ArrowUp,
            deshabilitado: posSeccion <= 0,
            onClick: () => moverSeccion(seccion.id, -1),
          },
          {
            id: 'bajar-cap',
            etiqueta: 'Bajar capítulo',
            icono: ArrowDown,
            deshabilitado: posSeccion < 0 || posSeccion === secciones.length - 1,
            onClick: () => moverSeccion(seccion.id, 1),
          },
          { id: 'nuevo-cap', etiqueta: 'Agregar capítulo al final', icono: Plus, onClick: handleAgregarCapitulo },
          {
            id: 'borrar-cap',
            etiqueta: 'Eliminar capítulo',
            icono: Trash2,
            peligro: true,
            onClick: () => eliminarSeccion(seccion.id),
          },
        ],
      });
    }

    grupos.push({
      titulo: idxHoja >= 0 ? `Hoja ${hojasPreliminares + idxHoja + 1} de ${totalHojas}` : 'Documento',
      opciones: [
        {
          id: 'hoja-nueva',
          etiqueta: 'Hoja nueva después de esta',
          icono: FilePlus2,
          deshabilitado: !fragmentos?.length,
          onClick: () => agregarHojaTras(fragmentos?.[fragmentos.length - 1]),
        },
        {
          id: 'hoja-unir',
          etiqueta: 'Unir con la hoja anterior',
          icono: Scissors,
          deshabilitado: !hojaAbiertaPorSalto(fragmentos?.[0]),
          onClick: () => quitarHoja(fragmentos?.[0]),
        },
        {
          id: 'hoja-eliminar',
          etiqueta: 'Eliminar esta hoja y su contenido',
          icono: Trash2,
          peligro: true,
          deshabilitado: idxHoja < 0 || !fragmentos?.length,
          onClick: () => eliminarHoja(idxHoja),
        },
      ],
    });

    grupos.push({
      opciones: [
        { id: 'deshacer', etiqueta: 'Deshacer', icono: Undo2, atajo: 'Ctrl+Z', deshabilitado: !puedeDeshacer, onClick: deshacer },
        { id: 'rehacer', etiqueta: 'Rehacer', icono: Redo2, atajo: 'Ctrl+Y', deshabilitado: !puedeRehacer, onClick: rehacer },
        {
          id: 'guardar',
          etiqueta: 'Guardar cambios',
          icono: CheckCircle2,
          atajo: 'Ctrl+S',
          deshabilitado: !cambiosPendientes || updateMutation.isPending,
          onClick: handleGuardar,
        },
        { id: 'imprimir', etiqueta: 'Imprimir / PDF', icono: Printer, atajo: 'Ctrl+P', onClick: handleImprimir },
      ],
    });

    e.preventDefault();
    setMenuCtx({ x: e.clientX, y: e.clientY, grupos });
  };

  // Salir de la página con cambios sin guardar tenía que avisar: es fácil perder
  // media tarde de redacción con un clic en el menú lateral.
  useEffect(() => {
    if (!cambiosPendientes) return;
    const aviso = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', aviso);
    return () => window.removeEventListener('beforeunload', aviso);
  }, [cambiosPendientes]);

  // Atajos del editor. Van en captura y con preventDefault para ganarle al
  // deshacer propio del navegador, que solo revierte texto de un campo suelto.
  useEffect(() => {
    if (!editable) return;
    const alTeclado = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      const tecla = e.key.toLowerCase();
      if (tecla === 'z' && !e.shiftKey) {
        e.preventDefault();
        deshacer();
      } else if (tecla === 'y' || (tecla === 'z' && e.shiftKey)) {
        e.preventDefault();
        rehacer();
      } else if (tecla === 's') {
        e.preventDefault();
        if (cambiosPendientes && !updateMutation.isPending) handleGuardar();
      } else if (tecla === 'p') {
        e.preventDefault();
        handleImprimir();
      }
    };
    window.addEventListener('keydown', alTeclado, true);
    return () => window.removeEventListener('keydown', alTeclado, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editable, cambiosPendientes, updateMutation.isPending, contenidoLocal, registro]);

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
      {/* Estilos globales para impresión y exportación en PDF oficial tamaño Carta */}
      <style>{`
        @media print {
          @page {
            size: letter portrait;
            margin: 0;
          }
          html, body {
            background: white !important;
            color: black !important;
            margin: 0 !important;
            padding: 0 !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .print\\:hidden, nav, aside, .no-print {
            display: none !important;
          }
          .hoja-carta-canvas {
            padding: 0 !important;
            margin: 0 !important;
            background: transparent !important;
            box-shadow: none !important;
            transform: none !important;
          }
          /* Mismas medidas que en pantalla, en px, para que el texto corte el
             renglón en el mismo punto y la vista previa sea el papel. */
          .hoja-carta {
            width: ${ANCHO_HOJA}px !important;
            height: ${ALTO_HOJA}px !important;
            min-height: ${ALTO_HOJA}px !important;
            max-height: ${ALTO_HOJA}px !important;
            padding: ${MARGEN_HOJA}px !important;
            /* Red de seguridad: si algo se pasara de largo se recorta aquí en
               vez de derramarse a una página extra con el pie descolgado. */
            overflow: hidden !important;
            margin: 0 !important;
            box-shadow: none !important;
            border: none !important;
            border-radius: 0 !important;
            page-break-after: always !important;
            break-after: page !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            display: flex !important;
            flex-direction: column !important;
            justify-content: space-between !important;
            box-sizing: border-box !important;
            background: white !important;
            position: relative !important;
          }
          .hoja-carta:last-child {
            page-break-after: auto !important;
            break-after: auto !important;
          }
          .hoja-footer {
            display: flex !important;
            margin-top: auto !important;
            padding-top: 3mm !important;
            border-top: 1px solid #cbd5e1 !important;
            width: 100% !important;
          }
          .hoja-zoom {
            transform: none !important;
            transform-origin: top left !important;
          }
        }
      `}</style>

      {/* Cabecera institucional de herramientas (estática, no fija) */}
      <div className="bg-card border border-border rounded-xl p-3 sm:p-4 shadow-sm flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 print:hidden">
        <div className="flex items-center gap-3">
          <Link href={esReglamento ? "/" : "/protocolos"}>
            <Button variant="ghost" size="sm" className="h-9 px-2 text-muted-foreground hover:text-foreground">
              <ArrowLeft className="w-4 h-4 mr-1" /> {esReglamento ? 'Inicio' : 'Protocolos'}
            </Button>
          </Link>
          <div className="h-5 w-px bg-border hidden sm:block" />
          <div>
            <h1 className="text-base sm:text-lg font-bold tracking-tight text-foreground flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-primary" /> {registro.titulo}
            </h1>
            <p className="text-xs text-muted-foreground hidden sm:block">
              {secciones.length} capítulos y secciones · Formato Oficial U3 Seguridad Privada
            </p>
          </div>
        </div>

        {/* Selector de reglamento: oficinistas u operativo, o Badge institucional */}
        {esReglamento ? (
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
        ) : (
          <div className="flex items-center gap-2 self-start md:self-auto">
            <span className="text-xs font-mono font-bold uppercase px-2.5 py-1 rounded bg-primary/10 text-primary border border-primary/20">
              {codigoDocumento}
            </span>
            <span className="text-xs font-semibold px-2.5 py-1 rounded bg-muted text-muted-foreground border border-border">
              {registro.categoria || 'Normativa'}
            </span>
          </div>
        )}

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

          {/* Deshacer y rehacer sobre el documento completo (Ctrl+Z / Ctrl+Y) */}
          {editable && (
            <div className="flex items-center bg-muted/60 rounded-lg p-0.5 border border-border">
              <button
                onClick={deshacer}
                disabled={!puedeDeshacer}
                title="Deshacer (Ctrl+Z)"
                className="p-1.5 hover:bg-background rounded text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent"
              >
                <Undo2 className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={rehacer}
                disabled={!puedeRehacer}
                title="Rehacer (Ctrl+Y o Ctrl+Shift+Z)"
                className="p-1.5 hover:bg-background rounded text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent border-l border-border"
              >
                <Redo2 className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Edición o solo lectura */}
          {canEdit && (
            <Button
              onClick={() => setModoEdicion((v) => !v)}
              variant={modoEdicion ? 'default' : 'outline'}
              size="sm"
              className="h-8 text-xs font-semibold"
              title={modoEdicion ? 'Ocultar los controles y ver el documento limpio' : 'Mostrar los controles para editar el documento'}
            >
              {modoEdicion ? (
                <>
                  <Pencil className="w-3.5 h-3.5 mr-1.5" /> Editando
                </>
              ) : (
                <>
                  <Eye className="w-3.5 h-3.5 mr-1.5" /> Solo lectura
                </>
              )}
            </Button>
          )}

          {/* Botón Imprimir / PDF */}
          <Button onClick={handleImprimir} variant="outline" size="sm" className="h-8 text-xs font-semibold">
            <Printer className="w-3.5 h-3.5 mr-1.5" /> Imprimir / PDF
          </Button>

          {/* Acceso directo al Checador de Salidas de 10 min (solo en reglamento) */}
          {esReglamento && (
            <Link href="/checador">
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs bg-amber-500/10 border-amber-500/30 text-amber-800 dark:text-amber-300 hover:bg-amber-500/20 font-semibold"
                title="Abrir el Checador de Salidas de 10 min (Reglamento Art. IV)"
              >
                <Timer className="w-3.5 h-3.5 mr-1.5 text-amber-600 dark:text-amber-400" /> Checador (10 min)
              </Button>
            </Link>
          )}

          {/* Guardar cambios (si es editor/admin) */}
          {canEdit && (
            <Button
              onClick={handleGuardar}
              disabled={!cambiosPendientes || updateMutation.isPending}
              size="sm"
              className={cn('h-8 text-xs font-semibold', cambiosPendientes && 'animate-pulse')}
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

      {/* Banner informativo de política de salidas de 10 minutos (solo en reglamento) */}
      {esReglamento && (
        <div className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs print:hidden shadow-xs">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 bg-slate-200/80 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-lg">
              <Timer className="w-4 h-4" />
            </div>
            <div>
              <span className="font-bold text-slate-900 dark:text-slate-100">
                Control de Salidas Intermedias (Capítulo IV del Reglamento):
              </span>{' '}
              <span className="text-slate-600 dark:text-slate-300">
                El personal cuenta con 3 descansos de hasta 10 minutos al día con registro obligatorio y foto de evidencia.
              </span>
            </div>
          </div>
          <Link href="/checador">
            <Button size="sm" variant="outline" className="h-7 text-xs bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 shrink-0 font-semibold">
              <Timer className="w-3 h-3 mr-1 text-slate-600 dark:text-slate-400" /> Abrir Checador en Vivo
            </Button>
          </Link>
        </div>
      )}

      {editable && searchTerm.trim() && (
        <div className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 print:hidden">
          Estás filtrando por «{searchTerm}»: solo se muestran los capítulos que coinciden. Limpia la búsqueda para ver el documento completo.
        </div>
      )}

      {/* Contenedor con Navegación Lateral (Índice) y Hojas de Papel */}
      <div className="flex flex-col xl:flex-row items-start gap-6">
        {/* Índice lateral interactivo (nunca tapado por la barra de formato) */}
        <aside className="w-full xl:w-72 bg-card border border-border rounded-xl p-4 shadow-sm xl:sticky xl:top-2 max-h-[92vh] overflow-y-auto no-scrollbar print:hidden">
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-border">
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <ListOrdered className="w-4 h-4 text-primary" /> Índice del Reglamento
            </span>
            {editable && (
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
              <div key={sec.id} className="group/idx flex items-center gap-1">
                <a
                  href={`#${sec.id}`}
                  className="flex-1 min-w-0 block p-2 rounded-lg text-xs hover:bg-muted/70 transition-colors group"
                >
                  <div className="font-semibold text-foreground group-hover:text-primary leading-tight">
                    {sec.numero ? `${sec.numero}: ` : ''}{sec.titulo}
                  </div>
                  <div className="text-[10.5px] text-muted-foreground">
                    {sec.bloques.length} bloque{sec.bloques.length === 1 ? '' : 's'}
                  </div>
                </a>
                {editable && (
                  <div className="hidden group-hover/idx:flex items-center gap-0.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => moverSeccion(sec.id, -1)}
                      disabled={idx === 0}
                      title="Subir capítulo"
                      className="text-muted-foreground hover:text-foreground disabled:opacity-25"
                    >
                      <ArrowUp className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => moverSeccion(sec.id, 1)}
                      disabled={idx === secciones.length - 1}
                      title="Bajar capítulo"
                      className="text-muted-foreground hover:text-foreground disabled:opacity-25"
                    >
                      <ArrowDown className="w-3 h-3" />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </nav>
        </aside>

        {/* Visor de Páginas Tamaño Carta */}
        <main className="flex-1 w-full flex flex-col items-center pb-12">
          {/* Barra de Formato Fija/Adherente sobre las hojas del documento (siempre fija al hacer scroll) */}
          {editable && (
            <div className="sticky top-2 z-30 mb-4 print:hidden animate-in slide-in-from-top-1 duration-150 w-full max-w-[816px]">
              <BarraFormatoFlotante visible={editable} />
            </div>
          )}

          <div className="w-full overflow-x-auto flex flex-col items-center">
            <div
              id="documento-print"
              onFocusCapture={marcarFoco}
              onBlurCapture={marcarSalidaFoco}
              onContextMenu={abrirMenuContextual}
              className="hoja-carta-canvas hoja-zoom transition-transform duration-150 origin-top flex flex-col items-center space-y-8 print:space-y-0"
              style={{ transform: `scale(${zoom})` }}
            >
              {/* HOJA 1: PORTADA EJECUTIVA MODERNA FORMAL */}
              <div
                className="hoja-carta mx-auto bg-white text-slate-900 border border-slate-300 rounded-none flex flex-col justify-between shadow-xl shrink-0 box-border"
                style={{ width: ANCHO_HOJA, minHeight: ALTO_HOJA, padding: MARGEN_HOJA, fontFamily: 'Inter, system-ui, -apple-system, sans-serif' }}
              >
                {/* Header Superior Corporativo */}
                <div className="bg-[#0f172a] text-white -mx-14 -mt-14 px-8 py-5 flex items-center justify-between mb-8 shrink-0">
                  <div className="flex items-center gap-3">
                    <img src={COMPANY.logoPublicPath || '/logo_b.png'} alt="U3" className="w-10 h-10 object-contain bg-white p-1 rounded" />
                    <div>
                      <p className="text-[12px] font-extrabold uppercase tracking-widest">{COMPANY.razonSocial}</p>
                      <p className="text-[9.5px] text-slate-300 uppercase tracking-wider font-semibold">
                        {ambito === 'oficinas' ? 'Dirección General · Corporativo Insurgentes' : 'Dirección de Operaciones · Seguridad en Servicio'}
                      </p>
                    </div>
                  </div>
                  <span className="bg-blue-600 text-white font-mono text-[9.5px] font-bold px-2.5 py-1 uppercase tracking-wider rounded-xs">
                    {codigoDocumento}
                  </span>
                </div>

                {/* Cuerpo Principal de Portada */}
                <div className="my-auto py-6 space-y-8 flex-1 flex flex-col justify-center">
                  <div className="space-y-4 max-w-xl">
                    <div className="border-l-4 border-[#1e3a8a] pl-4 py-1">
                      <span className="text-[11px] font-extrabold uppercase tracking-widest text-blue-800 font-mono">DOCUMENTO RECTOR OFICIAL</span>
                      <h1 className="text-2xl sm:text-3xl font-extrabold uppercase leading-tight text-[#0f172a] tracking-tight mt-1">
                        {registro.titulo}
                      </h1>
                    </div>

                    <div className="text-[13px] text-slate-600 leading-relaxed font-medium pl-4">
                      <EditableText
                        value={contenidoLocal?.subtitulo ?? registro.descripcion ?? ''}
                        onChange={(subtitulo) => mutarContenido((c) => ({ ...c, subtitulo }))}
                        readOnly={!editable}
                        placeholder="Escribe el subtítulo o alcance del reglamento..."
                      />
                    </div>
                  </div>

                  {/* Ficha Técnica Corporativa Estructurada */}
                  <div className="max-w-lg border border-slate-200 bg-slate-50 p-5 rounded-none font-sans space-y-3">
                    <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 border-b border-slate-200 pb-1.5">
                      Control Documental Institucional
                    </p>
                    <div className="grid grid-cols-2 gap-3 text-[11px]">
                      <div>
                        <span className="text-slate-500 text-[10px] uppercase font-bold block">Ámbito de Aplicación</span>
                        <span className="font-bold text-[#0f172a]">
                          {esReglamento
                            ? (ambito === 'oficinas' ? 'Personal Administrativo y Directivo' : 'Personal Operativo y Guardias')
                            : (registro.categoria ? `${registro.categoria} · Aplicación General` : 'Todo el Personal Operativo')}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500 text-[10px] uppercase font-bold block">Versión Oficial</span>
                        <span className="font-mono font-bold text-[#0f172a]">{contenidoLocal?.version ?? 'V1.0-2026'}</span>
                      </div>
                      <div>
                        <span className="text-slate-500 text-[10px] uppercase font-bold block">Fecha de Emisión</span>
                        <span className="font-bold text-slate-800">{fechaEmision}</span>
                      </div>
                      <div>
                        <span className="text-slate-500 text-[10px] uppercase font-bold block">Clasificación</span>
                        <span className="font-bold text-slate-800 text-[10.5px] uppercase">
                          {esReglamento ? 'Reglamento Laboral Interno' : (registro.categoria || 'Normativa Institucional')}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Pie de Portada */}
                <footer className="hoja-footer border-t-2 border-[#0f172a] pt-3 mt-auto flex items-center justify-between gap-6 text-[10px] text-slate-600 font-sans w-full shrink-0">
                  <span className="font-bold leading-snug min-w-0 flex-1">{COMPANY.razonSocial} · {COMPANY.domicilio}</span>
                  <span className="font-mono font-bold whitespace-nowrap shrink-0">Hoja 1 de {totalHojas}</span>
                </footer>
              </div>

              {/* HOJA 2: ÍNDICE GENERAL (PARTE I) */}
              <div
                className="hoja-carta mx-auto bg-white text-slate-900 border border-slate-300 rounded-none flex flex-col justify-between shadow-xl shrink-0 box-border"
                style={{ width: ANCHO_HOJA, minHeight: ALTO_HOJA, padding: MARGEN_HOJA, fontFamily: 'Inter, system-ui, -apple-system, sans-serif' }}
              >
                <div className="border-b-2 border-[#1e3a8a] pb-2.5 flex items-center justify-between text-[10px] text-slate-600 font-sans tracking-wider uppercase shrink-0">
                  <span className="font-extrabold text-[#0f172a]">{COMPANY.razonSocial}</span>
                  <span className="font-semibold">Índice General{indicePartido ? ' · Parte I' : ''}</span>
                </div>

                <div className="my-auto py-2 space-y-3 font-sans flex-1">
                  <div className="border-b border-slate-200 pb-2">
                    <h2 className="text-lg font-extrabold uppercase tracking-tight text-[#0f172a]">Índice de Contenido{indicePartido ? ' (1 / 2)' : ''}</h2>
                    <p className="text-[11px] text-slate-500">Capítulos, políticas y secciones oficiales del documento</p>
                  </div>

                  <div className="space-y-1 text-[11.5px] leading-relaxed">
                    {secciones.slice(0, SECCIONES_POR_INDICE).map((sec) => {
                      const idxEnHojas = hojas.findIndex((h) => h.some((x) => x.seccionId === sec.id));
                      const pageNum = hojasPreliminares + 1 + (idxEnHojas >= 0 ? idxEnHojas : 0);
                      const isCapitulo = (sec.numero ?? '').toLowerCase().startsWith('capítulo') || sec.tipo === 'capitulo';
                      return (
                        <a
                          key={sec.id}
                          href={`#${sec.id}`}
                          className={cn(
                            'py-1.5 border-b border-slate-100 flex items-baseline justify-between hover:bg-slate-50 transition-colors',
                            isCapitulo ? 'font-extrabold text-[#0f172a] pt-3.5 text-[12px] uppercase' : 'text-slate-700 pl-4 font-medium'
                          )}
                        >
                          <div className="flex items-baseline gap-2 min-w-0 pr-4">
                            {sec.numero && (
                              <span className="font-mono text-blue-800 font-bold shrink-0 text-[11px]">{sec.numero}</span>
                            )}
                            <span className="break-words">{sec.titulo}</span>
                          </div>
                          <span className="font-mono text-[10.5px] font-bold text-slate-500 shrink-0 whitespace-nowrap">
                            Pág. {pageNum}
                          </span>
                        </a>
                      );
                    })}
                  </div>
                </div>

                <footer className="hoja-footer border-t border-slate-300 pt-3 mt-auto flex items-center justify-between gap-6 text-[10px] text-slate-600 font-sans w-full shrink-0">
                  <span className="font-bold leading-snug min-w-0 flex-1">{COMPANY.razonSocial} · Control Documental</span>
                  <span className="font-mono font-bold whitespace-nowrap shrink-0">Hoja 2 de {totalHojas}</span>
                </footer>
              </div>

              {/* HOJA 3: ÍNDICE GENERAL (PARTE II, solo en documentos extensos) */}
              {indicePartido && (
                <div
                  className="hoja-carta mx-auto bg-white text-slate-900 border border-slate-300 rounded-none flex flex-col justify-between shadow-xl shrink-0 box-border"
                  style={{ width: ANCHO_HOJA, minHeight: ALTO_HOJA, padding: MARGEN_HOJA, fontFamily: 'Inter, system-ui, -apple-system, sans-serif' }}
                >
                  <div className="border-b-2 border-[#1e3a8a] pb-2.5 flex items-center justify-between text-[10px] text-slate-600 font-sans tracking-wider uppercase shrink-0">
                    <span className="font-extrabold text-[#0f172a]">{COMPANY.razonSocial}</span>
                    <span className="font-semibold">Índice General · Parte II</span>
                  </div>

                  <div className="my-auto py-2 space-y-3 font-sans flex-1">
                    <div className="border-b border-slate-200 pb-2">
                      <h2 className="text-lg font-extrabold uppercase tracking-tight text-[#0f172a]">Índice de Contenido (2 / 2)</h2>
                      <p className="text-[11px] text-slate-500">Capítulos, anexos y cédulas de conformidad</p>
                    </div>

                    <div className="space-y-1 text-[11.5px] leading-relaxed">
                      {secciones.slice(SECCIONES_POR_INDICE).map((sec) => {
                        const idxEnHojas = hojas.findIndex((h) => h.some((x) => x.seccionId === sec.id));
                        const pageNum = hojasPreliminares + 1 + (idxEnHojas >= 0 ? idxEnHojas : 0);
                        const isCapitulo = (sec.numero ?? '').toLowerCase().startsWith('capítulo') || sec.tipo === 'capitulo';
                        return (
                          <a
                            key={sec.id}
                            href={`#${sec.id}`}
                            className={cn(
                              'py-1.5 border-b border-slate-100 flex items-baseline justify-between hover:bg-slate-50 transition-colors',
                              isCapitulo ? 'font-extrabold text-[#0f172a] pt-3.5 text-[12px] uppercase' : 'text-slate-700 pl-4 font-medium'
                            )}
                          >
                            <div className="flex items-baseline gap-2 min-w-0 pr-4">
                              {sec.numero && (
                                <span className="font-mono text-blue-800 font-bold shrink-0 text-[11px]">{sec.numero}</span>
                              )}
                              <span className="break-words">{sec.titulo}</span>
                            </div>
                            <span className="font-mono text-[10.5px] font-bold text-slate-500 shrink-0 whitespace-nowrap">
                              Pág. {pageNum}
                            </span>
                          </a>
                        );
                      })}
                    </div>
                  </div>

                  <footer className="hoja-footer border-t border-slate-300 pt-3 mt-auto flex items-center justify-between gap-6 text-[10px] text-slate-600 font-sans w-full shrink-0">
                    <span className="font-bold leading-snug min-w-0 flex-1">{COMPANY.razonSocial} · Control Documental</span>
                    <span className="font-mono font-bold whitespace-nowrap shrink-0">Hoja 3 de {totalHojas}</span>
                  </footer>
                </div>
              )}

              {/* HOJAS DE CONTENIDO DEL DOCUMENTO */}
              {hojas.map((hojaSecciones, hojaIdx) => (
                <div
                  key={hojaIdx}
                  data-hoja={hojaIdx}
                  className="hoja-carta bg-white text-slate-900 shadow-xl rounded-none relative flex flex-col justify-between border border-slate-200 shrink-0 box-border"
                  style={{
                    width: ANCHO_HOJA,
                    minHeight: ALTO_HOJA,
                    padding: MARGEN_HOJA,
                    fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
                  }}
                >
                  {/* Membrete Oficial Superior */}
                  <header
                    ref={hojaIdx === 0 ? membreteRef : undefined}
                    className="border-b-2 border-slate-900 pb-3 mb-6 flex items-center justify-between shrink-0"
                  >
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
                        {esReglamento ? `Reglamento Normativo · ${ambitoMeta.etiqueta}` : (registro.categoria || 'Normativa Oficial')}
                      </div>
                      <div className="text-[9.5px] text-slate-500 font-mono">
                        CÓDIGO: {codigoDocumento}
                      </div>
                    </div>
                  </header>

                  {/* Contenido de la hoja */}
                  <div className="hoja-contenido flex-1 space-y-6">
                    {hojaIdx === 0 && (
                      <div ref={portadillaRef} className="text-center pb-4 mb-4 border-b border-slate-200">
                        <h2 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight uppercase">
                          {registro.titulo}
                        </h2>
                        <div className="text-[11.5px] text-slate-600 font-medium mt-1 max-w-xl mx-auto italic">
                          <EditableText
                            value={contenidoLocal?.subtitulo ?? registro.descripcion ?? ''}
                            onChange={(subtitulo) => mutarContenido((c) => ({ ...c, subtitulo }))}
                            readOnly={!editable}
                            placeholder="Subtítulo o alcance del reglamento"
                            className="text-center"
                          />
                        </div>
                      </div>
                    )}

                    {hojaSecciones.map((frag) => {
                      const seccion = secciones.find((s) => s.id === frag.seccionId);
                      if (!seccion) return null;
                      const idxSeccion = secciones.findIndex((s) => s.id === frag.seccionId);
                      // Al congelar el reparto mientras se escribe, el último
                      // fragmento se estira para que un bloque recién insertado
                      // se vea de inmediato, pero nunca más allá de un salto de
                      // página: lo que va después es otra hoja.
                      const siguienteSalto = frag.ultimo
                        ? seccion.bloques.findIndex((b, i) => i >= frag.hasta && b.tipo === 'salto')
                        : -1;
                      const hasta = frag.ultimo
                        ? siguienteSalto === -1
                          ? seccion.bloques.length
                          : siguienteSalto + 1
                        : Math.min(frag.hasta, seccion.bloques.length);
                      return (
                        <SeccionVistaEditable
                          key={`${frag.seccionId}-${frag.desde}`}
                          seccion={seccion}
                          desde={Math.min(frag.desde, seccion.bloques.length)}
                          hasta={hasta}
                          continuacion={frag.continuacion}
                          ultimo={frag.ultimo}
                          primeraSeccion={idxSeccion === 0}
                          ultimaSeccion={idxSeccion === secciones.length - 1}
                          onActualizar={(fn) => actualizarSeccion(seccion.id, fn)}
                          onEliminar={() => eliminarSeccion(seccion.id)}
                          onMoverSeccion={(delta) => moverSeccion(seccion.id, delta)}
                          readOnly={!editable}
                        />
                      );
                    })}

                    {editable && (
                      <div className="pt-3 mt-2 border-t border-dashed border-slate-200 flex flex-wrap items-center justify-center gap-2 print:hidden">
                        {hojaAbiertaPorSalto(hojaSecciones[0]) && (
                          <button
                            type="button"
                            onClick={() => quitarHoja(hojaSecciones[0])}
                            title="Quita el salto que abre esta hoja y devuelve el contenido a la hoja anterior"
                            className="flex items-center gap-1.5 px-2.5 py-1 rounded border border-slate-300 text-[10.5px] font-semibold text-slate-500 hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50/50 transition-colors"
                          >
                            <Scissors className="w-3 h-3" /> Unir con la anterior
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => eliminarHoja(hojaIdx)}
                          title="Borra esta hoja completa, con todo lo que tenga dentro"
                          className="flex items-center gap-1.5 px-2.5 py-1 rounded border border-slate-300 text-[10.5px] font-semibold text-slate-500 hover:border-red-400 hover:text-red-600 hover:bg-red-50/50 transition-colors"
                        >
                          <Trash2 className="w-3 h-3" /> Eliminar esta hoja
                        </button>
                        <button
                          type="button"
                          onClick={() => agregarHojaTras(hojaSecciones[hojaSecciones.length - 1])}
                          title="Corta aquí el documento y abre una hoja nueva a continuación"
                          className="flex items-center gap-1.5 px-2.5 py-1 rounded border border-slate-300 text-[10.5px] font-semibold text-slate-500 hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50/50 transition-colors"
                        >
                          <FilePlus2 className="w-3 h-3" /> Hoja nueva después de esta
                        </button>
                      </div>
                    )}

                    {editable && hojaIdx === hojas.length - 1 && (
                      <div className="pt-4 print:hidden">
                        <button
                          type="button"
                          onClick={handleAgregarCapitulo}
                          className="w-full flex items-center justify-center gap-1.5 py-2 rounded border border-dashed border-slate-300 text-[11px] font-semibold text-slate-500 hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50/50 transition-colors"
                        >
                          <Plus className="w-3.5 h-3.5" /> Agregar capítulo al final del reglamento
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Pie de Página Oficial con Foliado */}
                  <footer
                    ref={hojaIdx === 0 ? pieRef : undefined}
                    className="hoja-footer border-t border-slate-200 pt-3 mt-auto flex items-center justify-between gap-6 text-[10px] text-slate-600 font-sans w-full shrink-0"
                  >
                    <div className="leading-snug min-w-0 flex-1 truncate">
                      <strong className="text-slate-800">{COMPANY.razonSocial}</strong> · {registro.titulo}
                    </div>
                    <div className="font-mono font-bold whitespace-nowrap shrink-0 text-slate-700">
                      Hoja {hojasPreliminares + hojaIdx + 1} de {totalHojas}
                    </div>
                  </footer>
                </div>
              ))}
            </div>
          </div>
        </main>
      </div>

      {confirmacion && (
        <DialogoConfirmar datos={confirmacion} onCerrar={() => setConfirmacion(null)} />
      )}

      {menuCtx && (
        <MenuContextual
          x={menuCtx.x}
          y={menuCtx.y}
          grupos={menuCtx.grupos}
          onCerrar={() => setMenuCtx(null)}
        />
      )}

      {/* Copia oculta del documento: solo sirve para medir el alto real de cada
          bloque con el ancho de columna de la hoja, tal como se imprime (sin
          los controles de edición, que no salen en papel). Nunca se ve. */}
      <div
        ref={medidorRef}
        aria-hidden
        className="pointer-events-none print:hidden"
        style={{
          position: 'fixed',
          top: 0,
          left: -99999,
          width: ANCHO_CONTENIDO,
          visibility: 'hidden',
          fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
        }}
      >
        {secciones.map((sec) => (
          <div key={sec.id}>
            <div data-medir-seccion={sec.id}>
              <SeccionVistaEditable
                seccion={sec}
                readOnly
                medicion
                primeraSeccion
                ultimaSeccion
                onActualizar={() => {}}
                onEliminar={() => {}}
                onMoverSeccion={() => {}}
              />
            </div>
            {/* El encabezado compacto de «continúa» mide distinto que el normal. */}
            <div data-medir-seccion={sec.id} data-medir-continuacion="si">
              <SeccionVistaEditable
                seccion={sec}
                readOnly
                medicion
                continuacion
                desde={0}
                hasta={Math.min(1, sec.bloques.length)}
                primeraSeccion
                ultimaSeccion
                onActualizar={() => {}}
                onEliminar={() => {}}
                onMoverSeccion={() => {}}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
