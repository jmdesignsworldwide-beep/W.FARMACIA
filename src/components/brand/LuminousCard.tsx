import { type ReactNode } from 'react';

/**
 * §1.1 — Tarjeta con el borde luminoso JM Tech. `protagonist` sube el
 * brillo del borde para las tarjetas que arden (ventas de hoy, alertas
 * críticas). El valor exacto vive en globals.css (.luminous / .luminous-strong),
 * nunca improvisado aquí (Museo de Errores #10).
 */
export function LuminousCard({
  children,
  protagonist = false,
  neutral = false,
  className = '',
  as: Tag = 'div',
}: {
  children: ReactNode;
  protagonist?: boolean;
  neutral?: boolean;
  className?: string;
  as?: 'div' | 'section' | 'article';
}) {
  const glow = neutral ? 'ring-soft' : protagonist ? 'luminous-strong' : 'luminous';
  return (
    <Tag
      className={`rounded-card bg-surface p-5 ${glow} transition-shadow duration-300 ${className}`}
    >
      {children}
    </Tag>
  );
}
