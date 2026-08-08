import { requireCapability, getSessionUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { CronicosCliente, type ActivoItem, type CandidatoItem } from './CronicosCliente';

export const dynamic = 'force-dynamic';

function estadoDe(proxima: string | null): { label: string; tono: string; orden: number } {
  if (!proxima) return { label: 'sin fecha', tono: 'text-ink-faint', orden: 3 };
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const p = new Date(proxima + 'T00:00:00');
  const dias = Math.round((p.getTime() - hoy.getTime()) / 86400000);
  if (dias < 0) return { label: 'atrasado', tono: 'text-rose-600 dark:text-rose-400', orden: 0 };
  if (dias <= 3) return { label: 'por vencer', tono: 'text-amber-600 dark:text-amber-400', orden: 1 };
  return { label: 'al día', tono: 'text-emerald-600 dark:text-emerald-400', orden: 2 };
}

export default async function CronicosPage() {
  await requireCapability('ver_operacion');
  const user = await getSessionUser();
  const puedeConfirmar = user?.role === 'dueno' || user?.role === 'administrador' || user?.role === 'farmaceutico';
  const supabase = createClient();

  const { data: act } = await supabase
    .from('tratamiento_cronico')
    .select('id, ciclo_dias, ultima_compra, proxima_fecha, estado, cliente:cliente_id ( nombre, telefono ), principio:principio_activo_id ( nombre )')
    .eq('estado', 'activo')
    .order('proxima_fecha', { nullsFirst: false });

  const activos: ActivoItem[] = ((act as unknown as Array<Record<string, unknown>>) ?? [])
    .map((t) => {
      const cli = t.cliente as { nombre?: string; telefono?: string | null } | null;
      const est = estadoDe((t.proxima_fecha as string) ?? null);
      return {
        id: String(t.id),
        cliente: cli?.nombre ?? '—',
        telefono: cli?.telefono ?? null,
        principio: (t.principio as { nombre?: string } | null)?.nombre ?? '—',
        cicloDias: Number(t.ciclo_dias),
        proximaFecha: (t.proxima_fecha as string) ?? null,
        estadoLabel: est.label,
        estadoTono: est.tono,
        orden: est.orden,
      };
    })
    .sort((a, b) => a.orden - b.orden);

  const { data: cand } = await supabase.rpc('candidatos_cronicos' as never);
  const candidatos: CandidatoItem[] = ((cand as unknown as Array<Record<string, unknown>>) ?? []).map((c) => ({
    clienteId: String(c.cliente_id),
    clienteNombre: String(c.cliente_nombre),
    principioActivoId: String(c.principio_activo_id),
    principioNombre: String(c.principio_nombre),
    compras: Number(c.compras),
    ultima: (c.ultima as string) ?? null,
    intervaloPromedio: c.intervalo_promedio != null ? Number(c.intervalo_promedio) : null,
  }));

  return <CronicosCliente activos={activos} candidatos={candidatos} puedeConfirmar={puedeConfirmar} />;
}
