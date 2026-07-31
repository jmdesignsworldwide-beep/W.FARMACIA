import type { Config } from 'tailwindcss';

/**
 * Tailwind consume las variables CSS definidas en globals.css (un color
 * por token, dos temas). Ningún hex vive aquí ni en los componentes —
 * §1.7 del ADN. El tema se cambia con la clase `dark` en <html>.
 */
const config: Config = {
  darkMode: 'class',
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Superficies
        canvas: 'hsl(var(--canvas) / <alpha-value>)',
        surface: 'hsl(var(--surface) / <alpha-value>)',
        'surface-2': 'hsl(var(--surface-2) / <alpha-value>)',
        // Tinta / texto
        ink: 'hsl(var(--ink) / <alpha-value>)',
        'ink-soft': 'hsl(var(--ink-soft) / <alpha-value>)',
        'ink-faint': 'hsl(var(--ink-faint) / <alpha-value>)',
        // Acento (emerald farmacéutico) + degradado de marca
        accent: 'hsl(var(--accent) / <alpha-value>)',
        'accent-2': 'hsl(var(--accent-2) / <alpha-value>)',
        // Bordes / líneas
        line: 'hsl(var(--line) / <alpha-value>)',
        // Estados semánticos (urgencia del dashboard)
        danger: 'hsl(var(--danger) / <alpha-value>)',
        warning: 'hsl(var(--warning) / <alpha-value>)',
        success: 'hsl(var(--success) / <alpha-value>)',
        info: 'hsl(var(--info) / <alpha-value>)',
      },
      borderRadius: {
        card: '1rem',
        panel: '1.25rem',
        control: '0.625rem',
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
        display: ['var(--font-display)', 'var(--font-sans)', 'sans-serif'],
      },
      fontFeatureSettings: {
        nums: '"tnum" 1, "lnum" 1',
      },
      keyframes: {
        'blur-in': {
          '0%': { opacity: '0', filter: 'blur(12px)', transform: 'translateY(8px)' },
          '100%': { opacity: '1', filter: 'blur(0)', transform: 'translateY(0)' },
        },
        aurora: {
          '0%, 100%': { transform: 'translate3d(0,0,0) scale(1)' },
          '50%': { transform: 'translate3d(2%, -3%, 0) scale(1.08)' },
        },
      },
      animation: {
        'blur-in': 'blur-in 0.7s cubic-bezier(0.22,1,0.36,1) both',
        aurora: 'aurora 14s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};

export default config;
