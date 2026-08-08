import { requireCapability, getSessionUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { CadenaFrioCliente, type Lectura, type Apagon, type LoteRevision } from './CadenaFrioCliente';

export const dynamic = 'force-dynamic';

const SUCURSAL = '00000000-0000-0000-0000-000000000001';

export default async function CadenaFrioPage() {
  await requireCapability('ver_operacion');
  const user = await getSessionUser();
  const puedeResolver = user?.role === 'dueno' || user?.role === 'administrador' || user?.role === 'farmaceutico';
  const supabase = createClient();

  const { data: lecturasData } = await supabase
    .from('lectura_temperatura')
    .select('id, valor_celsius, fuera_de_rango, tomada_en')
    .eq('sucursal_id', SUCURSAL)
    .order('tomada_en', { ascending: false })
    .limit(8);

  const { data: apagonesData } = await supabase
    .from('apagon')
    .select('id, inicio, retorno, duracion_horas, umbral_excedido, lotes_afectados')
    .eq('sucursal_id', SUCURSAL)
    .order('inicio', { ascending: false })
    .limit(8);

  const { data: revisionData } = await supabase
    .from('lote')
    .select('id, revision_motivo, cantidad_actual, producto:producto_id ( nombre )')
    .eq('en_revision_frio', true)
    .limit(50);

  const { data: cfg } = await supabase.from('configuracion').select('clave, valor').in('clave', ['nevera_temp_min', 'nevera_temp_max', 'umbral_apagon_horas']);
  const cfgMap = new Map(((cfg as unknown as Array<{ clave: string; valor: unknown }>) ?? []).map((c) => [c.clave, Number(c.valor)]));

  const lecturas: Lectura[] = ((lecturasData as unknown as Array<Record<string, unknown>>) ?? []).map((l) => ({
    id: String(l.id), valor: Number(l.valor_celsius), fueraDeRango: Boolean(l.fuera_de_rango), tomadaEn: String(l.tomada_en),
  }));
  const apagones: Apagon[] = ((apagonesData as unknown as Array<Record<string, unknown>>) ?? []).map((a) => ({
    id: String(a.id), inicio: String(a.inicio), retorno: (a.retorno as string) ?? null,
    duracionHoras: a.duracion_horas != null ? Number(a.duracion_horas) : null,
    umbralExcedido: Boolean(a.umbral_excedido), lotesAfectados: Number(a.lotes_afectados ?? 0),
  }));
  const enRevision: LoteRevision[] = ((revisionData as unknown as Array<Record<string, unknown>>) ?? []).map((l) => ({
    id: String(l.id), motivo: (l.revision_motivo as string) ?? '', cantidad: Number(l.cantidad_actual ?? 0),
    producto: (l.producto as { nombre?: string } | null)?.nombre ?? '—',
  }));

  return (
    <CadenaFrioCliente
      lecturas={lecturas}
      apagones={apagones}
      enRevision={enRevision}
      puedeResolver={puedeResolver}
      tempMin={cfgMap.get('nevera_temp_min') ?? 2}
      tempMax={cfgMap.get('nevera_temp_max') ?? 8}
      umbralHoras={cfgMap.get('umbral_apagon_horas') ?? 2}
    />
  );
}
