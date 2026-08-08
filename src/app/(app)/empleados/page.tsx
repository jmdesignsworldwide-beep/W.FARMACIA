import { requireCapability } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { EmpleadosCliente, type EmpleadoItem } from './EmpleadosCliente';

export const dynamic = 'force-dynamic';

const ROL_LABEL: Record<string, string> = {
  dueno: 'Dueño',
  administrador: 'Administrador',
  farmaceutico: 'Farmacéutico',
  cajero: 'Cajero',
  motorista: 'Motorista',
};

function licencia(fecha: string | null): { label: string; tono: string } | null {
  if (!fecha) return null;
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const v = new Date(fecha + 'T00:00:00');
  const dias = Math.round((v.getTime() - hoy.getTime()) / 86400000);
  if (dias < 0) return { label: `Licencia VENCIDA (${fecha})`, tono: 'text-rose-600 dark:text-rose-400' };
  if (dias <= 60) return { label: `Licencia vence en ${dias} días (${fecha})`, tono: 'text-amber-600 dark:text-amber-400' };
  return { label: `Licencia vigente (${fecha})`, tono: 'text-emerald-600 dark:text-emerald-400' };
}

export default async function EmpleadosPage() {
  await requireCapability('gestionar_empleados');
  const supabase = createClient();

  const { data } = await supabase
    .from('profiles')
    .select('id, nombre, role, telefono, cedula, contacto_emergencia_nombre, contacto_emergencia_telefono, fecha_ingreso, direccion, exequatur, licencia_vencimiento, activo')
    .is('eliminado_en', null)
    .order('nombre');

  const empleados: EmpleadoItem[] = ((data as unknown as Array<Record<string, unknown>>) ?? []).map((p) => {
    const lic = licencia((p.licencia_vencimiento as string) ?? null);
    return {
      id: String(p.id),
      nombre: String(p.nombre ?? '—'),
      rol: ROL_LABEL[String(p.role)] ?? String(p.role),
      rolRaw: String(p.role),
      telefono: (p.telefono as string) ?? '',
      cedula: (p.cedula as string) ?? '',
      contactoNombre: (p.contacto_emergencia_nombre as string) ?? '',
      contactoTelefono: (p.contacto_emergencia_telefono as string) ?? '',
      fechaIngreso: (p.fecha_ingreso as string) ?? null,
      direccion: (p.direccion as string) ?? '',
      exequatur: (p.exequatur as string) ?? '',
      licenciaVencimiento: (p.licencia_vencimiento as string) ?? null,
      activo: Boolean(p.activo),
      licenciaLabel: lic?.label ?? null,
      licenciaTono: lic?.tono ?? null,
    };
  });

  return <EmpleadosCliente empleados={empleados} />;
}
