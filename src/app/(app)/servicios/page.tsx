import { requireCapability } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { ServiciosCliente, type ServicioItem } from './ServiciosCliente';

export const dynamic = 'force-dynamic';

export default async function ServiciosPage() {
  await requireCapability('ver_operacion');
  const supabase = createClient();

  const { data } = await supabase
    .from('servicio')
    .select('id, tipo, valor, resultado, nota, created_at, cliente:cliente_id ( nombre )')
    .order('created_at', { ascending: false })
    .limit(30);

  const servicios: ServicioItem[] = ((data as unknown as Array<Record<string, unknown>>) ?? []).map((s) => ({
    id: String(s.id),
    tipo: String(s.tipo),
    cliente: (s.cliente as { nombre?: string } | null)?.nombre ?? null,
    valor: Number(s.valor),
    resultado: (s.resultado as Record<string, number>) ?? {},
    nota: (s.nota as string) ?? null,
    creadoEn: String(s.created_at),
  }));

  return <ServiciosCliente servicios={servicios} />;
}
