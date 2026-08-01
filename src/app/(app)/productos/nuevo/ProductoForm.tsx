'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertTriangle, ArrowLeft, FlaskConical, Loader2, Plus, Save, Trash2 } from 'lucide-react';
import { LuminousCard } from '@/components/brand/LuminousCard';
import {
  UNIDADES_CONCENTRACION,
  UNIDADES_VOLUMEN,
  type PrincipioInput,
  type ProductoPayload,
} from '@/lib/producto';
import type { UnidadConcentracion, UnidadVolumen } from '@/lib/supabase/types';
import { crearProducto, actualizarProducto } from '../actions';

export interface OpcionCatalogo {
  id: string;
  nombre: string;
}

export interface RenglonPrincipio {
  principio_activo_id: string;
  valor: string;
  unidad: UnidadConcentracion;
  volVal: string;
  volUnidad: '' | UnidadVolumen;
}

export interface ProductoInicial {
  id: string;
  nombre: string;
  forma_farmaceutica_id: string;
  via_administracion_id: string;
  laboratorio: string;
  presentacion: string;
  unidad_base: string;
  unidad_caja: string;
  factor_caja: string;
  precio_venta: string;
  precio_caja: string;
  margen_objetivo: string;
  es_controlado: boolean;
  requiere_receta: boolean;
  exento_itbis: boolean;
  codigo_barras: string;
  registro_sanitario: string;
  principios: RenglonPrincipio[];
}

const renglonVacio = (): RenglonPrincipio => ({
  principio_activo_id: '',
  valor: '',
  unidad: 'mg',
  volVal: '',
  volUnidad: '',
});

const inputBase =
  'h-10 w-full rounded-control border border-line bg-canvas px-3 text-ink outline-none transition-shadow focus:luminous';
const labelBase = 'block text-sm font-medium text-ink-soft';

function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <LuminousCard neutral className="mt-4">
      <h2 className="mb-3 font-display text-base font-semibold text-ink">{titulo}</h2>
      {children}
    </LuminousCard>
  );
}

