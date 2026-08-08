import { requireUser } from '@/lib/auth';
import { can, type Capability } from '@/lib/roles';
import { Download, DatabaseBackup } from 'lucide-react';

export const dynamic = 'force-dynamic';

interface Exportable {
  recurso: string;
  titulo: string;
  descripcion: string;
  cap: Capability;
}

const EXPORTS: Exportable[] = [
  { recurso: 'inventario', titulo: 'Inventario', descripcion: 'Existencias por lote, con costo, precio y vencimiento.', cap: 'gestionar_inventario' },
  { recurso: 'movimientos', titulo: 'Movimientos de inventario', descripcion: 'El kardex completo: cada entrada y salida con su motivo.', cap: 'gestionar_inventario' },
  { recurso: 'ventas', titulo: 'Ventas', descripcion: 'Todas las ventas con subtotal, ITBIS, total y estado.', cap: 'ver_finanzas' },
  { recurso: 'comprobantes', titulo: 'Comprobantes fiscales (NCF)', descripcion: 'NCF emitidos, notas de crédito B04 y sus referencias.', cap: 'ver_finanzas' },
  { recurso: 'clientes', titulo: 'Clientes', descripcion: 'Expediente: nombre, teléfono, cédula, dirección.', cap: 'ver_operacion' },
  { recurso: 'fiado', titulo: 'Fiado (por cobrar)', descripcion: 'Saldos abiertos por cliente.', cap: 'ver_operacion' },
  { recurso: 'por-pagar', titulo: 'Cuentas por pagar', descripcion: 'Lo pendiente con las droguerías.', cap: 'ver_finanzas' },
  { recurso: 'libro-controlado', titulo: 'Libro de controlados', descripcion: 'El libro inviolable de despachos de controlados.', cap: 'despachar_controlados' },
];

export default async function RespaldoPage() {
  const user = await requireUser();
  const disponibles = EXPORTS.filter((e) => can(user.role, e.cap));

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4">
      <div>
        <div className="flex items-center gap-2 font-display text-xl font-semibold text-ink">
          <DatabaseBackup className="h-6 w-6 text-accent" /> Respaldo y exportación
        </div>
        <p className="mt-1 text-sm text-ink-soft">
          Baja tus datos cuando quieras. Los archivos son CSV — abren directo en Excel o Google Sheets, con los acentos bien.
        </p>
      </div>

      {disponibles.length === 0 ? (
        <div className="rounded-card border border-line bg-surface p-4 text-center text-sm text-ink-faint">
          Tu rol no tiene exportaciones disponibles.
        </div>
      ) : (
        <div className="space-y-2">
          {disponibles.map((e) => (
            <a
              key={e.recurso}
              href={`/export/${e.recurso}`}
              className="flex items-center justify-between gap-3 rounded-card border border-line bg-surface p-4 hover:border-accent/50"
            >
              <div>
                <div className="font-medium text-ink">{e.titulo}</div>
                <div className="text-xs text-ink-faint">{e.descripcion}</div>
              </div>
              <span className="inline-flex items-center gap-1.5 rounded-control border border-line px-3 py-2 text-sm text-ink">
                <Download className="h-4 w-4" /> Descargar CSV
              </span>
            </a>
          ))}
        </div>
      )}

      <div className="rounded-card border border-line bg-surface p-4 text-sm text-ink-soft">
        <div className="mb-1 font-medium text-ink">¿Y el respaldo automático?</div>
        <p>
          Supabase (la plataforma donde vive tu base) hace <strong>respaldos automáticos diarios</strong> de todo el
          sistema por su lado. Lo de esta pantalla es <strong>tu copia en Excel</strong>, para tenerla en tu mano cuando
          quieras. Cómo se restaura, en cristiano y paso a paso, está en{' '}
          <code>docs/RESPALDO-Y-RESTAURACION.md</code>.
        </p>
      </div>

      <p className="text-xs text-ink-faint">
        La carpeta de inspección DIGEMAPS ya imprime en PDF desde su propia pantalla. El export tabular vive aquí.
      </p>
    </div>
  );
}
