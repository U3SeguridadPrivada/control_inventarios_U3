'use client';
import { useEffect, useState } from 'react';
import { Download, Share, SquarePlus, X } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISSED_KEY = 'u3_pwa_install_dismissed';
/** Tras descartar el banner no se vuelve a ofrecer en 14 dias. */
const SNOOZE_MS = 14 * 24 * 60 * 60 * 1000;

function isStandalone() {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // iOS expone la app instalada por esta propiedad no estandar.
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIos() {
  if (typeof navigator === 'undefined') return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function snoozed() {
  try {
    const raw = localStorage.getItem(DISMISSED_KEY);
    return !!raw && Date.now() - Number(raw) < SNOOZE_MS;
  } catch {
    return false;
  }
}

/**
 * Banner de instalacion. En Chrome/Edge/Android usa `beforeinstallprompt`;
 * en iOS, que no lo soporta, muestra las instrucciones de "Agregar a inicio".
 */
export default function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIosHint, setShowIosHint] = useState(false);

  useEffect(() => {
    if (isStandalone() || snoozed()) return;

    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      setDeferred(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setDeferred(null);
      setShowIosHint(false);
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);

    // iOS nunca dispara beforeinstallprompt: se ofrece la guia manual.
    const iosTimer = isIos() ? window.setTimeout(() => setShowIosHint(true), 2500) : undefined;

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
      if (iosTimer) window.clearTimeout(iosTimer);
    };
  }, []);

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISSED_KEY, String(Date.now()));
    } catch {
      // Modo privado: se descarta solo por esta sesion.
    }
    setDeferred(null);
    setShowIosHint(false);
  };

  const install = async () => {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    setDeferred(null);
  };

  if (!deferred && !showIosHint) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 px-3 pb-[calc(0.75rem+var(--safe-bottom)+var(--mobile-nav-height))] md:pb-4 md:left-auto md:right-4 md:w-[360px] md:px-0 pointer-events-none">
      <div className="pointer-events-auto flex items-start gap-3 rounded-2xl border border-border bg-card p-3.5 shadow-2xl animate-in slide-in-from-bottom-4 fade-in duration-300">
        <img src="/icons/icon-192.png" alt="" className="w-11 h-11 rounded-xl border border-border flex-shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-tight">Instalar Suite U3</p>
          {deferred ? (
            <>
              <p className="text-xs text-muted-foreground mt-1 leading-snug">
                Acceso directo desde tu pantalla de inicio, a pantalla completa y con soporte sin conexión.
              </p>
              <button
                onClick={install}
                className="mt-2.5 inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground active:bg-primary/90"
              >
                <Download className="w-3.5 h-3.5" /> Instalar app
              </button>
            </>
          ) : (
            <p className="text-xs text-muted-foreground mt-1 leading-snug">
              Toca <Share className="inline w-3.5 h-3.5 align-text-bottom" /> <span className="font-medium">Compartir</span> y luego{' '}
              <SquarePlus className="inline w-3.5 h-3.5 align-text-bottom" />{' '}
              <span className="font-medium">Agregar a pantalla de inicio</span>.
            </p>
          )}
        </div>
        <button
          onClick={dismiss}
          aria-label="Descartar"
          className="flex-shrink-0 w-8 h-8 -mt-1 -mr-1 rounded-lg flex items-center justify-center text-muted-foreground active:bg-muted"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
