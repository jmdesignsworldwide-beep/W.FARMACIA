'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import * as Icons from 'lucide-react';
import { Menu, X } from 'lucide-react';
import { Capsula } from '@/components/brand/Capsula';
import { ThemeToggle } from '@/components/layout/ThemeToggle';
import { NAV } from '@/lib/nav';
import { can, ROLE_LABEL, type Role } from '@/lib/roles';
import { BRAND, MOTION } from '@/lib/tokens';

/**
 * §1.6 — Sidebar con el sello, que colapsa a hamburguesa a 390px reales.
 * Filtra ítems por capacidad del rol (cortesía; la barrera real es el
 * servidor, §2.7). Los módulos de próximas tandas se muestran atenuados.
 */
function IconByName({ name, size = 18 }: { name: string; size?: number }) {
  const Cmp = (Icons as unknown as Record<string, Icons.LucideIcon>)[name] ?? Icons.Circle;
  return <Cmp size={size} />;
}

export function Sidebar({
  role,
  nombre,
}: {
  role: Role;
  nombre: string;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const groups = NAV.map((g) => ({
    ...g,
    items: g.items.filter((it) => !it.cap || can(role, it.cap)),
  })).filter((g) => g.items.length > 0);

  const content = (
    <div className="flex h-full flex-col">
      {/* Marca con el sello */}
      <div className="flex items-center gap-3 px-5 py-5">
        <Capsula size={36} pulse />
        <div className="leading-tight">
          <div className="font-display text-base font-bold text-ink">{BRAND.name}</div>
          <div className="text-[11px] text-ink-faint">{BRAND.tagline}</div>
        </div>
      </div>

      {/* Navegación */}
      <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-2">
        {groups.map((group) => (
          <div key={group.titulo}>
            <div className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-faint">
              {group.titulo}
            </div>
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const active = pathname === item.href;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.proximamente ? '#' : item.href}
                      onClick={() => setOpen(false)}
                      aria-disabled={item.proximamente}
                      className={[
                        'group flex items-center gap-3 rounded-control px-3 py-2 text-sm transition-colors',
                        active
                          ? 'bg-surface-2 font-semibold text-ink luminous'
                          : 'text-ink-soft hover:bg-surface-2 hover:text-ink',
                        item.proximamente ? 'cursor-not-allowed opacity-45 hover:bg-transparent' : '',
                      ].join(' ')}
                    >
                      <span className={active ? 'text-accent' : 'text-ink-faint group-hover:text-accent'}>
                        <IconByName name={item.icon} />
                      </span>
                      <span className="flex-1">{item.label}</span>
                      {item.proximamente ? (
                        <span className="rounded-full bg-surface-2 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-ink-faint">
                          pronto
                        </span>
                      ) : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Pie: usuario + tema */}
      <div className="flex items-center justify-between gap-2 border-t border-line px-4 py-3">
        <div className="min-w-0 leading-tight">
          <div className="truncate text-sm font-medium text-ink">{nombre}</div>
          <div className="text-[11px] text-ink-faint">{ROLE_LABEL[role]}</div>
        </div>
        <ThemeToggle />
      </div>

      {/* Crédito del creador — único enlace externo, solo Instagram (§8) */}
      <a
        href={BRAND.makerInstagram}
        target="_blank"
        rel="noopener noreferrer"
        className="block border-t border-line px-4 py-2 text-center text-[11px] text-ink-faint transition-colors hover:text-accent"
      >
        Hecho por {BRAND.maker}
      </a>
    </div>
  );

  return (
    <>
      {/* Escritorio */}
      <aside className="hidden w-64 shrink-0 border-r border-line bg-surface md:block">
        {content}
      </aside>

      {/* Móvil: barra superior con hamburguesa */}
      <div className="flex items-center justify-between border-b border-line bg-surface px-4 py-3 md:hidden">
        <div className="flex items-center gap-2">
          <Capsula size={28} />
          <span className="font-display text-sm font-bold text-ink">{BRAND.name}</span>
        </div>
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Abrir menú"
            className="flex h-9 w-9 items-center justify-center rounded-control text-ink-soft hover:bg-surface-2"
          >
            <Menu size={20} />
          </button>
        </div>
      </div>

      {/* Móvil: panel deslizante */}
      <AnimatePresence>
        {open ? (
          <motion.div
            className="fixed inset-0 z-50 md:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
            <motion.aside
              className="absolute inset-y-0 left-0 w-72 bg-surface shadow-2xl"
              initial={{ x: '-100%' }}
              animate={{ x: 0, transition: MOTION.spring }}
              exit={{ x: '-100%', transition: { duration: 0.2 } }}
            >
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Cerrar menú"
                className="absolute right-3 top-4 z-10 flex h-9 w-9 items-center justify-center rounded-control text-ink-soft hover:bg-surface-2"
              >
                <X size={20} />
              </button>
              {content}
            </motion.aside>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}
