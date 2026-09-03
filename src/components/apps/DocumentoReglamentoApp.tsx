'use client';
import { useEffect, useState, useMemo, useRef } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/src/lib/api';
import { Button } from '@/src/components/ui/button';
import { Select } from '@/src/components/ui/select';
import {
  ArrowLeft, Printer, Plus, Trash2, ArrowUp, ArrowDown,
  ZoomIn, ZoomOut, RotateCcw, Loader2, CheckCircle2,
  BookOpen, Search, ShieldCheck, ListOrdered, Building2, Pencil, Eye, X,
  Timer,
} from 'lucide-react';
import { toast } from 'sonner';
import DOMPurify from 'isomorphic-dompurify';
import { COMPANY } from '@/src/lib/company';
import {
  bloqueVacio, ETIQUETA_BLOQUE, limpiarContenido, mover, paginarFragmentos, seccionVacia,
  type Bloque, type ContenidoDoc, type EstiloLista, type ProtocoloRegistro, type SeccionDoc, type TipoBloque,
} from '@/src/lib/documentoProtocolo';
import { cn } from '@/src/lib/utils';
import { useAuth } from '@/src/context/AuthContext';
import BarraFormatoFlotante from '@/src/components/reglamento/BarraFormatoFlotante';

const TIPOS_BLOQUE: TipoBloque[] = ['parrafo', 'subtitulo', 'lista', 'nota', 'tabla', 'campos', 'firma'];

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
            <div key={idx}>
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
    setContenidoLocal(registro.contenido as ContenidoDoc);
  }, [registro, ambito, protocoloId, cambiosPendientes]);

  // Cambiar de reglamento descarta el borrador en pantalla, nunca lo mezcla con el otro documento.
  const cambiarAmbito = (nuevo: AmbitoReglamento) => {
    if (nuevo === ambito) return;
    if (cambiosPendientes && !window.confirm('Tienes cambios sin guardar en este reglamento. ¿Cambiar de documento y descartarlos?')) {
      return;
    }
    setCambiosPendientes(false);
    setContenidoLocal(null);
    versionCargada.current = null;
    setSearchTerm('');
    setAmbito(nuevo);
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

  const layout = useMemo<FragmentoLayout[][]>(
    () =>
      paginarFragmentos(seccionesFiltradas).map((hoja) =>
        hoja.map((f) => ({
          seccionId: f.seccion.id,
          desde: f.desde,
          hasta: f.hasta,
          continuacion: f.continuacion,
          ultimo: f.ultimo,
        }))
      ),
    [seccionesFiltradas]
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

  const marcarFoco = () => {
    if (finEscrituraRef.current) clearTimeout(finEscrituraRef.current);
    finEscrituraRef.current = null;
    setEscribiendo(true);
  };

  const marcarSalidaFoco = () => {
    if (finEscrituraRef.current) clearTimeout(finEscrituraRef.current);
    // Pasar de un campo a otro dispara blur y focus seguidos: se espera un
    // instante para no recalcular las hojas en ese hueco.
    finEscrituraRef.current = setTimeout(() => setEscribiendo(false), 200);
  };

  useEffect(() => () => {
    if (finEscrituraRef.current) clearTimeout(finEscrituraRef.current);
  }, []);

  /** Todos los cambios se aplican sobre la última versión del contenido, nunca
   *  sobre la copia que tenía el render en el que se hizo clic. */
  const mutarContenido = (fn: (c: ContenidoDoc) => ContenidoDoc) => {
    setContenidoLocal((prev) => (prev ? fn(prev) : prev));
    setCambiosPendientes(true);
  };

  const actualizarSeccion = (id: string, fn: (s: SeccionDoc) => SeccionDoc) =>
    mutarContenido((c) => ({ ...c, secciones: c.secciones.map((s) => (s.id === id ? fn(s) : s)) }));

  const eliminarSeccion = (id: string) => {
    const sec = secciones.find((s) => s.id === id);
    if (sec && !window.confirm(`¿Eliminar "${sec.titulo}" y todo su contenido?`)) return;
    mutarContenido((c) => ({ ...c, secciones: c.secciones.filter((s) => s.id !== id) }));
  };

  const moverSeccion = (id: string, delta: number) =>
    mutarContenido((c) => {
      const i = c.secciones.findIndex((s) => s.id === id);
      if (i < 0) return c;
      return { ...c, secciones: mover(c.secciones, i, delta) };
    });

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
          .hoja-carta {
            width: 215.9mm !important;
            height: 279.4mm !important;
            min-height: 279.4mm !important;
            max-height: 279.4mm !important;
            padding: 16mm 18mm 14mm 18mm !important;
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
              className="hoja-carta-canvas hoja-zoom transition-transform duration-150 origin-top flex flex-col items-center space-y-8 print:space-y-0"
              style={{ transform: `scale(${zoom})` }}
            >
              {/* HOJA 1: PORTADA EJECUTIVA MODERNA FORMAL */}
              <div
                className="hoja-carta mx-auto bg-white text-slate-900 border border-slate-300 rounded-none p-12 sm:p-14 flex flex-col justify-between shadow-xl shrink-0 box-border overflow-hidden"
                style={{ width: '816px', height: '1056px', minHeight: '1056px', maxHeight: '1056px', maxWidth: '100%', fontFamily: 'Inter, system-ui, -apple-system, sans-serif' }}
              >
                {/* Header Superior Corporativo */}
                <div className="bg-[#0f172a] text-white -mx-12 -mt-12 sm:-mx-14 sm:-mt-14 px-8 py-5 flex items-center justify-between mb-8 shrink-0">
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
                className="hoja-carta mx-auto bg-white text-slate-900 border border-slate-300 rounded-none p-12 sm:p-14 flex flex-col justify-between shadow-xl shrink-0 box-border overflow-hidden"
                style={{ width: '816px', height: '1056px', minHeight: '1056px', maxHeight: '1056px', maxWidth: '100%', fontFamily: 'Inter, system-ui, -apple-system, sans-serif' }}
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
                  className="hoja-carta mx-auto bg-white text-slate-900 border border-slate-300 rounded-none p-12 sm:p-14 flex flex-col justify-between shadow-xl shrink-0 box-border overflow-hidden"
                  style={{ width: '816px', height: '1056px', minHeight: '1056px', maxHeight: '1056px', maxWidth: '100%', fontFamily: 'Inter, system-ui, -apple-system, sans-serif' }}
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
                  className="hoja-carta w-[816px] h-[1056px] min-h-[1056px] max-h-[1056px] bg-white text-slate-900 shadow-xl rounded-none p-12 sm:p-14 relative flex flex-col justify-between border border-slate-200 shrink-0 box-border overflow-hidden"
                  style={{
                    fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
                  }}
                >
                  {/* Membrete Oficial Superior */}
                  <header className="border-b-2 border-slate-900 pb-3 mb-6 flex items-center justify-between shrink-0">
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
                  <div className="flex-1 space-y-6 overflow-hidden">
                    {hojaIdx === 0 && (
                      <div className="text-center pb-4 mb-4 border-b border-slate-200">
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
                      // fragmento se estira hasta el final para que un bloque
                      // recién insertado se vea de inmediato.
                      const hasta = frag.ultimo ? seccion.bloques.length : Math.min(frag.hasta, seccion.bloques.length);
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
                  <footer className="hoja-footer border-t border-slate-200 pt-3 mt-auto flex items-center justify-between gap-6 text-[10px] text-slate-600 font-sans w-full shrink-0">
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
    </div>
  );
}
