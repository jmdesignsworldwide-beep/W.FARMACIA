'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getSessionUser } from '@/lib/auth';
import { can } from '@/lib/roles';
import { normaliza } from '@/lib/catalogos';
import { parseArchivo } from '@/lib/importar/archivo';
import { procesar, type FilaProcesada } from '@/lib/importar/validar';
import { sugerirMapeo } from '@/lib/importar/mapeo';
import type { FormatoFecha } from '@/lib/importar/valores';

type Cliente = ReturnType<typeof createClient>;
type Celda = string | number | null;

/** Paso 1: parsea el archivo EN EL SERVIDOR y devuelve las filas crudas (fechas
 *  a ISO para viajar en JSON) + mapeo sugerido y el recordado de la última corrida. */
export async function parsearArchivo(formData: FormData) {
  const user = await getSessionUser();
  if (!user || !can(user.role, 'gestionar_inventario')) return { error: 'No tienes permiso para importar.' };
  const file = formData.get('archivo');
  if (!(file instanceof File)) return { error: 'No se recibió el archivo.' };
  if (file.size > 15 * 1024 * 1024) return { error: 'El archivo supera 15 MB.' };

  try {
    const buf = Buffer.from(await file.arrayBuffer());
    const { filas, detalle } = parseArchivo(file.name, buf);
    // Date → ISO (AAAA-MM-DD) para JSON; el cliente lo re-procesa en vivo.
    const filasJson: Celda[][] = filas.map((f) =>
      f.map((c) => (c instanceof Date ? c.toISOString().slice(0, 10) : (c as Celda))),
    );
    const res = procesar(filas);
    const supabase = createClient();
    const { data: ultima } = await supabase
      .from('importacion')
      .select('mapeo')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle<{ mapeo: Array<string | ''> | null }>();
    const mapeoRecordado = ultima?.mapeo ?? null;

    return {
      ok: true as const,
      nombre: file.name,
      detalle,
      filas: filasJson,
      indiceEncabezado: res.indiceEncabezado,
      headers: res.headers,
      mapeoSugerido: res.mapeo,
      mapeoRecordado,
    };
  } catch {
    return { error: 'No se pudo leer el archivo. ¿Es un .xlsx o .csv válido?' };
  }
}

/** Crea la corrida (estado pendiente). Guarda el mapeo para recordarlo. */
export async function crearImportacion(meta: {
  archivo_nombre: string;
  archivo_tipo: string;
  filas_total: number;
  mapeo: Array<string | ''>;
  opciones: { formatoFecha: FormatoFecha };
}) {
  const user = await getSessionUser();
  if (!user || !can(user.role, 'gestionar_inventario')) return { error: 'No tienes permiso para importar.' };
  const supabase = createClient();
  const { data, error } = await supabase
    .from('importacion')
    .insert({
      empleado_id: user.id,
      archivo_nombre: meta.archivo_nombre,
      archivo_tipo: meta.archivo_tipo,
      estado: 'procesando',
      filas_total: meta.filas_total,
      mapeo: meta.mapeo,
      opciones: meta.opciones,
    } as never)
    .select('id')
    .single<{ id: string }>();
  if (error || !data) return { error: 'No se pudo iniciar la importación.' };
  return { ok: true as const, id: data.id };
}

async function labOCrear(supabase: Cliente, texto: string | null): Promise<string | null> {
  const nombre = (texto ?? '').trim();
  if (!nombre) return null;
  const norm = normaliza(nombre);
  const { data } = await supabase.from('laboratorio').select('id, nombre_normalizado');
  const found = (data as { id: string; nombre_normalizado: string }[] | null)?.find((e) => e.nombre_normalizado === norm);
  if (found) return found.id;
  const { data: creado } = await supabase.from('laboratorio').insert({ nombre } as never).select('id').single<{ id: string }>();
  return creado?.id ?? null;
}

export interface ResultadoLote {
  ok: boolean;
  procesadas: number;
  insertadas: number;
  errores: number;
  fallidas: Array<{ fila: number; nombre: string; motivo: string }>;
}

/**
 * Paso 4: procesa un LOTE de filas de datos EN EL SERVIDOR (autoridad — nunca
 * confía en el cliente): re-valida, crea el producto si no existe (por nombre
 * normalizado) y le mete su lote, todo marcado con importacion_id. El cliente
 * envía lotes chiquitos y avanza la barra; si cierra la pestaña, lo insertado
 * queda (marcado) y es reversible.
 */
