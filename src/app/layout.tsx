import type { Metadata, Viewport } from 'next';
import { ThemeScript } from '@/components/layout/ThemeToggle';
import { RegisterSW } from '@/components/pwa/RegisterSW';
import { OfflineBanner } from '@/components/pwa/OfflineBanner';
import { BRAND, THEME_COLOR } from '@/lib/tokens';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: `${BRAND.name} · Sistema de Farmacia`,
    template: `%s · ${BRAND.name}`,
  },
  description: BRAND.tagline,
  applicationName: BRAND.name,
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: BRAND.name },
};

export const viewport: Viewport = {
  // Valor SSR por defecto = tema oscuro (el tema por defecto de la app).
  // El ThemeScript corrige esta meta al tema real antes de pintar, y el
  // toggle la actualiza en vivo — así la barra del navegador sigue al tema
  // de la app y no al prefers-color-scheme del SO (que puede diverger).
  themeColor: THEME_COLOR.dark,
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-DO" suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body>
        <OfflineBanner />
        {children}
        <RegisterSW />
      </body>
    </html>
  );
}
