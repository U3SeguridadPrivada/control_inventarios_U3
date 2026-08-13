'use client';
import { useEffect, useState } from 'react';
import { Download, Share, SquarePlus, X, Smartphone } from 'lucide-react';
import { usePwaInstall } from '@/src/lib/pwa';

const DISMISSED_KEY = 'u3_pwa_install_dismissed';
/** Si se descarta el banner flotante, se vuelve a mostrar pasadas 24 horas. */
const SNOOZE_MS = 24 * 60 * 60 * 1000;

function snoozed() {
  try {
    const raw = localStorage.getItem(DISMISSED_KEY);
    return !!raw && Date.now() - Number(raw) < SNOOZE_MS;
  } catch {
    return false;
  }
}

export default function InstallPrompt() {
  const { canInstall, installed, isIosDevice, triggerInstall } = usePwaInstall();
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    // Al montar, evaluar si está descartado recientemente
    setDismissed(snoozed());
  }, []);

  if (installed || !canInstall || dismissed) return null;

  const handleDismiss = () => {
    try {
      localStorage.setItem(DISMISSED_KEY, String(Date.now()));
    } catch {
      // Ignorar en privado
    }
    setDismissed(true);
  };

  const handleInstallClick = async () => {
    const success = await triggerInstall();
    if (success) {
      setDismissed(true);
    }
  };

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 px-3 pb-[calc(1rem+var(--safe-bottom)+var(--mobile-nav-height))] md:pb-6 md:left-auto md:right-6 md:w-[380px] md:px-0 pointer-events-none">
      <div className="pointer-events-auto flex items-start gap-3 rounded-2xl border border-sky-200 bg-white/95 backdrop-blur-md p-4 shadow-2xl ring-1 ring-sky-900/10 animate-in slide-in-from-bottom-4 fade-in duration-300">
        <div className="w-11 h-11 rounded-xl bg-[#1e3a5f] text-white flex items-center justify-center flex-shrink-0 shadow-sm">
          <Smartphone className="w-6 h-6" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="text-sm font-bold text-slate-900 leading-tight">Instalar Suite U3</p>
            <span className="text-[10px] bg-sky-100 text-sky-800 font-semibold px-1.5 py-0.5 rounded-md">App</span>
          </div>

          {!isIosDevice ? (
            <>
              <p className="text-xs text-slate-600 mt-1 leading-snug">
                Instala la app en tu dispositivo para acceder más rápido, trabajar a pantalla completa y recibir notificaciones.
              </p>
              <button
                onClick={handleInstallClick}
                className="mt-2.5 inline-flex items-center gap-1.5 rounded-lg bg-[#1e3a5f] hover:bg-[#152a45] px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition-all active:scale-[0.98]"
              >
                <Download className="w-3.5 h-3.5" /> Instalar app ahora
              </button>
            </>
          ) : (
            <p className="text-xs text-slate-600 mt-1 leading-snug">
              En iOS: toca <Share className="inline w-3.5 h-3.5 text-sky-700 align-text-bottom" /> <span className="font-semibold text-slate-800">Compartir</span> y selecciona{' '}
              <SquarePlus className="inline w-3.5 h-3.5 text-sky-700 align-text-bottom" />{' '}
              <span className="font-semibold text-slate-800">Agregar a inicio</span>.
            </p>
          )}
        </div>

        <button
          onClick={handleDismiss}
          aria-label="Descartar por hoy"
          title="Descartar por hoy"
          className="flex-shrink-0 w-7 h-7 -mt-1 -mr-1 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
