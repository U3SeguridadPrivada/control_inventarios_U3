'use client';
import { useRef, useState } from 'react';
import { X, Download, Printer, Loader2, FileText, AlertTriangle } from 'lucide-react';

interface DocumentViewerModalProps {
  title: string;
  url: string;
  downloadName?: string;
  viaFallback?: boolean;
  borrador?: boolean;
  onClose: () => void;
}

export default function DocumentViewerModal({ title, url, downloadName = 'documento.pdf', viaFallback, borrador, onClose }: DocumentViewerModalProps) {
  const [loading, setLoading] = useState(true);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const handlePrint = () => {
    try {
      iframeRef.current?.contentWindow?.focus();
      iframeRef.current?.contentWindow?.print();
    } catch {
      window.open(url, '_blank');
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-3 sm:p-6">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-5xl h-[92vh] bg-card border border-border rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-4 sm:px-5 py-3 border-b border-border bg-card flex-shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
              <FileText className="w-4 h-4" />
            </div>
            <span className="text-sm font-bold truncate">{title}</span>
            {viaFallback && (
              <span className="hidden sm:flex items-center gap-1 text-[11px] font-medium text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full flex-shrink-0">
                <AlertTriangle className="w-3 h-3" /> Generado en modo respaldo
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <button onClick={handlePrint} disabled={loading} className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700 hover:text-white bg-emerald-50 hover:bg-emerald-600 disabled:opacity-40 border border-emerald-200 px-3 py-1.5 rounded-lg transition-colors">
              <Printer className="w-3.5 h-3.5" /> Imprimir
            </button>
            <a href={url} download={downloadName} className="flex items-center gap-1.5 text-xs font-semibold text-primary hover:text-white bg-primary/10 hover:bg-primary px-3 py-1.5 rounded-lg transition-colors border border-primary/20">
              <Download className="w-3.5 h-3.5" /> Descargar
            </a>
            <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full text-muted-foreground hover:bg-muted transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {borrador && (
          <div className="flex items-center gap-2 px-4 sm:px-5 py-2 bg-amber-50 border-b border-amber-200 text-amber-800 text-xs font-medium flex-shrink-0">
            <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" /> Vista previa de un borrador — aún no se ha guardado en el sistema.
          </div>
        )}

        <div className="flex-1 w-full bg-muted/30 relative">
          {loading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 z-10 bg-muted/30">
              <Loader2 className="w-8 h-8 text-primary animate-spin" />
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Cargando documento...</p>
            </div>
          )}
          <iframe ref={iframeRef} src={url} onLoad={() => setLoading(false)} className="w-full h-full border-0" title={title} />
        </div>
      </div>
    </div>
  );
}
