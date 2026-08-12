import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Providers } from '@/src/components/providers';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Suite U3',
  description: 'Suite de gestión operativa de U3 Seguridad Privada: inventario, personal, ventas y finanzas',
  applicationName: 'Suite U3',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [
      { url: '/icons/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icons/favicon-16.png', sizes: '16x16', type: 'image/png' },
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
    ],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
  appleWebApp: {
    capable: true,
    title: 'Suite U3',
    // La barra de estado se dibuja sobre el contenido; el header respeta --safe-top.
    statusBarStyle: 'default',
  },
  formatDetection: {
    // Evita que iOS convierta folios y cantidades en enlaces de telefono.
    telephone: false,
  },
  other: {
    // Next ya emite el nombre estandar `mobile-web-app-capable`; Safari viejo
    // (anterior a iOS 16.4) solo entiende este.
    'apple-mobile-web-app-capable': 'yes',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Se permite el zoom por accesibilidad; el zoom involuntario en inputs se
  // evita con font-size >= 16px en globals.css.
  maximumScale: 5,
  userScalable: true,
  viewportFit: 'cover',
  themeColor: '#1a4a91',
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
