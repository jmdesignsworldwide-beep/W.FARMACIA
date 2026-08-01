import { requireCapability } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { ConteoCliente, type LineaCiega } from './ConteoCliente';

export const dynamic = 'force-dynamic';

export default async function ConteoPage() {
  const user = await requireCapability('gestionar_inventario');
  const puedeAutorizar = user.role === 'dueno' || user.role === 'administrador';
  const supabase = createClient();

  // Progreso de verificación (verde / amarillo / discrepancia).
  const base = supabase.from('producto').select('id', { count: 'exact', head: true }).is('eliminado_en', null);
  const [totalR, verifR, discR] = await Promise.all([
    base,
    supabase
      .from('producto')
      .select('id', { count: 'exact', head: true })
      .is('eliminado_en', null)
      .eq('estado_verificacion', 'verificado'),
    supabase
      .from('producto')
      .select('id', { count: 'exact', head: true })
      .is('eliminado_en', null)
      .eq('estado_verificacion', 'discrepancia'),
  ]);
  const total = totalR.count ?? 0;
  const verificados = verifR.count ?? 0;
  const discrepancias = discR.count ?? 0;
  const estimados = Math.max(0, total - verificados - discrepancias);

  // Conteo abierto (si lo hay) — SIN cantidad_sistema (conteo a ciegas).
  const { data: abierto } = await supabase
    .from('conteo_ciclico')
    .select('id')
    .neq('estado', 'cerrado')
    .order('fecha', { ascending: false })
    .limit(1)
    .maybeSingle<{ id: string }>();

  let conteoId: string | null = null;
  let lineas: LineaCiega[] = [];
  if (abierto) {
    conteoId = abierto.id;
    const { data } = await supabase
      .from('conteo_ciclico_linea')
      .select(
        `id, cantidad_contada,
         producto:producto_id ( nombre ),
         lote:lote_id ( numero_lote, fecha_vencimiento, ubicacion_fisica )`,
      )
      .eq('conteo_id', abierto.id)
      .order('created_at', { ascending: true });
    type Row = {
      id: string;
      cantidad_contada: number | null;
      producto: { nombre: string } | null;
      lote: { numero_lote: string | null; fecha_vencimiento: string | null; ubicacion_fisica: string | null } | null;
    };
    lineas = ((data as unknown as Row[]) ?? []).map((r) => ({
      lineaId: r.id,
      producto: r.producto?.nombre ?? '—',
      lote: r.lote?.numero_lote ?? null,
      vence: r.lote?.fecha_vencimiento ?? null,
      ubicacion: r.lote?.ubicacion_fisica ?? null,
      contada: r.cantidad_contada,
    }));
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
      <header className="mb-5">
        <h1 className="font-display text-2xl font-bold text-ink">Conteo cíclico</h1>
        <p className="mt-1 text-sm text-ink-soft">
          Cinco minutos al día: 10–15 productos priorizados por valor. Se cuenta a ciegas y el sistema
          revela después, propone la causa de lo que no cuadra y corrige con tu confirmación.
        </p>
      </header>

      <ConteoCliente
        conteoId={conteoId}
        lineas={lineas}
        puedeAutorizar={puedeAutorizar}
        progreso={{ total, verificados, estimados, discrepancias }}
      />
    </div>
  );
}
