'use client';
import { useRef, useState, useEffect } from 'react';
import { X, Download, Printer, Loader2, FileText, AlertTriangle, ExternalLink, RefreshCw } from 'lucide-react';

interface DocumentViewerModalProps {
  title: string;
  url: string;
  downloadName?: string;
  viaFallback?: boolean;
  borrador?: boolean;
  onClose: () => void;
}

export default function DocumentViewerModal({
  title,
  url,
  downloadName = 'documento.pdf',
  viaFallback,
  borrador,
  onClose,
}: DocumentViewerModalProps) {
  const [loading, setLoading] = useState(true);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [isImage, setIsImage] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Cerrar con tecla Escape
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  // Cargar documento con soporte para Blob y fallback directo
  useEffect(() => {
    let isMounted = true;
    let localBlobUrl: string | null = null;

    async function load() {
      setLoading(true);
      setLoadError(null);

      // Si es una imagen por extensión conocida
      const lower = url.toLowerCase();
      if (lower.match(/\.(png|jpe?g|webp|gif|svg)($|\?)/)) {
        if (isMounted) {
          setIsImage(true);
          setBlobUrl(url);
          setLoading(false);
        }
        return;
      }

      try {
        const res = await fetch(url);
        if (!res.ok) {
          throw new Error(`Servidor respondió con código ${res.status}: ${res.statusText}`);
        }
        const contentType = res.headers.get('content-type') || '';
        const blob = await res.blob();

        if (!isMounted) return;

        if (contentType.startsWith('image/')) {
          setIsImage(true);
        } else {
          setIsImage(false);
        }

        localBlobUrl = URL.createObjectURL(blob);
        setBlobUrl(localBlobUrl);
      } catch (err: any) {
        console.warn('Fallback al url directo en visualizador:', err);
        if (isMounted) {
          // Si el fetch falló, intentamos mostrar la URL directa en el iframe
          setIsImage(false);
          setBlobUrl(url);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    load();

    return () => {
      isMounted = false;
      if (localBlobUrl) {
        URL.revokeObjectURL(localBlobUrl);
      }
    };
  }, [url]);

  const handlePrint = () => {
    try {
      if (iframeRef.current?.contentWindow) {
        iframeRef.current.contentWindow.focus();
        iframeRef.current.contentWindow.print();
        return;
      }
    } catch {
      // Fallback si el iframe no permite acceso cross-origin
    }
    window.open(url, '_blank');
  };

  const directUrl = url.includes('inline=true') ? url.replace('inline=true', 'download=true') : url;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-2 sm:p-5">
      <div className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-5xl h-[92vh] bg-card border border-border rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Cabecera del visor */}
        <div className="flex items-center justify-between px-4 sm:px-5 py-3 border-b border-border bg-card flex-shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
              <FileText className="w-4 h-4" />
            </div>
            <span className="text-sm font-bold truncate text-foreground">{title}</span>
            {viaFallback && (
              <span className="hidden sm:flex items-center gap-1 text-[11px] font-medium text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full flex-shrink-0">
                <AlertTriangle className="w-3 h-3" /> Modo respaldo
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="hidden sm:flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-muted px-2.5 py-1.5 rounded-lg transition-colors border border-border/70"
              title="Abrir en pestaña nueva del navegador"
            >
              <ExternalLink className="w-3.5 h-3.5" /> Pestaña nueva
            </a>
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400 hover:text-white bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-600 border border-emerald-200 dark:border-emerald-800 px-3 py-1.5 rounded-lg transition-colors"
            >
              <Printer className="w-3.5 h-3.5" /> Imprimir
            </button>
            <a
              href={directUrl}
              download={downloadName}
              className="flex items-center gap-1.5 text-xs font-semibold text-primary hover:text-white bg-primary/10 hover:bg-primary px-3 py-1.5 rounded-lg transition-colors border border-primary/20"
            >
              <Download className="w-3.5 h-3.5" /> Descargar
            </a>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              title="Cerrar (Esc)"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {borrador && (
          <div className="flex items-center gap-2 px-4 sm:px-5 py-2 bg-amber-50 border-b border-amber-200 text-amber-800 text-xs font-medium flex-shrink-0">
            <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" /> Vista previa de un borrador — aún no se ha guardado en el sistema.
          </div>
        )}

        {/* Contenido principal */}
        <div className="flex-1 w-full bg-slate-900/10 relative overflow-hidden flex items-center justify-center">
          {loading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 z-10 bg-background/80 backdrop-blur-xs">
              <Loader2 className="w-8 h-8 text-primary animate-spin" />
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Cargando documento...</p>
            </div>
          )}

          {loadError ? (
            <div className="flex flex-col items-center justify-center p-6 text-center max-w-md">
              <AlertTriangle className="w-10 h-10 text-amber-500 mb-3" />
              <p className="text-sm font-bold text-foreground mb-1">No se pudo cargar la vista previa</p>
              <p className="text-xs text-muted-foreground mb-4">{loadError}</p>
              <div className="flex items-center gap-2">
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1.5 bg-primary text-primary-foreground text-xs font-semibold rounded-lg shadow hover:opacity-90"
                >
                  Abrir directamente
                </a>
                <a
                  href={directUrl}
                  download={downloadName}
                  className="px-3 py-1.5 border border-border text-foreground text-xs font-semibold rounded-lg hover:bg-muted"
                >
                  Descargar archivo
                </a>
              </div>
            </div>
          ) : isImage ? (
            <div className="w-full h-full flex items-center justify-center p-4 bg-slate-950/90 overflow-auto">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={blobUrl || url}
                alt={title}
                className="max-h-full max-w-full object-contain rounded shadow-lg border border-slate-800"
              />
            </div>
          ) : (
            <iframe
              ref={iframeRef}
              src={blobUrl || url}
              className="w-full h-full border-0 bg-white"
              title={title}
            />
          )}
        </div>
      </div>
    </div>
  );
}
