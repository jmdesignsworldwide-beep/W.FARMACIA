import { createClient } from '@/lib/supabase/server';
import { getSessionUser } from '@/lib/auth';
import { can, type Capability } from '@/lib/roles';

export const dynamic = 'force-dynamic';

/** Convierte filas (objetos) a CSV con BOM para que Excel respete los acentos. */
function toCsv(headers: string[], rows: Array<Array<string | number | null>>): string {
  const esc = (v: string | number | null) => {
    const s = v == null ? '' : String(v);
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.map(esc).join(','), ...rows.map((r) => r.map(esc).join(','))];
  return '﻿' + lines.join('\r\n');
}

interface Recurso {
  cap: Capability;
  archivo: string;
  build: (supabase: ReturnType<typeof createClient>) => Promise<{ headers: string[]; rows: Array<Array<string | number | null>> }>;
}

const RECURSOS: Record<string, Recurso> = {
  inventario: {
    cap: 'gestionar_inventario',
    archivo: 'inventario',
    async build(supabase) {
      const { data } = await supabase
        .from('lote')
        .select('cantidad_actual, costo_unitario, fecha_vencimiento, numero_lote, producto:producto_id ( nombre, precio_venta )')
        .eq('estado', 'activo')
        .gt('cantidad_actual', 0)
        .limit(5000);
      const rows = ((data as unknown as Array<{ cantidad_actual: number; costo_unitario: number | null; fecha_vencimiento: string | null; numero_lote: string | null; producto: { nombre?: string; precio_venta?: number } | null }>) ?? [])
        .map((l) => [
          l.producto?.nombre ?? '—',
          l.numero_lote ?? '',
          Number(l.cantidad_actual),
          Number(l.costo_unitario ?? 0),
          Number(l.producto?.precio_venta ?? 0),
          l.fecha_vencimiento ?? '',
          Number(l.cantidad_actual) * Number(l.costo_unitario ?? 0),
        ]);
      return { headers: ['Producto', 'Lote', 'Existencia', 'Costo unitario', 'Precio venta', 'Vence', 'Valor al costo'], rows };
    },
  },
  ventas: {
    cap: 'ver_finanzas',
    archivo: 'ventas',
    async build(supabase) {
      const { data } = await supabase
        .from('venta')
        .select('fecha, subtotal, itbis, total, estado')
        .order('fecha', { ascending: false })
        .limit(5000);
      const rows = ((data as unknown as Array<{ fecha: string; subtotal: number; itbis: number; total: number; estado: string }>) ?? [])
        .map((v) => [v.fecha, Number(v.subtotal), Number(v.itbis), Number(v.total), v.estado]);
      return { headers: ['Fecha', 'Subtotal', 'ITBIS', 'Total', 'Estado'], rows };
    },
  },
  clientes: {
    cap: 'ver_operacion',
    archivo: 'clientes',
    async build(supabase) {
      const { data } = await supabase
        .from('cliente')
        .select('nombre, telefono, cedula, direccion')
        .is('eliminado_en', null)
        .order('nombre')
        .limit(5000);
      const rows = ((data as unknown as Array<{ nombre: string; telefono: string | null; cedula: string | null; direccion: string | null }>) ?? [])
        .map((c) => [c.nombre, c.telefono ?? '', c.cedula ?? '', c.direccion ?? '']);
      return { headers: ['Nombre', 'Teléfono', 'Cédula', 'Dirección'], rows };
    },
  },
  fiado: {
    cap: 'ver_operacion',
    archivo: 'fiado-por-cobrar',
    async build(supabase) {
      const { data: cobros } = await supabase.from('cobro').select('pagador_id, monto').eq('metodo', 'credito_interno').not('pagador_id', 'is', null);
      const fiado = new Map<string, number>();
      for (const c of (cobros as unknown as Array<{ pagador_id: string; monto: number }>) ?? []) fiado.set(c.pagador_id, (fiado.get(c.pagador_id) ?? 0) + Number(c.monto));
      const { data: abonos } = await supabase.from('abono').select('pagador_id, monto');
      const abonado = new Map<string, number>();
      for (const a of (abonos as unknown as Array<{ pagador_id: string; monto: number }>) ?? []) abonado.set(a.pagador_id, (abonado.get(a.pagador_id) ?? 0) + Number(a.monto));
      const ids = [...fiado.keys()];
      const nombres = new Map<string, { nombre: string; telefono: string | null }>();
      if (ids.length > 0) {
        const { data: pags } = await supabase.from('pagador').select('id, nombre, telefono').in('id', ids);
        for (const p of (pags as unknown as Array<{ id: string; nombre: string; telefono: string | null }>) ?? []) nombres.set(p.id, { nombre: p.nombre, telefono: p.telefono });
      }
      const rows = ids
        .map((id) => ({ nombre: nombres.get(id)?.nombre ?? '—', tel: nombres.get(id)?.telefono ?? '', saldo: Math.round(((fiado.get(id) ?? 0) - (abonado.get(id) ?? 0)) * 100) / 100 }))
        .filter((r) => r.saldo > 0.009)
        .sort((a, b) => b.saldo - a.saldo)
        .map((r) => [r.nombre, r.tel, r.saldo]);
      return { headers: ['Cliente', 'Teléfono', 'Saldo por cobrar'], rows };
    },
  },
  'por-pagar': {
    cap: 'ver_finanzas',
    archivo: 'cuentas-por-pagar',
    async build(supabase) {
      const { data } = await supabase
        .from('cuenta_por_pagar')
        .select('monto, fecha_emision, fecha_vencimiento, estado, proveedor:proveedor_id ( nombre )')
        .eq('estado', 'pendiente')
        .limit(5000);
      const rows = ((data as unknown as Array<{ monto: number; fecha_emision: string; fecha_vencimiento: string | null; estado: string; proveedor: { nombre?: string } | null }>) ?? [])
        .map((c) => [c.proveedor?.nombre ?? 'Sin proveedor', Number(c.monto), c.fecha_emision, c.fecha_vencimiento ?? '', c.estado]);
      return { headers: ['Proveedor', 'Monto', 'Emisión', 'Vencimiento', 'Estado'], rows };
    },
  },
  movimientos: {
    cap: 'gestionar_inventario',
    archivo: 'movimientos-inventario',
    async build(supabase) {
      const { data } = await supabase
        .from('movimiento_inventario')
        .select('ocurrido_en, tipo, cantidad, cantidad_resultante, motivo, referencia, producto:producto_id ( nombre )')
        .order('ocurrido_en', { ascending: false })
        .limit(5000);
      const rows = ((data as unknown as Array<{ ocurrido_en: string; tipo: string; cantidad: number; cantidad_resultante: number | null; motivo: string | null; referencia: string | null; producto: { nombre?: string } | null }>) ?? [])
        .map((m) => [m.ocurrido_en, m.producto?.nombre ?? '—', m.tipo, Number(m.cantidad), m.cantidad_resultante ?? '', m.motivo ?? '', m.referencia ?? '']);
      return { headers: ['Fecha', 'Producto', 'Tipo', 'Cantidad', 'Resultante', 'Motivo', 'Referencia'], rows };
    },
  },
  comprobantes: {
    cap: 'ver_finanzas',
    archivo: 'comprobantes-fiscales',
    async build(supabase) {
      const { data } = await supabase
        .from('comprobante')
        .select('emitido_en, tipo, ncf, ncf_modificado, rnc_receptor, subtotal, itbis, total, estado')
        .order('emitido_en', { ascending: false })
        .limit(5000);
      const rows = ((data as unknown as Array<{ emitido_en: string; tipo: string; ncf: string; ncf_modificado: string | null; rnc_receptor: string | null; subtotal: number; itbis: number; total: number; estado: string }>) ?? [])
        .map((c) => [c.emitido_en, c.tipo, c.ncf, c.ncf_modificado ?? '', c.rnc_receptor ?? '', Number(c.subtotal), Number(c.itbis), Number(c.total), c.estado]);
      return { headers: ['Fecha', 'Tipo', 'NCF', 'NCF modificado', 'RNC receptor', 'Subtotal', 'ITBIS', 'Total', 'Estado'], rows };
    },
  },
  'libro-controlado': {
    cap: 'despachar_controlados',
    archivo: 'libro-controlados',
    async build(supabase) {
      const { data } = await supabase
        .from('libro_controlado')
        .select('despachado_en, cantidad, paciente_nombre, producto:producto_id ( nombre ), farmaceutico:farmaceutico_id ( nombre )')
        .order('despachado_en', { ascending: false })
        .limit(5000);
      const rows = ((data as unknown as Array<{ despachado_en: string; cantidad: number; paciente_nombre: string; producto: { nombre?: string } | null; farmaceutico: { nombre?: string } | null }>) ?? [])
        .map((l) => [l.despachado_en, l.producto?.nombre ?? '—', Number(l.cantidad), l.paciente_nombre, l.farmaceutico?.nombre ?? '—']);
      return { headers: ['Fecha', 'Producto', 'Cantidad', 'Paciente', 'Farmacéutico'], rows };
    },
  },
};

export async function GET(_req: Request, { params }: { params: Promise<{ recurso: string }> }) {
  const { recurso } = await params;
  const def = RECURSOS[recurso];
  if (!def) return new Response('Recurso no válido', { status: 404 });

  const user = await getSessionUser();
  if (!user) return new Response('No autorizado', { status: 401 });
  if (!can(user.role, def.cap)) return new Response('Sin permiso para esta exportación', { status: 403 });

  const supabase = createClient();
  const { headers, rows } = await def.build(supabase);
  const csv = toCsv(headers, rows);
  const fecha = new Date().toISOString().slice(0, 10);

  return new Response(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${def.archivo}-${fecha}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
