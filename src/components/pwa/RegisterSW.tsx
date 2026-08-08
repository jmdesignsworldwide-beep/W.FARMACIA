'use client';

import { useEffect } from 'react';

/** Registra el service worker (Tanda 19). Silencioso: si el navegador no soporta SW, no pasa nada. */
export function RegisterSW() {
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    const onLoad = () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        /* registro best-effort: la app funciona igual sin SW */
      });
    };
    if (document.readyState === 'complete') onLoad();
    else window.addEventListener('load', onLoad);
    return () => window.removeEventListener('load', onLoad);
  }, []);
  return null;
}
