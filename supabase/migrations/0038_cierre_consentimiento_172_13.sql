-- ════════════════════════════════════════════════════════════════════
-- W.FARMACIA · Migración 0038 — CIERRE §2.6 · Consentimiento y datos (Ley 172-13)
-- ADN JM NEXUS · el dato de salud es del paciente; se guarda con su permiso
-- ════════════════════════════════════════════════════════════════════
-- Consentimiento informado por cliente (con fecha, revocable) + opción de NO recibir
-- mensajes (opt-out respetado en todo el sistema). El derecho de acceso lo cubre el
-- expediente (lo que se guarda de él) y el audit_log (quién accedió).
-- ════════════════════════════════════════════════════════════════════

alter table public.cliente add column if not exists consentimiento_datos boolean not null default false;
alter table public.cliente add column if not exists consentimiento_en    timestamptz;
alter table public.cliente add column if not exists acepta_mensajes      boolean not null default true;

comment on column public.cliente.consentimiento_datos is 'Consentimiento informado del paciente para guardar sus datos de salud (Ley 172-13). Revocable.';
comment on column public.cliente.consentimiento_en    is 'Fecha en que el cliente dio (o revocó) el consentimiento.';
comment on column public.cliente.acepta_mensajes      is 'Opt-out: si es false, el sistema NO ofrece enviarle mensajes. Respetado en todo el sistema.';
