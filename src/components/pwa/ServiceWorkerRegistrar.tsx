'use client';
import { useEffect } from 'react';
import { toast } from 'sonner';

/**
 * Registra el service worker en produccion y avisa cuando hay una version nueva.
 * En desarrollo hace lo contrario: da de baja cualquier registro previo para que
 * el cache no sirva bundles viejos mientras se trabaja.
 */
export default function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

    if (process.env.NODE_ENV !== 'production') {
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        registrations.forEach((registration) => registration.unregister());
      });
      return;
    }

    let refreshing = false;
    const onControllerChange = () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);

    const announceUpdate = (worker: ServiceWorker) => {
      toast('Hay una versión nueva disponible', {
        description: 'Actualiza para recibir los últimos cambios.',
        duration: Infinity,
        action: {
          label: 'Actualizar',
          onClick: () => worker.postMessage({ type: 'SKIP_WAITING' }),
        },
      });
    };

    const register = async () => {
      try {
        const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });

        if (registration.waiting) announceUpdate(registration.waiting);

        registration.addEventListener('updatefound', () => {
          const installing = registration.installing;
          if (!installing) return;
          installing.addEventListener('statechange', () => {
            // Solo es una actualizacion si ya habia un SW controlando la pagina.
            if (installing.state === 'installed' && navigator.serviceWorker.controller) {
              announceUpdate(installing);
            }
          });
        });

        // Busca actualizaciones al volver a la app desde segundo plano.
        const checkForUpdate = () => {
          if (document.visibilityState === 'visible') registration.update().catch(() => undefined);
        };
        document.addEventListener('visibilitychange', checkForUpdate);
        return () => document.removeEventListener('visibilitychange', checkForUpdate);
      } catch {
        // Un fallo al registrar no debe romper la app: simplemente no habra modo offline.
        return undefined;
      }
    };

    const cleanupPromise = register();

    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
      cleanupPromise.then((cleanup) => cleanup?.());
    };
  }, []);

  return null;
}
