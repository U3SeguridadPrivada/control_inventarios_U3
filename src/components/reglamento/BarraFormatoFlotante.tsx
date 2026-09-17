'use client';
import React, { useState, useEffect, useRef } from 'react';
import {
  Bold,
  Italic,
  Underline,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  Type,
  Palette,
  Highlighter,
  RemoveFormatting,
  MoveVertical,
} from 'lucide-react';
import { cn } from '@/src/lib/utils';

const COLORES_TEXTO = [
  { nombre: 'Predeterminado', color: '#0f172a', label: 'Negro' },
  { nombre: 'Azul Institucional', color: '#1d4ed8', label: 'Azul' },
  { nombre: 'Rojo Alerta', color: '#dc2626', label: 'Rojo' },
  { nombre: 'Verde Éxito', color: '#16a34a', label: 'Verde' },
  { nombre: 'Gris Secundario', color: '#64748b', label: 'Gris' },
];

const COLORES_RESALTADO = [
  { nombre: 'Sin resaltado', color: 'transparent', label: 'Ninguno' },
  { nombre: 'Amarillo suave', color: '#fef08a', label: 'Amarillo' },
  { nombre: 'Verde claro', color: '#bbf7d0', label: 'Verde' },
  { nombre: 'Azul tenue', color: '#bfdbfe', label: 'Azul' },
  { nombre: 'Naranja suave', color: '#fed7aa', label: 'Naranja' },
];

const TAMANOS_TEXTO = [
  { etiqueta: '10px (Muy pequeño)', valor: '10px' },
  { etiqueta: '11.5px (Estándar)', valor: '11.5px' },
  { etiqueta: '12px (Normal)', valor: '12px' },
  { etiqueta: '12.5px (Intermedio)', valor: '12.5px' },
  { etiqueta: '13px (Mediano)', valor: '13px' },
  { etiqueta: '14.5px (Destacado)', valor: '14.5px' },
  { etiqueta: '16px (Subtítulo)', valor: '16px' },
  { etiqueta: '18px (Título)', valor: '18px' },
  { etiqueta: '22px (Grande)', valor: '22px' },
];

const INTERLINEADOS = [
  { etiqueta: '1.15 (Compacto)', valor: '1.15' },
  { etiqueta: '1.30 (Normal)', valor: '1.3' },
  { etiqueta: '1.42 (Estándar Contrato)', valor: '1.42' },
  { etiqueta: '1.50 (Medio)', valor: '1.5' },
  { etiqueta: '1.75 (Relajado)', valor: '1.75' },
  { etiqueta: '2.00 (Doble)', valor: '2.0' },
];

interface BarraFormatoProps {
  visible?: boolean;
}

