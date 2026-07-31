import { type ReactNode } from 'react';
import { Capsula } from '@/components/brand/Capsula';
import { toneColor, toneRing, type Tone } from '@/lib/tokens';

/**
 * §1.4 — Estado vacío premium. Nunca una caja gigante vacía. Medallón con
 * presencia, título con carácter, mensaje cálido en español dominicano y un
 * CTA que resuelve.
 *
 * §1.3 — El sello se repite CON ELEGANCIA, no copiado: cuando el estado tiene
 * un contexto propio (Vencidas, Esta semana, Reordenar), el héroe del medallón
 * es su ícono de contexto —teñido por su tono semántico— y el sello (la
 * cápsula) queda integrado como distintivo. Sin contexto, el héroe es el
 * sello puro con su pulso vital.
 */
export function EmptyState({
  titulo,
  mensaje,
  cta,
  icon,
  tone = 'accent',
}: {
  titulo: string;
  mensaje: string;
  cta?: ReactNode;
  icon?: ReactNode;
  tone?: Tone;
}) {
  const conContexto = Boolean(icon);
  return (
    <div className="flex flex-col items-center justify-center px-6 py-10 text-center">
      {/* Medallón con presencia — anillo luminoso teñido por tono (§1.1/§1.3) */}
      <div className="relative mb-4">
        <div
          aria-hidden
          className="absolute inset-0 rounded-full blur-xl opacity-[0.12]"
          style={{ backgroundColor: toneColor(tone) }}
        />
        <div
          className="relative flex h-20 w-20 items-center justify-center rounded-full bg-surface"
          style={{ boxShadow: toneRing(tone) }}
        >
          {conContexto ? (
            <span style={{ color: toneColor(tone) }}>{icon}</span>
          ) : (
            <Capsula size={40} pulse />
          )}

          {/* El sello, integrado como distintivo cuando hay ícono de contexto */}
          {conContexto ? (
            <span className="absolute -bottom-1.5 -right-1.5 flex h-8 w-8 items-center justify-center rounded-full border border-line bg-surface">
              <Capsula size={18} />
            </span>
          ) : null}
        </div>
      </div>

      <h3 className="font-display text-lg font-semibold text-ink">{titulo}</h3>
      <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-ink-soft">{mensaje}</p>

      {cta ? <div className="mt-5">{cta}</div> : null}
    </div>
  );
}
