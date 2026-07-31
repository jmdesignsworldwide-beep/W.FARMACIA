-- ════════════════════════════════════════════════════════════════════
-- W.FARMACIA · Migración 0011 — Firma de molécula (panel de equivalencia)
-- ADN JM NEXUS · ADENDA III §5
-- ════════════════════════════════════════════════════════════════════
-- El panel de equivalencia necesita DOS listas, nunca mezcladas:
--   • EQUIVALENTES REALES   = misma firma completa (principios + concentración
--                             + forma + vía). Incluye marcas alternativas
--                             (misma firma, distinto laboratorio).
--   • "CASI COINCIDEN"       = misma MOLÉCULA (mismos principios + forma + vía)
--                             pero DISTINTA concentración → requiere que el
--                             farmacéutico verifique. Nunca se venden como
--                             equivalentes sin revisión.
--
-- Para resolver ambas listas con UNA sola consulta indexada (<500 ms, §5),
-- guardamos una "firma de molécula": la firma SIN la concentración. Así:
--   where firma_molecula = <la del producto>  ->  trae los dos grupos.
--   partición en el cliente: firma_equivalencia igual = real; distinta = casi.
--
-- Se mantiene por trigger, en el MISMO camino que firma_equivalencia
-- (app.set_firma), sin recursión ni doble cálculo.
-- ════════════════════════════════════════════════════════════════════

-- ── Columna mantenida por trigger (como firma_equivalencia) ──
alter table public.producto
  add column if not exists firma_molecula text;
comment on column public.producto.firma_molecula is
  'Firma de equivalencia SIN concentración (principios + forma + vía). La usa el panel para separar equivalentes reales de "casi coinciden" (concentración distinta) con una sola consulta indexada. Mantenida por trigger (Adenda III §5).';

-- Índice para la consulta única del panel.
create index if not exists idx_producto_molecula on public.producto (firma_molecula);

-- ── Firma de molécula: principios (sin concentración) + forma + vía ──
-- Mismo formato que app.firma_de pero omitiendo la concentración normalizada,
-- de modo que dos productos de la misma molécula (aunque cambie la dosis)
-- compartan firma_molecula. Un producto incompleto (sin forma/vía/principios)
-- produce una firma vacía/parcial y NO matchea — igual que la firma completa.
create or replace function app.molecula_de(p_producto uuid, p_forma uuid, p_via uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select string_agg(clave, '|' order by clave)
    from (
      select distinct ppa.principio_activo_id::text as clave
      from public.producto_principio_activo ppa
      where ppa.producto_id = p_producto
    ) s
  ), '')
  || '#' || coalesce(p_forma::text, '')
  || '#' || coalesce(p_via::text, '');
$$;

-- ── El trigger existente ahora fija AMBAS firmas en la misma pasada ──
-- Un solo recálculo por INSERT/UPDATE (barato, misma fila). El trigger del
-- puente (poke_producto_firma) ya "toca" el producto al cambiar principios,
-- así que firma_molecula se recalcula por el mismo camino, sin cambios extra.
create or replace function app.set_firma()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.firma_equivalencia :=
    app.firma_de(new.id, new.forma_farmaceutica_id, new.via_administracion_id);
  new.firma_molecula :=
    app.molecula_de(new.id, new.forma_farmaceutica_id, new.via_administracion_id);
  return new;
end;
$$;

-- ── Endurecimiento de ejecución (igual que firma_de, §5.3 #10) ──
-- SECURITY DEFINER: no ejecutable por public. El trigger corre como su dueño.
revoke execute on function app.molecula_de(uuid, uuid, uuid) from public;
grant execute on function app.molecula_de(uuid, uuid, uuid) to authenticated, service_role;

-- ── Backfill: refresca la firma de todos los productos existentes ──
-- Reejecuta el trigger set_firma (BEFORE UPDATE) para poblar firma_molecula
-- en las filas ya cargadas, sin tocar su contenido.
update public.producto set updated_at = now();
