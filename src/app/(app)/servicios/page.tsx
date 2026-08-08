import { requireCapability } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { can } from '@/lib/roles';
import { ServiciosCliente, type ServicioItem, type InsumoItem, type ProductoOpt } from './ServiciosCliente';

export const dynamic = 'force-dynamic';

export default async function ServiciosPage() {
  const user = await requireCapability('ver_operacion');
  const puedeConfigurar = can(user.role, 'gestionar_inventario');
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

  // Mapeo de insumos por servicio (degrada con gracia si la migración 0042 no está aplicada).
  let insumos: InsumoItem[] = [];
  const { data: insData, error: eIns } = await supabase
    .from('servicio_insumo')
    .select('id, servicio_tipo, cantidad, producto:producto_id ( nombre )');
  if (!eIns) {
    insumos = ((insData as unknown as Array<{ id: string; servicio_tipo: string; cantidad: number; producto: { nombre?: string } | null }>) ?? []).map((i) => ({
      id: i.id, tipo: i.servicio_tipo, cantidad: Number(i.cantidad), producto: i.producto?.nombre ?? '—',
    }));
  }
  const insumosDisponibles = !eIns; // false = falta aplicar la migración 0042

  let productos: ProductoOpt[] = [];
  if (puedeConfigurar) {
    const { data: prodData } = await supabase.from('producto').select('id, nombre').is('eliminado_en', null).order('nombre').limit(2000);
    productos = ((prodData as unknown as Array<{ id: string; nombre: string }>) ?? []).map((p) => ({ id: p.id, nombre: p.nombre }));
  }

  return (
    <ServiciosCliente
      servicios={servicios}
      insumos={insumos}
      productos={productos}
      puedeConfigurar={puedeConfigurar}
      insumosDisponibles={insumosDisponibles}
    />
  );
}
