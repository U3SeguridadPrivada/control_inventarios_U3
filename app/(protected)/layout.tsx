'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/src/context/AuthContext';
import { useEventNotifications } from '@/src/hooks/useEventNotifications';
import { usePathname } from 'next/navigation';
import Sidebar from '@/src/components/Sidebar';
import MobileNav from '@/src/components/MobileNav';
import Header from '@/src/components/Header';
import InstallPrompt from '@/src/components/pwa/InstallPrompt';

export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  useEventNotifications();

  useEffect(() => {
    if (!isLoading && !user) {
      router.replace('/login');
    }
  }, [user, isLoading, router]);

  if (isLoading) {
    return (
      <div className="min-h-[100svh] flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!user) return null;

  const isCorreo = pathname === '/correo' || pathname.startsWith('/correo/');

  return (
    <div className="flex min-h-[100svh] bg-background">
      <Sidebar />
      <div className="flex-1 min-w-0 flex flex-col h-[100svh] overflow-hidden">
        {!isCorreo && <Header />}
        <main
          className={
            isCorreo
              ? 'flex-1 min-w-0 flex flex-col h-full overflow-hidden pb-mobile-nav md:pb-0'
              : 'flex-1 min-w-0 p-4 sm:p-6 lg:p-8 pb-mobile-nav max-w-[1600px] w-full mx-auto overflow-y-auto'
          }
        >
          {children}
        </main>
      </div>
      <MobileNav />
      <InstallPrompt />
    </div>
  );
}

