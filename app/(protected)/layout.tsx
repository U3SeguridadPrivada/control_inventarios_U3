'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/src/context/AuthContext';
import { useEventNotifications } from '@/src/hooks/useEventNotifications';
import Sidebar from '@/src/components/Sidebar';
import Header from '@/src/components/Header';

export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  useEventNotifications();

  useEffect(() => {
    if (!isLoading && !user) {
      router.replace('/login');
    }
  }, [user, isLoading, router]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar mobileOpen={mobileNavOpen} onCloseMobile={() => setMobileNavOpen(false)} />
      <div className="flex-1 min-w-0 flex flex-col">
        <Header onOpenMobileNav={() => setMobileNavOpen(true)} />
        <main className="flex-1 p-6 lg:p-8 max-w-[1600px] w-full mx-auto">{children}</main>
      </div>
    </div>
  );
}
