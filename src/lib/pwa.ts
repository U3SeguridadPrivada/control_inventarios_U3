'use client';

import { useEffect, useState } from 'react';

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

declare global {
  interface Window {
    deferredPWAInstallPrompt?: BeforeInstallPromptEvent | null;
  }
}

// Inicializar escucha global inmediatamente si estamos en el navegador
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e: Event) => {
    e.preventDefault();
    window.deferredPWAInstallPrompt = e as BeforeInstallPromptEvent;
    // Notificar a cualquier componente suscrito
    window.dispatchEvent(new CustomEvent('pwa-installable'));
  });

  window.addEventListener('appinstalled', () => {
    window.deferredPWAInstallPrompt = null;
    window.dispatchEvent(new CustomEvent('pwa-installed'));
  });
}

export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function isIos(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

/** Hook reactivo para obtener el estado de instalabilidad de la PWA. */
export function usePwaInstall() {
  const [canInstall, setCanInstall] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [isIosDevice, setIsIosDevice] = useState(false);

  useEffect(() => {
    const standalone = isStandalone();
    const ios = isIos();
    setInstalled(standalone);
    setIsIosDevice(ios);

    if (standalone) {
      setCanInstall(false);
      return;
    }

    if (window.deferredPWAInstallPrompt) {
      setCanInstall(true);
    } else if (ios) {
      setCanInstall(true);
    }

    const handleInstallable = () => setCanInstall(true);
    const handleInstalled = () => {
      setInstalled(true);
      setCanInstall(false);
    };

    window.addEventListener('pwa-installable', handleInstallable);
    window.addEventListener('pwa-installed', handleInstalled);
    window.addEventListener('beforeinstallprompt', handleInstallable);
    window.addEventListener('appinstalled', handleInstalled);

    return () => {
      window.removeEventListener('pwa-installable', handleInstallable);
      window.removeEventListener('pwa-installed', handleInstalled);
      window.removeEventListener('beforeinstallprompt', handleInstallable);
      window.removeEventListener('appinstalled', handleInstalled);
    };
  }, []);

  const triggerInstall = async (): Promise<boolean> => {
    if (window.deferredPWAInstallPrompt) {
      try {
        const promptEvent = window.deferredPWAInstallPrompt;
        await promptEvent.prompt();
        const choice = await promptEvent.userChoice;
        if (choice.outcome === 'accepted') {
          window.deferredPWAInstallPrompt = null;
          setCanInstall(false);
          setInstalled(true);
          return true;
        }
      } catch (err) {
        console.error('Error al ejecutar prompt de instalación:', err);
      }
    }
    return false;
  };

  return { canInstall, installed, isIosDevice, triggerInstall };
}
