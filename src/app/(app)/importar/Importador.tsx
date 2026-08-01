'use client';

import { useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle, ArrowLeft, CheckCircle2, Download, FileSpreadsheet, Loader2,
  RotateCcw, Upload, X,
} from 'lucide-react';
import { LuminousCard } from '@/components/brand/LuminousCard';
import { CAMPOS } from '@/lib/importar/mapeo';
import { agruparPrincipios, procesar } from '@/lib/importar/validar';
import type { FormatoFecha } from '@/lib/importar/valores';
import { formatNumber } from '@/lib/format';
import {
  crearImportacion, deshacerImportacion, finalizarImportacion, parsearArchivo, procesarLote,
} from './actions';

type Celda = string | number | null;
type Paso = 'subir' | 'mapeo' | 'importando' | 'listo';
const LOTE = 100; // filas por tanda al servidor

const control = 'h-9 rounded-control border border-line bg-canvas px-2 text-sm text-ink outline-none focus:luminous';
// Clases literales (no dinámicas) para que Tailwind no las purgue.
const BADGE: Record<string, string> = { ok: 'text-success', aviso: 'text-warning', error: 'text-danger', basura: 'text-ink-faint' };
const ETIQUETA: Record<string, string> = { ok: 'lista', aviso: 'aviso', error: 'no entra', basura: 'basura' };

