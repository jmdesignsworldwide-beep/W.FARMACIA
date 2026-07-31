'use client';

import { motion } from 'framer-motion';
import {
  AlertTriangle,
  CalendarClock,
  Package,
  PackageCheck,
  Receipt,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { CountUp } from '@/components/brand/CountUp';
import { LuminousCard } from '@/components/brand/LuminousCard';
import { EmptyState } from '@/components/brand/EmptyState';
import { Capsula } from '@/components/brand/Capsula';
import { formatMoney, formatNumber, formatDate } from '@/lib/format';
import { MOTION, toneColor, toneRing, type Tone } from '@/lib/tokens';

interface Kpis {
  ventasHoy: number;
  ticketsHoy: number;
  margenHoy: number;
  capitalDormido: number;
}

const container = {
  hidden: {},
  show: { transition: { staggerChildren: MOTION.stagger } },
};
const item = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: MOTION.spring },
};

type KpiVariant = 'protagonista' | 'alerta' | 'neutral';

function Kpi({
  icon,
  etiqueta,
  children,
  variant = 'neutral',
}: {
  icon: React.ReactNode;
  etiqueta: string;
  children: React.ReactNode;
  variant?: KpiVariant;
}) {
  // §1.1 — jerarquía visual: el protagonista con el borde más brillante,
  // la alerta teñida con su tono, y las métricas neutras retraídas.
  const isAlert = variant === 'alerta';
  const iconColor = variant === 'protagonista' ? 'text-accent' : isAlert ? undefined : 'text-ink-faint';
  return (
    <motion.div variants={item} className="h-full">
      <LuminousCard
        protagonist={variant === 'protagonista'}
        neutral={variant === 'neutral'}
        className="h-full"
        style={isAlert ? { boxShadow: toneRing('warning') } : undefined}
      >
        <div className="flex items-center gap-2 text-ink-faint">
          <span className={iconColor} style={isAlert ? { color: toneColor('warning') } : undefined}>
            {icon}
          </span>
          <span className="text-xs font-medium uppercase tracking-wide">{etiqueta}</span>
        </div>
        <div
          className="mt-3 font-display text-2xl font-bold text-ink"
          style={isAlert ? { color: toneColor('warning') } : undefined}
        >
          {children}
        </div>
      </LuminousCard>
    </motion.div>
  );
}

/** Carril de urgencia con estado vacío premium y medallón propio (§1.3/§1.4). */
function Carril({
  titulo,
  tone,
  headerIcon,
  medallonIcon,
  vacioTitulo,
  vacioMensaje,
}: {
  titulo: string;
  tone: Tone;
  headerIcon: React.ReactNode;
  medallonIcon: React.ReactNode;
  vacioTitulo: string;
  vacioMensaje: string;
}) {
  return (
    <motion.div variants={item} className="h-full">
      <LuminousCard neutral className="h-full">
        <div className="mb-1 flex items-center gap-2">
          <span style={{ color: toneColor(tone) }}>{headerIcon}</span>
          <h2 className="font-display text-sm font-semibold text-ink">{titulo}</h2>
        </div>
        <EmptyState titulo={vacioTitulo} mensaje={vacioMensaje} icon={medallonIcon} tone={tone} />
      </LuminousCard>
    </motion.div>
  );
}