export default function BarraFormatoFlotante({ visible = true }: BarraFormatoProps) {
  const [mostrarPaletaTexto, setMostrarPaletaTexto] = useState(false);
  const [mostrarPaletaFondo, setMostrarPaletaFondo] = useState(false);
  const [mostrarTamanos, setMostrarTamanos] = useState(false);
  const [mostrarInterlineado, setMostrarInterlineado] = useState(false);

  const barraRef = useRef<HTMLDivElement>(null);
  const savedRangeRef = useRef<Range | null>(null);

  // Guardar continuamente la selección del usuario mientras está dentro de un bloque editable
  useEffect(() => {
    const guardarSeleccion = () => {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return;

      const anchor = sel.anchorNode;
      let curr: Node | null = anchor;
      let dentroDeEditable = false;

      while (curr && curr !== document.body) {
        if (curr instanceof HTMLElement && curr.isContentEditable) {
          dentroDeEditable = true;
          break;
        }
        curr = curr.parentNode;
      }

      if (dentroDeEditable) {
        savedRangeRef.current = sel.getRangeAt(0).cloneRange();
      }
    };

    document.addEventListener('selectionchange', guardarSeleccion);
    return () => document.removeEventListener('selectionchange', guardarSeleccion);
  }, []);

  // Cerrar popovers sólo al hacer clic fuera de la barra de formato
  useEffect(() => {
    const handleClickFuera = (e: MouseEvent) => {
      if (barraRef.current && !barraRef.current.contains(e.target as Node)) {
        setMostrarTamanos(false);
        setMostrarInterlineado(false);
        setMostrarPaletaTexto(false);
        setMostrarPaletaFondo(false);
      }
    };

    document.addEventListener('mousedown', handleClickFuera);
    return () => document.removeEventListener('mousedown', handleClickFuera);
  }, []);

  // Obtener la selección activa o restaurar la última guardada
  const obtenerORestaurarSeleccion = (): Range | null => {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0 && !sel.isCollapsed) {
      return sel.getRangeAt(0);
    }
    if (savedRangeRef.current) {
      if (sel) {
        sel.removeAllRanges();
        sel.addRange(savedRangeRef.current);
      }
      return savedRangeRef.current;
    }
    return null;
  };

  // Notificar al componente EditableText para que guarde los cambios en el estado React
  const dispararCambioEnContenedor = (nodo: Node | null) => {
    let curr: Node | null = nodo;
    let contenedorEditable: HTMLElement | null = null;

    while (curr && curr !== document.body) {
      if (curr instanceof HTMLElement && curr.isContentEditable) {
        contenedorEditable = curr;
        break;
      }
      curr = curr.parentNode;
    }

    if (!contenedorEditable) {
      const activo = document.activeElement as HTMLElement | null;
      if (activo && activo.isContentEditable) {
        contenedorEditable = activo;
      }
    }

    if (contenedorEditable) {
      contenedorEditable.focus();
      contenedorEditable.dispatchEvent(new Event('input', { bubbles: true }));
    }
  };

  const ejecutarComando = (comando: string, valor?: string) => {
    const range = obtenerORestaurarSeleccion();
    document.execCommand(comando, false, valor);
    dispararCambioEnContenedor(range ? range.commonAncestorContainer : null);
  };

  const aplicarEstiloSeleccion = (propiedad: string, valor: string) => {
    const range = obtenerORestaurarSeleccion();
    if (!range || range.collapsed) return;

    try {
      const span = document.createElement('span');
      span.style.setProperty(propiedad, valor);
      span.appendChild(range.extractContents());
      range.insertNode(span);

      // Mantener la selección activa sobre el nuevo elemento
      const sel = window.getSelection();
      if (sel) {
        sel.removeAllRanges();
        const nuevoRango = document.createRange();
        nuevoRango.selectNodeContents(span);
        sel.addRange(nuevoRango);
        savedRangeRef.current = nuevoRango.cloneRange();
      }

      dispararCambioEnContenedor(span);
    } catch (e) {
      console.warn('No se pudo aplicar el estilo a la selección:', e);
    }
  };

  const aplicarInterlineado = (valor: string) => {
    let range = obtenerORestaurarSeleccion();
    if (!range) return;

    // Si no hay texto seleccionado (solo cursor en el párrafo), seleccionar todo el bloque editable
    if (range.collapsed) {
      let curr: Node | null = range.startContainer;
      let editable: HTMLElement | null = null;
      while (curr && curr !== document.body) {
        if (curr instanceof HTMLElement && curr.isContentEditable) {
          editable = curr;
          break;
        }
        curr = curr.parentNode;
      }
      if (editable) {
        const nuevoRango = document.createRange();
        nuevoRango.selectNodeContents(editable);
        const sel = window.getSelection();
        if (sel) {
          sel.removeAllRanges();
          sel.addRange(nuevoRango);
        }
        savedRangeRef.current = nuevoRango;
        range = nuevoRango;
      }
    }

    if (!range || range.collapsed) return;

    try {
      const span = document.createElement('span');
      span.style.setProperty('line-height', valor);
      span.style.setProperty('display', 'inline-block');
      span.style.setProperty('width', '100%');
      span.appendChild(range.extractContents());
      range.insertNode(span);

      const sel = window.getSelection();
      if (sel) {
        sel.removeAllRanges();
        const nuevoRango = document.createRange();
        nuevoRango.selectNodeContents(span);
        sel.addRange(nuevoRango);
        savedRangeRef.current = nuevoRango.cloneRange();
      }

      dispararCambioEnContenedor(span);
    } catch (e) {
      console.warn('No se pudo aplicar el interlineado:', e);
    }
  };

  const limpiarFormato = () => {
    const range = obtenerORestaurarSeleccion();
    document.execCommand('removeFormat', false);
    if (range && !range.collapsed) {
      try {
        const text = range.toString();
        range.deleteContents();
        const textNode = document.createTextNode(text);
        range.insertNode(textNode);
        dispararCambioEnContenedor(textNode);
      } catch (e) {
        console.warn('Error al limpiar formato:', e);
      }
    } else {
      dispararCambioEnContenedor(null);
    }
  };

  if (!visible) return null;

  return (
    <div
      ref={barraRef}
      className="bg-slate-900/95 text-white border border-slate-700/80 shadow-lg rounded-xl px-3 py-1.5 flex flex-wrap items-center gap-1.5 backdrop-blur-md transition-all z-40 print:hidden text-xs"
    >
      <div className="flex items-center gap-1 pr-2.5 border-r border-slate-700 text-slate-400 font-semibold text-[10px] uppercase tracking-wider select-none">
        <span>Formato</span>
      </div>

      {/* Botones de Estilo Básico */}
      <div className="flex items-center gap-0.5">
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={(e) => {
            e.stopPropagation();
            ejecutarComando('bold');
          }}
          title="Negrita (Ctrl+B)"
          className="p-1.5 rounded hover:bg-slate-800 hover:text-blue-400 active:scale-95 text-slate-300 transition-all"
        >
          <Bold className="w-3.5 h-3.5" />
        </button>

        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={(e) => {
            e.stopPropagation();
            ejecutarComando('italic');
          }}
          title="Cursiva (Ctrl+I)"
          className="p-1.5 rounded hover:bg-slate-800 hover:text-blue-400 active:scale-95 text-slate-300 transition-all"
        >
          <Italic className="w-3.5 h-3.5" />
        </button>

        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={(e) => {
            e.stopPropagation();
            ejecutarComando('underline');
          }}
          title="Subrayado (Ctrl+U)"
          className="p-1.5 rounded hover:bg-slate-800 hover:text-blue-400 active:scale-95 text-slate-300 transition-all"
        >
          <Underline className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="h-4 w-px bg-slate-700 mx-0.5" />

      {/* Selector de Tamaño de Texto */}
      <div className="relative">
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={(e) => {
            e.stopPropagation();
            setMostrarTamanos((v) => !v);
            setMostrarInterlineado(false);
            setMostrarPaletaTexto(false);
            setMostrarPaletaFondo(false);
          }}
          title="Cambiar tamaño de texto"
          className={cn(
            "flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium transition-colors",
            mostrarTamanos ? "bg-slate-800 text-blue-400" : "hover:bg-slate-800 text-slate-200"
          )}
        >
          <Type className="w-3.5 h-3.5 text-blue-400" />
          <span>Tamaño</span>
        </button>

        {mostrarTamanos && (
          <div
            className="absolute top-full mt-1 left-0 bg-slate-900 border border-slate-700 rounded-lg shadow-xl p-1.5 z-50 min-w-[160px] space-y-0.5 animate-in fade-in zoom-in-95 duration-100"
          >
            <div className="text-[10px] text-slate-400 font-semibold px-2 py-1 uppercase tracking-wider border-b border-slate-800 mb-1">
              Tamaño de fuente
            </div>
            {TAMANOS_TEXTO.map((t) => (
              <button
                key={t.valor}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={(e) => {
                  e.stopPropagation();
                  aplicarEstiloSeleccion('font-size', t.valor);
                  setMostrarTamanos(false);
                }}
                className="w-full text-left px-2 py-1 rounded hover:bg-slate-800 text-[11px] text-slate-200 flex items-center justify-between transition-colors"
              >
                <span>{t.etiqueta}</span>
                <span className="text-[10px] font-mono text-slate-500">{t.valor}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Selector de Interlineado */}
      <div className="relative">
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={(e) => {
            e.stopPropagation();
            setMostrarInterlineado((v) => !v);
            setMostrarTamanos(false);
            setMostrarPaletaTexto(false);
            setMostrarPaletaFondo(false);
          }}
          title="Interlineado (Espaciado entre líneas)"
          className={cn(
            "flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium transition-colors",
            mostrarInterlineado ? "bg-slate-800 text-teal-400" : "hover:bg-slate-800 text-slate-200"
          )}
        >
          <MoveVertical className="w-3.5 h-3.5 text-teal-400" />
          <span>Interlineado</span>
        </button>

        {mostrarInterlineado && (
          <div
            className="absolute top-full mt-1 left-0 bg-slate-900 border border-slate-700 rounded-lg shadow-xl p-1.5 z-50 min-w-[180px] space-y-0.5 animate-in fade-in zoom-in-95 duration-100"
          >
            <div className="text-[10px] text-slate-400 font-semibold px-2 py-1 uppercase tracking-wider border-b border-slate-800 mb-1">
              Espaciado entre líneas
            </div>
            {INTERLINEADOS.map((item) => (
              <button
                key={item.valor}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={(e) => {
                  e.stopPropagation();
                  aplicarInterlineado(item.valor);
                  setMostrarInterlineado(false);
                }}
                className="w-full text-left px-2 py-1 rounded hover:bg-slate-800 text-[11px] text-slate-200 flex items-center justify-between transition-colors"
              >
                <span>{item.etiqueta}</span>
                <span className="text-[10px] font-mono text-slate-500">{item.valor}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Color de Texto */}
      <div className="relative">
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={(e) => {
            e.stopPropagation();
            setMostrarPaletaTexto((v) => !v);
            setMostrarTamanos(false);
            setMostrarInterlineado(false);
            setMostrarPaletaFondo(false);
          }}
          title="Color de texto"
          className={cn(
            "flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium transition-colors",
            mostrarPaletaTexto ? "bg-slate-800 text-indigo-400" : "hover:bg-slate-800 text-slate-200"
          )}
        >
          <Palette className="w-3.5 h-3.5 text-indigo-400" />
          <span>Color</span>
        </button>

        {mostrarPaletaTexto && (
          <div
            className="absolute top-full mt-1 left-0 bg-slate-900 border border-slate-700 rounded-lg shadow-xl p-2 z-50 min-w-[150px] space-y-1 animate-in fade-in zoom-in-95 duration-100"
          >
            <div className="text-[10px] text-slate-400 font-semibold px-1 uppercase tracking-wider border-b border-slate-800 pb-1 mb-1">
              Color de letra
            </div>
            {COLORES_TEXTO.map((c) => (
              <button
                key={c.color}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={(e) => {
                  e.stopPropagation();
                  aplicarEstiloSeleccion('color', c.color);
                  setMostrarPaletaTexto(false);
                }}
                className="w-full text-left px-2 py-1 rounded hover:bg-slate-800 text-[11px] text-slate-200 flex items-center gap-2 transition-colors"
              >
                <span className="w-3 h-3 rounded-full border border-slate-500 shrink-0" style={{ backgroundColor: c.color }} />
                <span>{c.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Resaltador / Fondo */}
      <div className="relative">
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={(e) => {
            e.stopPropagation();
            setMostrarPaletaFondo((v) => !v);
            setMostrarTamanos(false);
            setMostrarInterlineado(false);
            setMostrarPaletaTexto(false);
          }}
          title="Resaltador / Marcatextos"
          className={cn(
            "flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium transition-colors",
            mostrarPaletaFondo ? "bg-slate-800 text-yellow-400" : "hover:bg-slate-800 text-slate-200"
          )}
        >
          <Highlighter className="w-3.5 h-3.5 text-yellow-400" />
          <span>Resaltar</span>
        </button>

        {mostrarPaletaFondo && (
          <div
            className="absolute top-full mt-1 left-0 bg-slate-900 border border-slate-700 rounded-lg shadow-xl p-2 z-50 min-w-[150px] space-y-1 animate-in fade-in zoom-in-95 duration-100"
          >
            <div className="text-[10px] text-slate-400 font-semibold px-1 uppercase tracking-wider border-b border-slate-800 pb-1 mb-1">
              Marcatextos
            </div>
            {COLORES_RESALTADO.map((c) => (
              <button
                key={c.color}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={(e) => {
                  e.stopPropagation();
                  if (c.color === 'transparent') {
                    aplicarEstiloSeleccion('background-color', 'transparent');
                  } else {
                    aplicarEstiloSeleccion('background-color', c.color);
                  }
                  setMostrarPaletaFondo(false);
                }}
                className="w-full text-left px-2 py-1 rounded hover:bg-slate-800 text-[11px] text-slate-200 flex items-center gap-2 transition-colors"
              >
                <span className="w-3 h-3 rounded border border-slate-500 shrink-0" style={{ backgroundColor: c.color === 'transparent' ? '#334155' : c.color }} />
                <span>{c.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="h-4 w-px bg-slate-700 mx-0.5" />

      {/* Alineación */}
      <div className="flex items-center gap-0.5">
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={(e) => {
            e.stopPropagation();
            ejecutarComando('justifyLeft');
          }}
          title="Alinear a la izquierda"
          className="p-1.5 rounded hover:bg-slate-800 hover:text-blue-400 text-slate-300 transition-colors"
        >
          <AlignLeft className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={(e) => {
            e.stopPropagation();
            ejecutarComando('justifyCenter');
          }}
          title="Centrar"
          className="p-1.5 rounded hover:bg-slate-800 hover:text-blue-400 text-slate-300 transition-colors"
        >
          <AlignCenter className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={(e) => {
            e.stopPropagation();
            ejecutarComando('justifyRight');
          }}
          title="Alinear a la derecha"
          className="p-1.5 rounded hover:bg-slate-800 hover:text-blue-400 text-slate-300 transition-colors"
        >
          <AlignRight className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={(e) => {
            e.stopPropagation();
            ejecutarComando('justifyFull');
          }}
          title="Justificar texto"
          className="p-1.5 rounded hover:bg-slate-800 hover:text-blue-400 text-slate-300 transition-colors"
        >
          <AlignJustify className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="h-4 w-px bg-slate-700 mx-0.5" />

      {/* Limpiar formato */}
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={(e) => {
          e.stopPropagation();
          limpiarFormato();
        }}
        title="Quitar formato del texto seleccionado"
        className="flex items-center gap-1 px-2 py-1 rounded hover:bg-red-950/60 text-slate-400 hover:text-red-300 text-[10.5px] transition-colors"
      >
        <RemoveFormatting className="w-3 h-3" />
        <span className="hidden sm:inline">Quitar formato</span>
      </button>

      {/* Atajos de teclado */}
      <div className="hidden xl:flex items-center text-[10.5px] text-slate-400 ml-auto pl-2">
        <span>
          Atajos: <strong className="text-slate-300">Ctrl+B</strong>, <strong className="text-slate-300">Ctrl+U</strong>, <strong className="text-slate-300">Ctrl+I</strong>
        </span>
      </div>
    </div>
  );
}
