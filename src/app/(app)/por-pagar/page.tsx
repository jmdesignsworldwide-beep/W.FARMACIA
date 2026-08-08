import { requireCapability } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { Receipt } from 'lucide-react';
import { PorPagarCliente, type CxpRow, type ProveedorOpt } from './PorPagarCliente';

export const dynamic = 'force-dynamic';

export default async function PorPagarPage() {
  await requireCapability('ver_finanzas'); // el espejo del fiado: solo Dueño/Admin
  const supabase = createClient();

  const { data: cxp } = await supabase
    .from('cuenta_por_pagar')
    .select('id, monto, fecha_emision, fecha_vencimiento, estado, nota, proveedor:proveedor_id ( nombre )')
    .eq('estado', 'pendiente')
    .order('fecha_vencimiento', { ascending: true, nullsFirst: false });

  const rows: CxpRow[] = ((cxp as unknown as Array<{
    id: string; monto: number; fecha_emision: string; fecha_vencimiento: string | null; estado: string; nota: string | null; proveedor: { nombre: string } | null;
  }>) ?? []).map((c) => ({
    id: c.id,
    monto: Number(c.monto),
    fechaEmision: c.fecha_emision,
    fechaVencimiento: c.fecha_vencimiento,
    nota: c.nota,
    proveedor: c.proveedor?.nombre ?? null,
  }));

  const { data: provs } = await supabase.from('proveedor').select('id, nombre').eq('activo', true).order('nombre');
  const proveedores: ProveedorOpt[] = ((provs as unknown as Array<{ id: string; nombre: string }>) ?? []).map((p) => ({ id: p.id, nombre: p.nombre }));

  const total = rows.reduce((s, r) => s + r.monto, 0);
  const hoy = new Date().toISOString().slice(0, 10);
  const vencido = rows.filter((r) => r.fechaVencimiento && r.fechaVencimiento < hoy).reduce((s, r) => s + r.monto, 0);

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4">
      <div>
        <div className="flex items-center gap-2 font-display text-xl font-semibold text-ink">
          <Receipt className="h-6 w-6 text-accent" /> Cuentas por pagar
        </div>
        <p className="mt-1 text-sm text-ink-soft">
          Lo que la farmacia le debe a las droguerías, con su fecha. Alimenta el pronóstico de flujo de caja.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-card border border-line bg-surface p-4">
          <div className="text-xs text-ink-faint">Total por pagar</div>
          <div className="font-display text-2xl font-bold text-ink tabular-nums">
            {new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP' }).format(total)}
          </div>
        </div>
        <div className="rounded-card border border-line bg-surface p-4">
          <div className="text-xs text-ink-faint">Ya vencido</div>
          <div className="font-display text-2xl font-bold text-rose-600 dark:text-rose-400 tabular-nums">
            {new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP' }).format(vencido)}
          </div>
        </div>
      </div>

      <PorPagarCliente rows={rows} proveedores={proveedores} />
    </div>
  );
}
