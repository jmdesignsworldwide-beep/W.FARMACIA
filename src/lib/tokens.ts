/**
 * ADN JM NEXUS — TOKENS
 * ─────────────────────────────────────────────────────────────
 * Única fuente de verdad de toda la identidad visual del sistema.
 * §1.7: "Toda la identidad en un solo archivo de tokens. Ni un
 *        color escrito a mano dentro de un componente."
 *
 * Los COLORES de tema (claro/oscuro) viven como variables CSS en
 * globals.css y se consumen vía Tailwind (bg-surface, text-ink...).
 * Aquí viven los tokens que el runtime necesita en JS: el valor
 * exacto del borde luminoso, los timings de animación, radios y
 * el color de acento en RGB para los glows.
 */

/* ── Acento de marca (emerald farmacéutico) en canales RGB ──
 * Se usa para construir el borde luminoso con opacidad. El mismo
 * tono aparece como --accent en cada tema; aquí en RGB para rgba().
 */
export const ACCENT_RGB = {
  light: '16, 152, 106', // emerald más profundo para contraste en crema
  dark: '52, 211, 153', // emerald brillante sobre fondo oscuro
} as const;

/**
 * §1.1 — EL BORDE LUMINOSO (origen: JM Tech)
 * "Un borde que brilla, no una nube detrás."
 * Borde de 1px del color de acento + glow MUY ceñido.
 * ❌ Nunca una sombra difusa detrás. ❌ Nunca un halo grande.
 *
 * Estos son los valores exactos. Se copian, no se improvisan
 * (Museo de Errores #10). Se aplican como clases utilitarias
 * `.luminous` y `.luminous-strong` en globals.css.
 */
export const LUMINOUS_BORDER = {
  // Tarjetas normales
  base: (rgb: string) =>
    `0 0 0 1px rgba(${rgb}, 0.40), 0 0 8px rgba(${rgb}, 0.15)`,
  // Tarjetas protagonistas (ventas de hoy, alertas críticas): un poco más brillante
  strong: (rgb: string) =>
    `0 0 0 1px rgba(${rgb}, 0.55), 0 0 12px rgba(${rgb}, 0.22)`,
} as const;

/**
 * §1.2 — UN SOLO TIMING EN TODO EL SISTEMA
 * "stagger 60–80ms, curvas spring." Mismos valores en todos los
 * modales, paneles y count-ups. Si dos pantallas se sienten hechas
 * por dos personas distintas, está mal.
 */
export const MOTION = {
  // Curva spring firma — usada por todo AnimatePresence
  spring: { type: 'spring', stiffness: 380, damping: 32, mass: 0.9 } as const,
  springSoft: { type: 'spring', stiffness: 240, damping: 30 } as const,
  // Stagger entre hijos de una lista/grid
  stagger: 0.07, // 70ms — dentro del rango 60–80ms del ADN
  // Duración base de fades/blur-a-nítido
  ease: [0.22, 1, 0.36, 1] as const, // easeOutExpo suave
  duration: 0.5,
  // Count-up de KPIs y montos (§1.2)
  countUp: 1.1,
} as const;

/**
 * Radios y espaciados firma — mismos en todas las pantallas (§1.2).
 * Consumidos por Tailwind (rounded-card, etc.) vía la config.
 */
export const RADII = {
  card: '1rem', // 16px
  panel: '1.25rem', // 20px
  pill: '9999px',
  control: '0.625rem', // 10px
} as const;

/**
 * Marca — nombre y textos de identidad en un solo lugar.
 */
export const BRAND = {
  name: 'Wilkins Farmacia',
  tagline: 'Tu farmacia, respirando.',
  locale: 'es-DO',
  currency: 'DOP',
  currencySymbol: 'RD$',
  itbisRate: 0.18, // ITBIS 18% (§2.6)
} as const;
