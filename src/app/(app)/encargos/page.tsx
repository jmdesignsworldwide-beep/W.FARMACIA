import { requireCapability } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { EncargosCliente, type EncargoItem } from './EncargosCliente';

export const dynamic = 'force-dynamic';

export default async function EncargosPage() {
  await requireCapability('ver_operacion');
  const supabase = createClient();

  const { data } = await supabase
    .from('encargo')
    .select('id, producto_texto, cliente_nombre, telefono, cantidad, estado, nota, created_at')
    .order('created_at', { ascending: false })
    .limit(80);

  const encargos: EncargoItem[] = ((data as unknown as Array<Record<string, unknown>>) ?? []).map((e) => ({
    id: String(e.id),
    producto: (e.producto_texto as string) ?? '—',
    cliente: (e.cliente_nombre as string) ?? '',
    telefono: (e.telefono as string) ?? '',
    cantidad: e.cantidad != null ? Number(e.cantidad) : null,
    estado: String(e.estado) as EncargoItem['estado'],
    nota: (e.nota as string) ?? '',
    fecha: String(e.created_at),
  }));

  return <EncargosCliente encargos={encargos} />;
}
