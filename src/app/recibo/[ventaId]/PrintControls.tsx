'use client';

import { useEffect } from 'react';
import { Printer, ArrowLeft } from 'lucide-react';

/** Controles de impresión del recibo. Auto-imprime si viene ?auto=1 (impresión al cobrar). */
export function PrintControls({ auto }: { auto: boolean }) {
  useEffect(() => {
    if (auto) {
      const t = setTimeout(() => window.print(), 350);
      return () => clearTimeout(t);
    }
  }, [auto]);
  return (
    <div className="no-print mx-auto mt-4 flex max-w-[80mm] items-center justify-between gap-2 px-2">
      <button onClick={() => window.history.back()} className="inline-flex items-center gap-1.5 rounded-control border border-line px-3 py-2 text-sm text-ink-soft hover:bg-canvas">
        <ArrowLeft className="h-4 w-4" /> Volver
      </button>
      <button onClick={() => window.print()} className="brand-gradient inline-flex items-center gap-1.5 rounded-control px-4 py-2 text-sm font-semibold text-white">
        <Printer className="h-4 w-4" /> Imprimir
      </button>
    </div>
  );
}
