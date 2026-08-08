'use client';

import { Printer } from 'lucide-react';

export function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="brand-gradient inline-flex items-center gap-2 rounded-control px-4 py-2 text-sm font-semibold text-white print:hidden"
    >
      <Printer className="h-4 w-4" /> Imprimir carpeta
    </button>
  );
}
