import { requireCapability } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { Bike } from 'lucide-react';
import { DeliveryMostrador, DeliveryMotorista, type EntregaRow, type MotoristaOpt } from './DeliveryCliente';

export const dynamic = 'force-dynamic';

export default async function DeliveryPage() {
  const user = await requireCapability('operar_delivery'); // motorista + mostrador (dueño/admin/farm/cajero)
  const supabase = createClient();
  const esMotorista = user.role === 'motorista';

  // RLS ya filtra: el motorista solo ve las suyas; el mostrador ve todas.
  const { data: entregas } = await supabase
    .from('entrega')
    .select('id, destinatario, direccion, referencia, telefono, estado, contra_entrega, monto_a_cobrar, cobrado, nota, motorista_id, motivo_no_entrega, created_at, motorista:motorista_id ( nombre )')
    .order('created_at', { ascending: false })
    .limit(200);

  const rows: EntregaRow[] = ((entregas as unknown as Array<{
    id: string; destinatario: string; direccion: string; referencia: string | null; telefono: string | null;
    estado: EntregaRow['estado']; contra_entrega: boolean; monto_a_cobrar: number; cobrado: boolean; nota: string | null;
    motorista_id: string | null; motivo_no_entrega: string | null; created_at: string; motorista: { nombre: string } | null;
  }>) ?? []).map((e) => ({
    id: e.id,
    destinatario: e.destinatario,
    direccion: e.direccion,
    referencia: e.referencia,
    telefono: e.telefono,
    estado: e.estado,
    contraEntrega: e.contra_entrega,
    montoACobrar: Number(e.monto_a_cobrar),
    cobrado: e.cobrado,
    nota: e.nota,
    motoristaId: e.motorista_id,
    motoristaNombre: e.motorista?.nombre ?? null,
    motivoNoEntrega: e.motivo_no_entrega,
  }));

  let motoristas: MotoristaOpt[] = [];
  if (!esMotorista) {
    const { data: motos } = await supabase.from('profiles').select('id, nombre').eq('role', 'motorista').order('nombre');
    motoristas = ((motos as unknown as Array<{ id: string; nombre: string }>) ?? []).map((m) => ({ id: m.id, nombre: m.nombre }));
  }

  const activas = rows.filter((r) => r.estado === 'pendiente' || r.estado === 'en_camino');

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4">
      <div>
        <div className="flex items-center gap-2 font-display text-xl font-semibold text-ink">
          <Bike className="h-6 w-6 text-accent" /> Delivery
        </div>
        <p className="mt-1 text-sm text-ink-soft">
          {esMotorista
            ? 'Tus entregas. Marca cuando sales y cuando llegas; si es contra entrega, confirma el cobro.'
            : 'Las entregas del día: crea, asigna el motorista y sigue su estado en vivo.'}
        </p>
      </div>

      {esMotorista ? (
        <DeliveryMotorista rows={activas} />
      ) : (
        <DeliveryMostrador rows={rows} activas={activas} motoristas={motoristas} />
      )}
    </div>
  );
}