export async function procesarLote(
  importacionId: string,
  filas: Celda[][],
  mapeo: Array<string | ''>,
  formatoFecha: FormatoFecha,
): Promise<ResultadoLote | { error: string }> {
  const user = await getSessionUser();
  if (!user || !can(user.role, 'gestionar_inventario')) return { error: 'No tienes permiso para importar.' };
  const supabase = createClient();

  const res = procesar(filas as never, { mapeo, formatoFecha, indiceEncabezado: -1 });
  let insertadas = 0;
  let errores = 0;
  let productosCreados = 0;
  let lotesCreados = 0;
  const fallidas: ResultadoLote['fallidas'] = [];

  for (const f of res.filas as FilaProcesada[]) {
    if (f.estado === 'basura' || !f.producto) continue;
    try {
      const norm = normaliza(f.producto.nombre);
      const { data: existente } = await supabase
        .from('producto')
        .select('id')
        .eq('nombre_normalizado', norm)
        .is('eliminado_en', null)
        .limit(1)
        .maybeSingle<{ id: string }>();
      let productoId: string;
      if (existente) {
        productoId = existente.id;
      } else {
        const labId = await labOCrear(supabase, f.producto.laboratorio);
        const { data: creado, error } = await supabase
          .from('producto')
          .insert({
            nombre: f.producto.nombre,
            precio_venta: f.producto.precio,
            laboratorio_id: labId,
            codigo_barras: f.producto.codigo_barras,
            registro_sanitario: f.producto.registro_sanitario,
            importacion_id: importacionId,
          } as never)
          .select('id')
          .single<{ id: string }>();
        if (error || !creado) {
          errores++;
          fallidas.push({ fila: f.fila, nombre: f.producto.nombre, motivo: 'No se pudo crear el producto (¿código de barras duplicado?)' });
          continue;
        }
        productoId = creado.id;
        productosCreados++;
      }
      if (f.lote) {
        const { error: loteErr } = await supabase.from('lote').insert({
          producto_id: productoId,
          cantidad_actual: f.lote.cantidad ?? 0,
          fecha_vencimiento: f.lote.vencimiento,
          costo_unitario: f.lote.costo,
          numero_lote: f.lote.numero_lote,
          importacion_id: importacionId,
        } as never);
        if (loteErr) {
          fallidas.push({ fila: f.fila, nombre: f.producto.nombre, motivo: 'Producto creado, pero el lote falló' });
        } else {
          lotesCreados++;
        }
      }
      insertadas++;
    } catch {
      errores++;
      fallidas.push({ fila: f.fila, nombre: f.producto?.nombre ?? '—', motivo: 'Error inesperado en la fila' });
    }
  }

  // Actualiza los contadores de la corrida (progreso real, sobrevive al cierre).
  const { data: actual } = await supabase
    .from('importacion')
    .select('filas_procesadas, filas_ok, filas_error, productos_creados, lotes_creados')
    .eq('id', importacionId)
    .maybeSingle<{ filas_procesadas: number; filas_ok: number; filas_error: number; productos_creados: number; lotes_creados: number }>();
  if (actual) {
    await supabase
      .from('importacion')
      .update({
        filas_procesadas: actual.filas_procesadas + filas.length,
        filas_ok: actual.filas_ok + insertadas,
        filas_error: actual.filas_error + errores,
        productos_creados: actual.productos_creados + productosCreados,
        lotes_creados: actual.lotes_creados + lotesCreados,
      } as never)
      .eq('id', importacionId);
  }

  return { ok: true, procesadas: filas.length, insertadas, errores, fallidas };
}

/** Cierra la corrida como completada. */
export async function finalizarImportacion(importacionId: string) {
  const user = await getSessionUser();
  if (!user || !can(user.role, 'gestionar_inventario')) return { error: 'No autorizado.' };
  const supabase = createClient();
  await supabase.from('importacion').update({ estado: 'completada' } as never).eq('id', importacionId);
  revalidatePath('/productos');
  return { ok: true as const };
}

/**
 * Deshacer 24h CONTABLE-SEGURO: revierte solo lo intacto. Un producto que ya
 * tiene movimientos se CONSERVA y se reporta — nunca se rompe un libro inviolable.
 */
export async function deshacerImportacion(importacionId: string): Promise<
  { ok: true; revertidos: number; conservados: number } | { error: string }
> {
  const user = await getSessionUser();
  if (!user || !can(user.role, 'gestionar_inventario')) return { error: 'No autorizado.' };
  const supabase = createClient();

  const { data: imp } = await supabase
    .from('importacion')
    .select('id, created_at, estado')
    .eq('id', importacionId)
    .maybeSingle<{ id: string; created_at: string; estado: string }>();
  if (!imp) return { error: 'La importación no existe.' };
  if (imp.estado === 'deshecha') return { error: 'Esa importación ya se deshizo.' };
  const horas = (Date.now() - Date.parse(imp.created_at)) / 3_600_000;
  if (horas > 24) return { error: 'Ya pasaron las 24 horas para deshacer esta importación.' };

  const { data: prods } = await supabase
    .from('producto')
    .select('id')
    .eq('importacion_id', importacionId)
    .is('eliminado_en', null);
  let revertidos = 0;
  let conservados = 0;
  for (const p of (prods as { id: string }[] | null) ?? []) {
    const { count } = await supabase
      .from('movimiento_inventario')
      .select('id', { count: 'exact', head: true })
      .eq('producto_id', p.id);
    if ((count ?? 0) > 0) {
      conservados++; // ya tiene historia: se conserva, no se toca el libro
      continue;
    }
    await supabase.from('lote').delete().eq('producto_id', p.id).eq('importacion_id', importacionId);
    await supabase.from('producto').update({ eliminado_en: new Date().toISOString(), activo: false } as never).eq('id', p.id);
    revertidos++;
  }
  await supabase
    .from('importacion')
    .update({ estado: 'deshecha', deshecha_en: new Date().toISOString(), deshecha_por: user.id } as never)
    .eq('id', importacionId);
  revalidatePath('/productos');
  return { ok: true, revertidos, conservados };
}
