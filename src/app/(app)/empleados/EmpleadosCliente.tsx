'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { BadgeCheck, Check, Loader2, Pencil, ShieldAlert, User, X } from 'lucide-react';
import { actualizarExpediente } from './actions';

export interface EmpleadoItem {
  id: string;
  nombre: string;
  rol: string;
  rolRaw: string;
  telefono: string;
  cedula: string;
  contactoNombre: string;
  contactoTelefono: string;
  fechaIngreso: string | null;
  direccion: string;
  exequatur: string;
  licenciaVencimiento: string | null;
  activo: boolean;
  licenciaLabel: string | null;
  licenciaTono: string | null;
}

const card = 'rounded-card border border-line bg-surface p-4';
const inputBase = 'h-10 w-full rounded-control border border-line bg-canvas px-3 text-ink outline-none focus:luminous';

export function EmpleadosCliente({ empleados }: { empleados: EmpleadoItem[] }) {
  const router = useRouter();
  const [editando, setEditando] = useState<EmpleadoItem | null>(null);

  const alertasLicencia = empleados.filter((e) => e.licenciaLabel && e.licenciaTono && !e.licenciaTono.includes('emerald'));

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4">
      <div>
        <div className="flex items-center gap-2 font-display text-xl font-semibold text-ink">
          <User className="h-6 w-6 text-accent" /> Empleados
        </div>
        <p className="mt-1 text-sm text-ink-soft">Expedientes, roles y la licencia del regente vigente ante DIGEMAPS.</p>
      </div>

      {alertasLicencia.length > 0 && (
        <div className="rounded-card border border-amber-500/40 bg-amber-500/5 p-3">
          {alertasLicencia.map((e) => (
            <div key={e.id} className="flex items-center gap-2 text-sm">
              <ShieldAlert className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              <span className="text-ink">{e.nombre}:</span> <span className={e.licenciaTono ?? ''}>{e.licenciaLabel}</span>
            </div>
          ))}
        </div>
      )}

      <div className={card}>
        <ul className="divide-y divide-line">
          {empleados.map((e) => (
            <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-ink">
                  <span className="font-medium">{e.nombre}</span>
                  <span className="rounded-full border border-line px-2 py-0.5 text-xs text-ink-soft">{e.rol}</span>
                  {!e.activo && <span className="text-xs text-ink-faint">inactivo</span>}
                </div>
                <div className="mt-0.5 text-xs text-ink-faint">
                  {e.cedula ? `Cédula ${e.cedula}` : 'Sin cédula'}
                  {e.telefono ? ` · ${e.telefono}` : ''}
                  {e.fechaIngreso ? ` · desde ${e.fechaIngreso}` : ''}
                </div>
                {e.exequatur && (
                  <div className="mt-0.5 flex items-center gap-1 text-xs">
                    <BadgeCheck className="h-3.5 w-3.5 text-ink-faint" /> Exequátur {e.exequatur}
                    {e.licenciaLabel && <span className={e.licenciaTono ?? ''}>· {e.licenciaLabel}</span>}
                  </div>
                )}
              </div>
              <button onClick={() => setEditando(e)} className="inline-flex items-center gap-1 rounded-control border border-line px-3 py-1.5 text-xs text-ink-soft hover:luminous">
                <Pencil className="h-3.5 w-3.5" /> Expediente
              </button>
            </li>
          ))}
        </ul>
      </div>

      {editando && <ExpedienteModal empleado={editando} onClose={() => setEditando(null)} onDone={() => { setEditando(null); router.refresh(); }} />}
    </div>
  );
}

function ExpedienteModal({ empleado, onClose, onDone }: { empleado: EmpleadoItem; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState({
    cedula: empleado.cedula,
    telefono: empleado.telefono,
    contactoNombre: empleado.contactoNombre,
    contactoTelefono: empleado.contactoTelefono,
    fechaIngreso: empleado.fechaIngreso ?? '',
    direccion: empleado.direccion,
    exequatur: empleado.exequatur,
    licenciaVencimiento: empleado.licenciaVencimiento ?? '',
  });
  const [proc, setProc] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF((s) => ({ ...s, [k]: e.target.value }));

  async function guardar() {
    setProc(true);
    setError(null);
    const res = await actualizarExpediente({
      id: empleado.id,
      cedula: f.cedula,
      telefono: f.telefono,
      contactoNombre: f.contactoNombre,
      contactoTelefono: f.contactoTelefono,
      fechaIngreso: f.fechaIngreso || null,
      direccion: f.direccion,
      exequatur: f.exequatur,
      licenciaVencimiento: f.licenciaVencimiento || null,
    });
    setProc(false);
    if (res.ok) onDone();
    else setError(res.error ?? 'No se pudo.');
  }

  const esRegente = empleado.rolRaw === 'farmaceutico' || empleado.rolRaw === 'dueno' || empleado.rolRaw === 'administrador';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-lg overflow-auto rounded-card border border-line bg-surface p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <div className="font-display text-lg font-semibold text-ink">Expediente · {empleado.nombre}</div>
          <button onClick={onClose} className="text-ink-faint hover:text-ink" aria-label="Cerrar"><X className="h-5 w-5" /></button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="mb-1 block text-xs text-ink-soft">Cédula</label><input value={f.cedula} onChange={set('cedula')} className={inputBase} /></div>
          <div><label className="mb-1 block text-xs text-ink-soft">Teléfono</label><input value={f.telefono} onChange={set('telefono')} className={inputBase} /></div>
          <div><label className="mb-1 block text-xs text-ink-soft">Contacto de emergencia</label><input value={f.contactoNombre} onChange={set('contactoNombre')} className={inputBase} /></div>
          <div><label className="mb-1 block text-xs text-ink-soft">Tel. de emergencia</label><input value={f.contactoTelefono} onChange={set('contactoTelefono')} className={inputBase} /></div>
          <div><label className="mb-1 block text-xs text-ink-soft">Fecha de ingreso</label><input type="date" value={f.fechaIngreso} onChange={set('fechaIngreso')} className={inputBase} /></div>
          <div className="col-span-2"><label className="mb-1 block text-xs text-ink-soft">Dirección</label><input value={f.direccion} onChange={set('direccion')} className={inputBase} /></div>
          {esRegente && (
            <>
              <div><label className="mb-1 block text-xs text-ink-soft">Exequátur (regente)</label><input value={f.exequatur} onChange={set('exequatur')} className={inputBase} /></div>
              <div><label className="mb-1 block text-xs text-ink-soft">Vence licencia</label><input type="date" value={f.licenciaVencimiento} onChange={set('licenciaVencimiento')} className={inputBase} /></div>
            </>
          )}
        </div>
        {error && <div className="mt-3 rounded-control border border-rose-500/40 bg-rose-500/5 px-3 py-1.5 text-xs text-rose-700 dark:text-rose-300">{error}</div>}
        <div className="mt-4 flex gap-2">
          <button onClick={onClose} className="flex-1 rounded-control border border-line px-4 py-2.5 text-sm text-ink-soft hover:bg-canvas">Cancelar</button>
          <button onClick={guardar} disabled={proc} className="brand-gradient inline-flex flex-1 items-center justify-center gap-2 rounded-control px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40">
            {proc ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Guardar
          </button>
        </div>
      </div>
    </div>
  );
}
