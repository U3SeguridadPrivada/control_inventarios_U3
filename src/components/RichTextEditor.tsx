'use client';
import { useEffect, useRef, useState } from 'react';
import {
  Bold, Italic, Underline, Strikethrough, List, ListOrdered, Link2,
  AlignLeft, AlignCenter, AlignRight, Quote, Eraser, Undo2, Redo2,
  Palette, Highlighter, Indent, Outdent, Minus,
} from 'lucide-react';

const COLORES = ['#000000', '#434343', '#666666', '#999999', '#b91c1c', '#ea580c', '#ca8a04', '#15803d', '#0e7490', '#1d4ed8', '#7e22ce', '#be185d'];
const RESALTADOS = ['transparent', '#fef08a', '#bbf7d0', '#bfdbfe', '#fbcfe8', '#fed7aa', '#e9d5ff'];
const TAMANOS = [{ v: '1', label: 'Pequeño' }, { v: '3', label: 'Normal' }, { v: '5', label: 'Grande' }, { v: '7', label: 'Enorme' }];

interface Props {
  initialHtml?: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: number;
}

// Editor de texto enriquecido estilo Gmail (contentEditable + execCommand).
export default function RichTextEditor({ initialHtml = '', onChange, placeholder, minHeight = 220 }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [activos, setActivos] = useState<Record<string, boolean>>({});
  const [paleta, setPaleta] = useState<'color' | 'resaltado' | null>(null);
  const [vacio, setVacio] = useState(!initialHtml);

  useEffect(() => {
    if (ref.current) ref.current.innerHTML = initialHtml;
    setVacio(!initialHtml.replace(/<[^>]*>/g, '').trim());
    // Solo al montar: después el div es no-controlado para no pelear con React
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const actualizar = () => {
      try {
        setActivos({
          bold: document.queryCommandState('bold'),
          italic: document.queryCommandState('italic'),
          underline: document.queryCommandState('underline'),
          strikeThrough: document.queryCommandState('strikeThrough'),
          insertUnorderedList: document.queryCommandState('insertUnorderedList'),
          insertOrderedList: document.queryCommandState('insertOrderedList'),
          justifyLeft: document.queryCommandState('justifyLeft'),
          justifyCenter: document.queryCommandState('justifyCenter'),
          justifyRight: document.queryCommandState('justifyRight'),
        });
      } catch { /* fuera del editor */ }
    };
    document.addEventListener('selectionchange', actualizar);
    return () => document.removeEventListener('selectionchange', actualizar);
  }, []);

  const emitir = () => {
    const html = ref.current?.innerHTML || '';
    setVacio(!html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim());
    onChange(html);
  };

  const exec = (cmd: string, val?: string) => {
    ref.current?.focus();
    document.execCommand(cmd, false, val);
    emitir();
  };

  const insertarEnlace = () => {
    const url = window.prompt('URL del enlace:', 'https://');
    if (url && url !== 'https://') exec('createLink', url);
  };

  const Btn = ({ cmd, icon: Icon, title, val, onClick }: { cmd?: string; icon: typeof Bold; title: string; val?: string; onClick?: () => void }) => (
    <button
      type="button"
      title={title}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick ?? (() => cmd && exec(cmd, val))}
      className={`w-7 h-7 flex items-center justify-center rounded-md transition-colors ${cmd && activos[cmd] ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}
    >
      <Icon className="w-3.5 h-3.5" />
    </button>
  );

  const Sep = () => <div className="w-px h-5 bg-border mx-0.5" />;

  return (
    <div className="border border-border rounded-lg overflow-hidden bg-card focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-1">
      <div className="relative flex flex-wrap items-center gap-0.5 px-2 py-1.5 border-b border-border bg-muted/30">
        <Btn icon={Undo2} title="Deshacer (Ctrl+Z)" onClick={() => exec('undo')} />
        <Btn icon={Redo2} title="Rehacer (Ctrl+Y)" onClick={() => exec('redo')} />
        <Sep />
        <select
          title="Tamaño de letra"
          defaultValue="3"
          onMouseDown={(e) => e.stopPropagation()}
          onChange={(e) => exec('fontSize', e.target.value)}
          className="h-7 text-xs bg-transparent border border-transparent hover:border-border rounded-md px-1 text-muted-foreground outline-none cursor-pointer"
        >
          {TAMANOS.map((t) => <option key={t.v} value={t.v}>{t.label}</option>)}
        </select>
        <Sep />
        <Btn cmd="bold" icon={Bold} title="Negrita (Ctrl+B)" />
        <Btn cmd="italic" icon={Italic} title="Cursiva (Ctrl+I)" />
        <Btn cmd="underline" icon={Underline} title="Subrayado (Ctrl+U)" />
        <Btn cmd="strikeThrough" icon={Strikethrough} title="Tachado" />
        <Btn icon={Palette} title="Color de texto" onClick={() => setPaleta(paleta === 'color' ? null : 'color')} />
        <Btn icon={Highlighter} title="Resaltar" onClick={() => setPaleta(paleta === 'resaltado' ? null : 'resaltado')} />
        <Sep />
        <Btn cmd="insertUnorderedList" icon={List} title="Lista con viñetas" />
        <Btn cmd="insertOrderedList" icon={ListOrdered} title="Lista numerada" />
        <Btn icon={Outdent} title="Reducir sangría" onClick={() => exec('outdent')} />
        <Btn icon={Indent} title="Aumentar sangría" onClick={() => exec('indent')} />
        <Sep />
        <Btn cmd="justifyLeft" icon={AlignLeft} title="Alinear a la izquierda" />
        <Btn cmd="justifyCenter" icon={AlignCenter} title="Centrar" />
        <Btn cmd="justifyRight" icon={AlignRight} title="Alinear a la derecha" />
        <Sep />
        <Btn icon={Link2} title="Insertar enlace" onClick={insertarEnlace} />
        <Btn icon={Quote} title="Cita" onClick={() => exec('formatBlock', 'blockquote')} />
        <Btn icon={Minus} title="Línea divisoria" onClick={() => exec('insertHorizontalRule')} />
        <Btn icon={Eraser} title="Quitar formato" onClick={() => exec('removeFormat')} />

        {paleta && (
          <div className="absolute top-full left-2 z-20 mt-1 p-2 bg-card border border-border rounded-lg shadow-lg flex gap-1 flex-wrap w-44">
            {(paleta === 'color' ? COLORES : RESALTADOS).map((c) => (
              <button
                key={c}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => { exec(paleta === 'color' ? 'foreColor' : 'hiliteColor', c); setPaleta(null); }}
                className="w-5 h-5 rounded border border-border hover:scale-110 transition-transform"
                style={{ backgroundColor: c === 'transparent' ? '#fff' : c, backgroundImage: c === 'transparent' ? 'linear-gradient(45deg,transparent 45%,#ef4444 45%,#ef4444 55%,transparent 55%)' : undefined }}
                title={c === 'transparent' ? 'Sin resaltado' : c}
              />
            ))}
          </div>
        )}
      </div>

      <div className="relative">
        {vacio && placeholder && (
          <div className="absolute top-3 left-3 text-sm text-muted-foreground pointer-events-none">{placeholder}</div>
        )}
        <div
          ref={ref}
          contentEditable
          onInput={emitir}
          onBlur={emitir}
          className="px-3 py-3 text-sm leading-relaxed outline-none overflow-y-auto [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground [&_a]:text-primary [&_a]:underline [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5"
          style={{ minHeight, maxHeight: 380 }}
        />
      </div>
    </div>
  );
}
