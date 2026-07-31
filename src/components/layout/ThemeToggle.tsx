'use client';

import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';

/**
 * Toggle de tema claro/oscuro. El tema inicial lo fija un script inline
 * en <head> (ver ThemeScript) para evitar parpadeo / layout shift (§1.2).
 * Aquí solo se conmuta y se persiste.
 */
export function ThemeToggle() {
  const [dark, setDark] = useState(true);

  useEffect(() => {
    setDark(document.documentElement.classList.contains('dark'));
  }, []);

  const toggle = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle('dark', next);
    try {
      localStorage.setItem('wf_theme', next ? 'dark' : 'light');
    } catch {
      /* almacenamiento no disponible: el tema sigue funcionando en sesión */
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={dark ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'}
      className="flex h-9 w-9 items-center justify-center rounded-control text-ink-soft transition-colors hover:bg-surface-2 hover:text-ink"
    >
      {dark ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );
}

/**
 * Script inline que corre antes de pintar: aplica el tema guardado o el
 * preferido del sistema. Evita el flash de tema incorrecto (Museo #11 en
 * espíritu: contraste correcto desde el primer frame).
 */
export function ThemeScript() {
  const code = `(function(){try{var t=localStorage.getItem('wf_theme');var d=t?t==='dark':true;document.documentElement.classList.toggle('dark',d);document.documentElement.style.colorScheme=d?'dark':'light';}catch(e){document.documentElement.classList.add('dark');}})();`;
  return <script dangerouslySetInnerHTML={{ __html: code }} />;
}
