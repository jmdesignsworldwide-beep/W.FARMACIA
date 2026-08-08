import { requireUser } from '@/lib/auth';
import { ShieldCheck } from 'lucide-react';
import { BRAND } from '@/lib/tokens';

export const dynamic = 'force-dynamic';

const card = 'rounded-card border border-line bg-surface p-4';

export default async function PrivacidadPage() {
  await requireUser();
  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4">
      <div>
        <div className="flex items-center gap-2 font-display text-xl font-semibold text-ink">
          <ShieldCheck className="h-6 w-6 text-accent" /> Privacidad y protección de datos
        </div>
        <p className="mt-1 text-sm text-ink-soft">Cómo {BRAND.name} trata los datos de sus clientes, conforme a la Ley 172-13.</p>
      </div>

      <div className={`${card} space-y-3 text-sm leading-relaxed text-ink-soft`}>
        <div>
          <div className="font-medium text-ink">Qué guardamos y para qué</div>
          <p>Guardamos los datos que el cliente nos da (nombre, teléfono, cédula, fecha de nacimiento) y su historial de compras y servicios, únicamente para atenderlo mejor: recordarle su tratamiento, avisarle cuando llega un pedido, aplicar el descuento de ley y llevar el control que exige la regulación farmacéutica.</p>
        </div>
        <div>
          <div className="font-medium text-ink">Consentimiento (Ley 172-13)</div>
          <p>Guardar datos de salud requiere el <strong>consentimiento informado del paciente</strong>. Ese consentimiento se registra con su fecha y <strong>es revocable</strong> en cualquier momento. El cliente puede además pedir <strong>no recibir mensajes</strong>, y esa preferencia se respeta en todo el sistema.</p>
        </div>
        <div>
          <div className="font-medium text-ink">Mensajes neutros</div>
          <p>Ningún mensaje automático nombra el medicamento. Un recordatorio o aviso dice, a lo sumo, que hay algo pendiente por recoger — nunca revela una condición de salud por un canal no cifrado.</p>
        </div>
        <div>
          <div className="font-medium text-ink">Derechos del cliente</div>
          <ul className="ml-4 list-disc space-y-1">
            <li><strong>Acceso:</strong> puede pedir qué datos guardamos de él.</li>
            <li><strong>Rectificación:</strong> puede corregir un dato equivocado.</li>
            <li><strong>Supresión:</strong> puede pedir que borremos sus datos, <em>salvo</em> lo que la ley obliga a conservar (por ejemplo, el libro de controlados, que es inviolable).</li>
          </ul>
        </div>
        <div>
          <div className="font-medium text-ink">Quién accede queda registrado</div>
          <p>El sistema lleva una bitácora inviolable (<code>audit_log</code>) de quién accede y modifica la información. Ante una solicitud del cliente, ese registro puede mostrarse.</p>
        </div>
      </div>

      <p className="text-xs text-ink-faint">
        Este texto es la política de privacidad visible del sistema. La decisión clínica y de dispensación corresponde siempre al personal farmacéutico autorizado.
      </p>
    </div>
  );
}
