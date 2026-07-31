'use client';

import { useEffect, useRef, useState } from 'react';
import { MOTION } from '@/lib/tokens';

/**
 * §1.2 — Count-up en todos los KPIs y montos. tabular-nums siempre.
 * Respeta prefers-reduced-motion: si está activo, muestra el valor final
 * sin animar. `format` recibe el valor intermedio y devuelve el string
 * (p. ej. formatMoney) para que RD$ y decimales se vean correctos al vuelo.
 */
export function CountUp({
  value,
  format = (n) => n.toLocaleString('es-DO'),
  durationMs = MOTION.countUp * 1000,
  className,
}: {
  value: number;
  format?: (n: number) => string;
  durationMs?: number;
  className?: string;
}) {
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(value);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const from = fromRef.current;
    const to = value;
    if (prefersReduced || from === to) {
      setDisplay(to);
      fromRef.current = to;
      return;
    }

    let start: number | null = null;
    const ease = (t: number) => 1 - Math.pow(1 - t, 3); // easeOutCubic

    const tick = (ts: number) => {
      if (start === null) start = ts;
      const p = Math.min((ts - start) / durationMs, 1);
      setDisplay(from + (to - from) * ease(p));
      if (p < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        fromRef.current = to;
      }
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [value, durationMs]);

  return (
    <span className={className} data-numeric>
      {format(display)}
    </span>
  );
}
