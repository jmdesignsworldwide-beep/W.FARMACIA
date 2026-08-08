import type { MetadataRoute } from 'next';
import { BRAND, THEME_COLOR } from '@/lib/tokens';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${BRAND.name} · Sistema de Farmacia`,
    short_name: BRAND.name,
    description: BRAND.tagline,
    start_url: '/dashboard',
    display: 'standalone',
    orientation: 'portrait',
    background_color: THEME_COLOR.dark,
    theme_color: THEME_COLOR.dark,
    lang: 'es-DO',
    icons: [
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
    ],
  };
}
