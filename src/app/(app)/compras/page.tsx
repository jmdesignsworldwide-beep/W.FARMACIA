import { requireCapability } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { ShoppingCart } from 'lucide-react';
import { ComprasCliente, type ProductoBajo, type ProveedorOpt, type OrdenItem } from './ComprasCliente';

export const dynamic = 'force-dynamic';

/** Sugerencia inicial del mínimo SIN datos (§3.1): más barato → más unidades. */
function minimoSugerido(precio: number): number {
  if (precio <= 0) return 10;
  if (precio < 50) return 24;
  if (precio < 200) return 12;
  if (precio < 800) return 6;
  return 3;
}

export default async function ComprasPage() {
  await requireCapability('gestionar_inventario');
  const supabase = createClient();

  // Productos activos con su precio y su mínimo.
  const { data: productos } = await supabase
    .from('producto')
    .select('id, nombre, precio_venta, punto_reorden_manual')
    .is('eliminado_en', null)
    .limit(5000);
  const prodRows = (productos as unknown as Array<{ id: string; nombre: string; precio_venta: number | null; punto_reorden_manual: number | null }>) ?? [];

  // Existencia por producto + proveedor más reciente (de lote.proveedor_id).
  const { data: lotes } = await supabase
    .from('lote')
    .select('producto_id, cantidad_actual, costo_unitario, proveedor_id, fecha_recepcion')
    .eq('estado', 'activo')
    .gt('cantidad_actual', 0);
  const existencia = new Map<string, number>();
  const provDe = new Map<string, { proveedorId: string | null; fecha: string; costo: number | null }>();
  for (const l of (lotes as unknown as Array<{ producto_id: string; cantidad_actual: number; costo_unitario: number | null; proveedor_id: string | null; fecha_recepcion: string | null }>) ?? []) {
    existencia.set(l.producto_id, (existencia.get(l.producto_id) ?? 0) + Number(l.cantidad_actual));
    const prev = provDe.get(l.producto_id);
    const fecha = l.fecha_recepcion ?? '';
    if (!prev || fecha > prev.fecha) provDe.set(l.producto_id, { proveedorId: l.proveedor_id, fecha, costo: l.costo_unitario });
  }

  // Proveedores (para nombre y para el select).
  const { data: provs } = await supabase.from('proveedor').select('id, nombre, telefono').eq('activo', true).order('nombre');
  const proveedores: ProveedorOpt[] = ((provs as unknown as Array<{ id: string; nombre: string; telefono: string | null }>) ?? []).map((p) => ({ id: p.id, nombre: p.nombre, telefono: p.telefono }));
  const nombreProv = new Map(proveedores.map((p) => [p.id, p.nombre]));

  // Bajo de stock: mínimo fijado y existencia por debajo.
  const bajos: ProductoBajo[] = prodRows
    .filter((p) => p.punto_reorden_manual != null && Number(p.punto_reorden_manual) > 0)
    .map((p) => {
      const ex = existencia.get(p.id) ?? 0;
      const info = provDe.get(p.id);
      return {
        id: p.id,
        nombre: p.nombre,
        existencia: ex,
        minimo: Number(p.punto_reorden_manual),
        sugeridoPedir: Math.max(1, Math.ceil(Number(p.punto_reorden_manual) * 2 - ex)),
        proveedorId: info?.proveedorId ?? null,
        proveedorNombre: info?.proveedorId ? (nombreProv.get(info.proveedorId) ?? null) : null,
        precioEsperado: info?.costo ?? null,
      };
    })
    .filter((p) => p.existencia < p.minimo)
    .sort((a, b) => a.existencia / a.minimo - b.existencia / b.minimo);

  // Productos SIN mínimo, para configurarlos (con sugerencia).
  const sinMinimo = prodRows
    .filter((p) => p.punto_reorden_manual == null)
    .slice(0, 300)
    .map((p) => ({ id: p.id, nombre: p.nombre, sugerido: minimoSugerido(Number(p.precio_venta ?? 0)), existencia: existencia.get(p.id) ?? 0 }));

  // Órdenes existentes.
  const { data: ordenes } = await supabase
    .from('orden_compra')
    .select('id, estado, fecha_envio, created_at, proveedor:proveedor_id ( nombre ), orden_compra_linea ( cantidad_pedida )')
    .order('created_at', { ascending: false })
    .limit(30);
  const ordenItems: OrdenItem[] = ((ordenes as unknown as Array<{ id: string; estado: string; fecha_envio: string | null; created_at: string; proveedor: { nombre: string } | null; orden_compra_linea: Array<{ cantidad_pedida: number }> }>) ?? []).map((o) => ({
    id: o.id,
    estado: o.estado,
    proveedor: o.proveedor?.nombre ?? 'Sin proveedor',
    renglones: (o.orden_compra_linea ?? []).length,
    fechaEnvio: o.fecha_envio,
    createdAt: o.created_at,
  }));

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4">
      <div>
        <div className="flex items-center gap-2 font-display text-xl font-semibold text-ink">
          <ShoppingCart className="h-6 w-6 text-accent" /> Compras y reabastecimiento
        </div>
        <p className="mt-1 text-sm text-ink-soft">
          Cuando algo baja de su mínimo, aquí sale — agrupado por proveedor, listo para pedirlo por WhatsApp.
        </p>
      </div>
      <ComprasCliente bajos={bajos} sinMinimo={sinMinimo} proveedores={proveedores} ordenes={ordenItems} />
    </div>
  );
}
