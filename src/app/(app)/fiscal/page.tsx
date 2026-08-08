import { requireCapability } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { FiscalCliente, type SecuenciaItem } from './FiscalCliente';

export const dynamic = 'force-dynamic';

const SUCURSAL = '00000000-0000-0000-0000-000000000001';

export default async function FiscalPage() {
  await requireCapability('configurar_sistema');
  const supabase = createClient();

  const { data } = await supabase
    .from('secuencia_fiscal')
    .select('id, tipo, rango_desde, rango_hasta, siguiente, digitos, vigencia_hasta, alerta_restantes, activa')
    .eq('sucursal_id', SUCURSAL)
    .order('tipo');

  const secuencias: SecuenciaItem[] = ((data as unknown as Array<Record<string, unknown>>) ?? []).map((s) => {
    const restantes = Number(s.rango_hasta) - Number(s.siguiente) + 1;
    return {
      id: String(s.id),
      tipo: String(s.tipo),
      rangoDesde: Number(s.rango_desde),
      rangoHasta: Number(s.rango_hasta),
      siguiente: Number(s.siguiente),
      digitos: Number(s.digitos),
      vigenciaHasta: (s.vigencia_hasta as string) ?? null,
      alertaRestantes: Number(s.alerta_restantes),
      activa: Boolean(s.activa),
      restantes: Math.max(0, restantes),
      porAgotarse: Boolean(s.activa) && restantes <= Number(s.alerta_restantes),
    };
  });

  return <FiscalCliente secuencias={secuencias} />;
}
