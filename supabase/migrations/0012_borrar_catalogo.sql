-- ════════════════════════════════════════════════════════════════════
-- W.FARMACIA · Migración 0012 — Borrado seguro de vocabulario maestro
-- ADN JM NEXUS · ADENDA III §3/§4
-- ════════════════════════════════════════════════════════════════════
-- La pantalla de catálogos necesita BORRAR una entrada mal escrita (un error
-- de dedo que, sin borrado, queda para siempre). Borrar vocabulario maestro es
-- delicado —si desaparece una forma farmacéutica tiene que haber rastro— así
-- que el borrado cumple TRES condiciones, y se resuelve por RLS (no por una
-- función SECURITY DEFINER expuesta a la API, que el Security Advisor marca):
--
--   1. ROL VALIDADO EN LA BASE. Una política RLS de DELETE solo para
--      Dueño/Administrador. Da igual que se llame por el botón o por una
--      llamada directa a la API: quien no tiene el rol ve 0 filas — la RLS lo
--      filtra, no borra nada.
--   2. CHEQUEO DE USO ATÓMICO. No se consulta "¿está en uso?" y luego se borra.
--      El DELETE se intenta directo y el FK RESTRICT es la garantía atómica: si
--      alguien lo referencia, aunque sea en ese instante, el DELETE se rechaza
--      (23503). El conteo para el mensaje se calcula DESPUÉS, solo para avisar.
--   3. RASTRO CON ACTOR REAL. El DELETE corre con la sesión del usuario, así
--      que dispara app.audit() y queda en audit_log con QUIÉN (auth.uid()) y
--      CUÁNDO. (Un service_role dejaría el actor en NULL — por eso NO se usa.)
--
-- 0007 había revocado DELETE de estos catálogos (modelo de flag `activo`).
-- Aquí se re-otorga DELETE a authenticated, PERO gobernado por la política:
-- el grant sin política no borra nada; la política es la que manda.
-- ════════════════════════════════════════════════════════════════════

-- Limpia cualquier versión previa de la función (primer intento la creó).
drop function if exists app.borrar_valor_catalogo(text, uuid);
drop function if exists public.borrar_valor_catalogo(text, uuid);

do $$
declare t text;
begin
  foreach t in array array['principio_activo', 'forma_farmaceutica', 'via_administracion']
  loop
    -- Se re-otorga DELETE, pero la política de abajo es la que decide.
    execute format('grant delete on public.%I to authenticated;', t);
    -- Política DELETE: solo Dueño/Administrador. (select ...) para que se
    -- evalúe una vez (initplan), no por fila (evita el aviso auth_rls_initplan).
    execute format('drop policy if exists %1$s_admin_delete on public.%1$s;', t);
    execute format($f$create policy %1$s_admin_delete on public.%1$s
      for delete to authenticated
      using ((select app.has_role('dueno', 'administrador')));$f$, t);
  end loop;
end $$;
