-- ════════════════════════════════════════════════════════════════════
-- W.FARMACIA · Migración 0017 — Alinear los `false` legados con tres estados
-- ADN JM NEXUS · TANDA 3 (gate del override, docs/PENDIENTES.md)
-- ════════════════════════════════════════════════════════════════════
-- El formulario viejo escribía producto.es_controlado / requiere_receta = false
-- por DEFECTO. En el modelo de tres estados (Adenda IV §1) eso debe ser null
-- (HEREDA de la molécula). Un `false` silencioso sobre una molécula controlada
-- se saltaría el candado: cuando el semilla DIGEMAPS (Pieza 4) marque la Morfina
-- como controlada, esos productos quedarían NO controlados sin motivo ni rastro.
--
-- Esta migración limpia lo ya cargado. Es SEGURA AHORA porque todavía no hay
-- moléculas controladas: `false` y `null` tienen el mismo efecto hoy, pero `null`
-- heredará bien mañana. Solo se tocan los `false` SIN motivo (puestos por defecto,
-- no por una decisión de override — esos llevan motivo y se respetan). El alta ya
-- escribe `null` (esta pieza), así que no vuelven a aparecer `false` por defecto.
--
-- Idempotente: re-ejecutar no encuentra `false` sin motivo y no hace nada.
-- El trigger de override no se dispara (poner null no es "bajar" el candado).
-- ════════════════════════════════════════════════════════════════════

update public.producto
   set es_controlado = null
 where es_controlado = false
   and motivo_control is null;

update public.producto
   set requiere_receta = null
 where requiere_receta = false
   and motivo_receta is null;