export function Importador() {
  const [paso, setPaso] = useState<Paso>('subir');
  const [error, setError] = useState<string | null>(null);
  const [ofrecerCsv, setOfrecerCsv] = useState(false);
  const [cargando, setCargando] = useState(false);

  const [nombre, setNombre] = useState('');
  const [detalle, setDetalle] = useState('');
  const [filas, setFilas] = useState<Celda[][]>([]);
  const [indiceEnc, setIndiceEnc] = useState(-1);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapeo, setMapeo] = useState<Array<string | ''>>([]);
  const [formato, setFormato] = useState<FormatoFecha>('dmy');

  const [progreso, setProgreso] = useState({ procesadas: 0, total: 0, insertadas: 0, errores: 0 });
  const [fallidas, setFallidas] = useState<Array<{ fila: number; nombre: string; motivo: string }>>([]);
  const [excluidos, setExcluidos] = useState<Set<string>>(new Set()); // grupos de principio NO enlazados
  const inputRef = useRef<HTMLInputElement>(null);

  // Re-procesa en vivo con el mapeo/formato actual (librería pura, sin red).
  const preview = useMemo(() => {
    if (paso === 'subir' || filas.length === 0) return null;
    return procesar(filas as never, { mapeo, formatoFecha: formato, indiceEncabezado: indiceEnc });
  }, [filas, mapeo, formato, indiceEnc, paso]);
  const grupos = useMemo(() => (preview ? agruparPrincipios(preview.filas) : []), [preview]);

  async function subir(file: File) {
    setError(null);
    setOfrecerCsv(false);
    setCargando(true);
    const fd = new FormData();
    fd.append('archivo', file);
    const res = await parsearArchivo(fd);
    setCargando(false);
    if ('error' in res) { setError(res.error!); setOfrecerCsv(Boolean((res as { sugerirCsv?: boolean }).sugerirCsv)); return; }
    setNombre(res.nombre);
    setDetalle(res.detalle);
    setFilas(res.filas);
    setIndiceEnc(res.indiceEncabezado);
    setHeaders(res.headers);
    setMapeo(res.mapeoRecordado && res.mapeoRecordado.length === res.headers.length ? res.mapeoRecordado : res.mapeoSugerido);
    setExcluidos(new Set());
    setPaso('mapeo');
  }

  async function importar() {
    if (!preview) return;
    setError(null);
    setPaso('importando');
    const datos = filas.slice(indiceEnc >= 0 ? indiceEnc + 1 : 0);
    const total = datos.length;
    setProgreso({ procesadas: 0, total, insertadas: 0, errores: 0 });
    setFallidas([]);

    const meta = await crearImportacion({
      archivo_nombre: nombre,
      archivo_tipo: nombre.toLowerCase().endsWith('.csv') ? 'csv' : 'xlsx',
      filas_total: total,
      mapeo,
      opciones: { formatoFecha: formato },
    });
    if ('error' in meta) { setError(meta.error!); setPaso('mapeo'); return; }

    const confirmados = grupos.map((g) => g.principio.toLowerCase()).filter((k) => !excluidos.has(k));
    let ins = 0; let err = 0; const fall: typeof fallidas = [];
    for (let i = 0; i < datos.length; i += LOTE) {
      const slice = datos.slice(i, i + LOTE);
      const r = await procesarLote(meta.id, slice, mapeo, formato, confirmados);
      if (!('error' in r)) {
        ins += r.insertadas; err += r.errores; fall.push(...r.fallidas);
      }
      setProgreso({ procesadas: Math.min(i + LOTE, total), total, insertadas: ins, errores: err });
    }
    setFallidas(fall);
    await finalizarImportacion(meta.id);
    (window as unknown as { __impId?: string }).__impId = meta.id;
    setPaso('listo');
  }

  async function deshacer() {
    const id = (window as unknown as { __impId?: string }).__impId;
    if (!id) return;
    setCargando(true);
    const r = await deshacerImportacion(id);
    setCargando(false);
    if ('error' in r) { setError(r.error!); return; }
    setError(null);
    alert(`Deshecho: ${r.revertidos} revertidos · ${r.conservados} conservados (ya tenían movimientos).`);
    reiniciar();
  }

  function descargarReporte() {
    if (!preview) return;
    const lineas = [['fila', 'estado', 'producto', 'avisos'].join(',')];
    for (const f of preview.filas) {
      const nom = f.producto?.nombre ?? '';
      lineas.push([f.fila, f.estado, `"${nom.replace(/"/g, '""')}"`, `"${f.mensajes.join('; ')}"`].join(','));
    }
    for (const f of fallidas) lineas.push([f.fila, 'fallo', `"${f.nombre}"`, `"${f.motivo}"`].join(','));
    const blob = new Blob(['﻿' + lineas.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `reporte-importacion-${nombre}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  function reiniciar() {
    setPaso('subir'); setFilas([]); setHeaders([]); setMapeo([]); setFallidas([]);
    setProgreso({ procesadas: 0, total: 0, insertadas: 0, errores: 0 }); setError(null);
  }

  const resumen = preview?.resumen;
  const importables = resumen ? resumen.ok + resumen.aviso : 0;

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
      <Link href="/productos" className="inline-flex items-center gap-1.5 text-sm text-ink-soft hover:text-ink">
        <ArrowLeft size={16} /> Productos
      </Link>
      <h1 className="mt-2 font-display text-2xl font-bold text-ink">Importar inventario</h1>
      <p className="mt-1 text-sm text-ink-soft">Excel o CSV, tal como lo tengas. El sistema limpia la basura, entiende tus números y fechas, y carga productos y lotes de una vez.</p>

      {/* pasos */}
      <div className="mt-4 flex items-center gap-2 text-xs">
        {(['subir', 'mapeo', 'importando', 'listo'] as Paso[]).map((p, i) => (
          <div key={p} className={`flex items-center gap-2 ${paso === p ? 'text-accent' : 'text-ink-faint'}`}>
            <span className={`flex h-6 w-6 items-center justify-center rounded-full border tabular-nums ${paso === p ? 'border-accent bg-accent/10' : 'border-line'}`}>{i + 1}</span>
            <span className="hidden capitalize sm:inline">{p === 'subir' ? 'Subir' : p === 'mapeo' ? 'Mapeo y vista previa' : p === 'importando' ? 'Importar' : 'Reporte'}</span>
            {i < 3 ? <span className="mx-1 h-px w-6 bg-line" /> : null}
          </div>
        ))}
      </div>

      {error ? (
        <div className="mt-4 rounded-control border border-danger/30 bg-danger/10 px-3 py-2">
          <p role="alert" className="flex items-start gap-2 text-sm text-danger">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" /> {error}
          </p>
          {ofrecerCsv ? (
            <p className="ml-6 mt-1.5 text-xs text-ink-soft">
              Abre el archivo en tu programa → <span className="font-medium">Archivo → Guardar como → CSV</span>, y sube ese. No cargamos un Excel a medias.
            </p>
          ) : null}
        </div>
      ) : null}

      {/* PASO 1 */}
      {paso === 'subir' ? (
        <LuminousCard neutral className="mt-4">
          <label
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) subir(f); }}
            className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-control border-2 border-dashed border-line px-6 py-12 text-center transition-colors hover:border-accent/50"
          >
            {cargando ? <Loader2 size={30} className="animate-spin text-accent" /> : <Upload size={30} className="text-ink-faint" />}
            <span className="text-sm text-ink">{cargando ? 'Leyendo el archivo…' : 'Arrastra tu archivo aquí, o haz clic para elegirlo'}</span>
            <span className="text-xs text-ink-faint">.xlsx o .csv — con separador de coma, punto y coma o tabulador</span>
            <input ref={inputRef} type="file" accept=".xlsx,.csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) subir(f); }} />
          </label>
        </LuminousCard>
      ) : null}

      {/* PASO 2: mapeo + preview */}
      {paso === 'mapeo' && preview ? (
        <>
          <LuminousCard neutral className="mt-4">
            <div className="flex items-center gap-2 text-sm text-ink"><FileSpreadsheet size={16} className="text-accent" /> {nombre} <span className="text-ink-faint">· {detalle}</span></div>

            <h2 className="mt-4 font-display text-base font-semibold text-ink">Mapeo de columnas</h2>
            <p className="text-xs text-ink-soft">El sistema propuso esto leyendo tus encabezados. Corrige lo que haga falta.</p>
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {headers.map((h, i) => (
                <label key={i} className="flex items-center gap-2 rounded-control border border-line bg-surface-2/60 px-2.5 py-1.5">
                  <span className="min-w-0 flex-1 truncate text-sm text-ink" title={h}>{h || <span className="text-ink-faint">(columna {i + 1})</span>}</span>
                  <select value={mapeo[i] ?? ''} onChange={(e) => setMapeo((m) => m.map((v, j) => (j === i ? e.target.value : v)))} className={control}>
                    <option value="">— ignorar —</option>
                    {CAMPOS.map((c) => (<option key={c.key} value={c.key}>{c.label}</option>))}
                  </select>
                </label>
              ))}
            </div>

            {preview.ambiguedad.fecha ? (
              <div className="mt-3 rounded-control border border-warning/30 bg-warning/10 p-3">
                <p className="text-sm text-ink">Hay fechas ambiguas (ej. <span className="font-medium tabular-nums">03/04/2027</span>). ¿En qué orden vienen? — se aplica a todo el archivo.</p>
                <div className="mt-2 flex gap-2">
                  {(['dmy', 'mdy'] as FormatoFecha[]).map((f) => (
                    <button key={f} type="button" onClick={() => setFormato(f)} className={`h-8 rounded-control border px-3 text-sm ${formato === f ? 'border-accent bg-accent/10 text-accent' : 'border-line text-ink-soft'}`}>
                      {f === 'dmy' ? 'Día / Mes / Año' : 'Mes / Día / Año'}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            {preview.ambiguedad.numero ? (
              <p className="mt-2 text-xs text-warning">⚠ Hay números con formato ambiguo (ej. 1.250): se interpretan como miles. Revisa las filas en ámbar.</p>
            ) : null}
          </LuminousCard>

          {/* Principios detectados — confirmación POR PATRÓN (una vez por grupo) */}
          {grupos.length ? (
            <LuminousCard neutral className="mt-3">
              <h2 className="font-display text-base font-semibold text-ink">Principios detectados</h2>
              <p className="text-xs text-ink-soft">Los inferí del nombre — son una <span className="font-medium">propuesta</span>. Se enlazan a la molécula (por eso funcionan equivalencia, alergia y controlados). Desmarca los que estén mal; la dosis se puede confirmar después.</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {grupos.map((g) => {
                  const key = g.principio.toLowerCase();
                  const on = !excluidos.has(key);
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setExcluidos((s) => { const n = new Set(s); if (n.has(key)) n.delete(key); else n.add(key); return n; })}
                      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition-colors ${on ? 'border-accent/40 bg-accent/10 text-accent' : 'border-line bg-surface-2 text-ink-faint line-through'}`}
                    >
                      {g.principio} <span className="tabular-nums text-xs opacity-70">×{g.conteo}{g.dosisEjemplo ? ` · ${g.dosisEjemplo}` : ' · dosis?'}</span>
                    </button>
                  );
                })}
              </div>
            </LuminousCard>
          ) : null}

          {/* resumen + preview de 20 */}
          <LuminousCard neutral className="mt-3">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
              <span className="tabular-nums"><span className="font-semibold text-success">{formatNumber(resumen!.ok)}</span> listas</span>
              <span className="tabular-nums"><span className="font-semibold text-warning">{formatNumber(resumen!.aviso)}</span> con avisos</span>
              <span className="tabular-nums"><span className="font-semibold text-danger">{formatNumber(resumen!.error)}</span> no se pueden</span>
              <span className="tabular-nums text-ink-faint">{formatNumber(resumen!.basura)} basura saltada</span>
              <span className="ml-auto tabular-nums text-ink-soft">→ {formatNumber(resumen!.productos)} productos · {formatNumber(resumen!.lotes)} lotes</span>
            </div>
            <div className="mt-3 max-h-80 overflow-auto rounded-control border border-line">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 bg-surface-2 text-[11px] uppercase tracking-wide text-ink-faint">
                  <tr><th className="px-2 py-1.5 tabular-nums">Fila</th><th className="px-2 py-1.5">Producto</th><th className="px-2 py-1.5">Lote</th><th className="px-2 py-1.5">Estado</th></tr>
                </thead>
                <tbody>
                  {preview.filas.slice(0, 20).map((f) => (
                    <tr key={f.fila} className="border-t border-line/60">
                      <td className="px-2 py-1.5 tabular-nums text-ink-faint">{f.fila}</td>
                      <td className="px-2 py-1.5 text-ink">{f.producto ? `${f.producto.nombre}${f.producto.precio != null ? ' · RD$ ' + formatNumber(f.producto.precio, 2) : ''}` : <span className="text-ink-faint">—</span>}</td>
                      <td className="px-2 py-1.5 tabular-nums text-ink-soft">{f.lote ? `${f.lote.cantidad ?? '—'} u${f.lote.vencimiento ? ' · ' + f.lote.vencimiento : ''}` : '—'}</td>
                      <td className="px-2 py-1.5">
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${BADGE[f.estado]}`} style={{ backgroundColor: 'color-mix(in srgb, currentColor 12%, transparent)' }} title={f.mensajes.join('; ')}>
                          {ETIQUETA[f.estado]}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-4 flex items-center gap-3">
              <button type="button" onClick={importar} disabled={importables === 0} className="inline-flex h-11 items-center gap-2 rounded-control brand-gradient px-5 font-semibold text-white shadow-sm transition-opacity hover:opacity-95 disabled:opacity-60">
                <Upload size={18} /> Importar {formatNumber(importables)} filas
              </button>
              <button type="button" onClick={reiniciar} className="text-sm text-ink-soft hover:text-ink">Cancelar</button>
            </div>
          </LuminousCard>
        </>
      ) : null}

      {/* PASO 3: importando */}
      {paso === 'importando' ? (
        <LuminousCard neutral className="mt-4">
          <div className="flex items-center gap-2 text-sm text-ink"><Loader2 size={16} className="animate-spin text-accent" /> Importando en el servidor…</div>
          <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-surface-2">
            <div className="h-full brand-gradient transition-[width] duration-300" style={{ width: `${progreso.total ? Math.round((progreso.procesadas / progreso.total) * 100) : 0}%` }} />
          </div>
          <p className="mt-2 text-sm tabular-nums text-ink-soft">
            {formatNumber(progreso.procesadas)} / {formatNumber(progreso.total)} · <span className="text-success">{formatNumber(progreso.insertadas)} insertadas</span>{progreso.errores ? <> · <span className="text-danger">{formatNumber(progreso.errores)} con error</span></> : null}
          </p>
          <p className="mt-2 text-xs text-ink-faint">Corre en el servidor: si cierras la pestaña, lo insertado queda y es reversible.</p>
        </LuminousCard>
      ) : null}

      {/* PASO 4: reporte */}
      {paso === 'listo' ? (
        <LuminousCard neutral className="mt-4">
          <div className="flex items-center gap-2"><CheckCircle2 size={20} className="text-success" /><h2 className="font-display text-lg font-semibold text-ink">Importación terminada</h2></div>
          <p className="mt-2 text-sm tabular-nums text-ink-soft">
            <span className="font-semibold text-success">{formatNumber(progreso.insertadas)}</span> filas entraron
            {progreso.errores ? <> · <span className="font-semibold text-danger">{formatNumber(progreso.errores)}</span> con error</> : null}.
          </p>
          {fallidas.length ? (
            <div className="mt-3 max-h-48 overflow-auto rounded-control border border-danger/30">
              <table className="w-full text-left text-sm">
                <tbody>
                  {fallidas.map((f, i) => (
                    <tr key={i} className="border-t border-line/60"><td className="px-2 py-1 tabular-nums text-ink-faint">f{f.fila}</td><td className="px-2 py-1 text-ink">{f.nombre}</td><td className="px-2 py-1 text-danger">{f.motivo}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Link href="/productos" className="inline-flex h-10 items-center gap-2 rounded-control brand-gradient px-4 text-sm font-semibold text-white shadow-sm hover:opacity-95">Ver productos</Link>
            <button type="button" onClick={descargarReporte} className="inline-flex h-10 items-center gap-2 rounded-control border border-line bg-surface-2 px-3 text-sm font-medium text-ink-soft hover:text-ink"><Download size={16} /> Descargar reporte</button>
            <button type="button" onClick={deshacer} disabled={cargando} className="inline-flex h-10 items-center gap-2 rounded-control border border-line px-3 text-sm text-ink-soft hover:text-danger disabled:opacity-60">
              {cargando ? <Loader2 size={16} className="animate-spin" /> : <RotateCcw size={16} />} Deshacer esta importación
            </button>
            <button type="button" onClick={reiniciar} className="inline-flex h-10 items-center gap-2 rounded-control px-3 text-sm text-ink-soft hover:text-ink"><X size={16} /> Importar otro</button>
          </div>
        </LuminousCard>
      ) : null}
    </div>
  );
}