export function ProductoForm({
  principiosCatalogo,
  formas,
  vias,
  laboratorios,
  presentaciones,
  inicial,
}: {
  principiosCatalogo: OpcionCatalogo[];
  formas: OpcionCatalogo[];
  vias: OpcionCatalogo[];
  laboratorios: string[];
  presentaciones: string[];
  inicial?: ProductoInicial;
}) {
  const router = useRouter();
  const esEdicion = Boolean(inicial);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [duplicados, setDuplicados] = useState<string[] | null>(null);

  const [nombre, setNombre] = useState(inicial?.nombre ?? '');
  const [formaId, setFormaId] = useState(inicial?.forma_farmaceutica_id ?? '');
  const [viaId, setViaId] = useState(inicial?.via_administracion_id ?? '');
  const [laboratorio, setLaboratorio] = useState(inicial?.laboratorio ?? '');
  const [presentacion, setPresentacion] = useState(inicial?.presentacion ?? '');
  const [principios, setPrincipios] = useState<RenglonPrincipio[]>(inicial?.principios ?? []);
  const [unidadBase, setUnidadBase] = useState(inicial?.unidad_base ?? '');
  const [unidadCaja, setUnidadCaja] = useState(inicial?.unidad_caja ?? '');
  const [factorCaja, setFactorCaja] = useState(inicial?.factor_caja ?? '');
  const [precioVenta, setPrecioVenta] = useState(inicial?.precio_venta ?? '');
  const [precioCaja, setPrecioCaja] = useState(inicial?.precio_caja ?? '');
  const [margen, setMargen] = useState(inicial?.margen_objetivo ?? '');
  const [esControlado, setEsControlado] = useState(inicial?.es_controlado ?? false);
  const [requiereReceta, setRequiereReceta] = useState(inicial?.requiere_receta ?? false);
  const [exentoItbis, setExentoItbis] = useState(inicial?.exento_itbis ?? false);
  const [codigoBarras, setCodigoBarras] = useState(inicial?.codigo_barras ?? '');
  const [registroSanitario, setRegistroSanitario] = useState(inicial?.registro_sanitario ?? '');

  const sinPrincipiosEnCatalogo = principiosCatalogo.length === 0;
  const setRenglon = (i: number, patch: Partial<RenglonPrincipio>) =>
    setPrincipios((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const quitarRenglon = (i: number) => setPrincipios((prev) => prev.filter((_, idx) => idx !== i));

  const guardar = (confirmarDuplicado = false) => {
    setError(null);
    if (!confirmarDuplicado) setDuplicados(null);
    const payload: ProductoPayload = {
      confirmarDuplicado,
      nombre: nombre.trim(),
      forma_farmaceutica_id: formaId || null,
      via_administracion_id: viaId || null,
      laboratorio: laboratorio.trim() || null,
      presentacion: presentacion.trim() || null,
      principios: principios.map<PrincipioInput>((r) => ({
        principio_activo_id: r.principio_activo_id,
        concentracion_valor: Number(r.valor),
        concentracion_unidad: r.unidad,
        concentracion_volumen_valor: r.volVal ? Number(r.volVal) : null,
        concentracion_volumen_unidad: r.volUnidad || null,
      })),
      unidad_base: unidadBase || null,
      unidad_caja: unidadCaja || null,
      factor_caja: factorCaja ? Number(factorCaja) : null,
      precio_venta: precioVenta ? Number(precioVenta) : null,
      precio_caja: precioCaja ? Number(precioCaja) : null,
      margen_objetivo: margen ? Number(margen) : null,
      es_controlado: esControlado,
      requiere_receta: requiereReceta,
      exento_itbis: exentoItbis,
      codigo_barras: codigoBarras || null,
      registro_sanitario: registroSanitario.trim() || null,
    };
    startTransition(async () => {
      const res = esEdicion
        ? await actualizarProducto(inicial!.id, payload)
        : await crearProducto(payload);
      if (res.ok) {
        const q =
          res.marcaAlternativaDe && res.marcaAlternativaDe.length > 0
            ? `?alt=${encodeURIComponent(res.marcaAlternativaDe.join(', '))}`
            : '';
        router.push(`/productos${q}`);
        return;
      }
      if (res.duplicados && res.duplicados.length > 0) {
        setDuplicados(res.duplicados);
        return;
      }
      setError(res.error ?? 'No se pudo guardar.');
    });
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <Link href="/productos" className="inline-flex items-center gap-1.5 text-sm text-ink-soft transition-colors hover:text-ink">
        <ArrowLeft size={16} /> Productos
      </Link>
      <h1 className="mt-2 font-display text-2xl font-bold text-ink">
        {esEdicion ? 'Editar producto' : 'Nuevo producto'}
      </h1>
      <p className="mt-1 text-sm text-ink-soft">
        Lo esencial ahora; el resto se enriquece después. Solo el nombre es obligatorio.
      </p>

      {/* Dos columnas en escritorio; una sola en móvil. Izquierda: identidad
          clínica. Derecha: lo comercial y fiscal. */}
      <div className="grid grid-cols-1 gap-x-5 lg:grid-cols-2 lg:items-start">
      <div className="min-w-0">
      <Seccion titulo="Identidad">
        <label className={labelBase} htmlFor="nombre">Nombre comercial</label>
        <input id="nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej. Losartán 50 mg" className={`${inputBase} mt-1.5`} />
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className={labelBase} htmlFor="forma">Forma farmacéutica</label>
            <select id="forma" value={formaId} onChange={(e) => setFormaId(e.target.value)} className={`${inputBase} mt-1.5`}>
              <option value="">— Sin definir —</option>
              {formas.map((f) => (<option key={f.id} value={f.id}>{f.nombre}</option>))}
            </select>
          </div>
          <div>
            <label className={labelBase} htmlFor="via">Vía de administración</label>
            <select id="via" value={viaId} onChange={(e) => setViaId(e.target.value)} className={`${inputBase} mt-1.5`}>
              <option value="">— Sin definir —</option>
              {vias.map((v) => (<option key={v.id} value={v.id}>{v.nombre}</option>))}
            </select>
          </div>
          <div>
            <label className={labelBase} htmlFor="laboratorio">Laboratorio / marca</label>
            <input id="laboratorio" list="labs" value={laboratorio} onChange={(e) => setLaboratorio(e.target.value)} placeholder="Escribe o elige (se guarda solo)" className={`${inputBase} mt-1.5`} />
            <datalist id="labs">{laboratorios.map((n) => (<option key={n} value={n} />))}</datalist>
          </div>
          <div>
            <label className={labelBase} htmlFor="presentacion">Presentación</label>
            <input id="presentacion" list="pres" value={presentacion} onChange={(e) => setPresentacion(e.target.value)} placeholder="Ej. Caja x 30" className={`${inputBase} mt-1.5`} />
            <datalist id="pres">{presentaciones.map((n) => (<option key={n} value={n} />))}</datalist>
          </div>
        </div>
        <p className="mt-2 text-[12px] text-ink-faint">
          Laboratorio y presentación distinguen un <span className="font-medium">duplicado</span> de una
          <span className="font-medium"> marca alternativa</span>: dos marcas del mismo medicamento son equivalentes, no un error.
        </p>
      </Seccion>

      <Seccion titulo="Principios activos y concentración">
        <p className="-mt-1 mb-3 text-sm text-ink-soft">
          Varios por producto (ej. Losartán + Hidroclorotiazida), cada uno con su concentración. Es la base de la equivalencia.
        </p>
        {sinPrincipiosEnCatalogo ? (
          <div className="rounded-control border border-line bg-surface-2 px-3 py-3 text-sm text-ink-soft">
            Aún no hay principios activos en el catálogo.{' '}
            <Link href="/catalogos" className="font-medium text-accent hover:underline">Agrégalos en Catálogos</Link>{' '}
            y vuelve — no se crean desde aquí (Adenda III §4).
          </div>
        ) : (
          <>
            {principios.length === 0 ? (
              <p className="mb-3 text-sm text-ink-faint">Sin principios aún (puedes dejarlo vacío y completarlo luego).</p>
            ) : null}
            <div className="space-y-3">
              {principios.map((r, i) => (
                <div key={i} className="rounded-control border border-line bg-canvas p-3">
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto]">
                    <select value={r.principio_activo_id} onChange={(e) => setRenglon(i, { principio_activo_id: e.target.value })} aria-label="Principio activo" className={inputBase}>
                      <option value="">— Elige el principio activo —</option>
                      {principiosCatalogo.map((p) => (<option key={p.id} value={p.id}>{p.nombre}</option>))}
                    </select>
                    <button type="button" onClick={() => quitarRenglon(i)} aria-label="Quitar principio" className="flex h-10 w-10 items-center justify-center rounded-control text-ink-faint transition-colors hover:bg-surface-2 hover:text-danger">
                      <Trash2 size={16} />
                    </button>
                  </div>
                  <div className="mt-2 flex flex-wrap items-end gap-2">
                    <div className="w-24">
                      <label className="text-[11px] text-ink-faint">Cantidad</label>
                      <input type="number" inputMode="decimal" min="0" step="any" value={r.valor} onChange={(e) => setRenglon(i, { valor: e.target.value })} placeholder="500" className={inputBase} />
                    </div>
                    <div className="w-24">
                      <label className="text-[11px] text-ink-faint">Unidad</label>
                      <select value={r.unidad} onChange={(e) => setRenglon(i, { unidad: e.target.value as UnidadConcentracion })} className={inputBase}>
                        {UNIDADES_CONCENTRACION.map((u) => (<option key={u} value={u}>{u}</option>))}
                      </select>
                    </div>
                    <span className="pb-2.5 text-ink-faint">/</span>
                    <div className="w-24">
                      <label className="text-[11px] text-ink-faint">Volumen (opc.)</label>
                      <input type="number" inputMode="decimal" min="0" step="any" value={r.volVal} onChange={(e) => setRenglon(i, { volVal: e.target.value })} placeholder="5" className={inputBase} />
                    </div>
                    <div className="w-24">
                      <label className="text-[11px] text-ink-faint">Unidad vol.</label>
                      <select value={r.volUnidad} onChange={(e) => setRenglon(i, { volUnidad: e.target.value as '' | UnidadVolumen })} className={inputBase}>
                        <option value="">—</option>
                        {UNIDADES_VOLUMEN.map((u) => (<option key={u} value={u}>{u}</option>))}
                      </select>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <button type="button" onClick={() => setPrincipios((prev) => [...prev, renglonVacio()])} className="mt-3 inline-flex items-center gap-1.5 rounded-control border border-line bg-surface-2 px-3 py-2 text-sm font-medium text-ink transition-colors hover:text-accent">
              <FlaskConical size={15} /> Agregar principio activo
            </button>
          </>
        )}
      </Seccion>
      </div>

      <div className="min-w-0">
      <Seccion titulo="Empaque y precio">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div><label className={labelBase}>Unidad de venta</label><input value={unidadBase} onChange={(e) => setUnidadBase(e.target.value)} placeholder="Tableta" className={`${inputBase} mt-1.5`} /></div>
          <div><label className={labelBase}>Unidad de caja</label><input value={unidadCaja} onChange={(e) => setUnidadCaja(e.target.value)} placeholder="Caja" className={`${inputBase} mt-1.5`} /></div>
          <div><label className={labelBase}>Unidades por caja</label><input type="number" min="0" step="any" value={factorCaja} onChange={(e) => setFactorCaja(e.target.value)} placeholder="30" className={`${inputBase} mt-1.5`} /></div>
          <div><label className={labelBase}>Precio de venta (RD$)</label><input type="number" min="0" step="0.01" value={precioVenta} onChange={(e) => setPrecioVenta(e.target.value)} placeholder="0.00" className={`${inputBase} mt-1.5`} /></div>
          <div><label className={labelBase}>Precio por caja (RD$)</label><input type="number" min="0" step="0.01" value={precioCaja} onChange={(e) => setPrecioCaja(e.target.value)} placeholder="0.00" className={`${inputBase} mt-1.5`} /></div>
          <div><label className={labelBase}>Margen objetivo (%)</label><input type="number" min="0" step="any" value={margen} onChange={(e) => setMargen(e.target.value)} placeholder="30" className={`${inputBase} mt-1.5`} /></div>
        </div>
      </Seccion>

      <Seccion titulo="Control y fiscal">
        <div className="space-y-2.5">
          {[
            { label: 'Medicamento controlado', v: esControlado, set: setEsControlado },
            { label: 'Requiere receta', v: requiereReceta, set: setRequiereReceta },
            { label: 'Exento de ITBIS', v: exentoItbis, set: setExentoItbis },
          ].map((f) => (
            <label key={f.label} className="flex cursor-pointer items-center gap-2.5 text-sm text-ink">
              <input type="checkbox" checked={f.v} onChange={(e) => f.set(e.target.checked)} className="h-4 w-4 rounded border-line accent-[hsl(var(--accent))]" />
              {f.label}
            </label>
          ))}
        </div>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className={labelBase}>Código de barras</label>
            <input value={codigoBarras} onChange={(e) => setCodigoBarras(e.target.value)} placeholder="Escanéalo o escríbelo" className={`${inputBase} mt-1.5`} />
          </div>
          <div>
            <label className={labelBase} htmlFor="registro">Registro sanitario</label>
            <input id="registro" value={registroSanitario} onChange={(e) => setRegistroSanitario(e.target.value)} placeholder="Registro DIGEMAPS" className={`${inputBase} mt-1.5`} />
            <p className="mt-1 text-[12px] text-ink-faint">Del registro oficial DIGEMAPS. Se llenará solo desde el catálogo cuando exista el buscador.</p>
          </div>
        </div>
      </Seccion>
      </div>
      </div>

      {/* Alerta de DUPLICADO (misma marca + presentación) */}
      {duplicados && duplicados.length > 0 ? (
        <div className="mt-4 rounded-control border border-danger/40 bg-danger/10 p-3">
          <p className="flex items-start gap-2 text-sm text-ink">
            <AlertTriangle size={16} className="mt-0.5 shrink-0 text-danger" />
            <span>
              Este producto ya existe: <span className="font-medium">{duplicados.join(', ')}</span> (misma
              marca y presentación). ¿Quizás lo que quieres es <span className="font-medium">agregarle un lote</span>? Si de
              verdad es otro producto, confírmalo.
            </span>
          </p>
          <button type="button" onClick={() => guardar(true)} disabled={pending} className="mt-2.5 ml-6 inline-flex h-9 items-center gap-1.5 rounded-control border border-danger/40 bg-danger/10 px-3 text-sm font-medium text-danger transition-opacity hover:opacity-90 disabled:opacity-60">
            {pending ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
            Crear de todos modos
          </button>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="mt-4 rounded-control border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>
      ) : null}

      <div className="mt-5 flex items-center gap-3">
        <button type="button" onClick={() => guardar()} disabled={pending} className="inline-flex h-11 items-center gap-2 rounded-control brand-gradient px-5 font-semibold text-white shadow-sm transition-opacity hover:opacity-95 disabled:opacity-60">
          {pending ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
          {pending ? 'Guardando…' : esEdicion ? 'Guardar cambios' : 'Guardar producto'}
        </button>
        <Link href="/productos" className="text-sm text-ink-soft transition-colors hover:text-ink">Cancelar</Link>
      </div>
    </div>
  );
}