export function DashboardClient({
  nombre,
  verFinanzas,
  kpis,
}: {
  nombre: string;
  verFinanzas: boolean;
  kpis: Kpis;
}) {
  const hoy = formatDate(new Date());
  const primerNombre = nombre.split(' ')[0];

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 md:py-8">
      {/* Saludo */}
      <div className="mb-6">
        <p className="text-sm text-ink-faint">{hoy}</p>
        <h1 className="font-display text-2xl font-bold text-ink sm:text-3xl">
          Hola, {primerNombre}
        </h1>
        <p className="mt-1 text-sm text-ink-soft">
          Así está tu farmacia hoy. Lo que arde va primero.
        </p>
      </div>

      {/* KPIs — jerarquía §1.1. El cajero no ve finanzas (§2.7) */}
      <motion.div
        variants={container}
        initial="hidden"
        animate="show"
        className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4"
      >
        {verFinanzas ? (
          <>
            <Kpi icon={<Wallet size={16} />} etiqueta="Ventas de hoy" variant="protagonista">
              <CountUp value={kpis.ventasHoy} format={formatMoney} />
            </Kpi>
            <Kpi icon={<Receipt size={16} />} etiqueta="Tickets de hoy" variant="neutral">
              <CountUp value={kpis.ticketsHoy} format={(n) => formatNumber(n)} />
            </Kpi>
            <Kpi icon={<TrendingUp size={16} />} etiqueta="Margen de hoy" variant="neutral">
              <CountUp value={kpis.margenHoy} format={formatMoney} />
            </Kpi>
            <Kpi icon={<PackageCheck size={16} />} etiqueta="Capital dormido" variant="alerta">
              <CountUp value={kpis.capitalDormido} format={formatMoney} />
            </Kpi>
          </>
        ) : (
          <>
            <Kpi icon={<Receipt size={16} />} etiqueta="Tickets de hoy" variant="protagonista">
              <CountUp value={kpis.ticketsHoy} format={(n) => formatNumber(n)} />
            </Kpi>
            <Kpi icon={<PackageCheck size={16} />} etiqueta="Productos por vencer" variant="neutral">
              <CountUp value={0} format={(n) => formatNumber(n)} />
            </Kpi>
          </>
        )}
      </motion.div>

      {/* Carriles de urgencia (§1.6), cada uno con su medallón propio */}
      <motion.div
        variants={container}
        initial="hidden"
        animate="show"
        className="mt-4 grid grid-cols-1 gap-3 sm:gap-4 lg:grid-cols-3"
      >
        <Carril
          titulo="Vencidas"
          tone="danger"
          headerIcon={<AlertTriangle size={16} />}
          medallonIcon={<AlertTriangle size={30} />}
          vacioTitulo="Nada vencido"
          vacioMensaje="Cuando cargues tu inventario con lotes y fechas, aquí verás en pesos lo que hay que sacar antes de que se pierda."
        />
        <Carril
          titulo="Esta semana"
          tone="warning"
          headerIcon={<CalendarClock size={16} />}
          medallonIcon={<CalendarClock size={30} />}
          vacioTitulo="Semana tranquila"
          vacioMensaje="El radar de vencimientos te avisará con tiempo para devolver al laboratorio, promocionar o mover el lote."
        />
        <Carril
          titulo="Reordenar"
          tone="info"
          headerIcon={<Package size={16} />}
          medallonIcon={<Package size={30} />}
          vacioTitulo="Stock al día"
          vacioMensaje="Con la velocidad de venta y el tiempo de entrega de cada proveedor, el sistema te dirá qué pedir y cuándo."
        />
      </motion.div>

      {/* Franja de sistema vacío — compacta, a la altura de su contenido (§1.4) */}
      <motion.div variants={item} initial="hidden" animate="show" className="mt-4">
        <LuminousCard className="flex items-center gap-4">
          <div className="shrink-0">
            <Capsula size={40} pulse />
          </div>
          <div className="min-w-0">
            <h3 className="font-display text-base font-semibold text-ink">
              Tu farmacia está lista para respirar
            </h3>
            <p className="mt-0.5 text-sm leading-relaxed text-ink-soft">
              Esto son los cimientos: identidad, seguridad por rol y trazabilidad inviolable ya
              funcionando. Las próximas tandas encienden la caja, el inventario con lotes FEFO y el
              radar de vencimientos en pesos.
            </p>
          </div>
        </LuminousCard>
      </motion.div>
    </div>
  );
}
