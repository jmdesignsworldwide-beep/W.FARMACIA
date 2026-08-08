import { Info } from 'lucide-react';

/**
 * Aviso legal que separa un sistema de GESTIÓN de uno que PRESCRIBE (CIERRE §2.7).
 * Va en toda pantalla clínica: despacho, controlados, equivalencias, alergias, servicios.
 * No es letra pequeña defensiva — es la línea que fija que la decisión es del profesional.
 */
export function AvisoClinico({ variante = 'dispensacion' }: { variante?: 'dispensacion' | 'servicio' }) {
  const texto =
    variante === 'servicio'
      ? 'Este registro es informativo. No sustituye el criterio médico. Consulte a su médico.'
      : 'Este sistema es una herramienta de gestión e información. No sustituye el criterio del profesional farmacéutico. Toda decisión de dispensación corresponde al personal autorizado.';
  return (
    <div className="flex items-start gap-2 rounded-control border border-line bg-canvas px-3 py-2 text-xs text-ink-faint">
      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span>{texto}</span>
    </div>
  );
}
