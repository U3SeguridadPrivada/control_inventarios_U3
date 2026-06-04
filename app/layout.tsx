import type { Metadata } from 'next';
import './globals.css';
import { Providers } from '@/src/components/providers';

export const metadata: Metadata = {
  title: 'Control de Inventario U3',
  description: 'Sistema de control de uniformes y dotaciones — U3 Seguridad Privada',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
