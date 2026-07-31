'use client';

import { motion } from 'framer-motion';
import {
  AlertTriangle,
  CalendarClock,
  PackageCheck,
  Receipt,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { CountUp } from '@/components/brand/CountUp';
import { LuminousCard } from '@/components/brand/LuminousCard';
import { EmptyState } from '@/components/brand/EmptyState';
import { formatMoney, formatNumber, formatDate } from '@/lib/format';
import { MOTION } from '@/lib/tokens';

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

function Kpi({
  icon,
  etiqueta,
  children,
  protagonist = false,
}: {
  icon: React.ReactNode;
  etiqueta: string;
  children: React.ReactNode;
  protagonist?: boolean;
}) {
  return (
    <motion.div variants={item}>
      <LuminousCard protagonist={protagonist} className="h-full">
        <div className="flex items-center gap-2 text-ink-faint">
          <span className="text-accent">{icon}</span>
          <span className="text-xs font-medium uppercase tracking-wide">{etiqueta}</span>
        </div>
        <div className="mt-3 font-display text-2xl font-bold text-ink">{children}</div>
      </LuminousCard>
    </motion.div>
  );
}

/** Carril de urgencia con estado vacío premium (§1.4). */
function Carril({
  titulo,
  acento,
  vacioTitulo,
  vacioMensaje,
  icon,
}: {
  titulo: string;
  acento: string;
  vacioTitulo: string;
  vacioMensaje: string;
  icon: React.ReactNode;
}) {
  return (
    <motion.div variants={item}>
      <LuminousCard neutral className="h-full">
        <div className="mb-1 flex items-center gap-2">
          <span style={{ color: acento }}>{icon}</span>
          <h2 className="font-display text-sm font-semibold text-ink">{titulo}</h2>
        </div>
        <EmptyState titulo={vacioTitulo} mensaje={vacioMensaje} />
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

      {/* KPIs — el cajero no ve finanzas (§2.7) */}
      <motion.div
        variants={container}
        initial="hidden"
        animate="show"
        className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4"
      >
        {verFinanzas ? (
          <>
            <Kpi icon={<Wallet size={16} />} etiqueta="Ventas de hoy" protagonist>
              <CountUp value={kpis.ventasHoy} format={formatMoney} />
            </Kpi>
            <Kpi icon={<Receipt size={16} />} etiqueta="Tickets de hoy">
              <CountUp value={kpis.ticketsHoy} format={(n) => formatNumber(n)} />
            </Kpi>
            <Kpi icon={<TrendingUp size={16} />} etiqueta="Margen de hoy">
              <CountUp value={kpis.margenHoy} format={formatMoney} />
            </Kpi>
            <Kpi icon={<PackageCheck size={16} />} etiqueta="Capital dormido">
              <CountUp value={kpis.capitalDormido} format={formatMoney} />
            </Kpi>
          </>
        ) : (
          <>
            <Kpi icon={<Receipt size={16} />} etiqueta="Tickets de hoy" protagonist>
              <CountUp value={kpis.ticketsHoy} format={(n) => formatNumber(n)} />
            </Kpi>
            <Kpi icon={<PackageCheck size={16} />} etiqueta="Productos por vencer">
              <CountUp value={0} format={(n) => formatNumber(n)} />
            </Kpi>
          </>
        )}
      </motion.div>

      {/* Carriles de urgencia (§1.6) */}
      <motion.div
        variants={container}
        initial="hidden"
        animate="show"
        className="mt-4 grid grid-cols-1 gap-3 sm:gap-4 lg:grid-cols-3"
      >
        <Carril
          titulo="Vencidas"
          acento="hsl(var(--danger))"
          icon={<AlertTriangle size={16} />}
          vacioTitulo="Nada vencido"
          vacioMensaje="Cuando cargues tu inventario con lotes y fechas, aquí verás en pesos lo que hay que sacar antes de que se pierda."
        />
        <Carril
          titulo="Esta semana"
          acento="hsl(var(--warning))"
          icon={<CalendarClock size={16} />}
          vacioTitulo="Semana tranquila"
          vacioMensaje="El radar de vencimientos te avisará con tiempo para devolver al laboratorio, promocionar o mover el lote."
        />
        <Carril
          titulo="Reordenar"
          acento="hsl(var(--info))"
          icon={<PackageCheck size={16} />}
          vacioTitulo="Stock al día"
          vacioMensaje="Con la velocidad de venta y el tiempo de entrega de cada proveedor, el sistema te dirá qué pedir y cuándo."
        />
      </motion.div>

      {/* Bienvenida de sistema vacío — el primer minuto (§1.4) */}
      <motion.div variants={item} initial="hidden" animate="show" className="mt-4">
        <LuminousCard>
          <EmptyState
            titulo="Tu farmacia está lista para respirar"
            mensaje="Esto son los cimientos: identidad, seguridad por rol y trazabilidad inviolable ya funcionando. Las próximas tandas encienden la caja, el inventario con lotes FEFO y el radar de vencimientos en pesos."
          />
        </LuminousCard>
      </motion.div>
    </div>
  );
}
