import { type CSSProperties } from 'react';

/**
 * EL SELLO — cápsula farmacéutica con pulso vital
 * ─────────────────────────────────────────────────────────────
 * §1.3: el elemento visual firma que se repite con elegancia y hace
 * que cada pantalla grite el oficio (como el latido en Reyna, el
 * odontograma en el dental). Aquí: una cápsula cuyas dos mitades son
 * el degradado de marca, con una línea de pulso vital recorriéndola.
 * Se siente hecho para una farmacia, no un ícono de pastilla genérico.
 *
 * Aparece en el sidebar, el dashboard y los estados vacíos. Sutil.
 * `pulse` anima el latido (respeta prefers-reduced-motion vía CSS).
 */
export function Capsula({
  size = 40,
  pulse = false,
  className,
  style,
}: {
  size?: number;
  pulse?: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  const uid = `cap-${size}-${pulse ? 'p' : 's'}`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      role="img"
      aria-label="W.Farmacia"
      className={className}
      style={style}
    >
      <defs>
        <linearGradient id={`${uid}-g`} x1="8" y1="8" x2="40" y2="40" gradientUnits="userSpaceOnUse">
          <stop stopColor="hsl(var(--accent))" />
          <stop offset="1" stopColor="hsl(var(--accent-2))" />
        </linearGradient>
        <clipPath id={`${uid}-clip`}>
          <rect x="9" y="15" width="30" height="18" rx="9" />
        </clipPath>
      </defs>

      {/* Cuerpo de la cápsula, inclinada 45° */}
      <g transform="rotate(-45 24 24)">
        {/* Mitad superior: color sólido de marca */}
        <rect x="9" y="15" width="30" height="18" rx="9" fill={`url(#${uid}-g)`} />
        {/* Mitad inferior: superficie clara con borde de marca */}
        <g clipPath={`url(#${uid}-clip)`}>
          <rect x="24" y="15" width="15" height="18" fill="hsl(var(--surface))" />
        </g>
        <rect
          x="9"
          y="15"
          width="30"
          height="18"
          rx="9"
          fill="none"
          stroke={`url(#${uid}-g)`}
          strokeWidth="2"
        />
        {/* Línea divisoria central */}
        <line x1="24" y1="15" x2="24" y2="33" stroke={`url(#${uid}-g)`} strokeWidth="2" />
      </g>

      {/* Pulso vital cruzando la mitad transparente — el sello dentro del sello */}
      <path
        d="M15 30 L21 30 L23 24 L26 34 L28.5 30 L33 30"
        stroke="hsl(var(--accent))"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        opacity="0.9"
        className={pulse ? 'capsula-pulse' : undefined}
      />
    </svg>
  );
}
