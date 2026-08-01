'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Eye, Loader2, ShieldAlert, Sparkles } from 'lucide-react';
import { LuminousCard } from '@/components/brand/LuminousCard';
import { formatMoney, formatNumber } from '@/lib/format';
import {
  abrirConteoDelDia,
  guardarConteoLinea,
  revelarConteo,
  confirmarCorreccion,
  cerrarConteo,
  type LineaRevelada,
} from './actions';

export interface LineaCiega {
  lineaId: string;
  producto: string;
  lote: string | null;
  vence: string | null;
  ubicacion: string | null;
  contada: number | null;
}

interface Progreso {
  total: number;
  verificados: number;
  estimados: number;
  discrepancias: number;
}

const inputBase =
  'h-10 w-full rounded-control border border-line bg-canvas px-3 text-ink outline-none transition-shadow focus:luminous';
const labelBase = 'block text-sm font-medium text-ink-soft';

type EstadoLinea = LineaCiega & {
  revelado?: LineaRevelada;
  confirmado?: boolean;
  causaConfirmada?: string;
  motivo?: string;
  error?: string;
};

export function ConteoCliente({
  conteoId,
  lineas,
  puedeAutorizar,
  progreso,
}: {
  conteoId: string | null;
  lineas: LineaCiega[];
  puedeAutorizar: boolean;
  progreso: Progreso;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [estado, setEstado] = useState<Record<string, EstadoLinea>>(() =>
    Object.fromEntries(lineas.map((l) => [l.lineaId, { ...l }])),
  );
  const [revelado, setRevelado] = useState(false);
  const [errorGlobal, setErrorGlobal] = useState<string | null>(null);

  const filas = useMemo(() => lineas.map((l) => estado[l.lineaId]).filter(Boolean), [lineas, estado]);
  const contadas = filas.filter((l) => l.contada !== null && l.contada !== undefined).length;
  const pendientesConfirmar = filas.filter(
    (l) => l.revelado && l.revelado.diferencia !== 0 && !l.confirmado,
  ).length;
  const todoAtendido =
    revelado && filas.every((l) => !l.revelado || l.revelado.diferencia === 0 || l.confirmado);

  const pct = progreso.total > 0 ? Math.round((progreso.verificados / progreso.total) * 100) : 0;

  function patch(id: string, p: Partial<EstadoLinea>) {
    setEstado((s) => ({ ...s, [id]: { ...s[id], ...p } }));
  }

  function generar() {
    setErrorGlobal(null);
    startTransition(async () => {
      const r = await abrirConteoDelDia();
      if (r.error) setErrorGlobal(r.error);
      else router.refresh();
    });
  }

  function guardarContada(id: string, valor: string) {
    const n = valor.trim() === '' ? null : Number(valor);
    patch(id, { contada: n });
    if (n === null || Number.isNaN(n)) return;
    void guardarConteoLinea(id, n);
  }

  function revelar() {
    if (!conteoId) return;
    setErrorGlobal(null);
    startTransition(async () => {
      const r = await revelarConteo(conteoId);
      if (r.error || !r.lineas) {
        setErrorGlobal(r.error ?? 'No se pudo revelar.');
        return;
      }
      const byId = new Map(r.lineas.map((x) => [x.lineaId, x]));
      setEstado((s) => {
        const next = { ...s };
        for (const [id, x] of byId) next[id] = { ...next[id], revelado: x };
        return next;
      });
      setRevelado(true);
    });
  }

  function confirmar(id: string) {
    const l = estado[id];
    if (!l?.revelado) return;
    patch(id, { error: undefined });
    startTransition(async () => {
      const r = await confirmarCorreccion({
        lineaId: id,
        causaSugerida: l.revelado?.causaSugerida,
        causaConfirmada: l.causaConfirmada,
        motivo: l.motivo,
      });
      if (r.error) patch(id, { error: r.error });
      else patch(id, { confirmado: true });
    });
  }

  function cerrar() {
    if (!conteoId) return;
    startTransition(async () => {
      const r = await cerrarConteo(conteoId);
      if (r.error) setErrorGlobal(r.error);
      else router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {/* Progreso */}
      <LuminousCard neutral>
        <div className="flex items-center justify-between">
          <h2 className="font-display text-base font-semibold text-ink">Progreso de verificación</h2>
          <span className="text-sm text-ink-soft tabular-nums">{pct}% verificado</span>
        </div>
        <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-surface-2">
          <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
          <div className="rounded-control border border-emerald-500/30 bg-emerald-500/5 py-2">
            <div className="font-display text-lg font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
              {formatNumber(progreso.verificados)}
            </div>
            <div className="text-ink-soft">verificados</div>
          </div>
          <div className="rounded-control border border-amber-500/30 bg-amber-500/5 py-2">
            <div className="font-display text-lg font-bold text-amber-600 dark:text-amber-400 tabular-nums">
              {formatNumber(progreso.estimados)}
            </div>
            <div className="text-ink-soft">estimados (aprox.)</div>
          </div>
          <div className="rounded-control border border-rose-500/30 bg-rose-500/5 py-2">
            <div className="font-display text-lg font-bold text-rose-600 dark:text-rose-400 tabular-nums">
              {formatNumber(progreso.discrepancias)}
            </div>
            <div className="text-ink-soft">con discrepancia</div>
          </div>
        </div>
        {progreso.estimados + progreso.discrepancias > 0 && (
          <p className="mt-2 text-xs text-ink-faint">
            Faltan {formatNumber(progreso.estimados + progreso.discrepancias)} por verificar.
          </p>
        )}
      </LuminousCard>

      {errorGlobal && (
        <div className="rounded-control border border-rose-500/40 bg-rose-500/5 px-3 py-2 text-sm text-rose-700 dark:text-rose-300">
          {errorGlobal}
        </div>
      )}

      {/* Sin conteo abierto */}
      {!conteoId && (
        <LuminousCard>
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <Sparkles className="h-8 w-8 text-accent" />
            <p className="text-sm text-ink-soft">
              No hay un conteo abierto. Genera la lista de hoy: los 10–15 productos de mayor valor por verificar.
            </p>
            <button
              onClick={generar}
              disabled={pending}
              className="brand-gradient inline-flex items-center gap-2 rounded-control px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              Generar lista de hoy
            </button>
          </div>
        </LuminousCard>
      )}

      {/* Conteo en curso */}
      {conteoId && filas.length > 0 && (
        <>
          <div className="flex items-center justify-between px-1">
            <p className="text-sm text-ink-soft">
              {revelado
                ? `Revelado · ${pendientesConfirmar} por confirmar`
                : `Conteo a ciegas · ${contadas}/${filas.length} contados`}
            </p>
            {!revelado ? (
              <button
                onClick={revelar}
                disabled={pending || contadas === 0}
                className="inline-flex items-center gap-1.5 rounded-control border border-line bg-surface px-3 py-1.5 text-sm font-medium text-ink hover:luminous disabled:opacity-50"
              >
                {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
                Revelar y reconciliar
              </button>
            ) : (
              todoAtendido && (
                <button
                  onClick={cerrar}
                  disabled={pending}
                  className="brand-gradient inline-flex items-center gap-1.5 rounded-control px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-60"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  Cerrar conteo
                </button>
              )
            )}
          </div>

          <div className="space-y-2.5">
            {filas.map((l) => (
              <LineaConteo
                key={l.lineaId}
                linea={l}
                revelado={revelado}
                puedeAutorizar={puedeAutorizar}
                pending={pending}
                onContada={(v) => guardarContada(l.lineaId, v)}
                onCausa={(v) => patch(l.lineaId, { causaConfirmada: v })}
                onMotivo={(v) => patch(l.lineaId, { motivo: v })}
                onConfirmar={() => confirmar(l.lineaId)}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function LineaConteo({
  linea,
  revelado,
  puedeAutorizar,
  pending,
  onContada,
  onCausa,
  onMotivo,
  onConfirmar,
}: {
  linea: EstadoLinea;
  revelado: boolean;
  puedeAutorizar: boolean;
  pending: boolean;
  onContada: (v: string) => void;
  onCausa: (v: string) => void;
  onMotivo: (v: string) => void;
  onConfirmar: () => void;
}) {
  const r = linea.revelado;
  const cuadra = r && r.diferencia === 0;
  const bloqueadoPorRol = !!r && r.requiereAutorizacion && !puedeAutorizar;

  return (
    <LuminousCard neutral className="!p-3.5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="font-medium text-ink">{linea.producto}</span>
        <span className="text-xs text-ink-faint">
          {linea.lote ? `Lote ${linea.lote}` : 'Sin lote'}
          {linea.ubicacion ? ` · ${linea.ubicacion}` : ''}
        </span>
      </div>

      {/* Fase conteo a ciegas: solo se pide la cantidad; el sistema NO se muestra */}
      {!revelado && (
        <div className="mt-2 flex items-center gap-2">
          <label className={labelBase}>Contado</label>
          <input
            type="number"
            min="0"
            step="any"
            inputMode="decimal"
            defaultValue={linea.contada ?? ''}
            onBlur={(e) => onContada(e.target.value)}
            placeholder="—"
            className={`${inputBase} max-w-[9rem]`}
          />
          {linea.contada !== null && linea.contada !== undefined && (
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          )}
        </div>
      )}

      {/* Fase revelado */}
      {revelado && r && (
        <div className="mt-2 space-y-2">
          <div className="grid grid-cols-3 gap-2 text-center text-sm">
            <div>
              <div className="text-xs text-ink-faint">Sistema</div>
              <div className="tabular-nums text-ink">{formatNumber(r.cantidadSistema)}</div>
            </div>
            <div>
              <div className="text-xs text-ink-faint">Contado</div>
              <div className="tabular-nums text-ink">{formatNumber(r.cantidadContada)}</div>
            </div>
            <div>
              <div className="text-xs text-ink-faint">Diferencia</div>
              <div
                className={`tabular-nums font-semibold ${
                  r.diferencia === 0
                    ? 'text-ink'
                    : r.diferencia < 0
                      ? 'text-rose-600 dark:text-rose-400'
                      : 'text-amber-600 dark:text-amber-400'
                }`}
              >
                {r.diferencia > 0 ? '+' : ''}
                {formatNumber(r.diferencia)}
                {r.diferencia !== 0 && (
                  <span className="ml-1 text-xs font-normal text-ink-soft">({formatMoney(Math.abs(r.valor))})</span>
                )}
              </div>
            </div>
          </div>

          {linea.confirmado ? (
            <div className="flex items-center gap-1.5 text-sm text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="h-4 w-4" /> {cuadra ? 'Verificado' : 'Corregido y verificado'}
            </div>
          ) : cuadra ? (
            <button
              onClick={onConfirmar}
              disabled={pending}
              className="inline-flex items-center gap-1.5 rounded-control border border-emerald-500/40 bg-emerald-500/5 px-3 py-1.5 text-sm font-medium text-emerald-700 dark:text-emerald-300 disabled:opacity-50"
            >
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Confirmar verificado
            </button>
          ) : (
            <div className="space-y-2 rounded-control border border-amber-500/30 bg-amber-500/5 p-2.5">
              <p className="text-xs text-ink-soft">
                <span className="font-medium text-ink">Causa sugerida: </span>
                {r.causaSugerida}
              </p>
              <input
                type="text"
                defaultValue={linea.causaConfirmada ?? ''}
                onBlur={(e) => onCausa(e.target.value)}
                placeholder="Causa confirmada (opcional)"
                className={`${inputBase} text-sm`}
              />
              {r.requiereAutorizacion && (
                <div className="rounded-control border border-rose-500/30 bg-rose-500/5 p-2">
                  <div className="flex items-center gap-1.5 text-xs font-medium text-rose-700 dark:text-rose-300">
                    <ShieldAlert className="h-3.5 w-3.5" />
                    Diferencia de {formatMoney(Math.abs(r.valor))} — exige motivo y autorización de Dueño/Administrador.
                  </div>
                  <input
                    type="text"
                    defaultValue={linea.motivo ?? ''}
                    onBlur={(e) => onMotivo(e.target.value)}
                    placeholder="Motivo (obligatorio)"
                    disabled={bloqueadoPorRol}
                    className={`${inputBase} mt-1.5 text-sm disabled:opacity-50`}
                  />
                  {bloqueadoPorRol && (
                    <p className="mt-1 text-xs text-rose-700 dark:text-rose-300">
                      Solo el Dueño o el Administrador puede confirmar esta corrección.
                    </p>
                  )}
                </div>
              )}
              {linea.error && (
                <p className="text-xs text-rose-700 dark:text-rose-300">{linea.error}</p>
              )}
              <button
                onClick={onConfirmar}
                disabled={pending || bloqueadoPorRol}
                className="inline-flex items-center gap-1.5 rounded-control bg-amber-500/90 px-3 py-1.5 text-sm font-semibold text-white hover:bg-amber-500 disabled:opacity-50"
              >
                {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Confirmar y corregir
              </button>
            </div>
          )}
        </div>
      )}
    </LuminousCard>
  );
}
