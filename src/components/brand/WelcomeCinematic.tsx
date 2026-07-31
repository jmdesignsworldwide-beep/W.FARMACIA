'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Capsula } from '@/components/brand/Capsula';
import { BRAND, MOTION } from '@/lib/tokens';

/**
 * §1.5 — Bienvenida cinematográfica a prueba de fallos (origen: JM Tech).
 * Nombre del usuario, marca en degradado, texto desenfoque-a-nítido,
 * aurora con profundidad, cortina de revelado de ~2.5s.
 *
 * REGLAS DURAS:
 *  • Una sola vez por sesión, no reaparece al navegar (sessionStorage).
 *  • Si la animación falla por lo que sea, NUNCA bloquea la entrada:
 *    todo va dentro de try/catch y hay un temporizador de seguridad que
 *    la cierra pase lo que pase. Nunca una pantalla premium que deje al
 *    cliente afuera.
 */
const SESSION_KEY = 'wf_welcome_shown';

export function WelcomeCinematic({ nombre }: { nombre: string }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let safety: ReturnType<typeof setTimeout> | undefined;
    try {
      const already = sessionStorage.getItem(SESSION_KEY);
      const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (already || prefersReduced) {
        // Ya se mostró o el usuario pidió menos movimiento: entra directo.
        sessionStorage.setItem(SESSION_KEY, '1');
        return;
      }
      sessionStorage.setItem(SESSION_KEY, '1');
      setShow(true);
      timer = setTimeout(() => setShow(false), 2600);
      // Red de seguridad: cierre garantizado aunque algo se trabe.
      safety = setTimeout(() => setShow(false), 4000);
    } catch {
      // Falla el storage o el matchMedia => cae directo al dashboard.
      setShow(false);
    }
    return () => {
      if (timer) clearTimeout(timer);
      if (safety) clearTimeout(safety);
    };
  }, []);

  return (
    <AnimatePresence>
      {show ? (
        <motion.div
          key="welcome"
          className="fixed inset-0 z-[100] flex items-center justify-center overflow-hidden bg-canvas"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.6, ease: MOTION.ease } }}
          onClick={() => setShow(false)}
        >
          {/* Aurora con profundidad */}
          <div aria-hidden className="pointer-events-none absolute inset-0">
            <div className="absolute left-1/4 top-1/3 h-72 w-72 -translate-x-1/2 rounded-full brand-gradient opacity-20 blur-3xl animate-aurora" />
            <div
              className="absolute right-1/4 top-1/2 h-80 w-80 translate-x-1/2 rounded-full brand-gradient opacity-15 blur-3xl animate-aurora"
              style={{ animationDelay: '-6s' }}
            />
          </div>

          <div className="relative flex flex-col items-center">
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1, transition: MOTION.spring }}
            >
              <Capsula size={72} pulse />
            </motion.div>

            <motion.p
              className="mt-6 text-sm uppercase tracking-[0.25em] text-ink-soft"
              initial={{ opacity: 0, filter: 'blur(12px)' }}
              animate={{ opacity: 1, filter: 'blur(0px)', transition: { delay: 0.15, duration: 0.7 } }}
            >
              Bienvenido
            </motion.p>

            <motion.h1
              className="mt-1 font-display text-4xl font-bold text-ink"
              initial={{ opacity: 0, filter: 'blur(14px)', y: 8 }}
              animate={{ opacity: 1, filter: 'blur(0px)', y: 0, transition: { delay: 0.3, duration: 0.7 } }}
            >
              {nombre}
            </motion.h1>

            <motion.div
              className="mt-3 font-display text-lg font-semibold brand-text"
              initial={{ opacity: 0, filter: 'blur(10px)' }}
              animate={{ opacity: 1, filter: 'blur(0px)', transition: { delay: 0.5, duration: 0.7 } }}
            >
              {BRAND.name}
            </motion.div>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
