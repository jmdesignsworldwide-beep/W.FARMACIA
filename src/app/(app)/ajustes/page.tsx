import { requireCapability } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { Settings } from 'lucide-react';
import { AjustesCliente, type ConfigMap } from './AjustesCliente';

export const dynamic = 'force-dynamic';

const SUCURSAL = '00000000-0000-0000-0000-000000000001';

export default async function AjustesPage() {
  await requireCapability('configurar_sistema'); // Dueño/Administrador
  const supabase = createClient();

  const { data } = await supabase.from('configuracion').select('clave, valor').eq('sucursal_id', SUCURSAL);
  const config: ConfigMap = {};
  for (const row of (data as unknown as Array<{ clave: string; valor: unknown }>) ?? []) {
    config[row.clave] = row.valor;
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4">
      <div>
        <div className="flex items-center gap-2 font-display text-xl font-semibold text-ink">
          <Settings className="h-6 w-6 text-accent" /> Ajustes
        </div>
        <p className="mt-1 text-sm text-ink-soft">La identidad de la farmacia, los avisos y la farmacia de turno. Solo el dueño lo cambia.</p>
      </div>
      <AjustesCliente config={config} />
    </div>
  );
}
