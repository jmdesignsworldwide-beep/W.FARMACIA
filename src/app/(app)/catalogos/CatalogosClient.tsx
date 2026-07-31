'use client';

import { useEffect, useRef } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { motion } from 'framer-motion';
import * as Icons from 'lucide-react';
import { AlertTriangle, Check, Plus, ShieldCheck } from 'lucide-react';
import { LuminousCard } from '@/components/brand/LuminousCard';
import { EmptyState } from '@/components/brand/EmptyState';
import { CATALOGOS, type CatalogoDef, type CatalogoTipo } from '@/lib/catalogos';
import { MOTION } from '@/lib/tokens';
import { crearValorCatalogo, type CatalogoState } from './actions';

export interface ValorCatalogo {
  id: string;
  nombre: string;
  activo: boolean;
}

function Icon({ name, size = 18 }: { name: string; size?: number }) {
  const Cmp = (Icons as unknown as Record<string, Icons.LucideIcon>)[name] ?? Icons.Circle;
  return <Cmp size={size} />;
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-label="Agregar"
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-control brand-gradient text-white shadow-sm transition-opacity hover:opacity-95 disabled:opacity-60"
    >
      {pending ? <Icons.Loader2 size={18} className="animate-spin" /> : <Plus size={18} />}
    </button>
  );
}

function ConfirmarButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex h-9 items-center gap-1.5 rounded-control border border-warning/40 bg-warning/10 px-3 text-sm font-medium text-warning transition-opacity hover:opacity-90 disabled:opacity-60"
    >
      {pending ? <Icons.Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
      Crear de todos modos
    </button>
  );
}

const container = { hidden: {}, show: { transition: { staggerChildren: MOTION.stagger } } };
const item = { hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0, transition: MOTION.spring } };

function CatalogoSeccion({ def, valores }: { def: CatalogoDef; valores: ValorCatalogo[] }) {
  const [state, formAction] = useFormState<CatalogoState, FormData>(crearValorCatalogo, {});
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Al agregar con éxito, limpiar y devolver el foco para seguir cargando.
  useEffect(() => {
    if (state.ok) {
      formRef.current?.reset();
      inputRef.current?.focus();
    }
  }, [state.ok]);

  return (
    <motion.div variants={item} className="h-full">
      <LuminousCard neutral className="flex h-full flex-col">
        {/* Cabecera */}
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-control bg-surface-2 text-accent">
            <Icon name={def.icon} size={20} />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="font-display text-base font-semibold text-ink">{def.titulo}</h2>
              <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] tabular-nums text-ink-faint">
                {valores.length}
              </span>
            </div>
            <p className="mt-0.5 text-sm leading-relaxed text-ink-soft">{def.descripcion}</p>
          </div>
        </div>

        {/* Alta */}
        <form ref={formRef} action={formAction} className="mt-4 flex items-center gap-2">
          <input type="hidden" name="tipo" value={def.tipo} />
          <input
            ref={inputRef}
            name="nombre"
            autoComplete="off"
            maxLength={120}
            placeholder={def.placeholder}
            aria-label={`Nuevo ${def.singular}`}
            className="h-11 w-full rounded-control border border-line bg-canvas px-3 text-ink outline-none transition-shadow focus:luminous"
          />
          <SubmitButton />
        </form>

        {/* Éxito */}
        {state.ok ? (
          <p className="mt-3 inline-flex items-center gap-1.5 text-sm text-accent">
            <Check size={15} /> Agregado «{state.creado}».
          </p>
        ) : null}

        {/* Error */}
        {state.error ? (
          <p
            role="alert"
            className="mt-3 rounded-control border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger"
          >
            {state.error}
          </p>
        ) : null}

        {/* Parecidos: aviso + confirmación (Adenda III §4) */}
        {state.similares && state.similares.length > 0 ? (
          <div className="mt-3 rounded-control border border-warning/30 bg-warning/10 p-3">
            <p className="flex items-start gap-2 text-sm text-ink">
              <AlertTriangle size={16} className="mt-0.5 shrink-0 text-warning" />
              <span>
                Ya existe algo parecido:{' '}
                <span className="font-medium">{state.similares.join(', ')}</span>. Si de verdad es
                distinto, confírmalo; si no, no lo dupliques.
              </span>
            </p>
            <form action={formAction} className="mt-2.5 pl-6">
              <input type="hidden" name="tipo" value={def.tipo} />
              <input type="hidden" name="nombre" value={state.intento ?? ''} />
              <input type="hidden" name="confirmar" value="true" />
              <ConfirmarButton />
            </form>
          </div>
        ) : null}

        {/* Lista */}
        <div className="mt-4 flex-1 border-t border-line pt-4">
          {valores.length === 0 ? (
            <EmptyState
              titulo="Aún sin valores"
              mensaje={`Agrega el primer ${def.singular} arriba. El catálogo se completa a medida que cargas tu inventario.`}
              icon={<Icon name={def.icon} size={30} />}
              tone="accent"
            />
          ) : (
            <ul className="flex flex-wrap gap-2">
              {valores.map((v) => (
                <li
                  key={v.id}
                  className={[
                    'rounded-full border border-line bg-surface-2 px-3 py-1 text-sm text-ink',
                    v.activo ? '' : 'opacity-45 line-through',
                  ].join(' ')}
                >
                  {v.nombre}
                </li>
              ))}
            </ul>
          )}
        </div>
      </LuminousCard>
    </motion.div>
  );
}

export function CatalogosClient({
  valores,
}: {
  valores: Record<CatalogoTipo, ValorCatalogo[]>;
}) {
  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <header className="mb-6">
        <h1 className="font-display text-2xl font-bold text-ink">Catálogos</h1>
        <p className="mt-1 flex items-center gap-1.5 text-sm text-ink-soft">
          <ShieldCheck size={15} className="text-accent" />
          Vocabulario maestro del sistema. Solo el Dueño y el Administrador lo editan — porque un
          duplicado silencioso aquí rompe la equivalencia entre medicamentos.
        </p>
      </header>

      <motion.div
        variants={container}
        initial="hidden"
        animate="show"
        className="grid grid-cols-1 gap-4 lg:grid-cols-3"
      >
        {CATALOGOS.map((def) => (
          <CatalogoSeccion key={def.tipo} def={def} valores={valores[def.tipo] ?? []} />
        ))}
      </motion.div>
    </div>
  );
}
