import type { createClient } from '@/lib/supabase/server';

/**
 * Estado regulatorio de un producto frente al Listado de Medicamentos de Venta
 * Libre (MVL, Resolución 000009-17). Base de `requiere_receta` (Adenda IV §5).
 *
 * La FUENTE DE VERDAD es la función SQL `app.estado_venta_libre()` (migración
 * 0018), con su asimetría de seguridad: venta libre SOLO con coincidencia exacta
 * de composición (firma por IDs), entrada no ambigua, enlazada y dentro del tope;
 * todo lo demás cae en "no consta → exige receta". El único error inaceptable es
 * el falso positivo.
 */
export type EstadoMvl = 'venta_libre' | 'no_consta' | 'excede_tope';
export type RazonMvl =
  | 'coincide'
  | 'excede_tope'
  | 'sin_coincidencia'
  | 'entrada_ambigua'
  | 'catalogo_incompleto'
  | 'tope_no_consta'
  | 'producto_sin_principios';

export interface ResultadoMvl {
  estado: EstadoMvl;
  razon: RazonMvl;
}

/**
 * Lee el estado MVL del producto.
 *
 * El esquema `app` no está expuesto a PostgREST, así que hoy no se puede llamar
 * `app.estado_venta_libre()` por `rpc`. Mientras el match esté APAGADO (Camino A:
 * ninguna entrada del listado enlazada al catálogo de principios), el resultado es
 * uniforme y honesto: `no_consta / catalogo_incompleto`. Se lee ese hecho real de
 * la tabla expuesta `medicamento_venta_libre`, SIN duplicar la lógica de firma
 * (que vive solo en la función SQL). Cuando llegue el catálogo y se encienda el
 * match, se expone la función y esto pasa a `supabase.rpc('estado_venta_libre', …)`.
 */
export async function estadoVentaLibre(
  supabase: ReturnType<typeof createClient>,
): Promise<ResultadoMvl> {
  const { count } = await supabase
    .from('medicamento_venta_libre')
    .select('id', { count: 'exact', head: true })
    .not('firma_composicion', 'is', null);
  // Match apagado (nada enlazado) → lado seguro, igual que la función SQL.
  if (!count) return { estado: 'no_consta', razon: 'catalogo_incompleto' };
  // Match encendido: la determinación exacta la hace la función SQL; hasta
  // exponerla por rpc, se mantiene el lado seguro para no arriesgar falsos positivos.
  return { estado: 'no_consta', razon: 'catalogo_incompleto' };
}

/** Procedencia visible en pantalla (mismo espíritu que el candado del override). */
export function procedenciaMvl(r: ResultadoMvl): {
  texto: string;
  detalle: string;
  tono: 'ok' | 'aviso';
} {
  if (r.estado === 'venta_libre') {
    return {
      texto: 'Venta libre (Res. 000009-17)',
      detalle: 'Consta en el listado oficial de medicamentos de venta libre.',
      tono: 'ok',
    };
  }
  if (r.estado === 'excede_tope') {
    return {
      texto: 'Requiere receta — excede el tope de venta libre',
      detalle: 'La concentración supera el máximo permitido por el listado.',
      tono: 'aviso',
    };
  }
  // no_consta — el detalle explica el porqué (rastro de la función)
  const detalle =
    r.razon === 'catalogo_incompleto'
      ? 'El listado de venta libre aún no está enlazado al catálogo de principios: por precaución, verificar.'
      : r.razon === 'entrada_ambigua'
        ? 'Hay una entrada del listado ambigua sin resolver: verificar a mano.'
        : r.razon === 'tope_no_consta'
          ? 'No consta el tope de concentración en el listado: verificar.'
          : r.razon === 'producto_sin_principios'
            ? 'El producto no tiene principios activos definidos: verificar.'
            : 'No consta en el listado de venta libre: verificar.';
  return { texto: 'Requiere receta — no consta en el listado MVL', detalle, tono: 'aviso' };
}
