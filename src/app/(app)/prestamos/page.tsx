import { requireCapability } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { normaliza } from '@/lib/catalogos';
import { PrestamosCliente, type PrestamoItem, type ProductoMin } from './PrestamosCliente';

export const dynamic = 'force-dynamic';

export default async function PrestamosPage() {
  await requireCapability('gestionar_inventario');
  const supabase = createClient();

  const { data: prodData } = await supabase.from('producto').select('id, nombre').is('eliminado_en', null).order('nombre');
  const productos: ProductoMin[] = ((prodData as unknown as Array<{ id: string; nombre: string }>) ?? []).map((p) => ({ id: p.id, nombre: p.nombre, busqueda: normaliza(p.nombre) }));

  const { data } = await supabase
    .from('prestamo')
    .select('id, tipo, cantidad, contraparte, estado, fecha, fecha_devolucion, producto:producto_id ( nombre )')
    .order('fecha', { ascending: false })
    .limit(60);

  const hoy = new Date();
  const prestamos: PrestamoItem[] = ((data as unknown as Array<Record<string, unknown>>) ?? []).map((p) => {
    const fecha = String(p.fecha);
    const dias = Math.round((hoy.getTime() - new Date(fecha + 'T00:00:00').getTime()) / 86400000);
    return {
      id: String(p.id),
      tipo: String(p.tipo) as PrestamoItem['tipo'],
      producto: (p.producto as { nombre?: string } | null)?.nombre ?? '—',
      cantidad: Number(p.cantidad),
      contraparte: String(p.contraparte),
      estado: String(p.estado) as PrestamoItem['estado'],
      fecha,
      diasPendiente: p.estado === 'pendiente' ? dias : null,
    };
  });

  return <PrestamosCliente productos={productos} prestamos={prestamos} />;
}
