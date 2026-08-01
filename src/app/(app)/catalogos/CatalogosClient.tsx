'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useFormState, useFormStatus } from 'react-dom';
import { motion } from 'framer-motion';
import * as Icons from 'lucide-react';
import { AlertTriangle, Check, Pencil, Plus, ShieldCheck, Trash2, X } from 'lucide-react';
import { LuminousCard } from '@/components/brand/LuminousCard';
import { EmptyState } from '@/components/brand/EmptyState';
import { CATALOGOS, type CatalogoDef, type CatalogoGrupo, type CatalogoTipo } from '@/lib/catalogos';
import { MOTION } from '@/lib/tokens';
import {
  crearValorCatalogo,
  editarValorCatalogo,
  borrarValorCatalogo,
  type CatalogoState,
} from './actions';

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
      Guardar de todos modos
    </button>
  );
}

/** Bloque de avisos blandos (parecidos + entrada sospechosa), compartido. */
function AvisosBlandos({ state }: { state: CatalogoState }) {
  if (!state.similares?.length && !state.sospechoso) return null;
  return (
    <div className="flex items-start gap-2 text-sm text-ink">
      <AlertTriangle size={16} className="mt-0.5 shrink-0 text-warning" />
      <div className="space-y-1">
        {state.sospechoso ? <p>{state.sospechoso} ¿Seguro que es un valor real?</p> : null}
        {state.similares?.length ? (
          <p>
            Ya existe algo parecido: <span className="font-medium">{state.similares.join(', ')}</span>. Si
            de verdad es distinto, confírmalo; si no, no lo dupliques.
          </p>
        ) : null}
      </div>
    </div>
  );
}

