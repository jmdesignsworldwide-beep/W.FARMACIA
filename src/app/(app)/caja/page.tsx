import { requireCapability, getSessionUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { can } from '@/lib/roles';
import { normaliza } from '@/lib/catalogos';
import { formatConcentracion } from '@/lib/producto';
import { CajaCliente, type CatalogoItem } from './CajaCliente';

export const dynamic = 'force-dynamic';

interface Row {
  id: string;
  nombre: string;
  precio_venta: number | null;
  exento_itbis: boolean | null;
  es_controlado: boolean | null;
  requiere_receta: boolean | null;
  codigo_barras: string | null;
  ubicacion_fisica_default: string | null;
  unidad_base: string | null;
  forma: { permite_fraccionamiento: boolean | null } | null;
  laboratorio: { nombre: string } | null;
  producto_principio_activo: Array<{
    concentracion_valor: number | null;
    concentracion_unidad: string | null;
    concentracion_volumen_valor: number | null;
    concentracion_volumen_unidad: string | null;
    principio_activo: { nombre: string; es_controlado: boolean | null; requiere_receta: boolean | null } | null;
  }>;
  lote: Array<{ cantidad_actual: number | null; estado: string; ubicacion_fisica: string | null; fecha_vencimiento: string | null }>;
}

export default async function CajaPage() {
  await requireCapability('ver_operacion');
  const user = await getSessionUser();
  const puedeDespacharControlados = user ? can(user.role, 'despachar_controlados') : false;
  const puedeAnular = user ? can(user.role, 'anular_ventas') : false;
  const supabase = createClient();

  // El catálogo se precarga UNA vez al abrir la caja: buscar nunca toca la red.
  const { data } = await supabase
    .from('producto')
    .select(
      `id, nombre, precio_venta, exento_itbis, es_controlado, requiere_receta, codigo_barras,
       ubicacion_fisica_default, unidad_base,
       forma:forma_farmaceutica_id ( permite_fraccionamiento ),
       laboratorio:laboratorio_id ( nombre ),
       producto_principio_activo (
         concentracion_valor, concentracion_unidad, concentracion_volumen_valor, concentracion_volumen_unidad,
         principio_activo:principio_activo_id ( nombre, es_controlado, requiere_receta )
       ),
       lote ( cantidad_actual, estado, ubicacion_fisica, fecha_vencimiento )`,
    )
    .is('eliminado_en', null)
    .order('nombre');

  const rows = (data as unknown as Row[]) ?? [];
  const catalogo: CatalogoItem[] = rows.map((p) => {
    const pas = p.producto_principio_activo ?? [];
    const molControlado = pas.some((x) => x.principio_activo?.es_controlado);
    const molReceta = pas.some((x) => x.principio_activo?.requiere_receta);
    const activos = (p.lote ?? []).filter((l) => l.estado === 'activo' && Number(l.cantidad_actual ?? 0) > 0);
    const existencia = activos.reduce((s, l) => s + Number(l.cantidad_actual ?? 0), 0);
    // Ubicación: la del producto por defecto, o la del lote que vence primero.
    const fefo = [...activos].sort((a, b) => (a.fecha_vencimiento ?? '9999').localeCompare(b.fecha_vencimiento ?? '9999'));
    const ubicacion = p.ubicacion_fisica_default ?? fefo[0]?.ubicacion_fisica ?? null;

    // Firma de molécula para equivalencias. `firmaMolecula` = solo los principios
    // (ordenados) → agrupa candidatos. `firmaCompleta` añade la concentración →
    // separa el equivalente REAL del que solo "casi coincide".
    const nombres = pas.map((x) => x.principio_activo?.nombre).filter((n): n is string => Boolean(n));
    const conConc = pas
      .filter((x) => x.principio_activo?.nombre)
      .map((x) => {
        const conc =
          x.concentracion_valor != null && x.concentracion_unidad
            ? formatConcentracion(x.concentracion_valor, x.concentracion_unidad, x.concentracion_volumen_valor, x.concentracion_volumen_unidad)
            : '';
        return `${x.principio_activo!.nombre} ${conc}`.trim();
      });
    const firmaMolecula = nombres.length ? normaliza([...nombres].sort().join('+')) : '';
    const firmaCompleta = conConc.length ? normaliza([...conConc].sort().join('+')) : '';
    const principios = conConc.join('  +  ');

    return {
      id: p.id,
      nombre: p.nombre,
      precio: Number(p.precio_venta ?? 0),
      exentoItbis: Boolean(p.exento_itbis),
      controlado: p.es_controlado ?? molControlado,
      receta: p.requiere_receta ?? molReceta,
      existencia,
      ubicacion,
      fraccionable: Boolean(p.forma?.permite_fraccionamiento),
      unidadBase: p.unidad_base ?? 'unidad',
      firmaMolecula,
      firmaCompleta,
      principios,
      busqueda: normaliza(
        [p.nombre, pas.map((x) => x.principio_activo?.nombre).filter(Boolean).join(' '), p.laboratorio?.nombre, p.codigo_barras]
          .filter(Boolean)
          .join(' '),
      ),
    };
  });

  const { data: esperaData } = await supabase
    .from('venta_en_espera')
    .select('id, etiqueta, carrito, created_at')
    .eq('sucursal_id', '00000000-0000-0000-0000-000000000001')
    .order('created_at', { ascending: false })
    .limit(20);
  const enEspera = ((esperaData as unknown as Array<{ id: string; etiqueta: string | null; carrito: unknown; created_at: string }>) ?? [])
    .map((r) => ({ id: r.id, etiqueta: r.etiqueta, lineas: Array.isArray(r.carrito) ? r.carrito : [], creadoEn: r.created_at }))
    .filter((r) => r.lineas.length > 0);

  // §4.1 — impresión automática del recibo al cobrar (configurable en Ajustes).
  const { data: cfgRecibo } = await supabase
    .from('configuracion').select('valor').eq('clave', 'recibo_auto_imprimir').eq('sucursal_id', '00000000-0000-0000-0000-000000000001').maybeSingle<{ valor: unknown }>();
  const reciboAutoImprimir = cfgRecibo?.valor === true || cfgRecibo?.valor === 'true';

  return (
    <CajaCliente
      catalogo={catalogo}
      puedeDespacharControlados={puedeDespacharControlados}
      puedeAnular={puedeAnular}
      enEspera={enEspera}
      reciboAutoImprimir={reciboAutoImprimir}
    />
  );
}
