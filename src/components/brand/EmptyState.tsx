import { type ReactNode } from 'react';
import { Capsula } from '@/components/brand/Capsula';

/**
 * §1.4 — Estado vacío premium. Nunca una caja gigante vacía ni un océano
 * de espacio muerto. Medallón con presencia (el sello), título con carácter,
 * mensaje cálido en español dominicano, y un CTA que resuelve.
 *
 * "Los estados vacíos son la firma de marca — el cliente los ve el primer
 *  día. Ese es literalmente el primer minuto de su experiencia."
 */
export function EmptyState({
  titulo,
  mensaje,
  cta,
  icon,
}: {
  titulo: string;
  mensaje: string;
  cta?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      {/* Medallón con presencia — el sello dentro de un anillo luminoso */}
      <div className="relative mb-5">
        <div
          aria-hidden
          className="absolute inset-0 rounded-full brand-gradient opacity-10 blur-xl"
        />
        <div className="relative flex h-20 w-20 items-center justify-center rounded-full bg-surface luminous">
          {icon ?? <Capsula size={40} pulse />}
        </div>
      </div>

      <h3 className="font-display text-lg font-semibold text-ink">{titulo}</h3>
      <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-ink-soft">{mensaje}</p>

      {cta ? <div className="mt-5">{cta}</div> : null}
    </div>
  );
}