/** Una entrada del catálogo: ver / editar / confirmar-borrado. */
function EntradaCatalogo({ tipo, entrada }: { tipo: CatalogoTipo; entrada: ValorCatalogo }) {
  const router = useRouter();
  const [modo, setModo] = useState<'ver' | 'editar' | 'borrar'>('ver');
  const [nombre, setNombre] = useState(entrada.nombre);
  const [st, setSt] = useState<CatalogoState>({});
  const [pending, start] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (modo === 'editar') inputRef.current?.focus();
  }, [modo]);

  const guardar = (confirmar = false) =>
    start(async () => {
      const r = await editarValorCatalogo({ tipo, id: entrada.id, nombre: nombre.trim(), confirmar });
      setSt(r);
      if (r.ok) {
        setModo('ver');
        router.refresh();
      }
    });

  const borrar = () =>
    start(async () => {
      const r = await borrarValorCatalogo({ tipo, id: entrada.id, nombre: entrada.nombre });
      setSt(r);
      if (r.ok) router.refresh();
      // Bloqueado (en uso) o error: volver a "ver" para mostrar el aviso
      // (el conteo «La usan N productos» se renderiza en ese modo).
      else setModo('ver');
    });

  const cancelar = () => {
    setModo('ver');
    setNombre(entrada.nombre);
    setSt({});
  };

  // ── Ver ── (píldora que fluye en línea; ocupa fila completa solo si hay aviso)
  if (modo === 'ver') {
    return (
      <li className={st.enUso || st.error ? 'w-full' : ''}>
        <div className="group inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-2 py-1 pl-3 pr-1.5 text-sm text-ink">
          <span className={entrada.activo ? '' : 'opacity-45 line-through'}>{entrada.nombre}</span>
          <span className="flex items-center gap-0.5">
            <button
              type="button"
              onClick={() => { setSt({}); setModo('editar'); }}
              aria-label={`Editar ${entrada.nombre}`}
              className="flex h-6 w-6 items-center justify-center rounded-full text-ink-faint transition-colors hover:bg-surface hover:text-accent"
            >
              <Pencil size={13} />
            </button>
            <button
              type="button"
              onClick={() => { setSt({}); setModo('borrar'); }}
              aria-label={`Borrar ${entrada.nombre}`}
              className="flex h-6 w-6 items-center justify-center rounded-full text-ink-faint transition-colors hover:bg-danger/10 hover:text-danger"
            >
              <Trash2 size={13} />
            </button>
          </span>
        </div>
        {/* Bloqueo por uso tras intentar borrar */}
        {st.enUso ? (
          <p className="mt-1 flex items-start gap-1.5 rounded-control border border-warning/30 bg-warning/10 px-2.5 py-1.5 text-[13px] text-ink">
            <AlertTriangle size={14} className="mt-0.5 shrink-0 text-warning" />
            La usan <span className="font-medium">{st.enUso}</span>{' '}
            {st.enUso === 1 ? 'producto' : 'productos'}: no se puede borrar sin romper esos datos.
          </p>
        ) : null}
        {st.error ? (
          <p role="alert" className="mt-1 text-[13px] text-danger">{st.error}</p>
        ) : null}
      </li>
    );
  }

  // ── Confirmar borrado ──
  if (modo === 'borrar') {
    return (
      <li className="w-full basis-full">
        <div className="rounded-control border border-danger/30 bg-danger/[0.06] px-3 py-2.5">
          <p className="text-sm text-ink">
            ¿Borrar «<span className="font-medium">{entrada.nombre}</span>»? No se puede deshacer.
          </p>
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={borrar}
              disabled={pending}
              className="inline-flex h-9 items-center gap-1.5 rounded-control border border-danger/40 bg-danger/10 px-3 text-sm font-medium text-danger transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {pending ? <Icons.Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
              Sí, borrar
            </button>
            <button
              type="button"
              onClick={cancelar}
              disabled={pending}
              className="inline-flex h-9 items-center rounded-control border border-line px-3 text-sm text-ink-soft transition-colors hover:text-ink"
            >
              Cancelar
            </button>
          </div>
          {st.error ? <p role="alert" className="mt-2 text-[13px] text-danger">{st.error}</p> : null}
        </div>
      </li>
    );
  }

  // ── Editar ──
  return (
    <li className="w-full basis-full">
      <div className="rounded-control border border-accent/30 bg-accent/[0.04] px-3 py-2.5">
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            value={nombre}
            maxLength={120}
            onChange={(e) => setNombre(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); guardar(false); }
              if (e.key === 'Escape') cancelar();
            }}
            aria-label={`Editar nombre de ${entrada.nombre}`}
            className="h-10 w-full rounded-control border border-line bg-canvas px-3 text-ink outline-none transition-shadow focus:luminous"
          />
          <button
            type="button"
            onClick={() => guardar(false)}
            disabled={pending || !nombre.trim()}
            aria-label="Guardar"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-control brand-gradient text-white shadow-sm transition-opacity hover:opacity-95 disabled:opacity-60"
          >
            {pending ? <Icons.Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
          </button>
          <button
            type="button"
            onClick={cancelar}
            disabled={pending}
            aria-label="Cancelar"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-control border border-line text-ink-faint transition-colors hover:text-ink"
          >
            <X size={16} />
          </button>
        </div>
        {st.error ? <p role="alert" className="mt-2 text-[13px] text-danger">{st.error}</p> : null}
        {(st.similares?.length || st.sospechoso) ? (
          <div className="mt-2.5 rounded-control border border-warning/30 bg-warning/10 p-2.5">
            <AvisosBlandos state={st} />
            <div className="mt-2 pl-6">
              <button
                type="button"
                onClick={() => guardar(true)}
                disabled={pending}
                className="inline-flex h-9 items-center gap-1.5 rounded-control border border-warning/40 bg-warning/10 px-3 text-sm font-medium text-warning transition-opacity hover:opacity-90 disabled:opacity-60"
              >
                {pending ? <Icons.Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
                Guardar de todos modos
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </li>
  );
}

const container = { hidden: {}, show: { transition: { staggerChildren: MOTION.stagger } } };
const item = { hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0, transition: MOTION.spring } };

function CatalogoSeccion({ def, valores }: { def: CatalogoDef; valores: ValorCatalogo[] }) {
  const [state, formAction] = useFormState<CatalogoState, FormData>(crearValorCatalogo, {});
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (state.ok) {
      formRef.current?.reset();
      inputRef.current?.focus();
    }
  }, [state.ok]);

  const hayAvisos = Boolean(state.similares?.length || state.sospechoso);

  return (
    <motion.div variants={item} className="h-full">
      <LuminousCard neutral className="flex h-full flex-col">
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

        {state.ok && state.creado ? (
          <p className="mt-3 inline-flex items-center gap-1.5 text-sm text-accent">
            <Check size={15} /> Agregado «{state.creado}».
          </p>
        ) : null}

        {state.error ? (
          <p role="alert" className="mt-3 rounded-control border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
            {state.error}
          </p>
        ) : null}

        {/* Avisos blandos: parecidos y/o entrada sospechosa + confirmación (§4) */}
        {hayAvisos ? (
          <div className="mt-3 rounded-control border border-warning/30 bg-warning/10 p-3">
            <AvisosBlandos state={state} />
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
                <EntradaCatalogo key={v.id} tipo={def.tipo} entrada={v} />
              ))}
            </ul>
          )}
        </div>
      </LuminousCard>
    </motion.div>
  );
}

const GRUPOS: { grupo: CatalogoGrupo; titulo: string; nota: string }[] = [
  { grupo: 'clinico', titulo: 'Identidad clínica', nota: 'Definen la equivalencia entre medicamentos.' },
  {
    grupo: 'clasificacion',
    titulo: 'Clasificación',
    nota: 'Agrupan y enriquecen la molécula — para reportes, alertas de alergia y el mostrador.',
  },
];

export function CatalogosClient({ valores }: { valores: Record<CatalogoTipo, ValorCatalogo[]> }) {
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

      <div className="space-y-8">
        {GRUPOS.map(({ grupo, titulo, nota }) => (
          <section key={grupo}>
            <div className="mb-3 flex items-baseline gap-2">
              <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-ink-soft">
                {titulo}
              </h2>
              <span className="text-xs text-ink-faint">— {nota}</span>
            </div>
            <motion.div
              variants={container}
              initial="hidden"
              animate="show"
              className="grid grid-cols-1 gap-4 lg:grid-cols-3"
            >
              {CATALOGOS.filter((d) => d.grupo === grupo).map((def) => (
                <CatalogoSeccion key={def.tipo} def={def} valores={valores[def.tipo] ?? []} />
              ))}
            </motion.div>
          </section>
        ))}
      </div>
    </div>
  );
}
