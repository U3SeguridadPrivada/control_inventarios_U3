'use client';
import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { CloudOff } from 'lucide-react';

/**
 * Barra fija que avisa cuando el dispositivo pierde la red y refresca las
 * consultas pendientes en cuanto vuelve.
 */
export default function NetworkStatus() {
  const [offline, setOffline] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    const goOffline = () => setOffline(true);
    const goOnline = () => {
      setOffline(false);
      queryClient.invalidateQueries();
    };

    setOffline(!navigator.onLine);
    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);
    return () => {
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online', goOnline);
    };
  }, [queryClient]);

  if (!offline) return null;

  return (
    <div
      role="status"
      className="fixed inset-x-0 top-0 z-[60] flex items-center justify-center gap-2 bg-amber-500 px-3 py-1.5 pt-[calc(0.375rem+var(--safe-top))] text-[12px] font-semibold text-white shadow-md"
    >
      <CloudOff className="w-3.5 h-3.5" />
      Sin conexión — estás viendo datos guardados
    </div>
  );
}
