'use client';
import React, { useState, useEffect } from 'react';
import {
  Bold, Italic, Underline, AlignLeft, AlignCenter, AlignRight, AlignJustify,
  Type, Palette, Highlighter, RemoveFormatting, Sparkles
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
  { etiqueta: '10px (Pequeño)', valor: '10px' },
  { etiqueta: '11.5px (Estándar)', valor: '11.5px' },
  { etiqueta: '13px (Mediano)', valor: '13px' },
  { etiqueta: '14.5px (Destacado)', valor: '14.5px' },
  { etiqueta: '16px (Subtítulo)', valor: '16px' },
  { etiqueta: '18px (Título)', valor: '18px' },
  { etiqueta: '22px (Grande)', valor: '22px' },
];

interface BarraFormatoProps {
  visible?: boolean;
}

export default function BarraFormatoFlotante({ visible = true }: BarraFormatoProps) {
  const [mostrarPaletaTexto, setMostrarPaletaTexto] = useState(false);
  const [mostrarPaletaFondo, setMostrarPaletaFondo] = useState(false);
  const [mostrarTamanos, setMostrarTamanos] = useState(false);
  const [seleccionActiva, setSeleccionActiva] = useState(false);

  useEffect(() => {
    const checkSelection = () => {
      const sel = window.getSelection();
      setSeleccionActiva(!!(sel && !sel.isCollapsed && sel.toString().trim().length > 0));
    };

    document.addEventListener('selectionchange', checkSelection);
    return () => document.removeEventListener('selectionchange', checkSelection);
  }, []);

  const dispararCambioEnActivo = () => {
    const el = document.activeElement as HTMLElement | null;
    if (el && el.isContentEditable) {
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }
  };

  const ejecutarComando = (comando: string, valor?: string) => {
    document.execCommand(comando, false, valor);
    dispararCambioEnActivo();
  };

  const aplicarEstiloSeleccion = (propiedad: string, valor: string) => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);

    if (sel.isCollapsed) {
      return;
    }

    try {
      const span = document.createElement('span');
      span.style.setProperty(propiedad, valor);
      span.appendChild(range.extractContents());
      range.insertNode(span);

      // Mantener la selección
      sel.removeAllRanges();
      const nuevoRango = document.createRange();
      nuevoRango.selectNodeContents(span);
      sel.addRange(nuevoRango);

      dispararCambioEnActivo();
    } catch (e) {
      console.warn('No se pudo aplicar estilo a la selección:', e);
    }
  };

  const limpiarFormato = () => {
    document.execCommand('removeFormat', false);
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed) {
      // Limpiar spans envolventes si los hay
      const range = sel.getRangeAt(0);
      const text = range.toString();
      range.deleteContents();
      range.insertNode(document.createTextNode(text));
    }
    dispararCambioEnActivo();
  };

  if (!visible) return null;

  return (
    <div className="bg-slate-900/95 text-white border border-slate-700/80 shadow-2xl rounded-xl px-3 py-1.5 flex flex-wrap items-center gap-1.5 backdrop-blur-md transition-all duration-200 z-40 print:hidden text-xs">
      <div className="flex items-center gap-1 pr-2 border-r border-slate-700">
        <Sparkles className="w-3.5 h-3.5 text-amber-400" />
        <span className="text-[11px] font-semibold text-slate-200">Formato:</span>
      </div>

      {/* Botones de Estilo Básico */}
      <div className="flex items-center gap-0.5">
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            ejecutarComando('bold');
          }}
          title="Negrita (Ctrl+B)"
          className="p-1.5 rounded hover:bg-slate-800 hover:text-blue-400 active:scale-95 transition-all"
        >
          <Bold className="w-3.5 h-3.5" />
        </button>

        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            ejecutarComando('italic');
          }}
          title="Cursiva (Ctrl+I)"
          className="p-1.5 rounded hover:bg-slate-800 hover:text-blue-400 active:scale-95 transition-all"
        >
          <Italic className="w-3.5 h-3.5" />
        </button>

        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            ejecutarComando('underline');
          }}
          title="Subrayado (Ctrl+U)"
          className="p-1.5 rounded hover:bg-slate-800 hover:text-blue-400 active:scale-95 transition-all"
        >
          <Underline className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="h-4 w-px bg-slate-700" />

      {/* Selector de Tamaño de Texto */}
      <div className="relative">
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            setMostrarTamanos((v) => !v);
            setMostrarPaletaTexto(false);
            setMostrarPaletaFondo(false);
          }}
          title="Cambiar tamaño de texto"
          className="flex items-center gap-1 px-2 py-1 rounded hover:bg-slate-800 text-[11px] text-slate-200"
        >
          <Type className="w-3.5 h-3.5 text-blue-400" />
          <span>Tamaño</span>
        </button>

        {mostrarTamanos && (
          <div
            onMouseDown={(e) => e.preventDefault()}
            className="absolute top-full mt-1 left-0 bg-slate-900 border border-slate-700 rounded-lg shadow-xl p-1.5 z-50 min-w-[150px] space-y-0.5"
          >
            <div className="text-[10px] text-slate-400 font-semibold px-2 py-0.5 uppercase tracking-wider">
              Tamaño de fuente
            </div>
            {TAMANOS_TEXTO.map((t) => (
              <button
                key={t.valor}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  aplicarEstiloSeleccion('font-size', t.valor);
                  setMostrarTamanos(false);
                }}
                className="w-full text-left px-2 py-1 rounded hover:bg-slate-800 text-[11px] text-slate-200 flex items-center justify-between"
              >
                <span>{t.etiqueta}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Color de Texto */}
      <div className="relative">
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            setMostrarPaletaTexto((v) => !v);
            setMostrarTamanos(false);
            setMostrarPaletaFondo(false);
          }}
          title="Color de texto"
          className="flex items-center gap-1 px-2 py-1 rounded hover:bg-slate-800 text-[11px] text-slate-200"
        >
          <Palette className="w-3.5 h-3.5 text-indigo-400" />
          <span>Color</span>
        </button>

        {mostrarPaletaTexto && (
          <div
            onMouseDown={(e) => e.preventDefault()}
            className="absolute top-full mt-1 left-0 bg-slate-900 border border-slate-700 rounded-lg shadow-xl p-2 z-50 min-w-[140px] space-y-1"
          >
            <div className="text-[10px] text-slate-400 font-semibold px-1 uppercase tracking-wider">
              Color de letra
            </div>
            {COLORES_TEXTO.map((c) => (
              <button
                key={c.color}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  ejecutarComando('foreColor', c.color);
                  setMostrarPaletaTexto(false);
                }}
                className="w-full text-left px-2 py-1 rounded hover:bg-slate-800 text-[11px] text-slate-200 flex items-center gap-2"
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
          onMouseDown={(e) => {
            e.preventDefault();
            setMostrarPaletaFondo((v) => !v);
            setMostrarTamanos(false);
            setMostrarPaletaTexto(false);
          }}
          title="Resaltador / Marcatextos"
          className="flex items-center gap-1 px-2 py-1 rounded hover:bg-slate-800 text-[11px] text-slate-200"
        >
          <Highlighter className="w-3.5 h-3.5 text-yellow-400" />
          <span>Resaltar</span>
        </button>

        {mostrarPaletaFondo && (
          <div
            onMouseDown={(e) => e.preventDefault()}
            className="absolute top-full mt-1 left-0 bg-slate-900 border border-slate-700 rounded-lg shadow-xl p-2 z-50 min-w-[140px] space-y-1"
          >
            <div className="text-[10px] text-slate-400 font-semibold px-1 uppercase tracking-wider">
              Marcatextos
            </div>
            {COLORES_RESALTADO.map((c) => (
              <button
                key={c.color}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  if (c.color === 'transparent') {
                    aplicarEstiloSeleccion('background-color', 'transparent');
                  } else {
                    aplicarEstiloSeleccion('background-color', c.color);
                  }
                  setMostrarPaletaFondo(false);
                }}
                className="w-full text-left px-2 py-1 rounded hover:bg-slate-800 text-[11px] text-slate-200 flex items-center gap-2"
              >
                <span className="w-3 h-3 rounded border border-slate-500 shrink-0" style={{ backgroundColor: c.color === 'transparent' ? '#334155' : c.color }} />
                <span>{c.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="h-4 w-px bg-slate-700" />

      {/* Alineación */}
      <div className="flex items-center gap-0.5">
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            ejecutarComando('justifyLeft');
          }}
          title="Alinear a la izquierda"
          className="p-1.5 rounded hover:bg-slate-800 hover:text-blue-400 transition-colors"
        >
          <AlignLeft className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            ejecutarComando('justifyCenter');
          }}
          title="Centrar"
          className="p-1.5 rounded hover:bg-slate-800 hover:text-blue-400 transition-colors"
        >
          <AlignCenter className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            ejecutarComando('justifyRight');
          }}
          title="Alinear a la derecha"
          className="p-1.5 rounded hover:bg-slate-800 hover:text-blue-400 transition-colors"
        >
          <AlignRight className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            ejecutarComando('justifyFull');
          }}
          title="Justificar texto"
          className="p-1.5 rounded hover:bg-slate-800 hover:text-blue-400 transition-colors"
        >
          <AlignJustify className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="h-4 w-px bg-slate-700" />

      {/* Limpiar formato */}
      <button
        type="button"
        onMouseDown={(e) => {
          e.preventDefault();
          limpiarFormato();
        }}
        title="Limpiar formato del texto seleccionado"
        className="flex items-center gap-1 px-2 py-1 rounded hover:bg-red-950/60 hover:text-red-300 text-[10.5px] text-slate-400 transition-colors"
      >
        <RemoveFormatting className="w-3 h-3" />
        <span className="hidden sm:inline">Quitar formato</span>
      </button>

      {/* Indicador de ayuda */}
      <div className="hidden lg:flex items-center text-[10px] text-slate-400 ml-auto pl-2">
        <span>Tip: Selecciona texto y usa <strong className="text-slate-300">Ctrl+B</strong>, <strong className="text-slate-300">Ctrl+U</strong> o <strong className="text-slate-300">Ctrl+I</strong></span>
      </div>
    </div>
  );
}
