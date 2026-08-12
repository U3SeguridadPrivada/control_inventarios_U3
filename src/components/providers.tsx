'use client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { AuthProvider } from '@/src/context/AuthContext';
import { Toaster } from 'sonner';
import ServiceWorkerRegistrar from '@/src/components/pwa/ServiceWorkerRegistrar';
import NetworkStatus from '@/src/components/pwa/NetworkStatus';

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        retry: 1,
        staleTime: 30_000,
        // En movil la app se suspende al cambiar de app: refrescar al volver.
        refetchOnWindowFocus: true,
        // Sin red no tiene sentido reintentar y vaciar bateria.
        networkMode: 'offlineFirst',
      },
    },
  }));
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        {children}
        <ServiceWorkerRegistrar />
        <NetworkStatus />
        {/* En movil los avisos bajan por debajo de la muesca y del header. */}
        <Toaster
          richColors
          closeButton
          position="top-right"
          mobileOffset={{ top: 'calc(var(--safe-top) + 0.75rem)', left: '0.75rem', right: '0.75rem' }}
        />
      </AuthProvider>
    </QueryClientProvider>
  );
}
