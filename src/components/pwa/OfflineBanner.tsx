'use client';

import { useEffect, useState } from 'react';

/** Barra global "sin conexión" (Tanda 19). Aparece al perder red, desaparece al volver. */
export function OfflineBanner() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const sync = () => setOffline(typeof navigator !== 'undefined' && !navigator.onLine);
    sync();
    window.addEventListener('online', sync);
    window.addEventListener('offline', sync);
    return () => {
      window.removeEventListener('online', sync);
      window.removeEventListener('offline', sync);
    };
  }, []);

  if (!offline) return null;
  return (
    <div className="fixed inset-x-0 top-0 z-[100] flex items-center justify-center gap-2 bg-amber-500 px-4 py-1.5 text-center text-xs font-medium text-black">
      <span aria-hidden>📶</span>
      Sin conexión — puedes consultar, pero cobrar espera a que vuelva el internet.
    </div>
  );
}

/** Hook reutilizable: ¿estamos en línea? (para deshabilitar el cobro en el POS). */
export function useOnline(): boolean {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const sync = () => setOnline(typeof navigator === 'undefined' ? true : navigator.onLine);
    sync();
    window.addEventListener('online', sync);
    window.addEventListener('offline', sync);
    return () => {
      window.removeEventListener('online', sync);
      window.removeEventListener('offline', sync);
    };
  }, []);
  return online;
}
