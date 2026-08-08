import { requireCapability } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { can } from '@/lib/roles';
import { HandCoins } from 'lucide-react';
import { FiadoCliente, type FiadoRow } from './FiadoCliente';

export const dynamic = 'force-dynamic';

export default async function FiadoPage() {
  const user = await requireCapability('ver_operacion'); // caja puede recibir abonos
  const puedeLimite = can(user.role, 'ver_finanzas'); // Dueño/Admin ajustan límite
  const supabase = createClient();

  // Fiado = cobros a crédito interno. El saldo por pagador = suma de esos cobros − abonos.
  const { data: cobros } = await supabase
    .from('cobro')
    .select('pagador_id, monto')
    .eq('metodo', 'credito_interno')
    .not('pagador_id', 'is', null);
  const fiadoPorPagador = new Map<string, number>();
  for (const c of (cobros as unknown as Array<{ pagador_id: string; monto: number }>) ?? []) {
    fiadoPorPagador.set(c.pagador_id, (fiadoPorPagador.get(c.pagador_id) ?? 0) + Number(c.monto));
  }

  const { data: abonos } = await supabase.from('abono').select('pagador_id, monto');
  const abonadoPorPagador = new Map<string, number>();
  for (const a of (abonos as unknown as Array<{ pagador_id: string; monto: number }>) ?? []) {
    abonadoPorPagador.set(a.pagador_id, (abonadoPorPagador.get(a.pagador_id) ?? 0) + Number(a.monto));
  }

  const pagadorIds = [...fiadoPorPagador.keys()];
  const pagadores = new Map<string, { nombre: string; telefono: string | null; limite: number | null }>();
  if (pagadorIds.length > 0) {
    const { data: pags } = await supabase
      .from('pagador')
      .select('id, nombre, telefono, limite_credito')
      .in('id', pagadorIds);
    for (const p of (pags as unknown as Array<{ id: string; nombre: string; telefono: string | null; limite_credito: number | null }>) ?? []) {
      pagadores.set(p.id, { nombre: p.nombre, telefono: p.telefono, limite: p.limite_credito });
    }
  }

  const rows: FiadoRow[] = pagadorIds
    .map((id) => {
      const info = pagadores.get(id);
      const fiado = fiadoPorPagador.get(id) ?? 0;
      const abonado = abonadoPorPagador.get(id) ?? 0;
      const saldo = Math.round((fiado - abonado) * 100) / 100;
      return {
        id,
        nombre: info?.nombre ?? '—',
        telefono: info?.telefono ?? null,
        limite: info?.limite ?? null,
        fiado,
        abonado,
        saldo,
      };
    })
    .filter((r) => r.saldo > 0.009)
    .sort((a, b) => b.saldo - a.saldo);

  const totalPorCobrar = rows.reduce((s, r) => s + r.saldo, 0);

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4">
      <div>
        <div className="flex items-center gap-2 font-display text-xl font-semibold text-ink">
          <HandCoins className="h-6 w-6 text-accent" /> Fiado (cuentas por cobrar)
        </div>
        <p className="mt-1 text-sm text-ink-soft">
          Lo que el barrio le debe a la farmacia. El saldo es cada venta fiada menos lo abonado.
        </p>
      </div>

      <div className="rounded-card border border-line bg-surface p-4">
        <div className="text-xs text-ink-faint">Total por cobrar</div>
        <div className="font-display text-3xl font-bold text-amber-600 dark:text-amber-400 tabular-nums">
          {new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP' }).format(totalPorCobrar)}
        </div>
        <div className="mt-1 text-xs text-ink-faint">{rows.length} cliente(s) con saldo abierto</div>
      </div>

      <FiadoCliente rows={rows} puedeLimite={puedeLimite} />
    </div>
  );
}
