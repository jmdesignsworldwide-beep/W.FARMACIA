'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Loader2, KeyRound, ShieldCheck } from 'lucide-react';

export function CambiarClaveForm({ nombre }: { nombre: string }) {
  const [p1, setP1] = useState('');
  const [p2, setP2] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function guardar() {
    if (p1.length < 8) { setError('La clave debe tener al menos 8 caracteres.'); return; }
    if (p1 !== p2) { setError('Las dos claves no coinciden.'); return; }
    setBusy(true); setError(null);
    const supabase = createClient();
    const { error: eUpd } = await supabase.auth.updateUser({ password: p1 });
    if (eUpd) { setBusy(false); setError(eUpd.message || 'No se pudo cambiar la clave.'); return; }
    // Baja la bandera (SECURITY DEFINER: solo toca la fila propia).
    const { error: eFlag } = await supabase.rpc('marcar_clave_cambiada' as never);
    if (eFlag) { setBusy(false); setError('Clave cambiada, pero hubo un problema al confirmar. Recarga.'); return; }
    // Recarga dura: el layout ya no redirige y entra al dashboard.
    window.location.href = '/dashboard';
  }

  const inp = 'h-11 w-full rounded-control border border-line bg-canvas px-3 text-ink outline-none focus:luminous';

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas p-4">
      <div className="w-full max-w-sm rounded-card border border-line bg-surface p-6 shadow-xl">
        <div className="mb-1 flex items-center gap-2 font-display text-lg font-semibold text-ink">
          <ShieldCheck className="h-5 w-5 text-accent" /> Cambia tu clave
        </div>
        <p className="mb-4 text-sm text-ink-soft">
          Hola {nombre.split(' ')[0]}. Entraste con una clave temporal. Por seguridad, ponle una clave tuya antes de continuar.
        </p>
        <div className="space-y-2">
          <div>
            <label className="mb-1 block text-xs text-ink-soft">Nueva clave (mínimo 8)</label>
            <input type="password" autoFocus value={p1} onChange={(e) => setP1(e.target.value)} className={inp} />
          </div>
          <div>
            <label className="mb-1 block text-xs text-ink-soft">Repite la clave</label>
            <input type="password" value={p2} onChange={(e) => setP2(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void guardar(); }} className={inp} />
          </div>
        </div>
        {error && <div className="mt-3 rounded-control border border-rose-500/40 bg-rose-500/5 px-3 py-1.5 text-xs text-rose-700 dark:text-rose-300">{error}</div>}
        <button onClick={() => void guardar()} disabled={busy || !p1 || !p2} className="brand-gradient mt-4 inline-flex w-full items-center justify-center gap-2 rounded-control px-4 py-3 text-sm font-semibold text-white disabled:opacity-40">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />} Guardar y entrar
        </button>
      </div>
    </div>
  );
}
