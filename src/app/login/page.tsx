'use client';

import { Suspense } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { Loader2, LockKeyhole } from 'lucide-react';
import { Capsula } from '@/components/brand/Capsula';
import { signIn, type LoginState } from './actions';
import { BRAND, MOTION } from '@/lib/tokens';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="mt-2 flex h-11 w-full items-center justify-center gap-2 rounded-control brand-gradient font-semibold text-white shadow-sm transition-opacity hover:opacity-95 disabled:opacity-70"
    >
      {pending ? <Loader2 size={18} className="animate-spin" /> : <LockKeyhole size={18} />}
      {pending ? 'Entrando…' : 'Entrar'}
    </button>
  );
}

function LoginForm() {
  const params = useSearchParams();
  const next = params.get('next') ?? '/dashboard';
  const [state, formAction] = useFormState<LoginState, FormData>(signIn, {});

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-canvas px-4">
      {/* Aurora con profundidad */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/3 top-1/4 h-72 w-72 -translate-x-1/2 rounded-full brand-gradient opacity-[0.12] blur-3xl animate-aurora" />
        <div
          className="absolute bottom-1/4 right-1/3 h-80 w-80 translate-x-1/2 rounded-full brand-gradient opacity-[0.10] blur-3xl animate-aurora"
          style={{ animationDelay: '-7s' }}
        />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 16, filter: 'blur(8px)' }}
        animate={{ opacity: 1, y: 0, filter: 'blur(0px)', transition: MOTION.spring }}
        className="relative w-full max-w-sm"
      >
        <div className="mb-7 flex flex-col items-center text-center">
          <Capsula size={56} pulse />
          <h1 className="mt-4 font-display text-2xl font-bold text-ink">{BRAND.name}</h1>
          <p className="mt-1 text-sm text-ink-soft">{BRAND.tagline}</p>
        </div>

        <form action={formAction} className="rounded-panel bg-surface p-6 luminous">
          <input type="hidden" name="next" value={next} />

          <label className="block text-sm font-medium text-ink-soft" htmlFor="email">
            Correo
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            placeholder="tu@farmacia.do"
            className="mt-1.5 mb-4 h-11 w-full rounded-control border border-line bg-canvas px-3 text-ink outline-none transition-shadow focus:luminous"
          />

          <label className="block text-sm font-medium text-ink-soft" htmlFor="password">
            Contraseña
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            placeholder="••••••••"
            className="mt-1.5 h-11 w-full rounded-control border border-line bg-canvas px-3 text-ink outline-none transition-shadow focus:luminous"
          />

          {state.error ? (
            <p
              role="alert"
              className="mt-4 rounded-control border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger"
            >
              {state.error}
            </p>
          ) : null}

          <SubmitButton />
        </form>

        <p className="mt-5 text-center text-xs text-ink-faint">
          Acceso solo para personal autorizado.
        </p>
      </motion.div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
