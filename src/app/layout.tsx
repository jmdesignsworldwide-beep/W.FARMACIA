import type { Metadata, Viewport } from 'next';
import { ThemeScript } from '@/components/layout/ThemeToggle';
import { BRAND } from '@/lib/tokens';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: `${BRAND.name} · Sistema de Farmacia`,
    template: `%s · ${BRAND.name}`,
  },
  description: BRAND.tagline,
  applicationName: BRAND.name,
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#faf6ee' },
    { media: '(prefers-color-scheme: dark)', color: '#0b0e14' },
  ],
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-DO" suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body>{children}</body>
    </html>
  );
}
