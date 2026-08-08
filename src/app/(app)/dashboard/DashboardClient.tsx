'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  AlertTriangle,
  CalendarClock,
  Wallet,
  Package,
  Receipt,
  TrendingUp,
  Snowflake,
  Bike,
  Siren,
  ArrowRight,
} from 'lucide-react';
import { CountUp } from '@/components/brand/CountUp';
import { LuminousCard } from '@/components/brand/LuminousCard';
import { formatMoney, formatNumber, formatDate } from '@/lib/format';
import { MOTION, toneColor, type Tone } from '@/lib/tokens';

interface Money {
  liquidoHoy: number;
  ticketsHoy: number;
  margenHoy: number;
  inventarioParado: number;
  capitalDormido: number;
  porCobrar: number;
  porPagar: number;
  posicionNeta: number;
}
interface Urgencias {
  vencidosN: number;
  vencidosVal: number;
  semanaN: number;
  semanaVal: number;
  entregasN: number;
  frioN: number;
}

const container = { hidden: {}, show: { transition: { staggerChildren: MOTION.stagger } } };
const item = { hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0, transition: MOTION.spring } };

/** Tarjeta grande de un "estado del dinero", con enlace a su pantalla. */
function EstadoDinero({
  icon, etiqueta, valor, sub, protagonista, href, tone,
}: {
  icon: React.ReactNode; etiqueta: string; valor: number; sub?: string; protagonista?: boolean; href: string; tone?: Tone;
}) {
  return (
    <motion.div variants={item} className="h-full">
      <Link href={href} className="block h-full">
        <LuminousCard protagonist={protagonista} neutral={!protagonista} className="h-full transition-transform hover:-translate-y-0.5">
          <div className="flex items-center gap-2 text-ink-faint">
            <span style={tone ? { color: toneColor(tone) } : undefined} className={tone ? undefined : 'text-accent'}>{icon}</span>
            <span className="text-xs font-medium uppercase tracking-wide">{etiqueta}</span>
          </div>
          <div className="mt-3 font-display text-2xl font-bold text-ink sm:text-3xl">
            <CountUp value={valor} format={formatMoney} />
          </div>
          {sub && <div className="mt-1 text-xs text-ink-faint">{sub}</div>}
        </LuminousCard>
      </Link>
    </motion.div>
  );
}

/** Carril de urgencia con dato real o estado tranquilo. */
function Carril({
  titulo, tone, icon, n, detalle, href, tranquilo,
}: {
  titulo: string; tone: Tone; icon: React.ReactNode; n: number; detalle: string; href: string; tranquilo: string;
}) {
  const hay = n > 0;
  return (
    <motion.div variants={item} className="h-full">
      <Link href={href} className="block h-full">
        <LuminousCard neutral className="flex h-full flex-col transition-transform hover:-translate-y-0.5">
          <div className="mb-1 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span style={{ color: toneColor(tone) }}>{icon}</span>
              <h2 className="font-display text-sm font-semibold text-ink">{titulo}</h2>
            </div>
            <ArrowRight className="h-4 w-4 text-ink-faint" />
          </div>
          {hay ? (
            <div className="mt-2">
              <div className="font-display text-2xl font-bold" style={{ color: toneColor(tone) }}>
                <CountUp value={n} format={(x) => formatNumber(x)} />
              </div>
              <div className="mt-0.5 text-xs text-ink-soft">{detalle}</div>
            </div>
          ) : (
            <div className="mt-2 text-sm text-ink-faint">{tranquilo}</div>
          )}
        </LuminousCard>
      </Link>
    </motion.div>
  );
}

export function DashboardClient({
  nombre, verFinanzas, deTurno, money, urgencias,
}: {
  nombre: string; verFinanzas: boolean; deTurno: boolean; money: Money; urgencias: Urgencias;
}) {
  const hoy = formatDate(new Date());
  const primerNombre = nombre.split(' ')[0];

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 md:py-8">
      {deTurno && (
        <div className="mb-4 flex items-center gap-2 rounded-card border border-accent/40 bg-accent/5 px-4 py-2.5 text-sm text-ink">
          <Siren className="h-4 w-4 text-accent" />
          <span><span className="font-semibold">Estamos de turno.</span> La farmacia figura como farmacia de turno (24 horas).</span>
        </div>
      )}

      {/* Saludo */}
      <div className="mb-6">
        <p className="text-sm text-ink-faint">{hoy}</p>
        <h1 className="font-display text-2xl font-bold text-ink sm:text-3xl">Hola, {primerNombre}</h1>
        <p className="mt-1 text-sm text-ink-soft">Los tres estados de tu dinero, y lo que arde primero.</p>
      </div>

      {/* Tres estados del dinero (§ dinero). El cajero no ve cifras (§2.7). */}
      <motion.div variants={container} initial="hidden" animate="show" className="grid grid-cols-1 gap-3 sm:gap-4 sm:grid-cols-3">
        {verFinanzas ? (
          <>
            <EstadoDinero
              icon={<Wallet size={16} />} etiqueta="Líquido — hoy" valor={money.liquidoHoy} protagonista href="/caja-diaria"
              sub={`${formatNumber(money.ticketsHoy)} ticket(s)${money.margenHoy ? ` · margen ${formatMoney(money.margenHoy)}` : ''}`}
            />
            <EstadoDinero
              icon={<Package size={16} />} etiqueta="Parado — inventario" valor={money.inventarioParado} href="/finanzas" tone="warning"
              sub={money.capitalDormido > 0 ? `${formatMoney(money.capitalDormido)} dormido (>90d)` : 'todo el inventario se mueve'}
            />
            <EstadoDinero
              icon={<TrendingUp size={16} />} etiqueta="En la calle — neto" valor={money.posicionNeta} href="/fiado"
              tone={money.posicionNeta >= 0 ? 'success' : 'danger'}
              sub={`por cobrar ${formatMoney(money.porCobrar)} · por pagar ${formatMoney(money.porPagar)}`}
            />
          </>
        ) : (
          <EstadoDinero icon={<Receipt size={16} />} etiqueta="Tickets — hoy" valor={money.ticketsHoy} protagonista href="/caja" />
        )}
      </motion.div>

      {/* Carriles de urgencia con datos reales (§1.6) */}
      <motion.div variants={container} initial="hidden" animate="show" className="mt-4 grid grid-cols-1 gap-3 sm:gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Carril
          titulo="Vencidos" tone="danger" icon={<AlertTriangle size={16} />} href="/vencimientos"
          n={urgencias.vencidosN} detalle={`${formatMoney(urgencias.vencidosVal)} en riesgo`} tranquilo="Nada vencido. 🎉"
        />
        <Carril
          titulo="Vence esta semana" tone="warning" icon={<CalendarClock size={16} />} href="/vencimientos"
          n={urgencias.semanaN} detalle={`${formatMoney(urgencias.semanaVal)} por mover`} tranquilo="Semana tranquila."
        />
        <Carril
          titulo="Entregas en curso" tone="info" icon={<Bike size={16} />} href="/delivery"
          n={urgencias.entregasN} detalle="pendientes o en camino" tranquilo="Sin entregas activas."
        />
        <Carril
          titulo="Cadena de frío" tone="info" icon={<Snowflake size={16} />} href="/cadena-frio"
          n={urgencias.frioN} detalle="lote(s) en revisión de frío" tranquilo="Frío bajo control."
        />
      </motion.div>
    </div>
  );
}
