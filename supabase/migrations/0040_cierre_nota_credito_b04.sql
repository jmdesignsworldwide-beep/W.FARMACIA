-- ════════════════════════════════════════════════════════════════════
-- W.FARMACIA · Migración 0040 — CIERRE §4.2 · Nota de crédito B04
-- ADN JM NEXUS · un comprobante no se edita ni se borra; se anula con nota de crédito
-- ════════════════════════════════════════════════════════════════════
-- El comprobante es INVIOLABLE (0022). Anular una venta con NCF NO edita el original:
-- emite un comprobante NUEVO tipo B04 que lo modifica. La B04 debe referenciar el NCF
-- original (obligación DGII). Se guarda en ncf_modificado. El original queda intacto.
-- ════════════════════════════════════════════════════════════════════

alter table public.comprobante add column if not exists ncf_modificado text;
comment on column public.comprobante.ncf_modificado is 'NCF del comprobante que esta nota de crédito (B04/E34) modifica. Obligatorio DGII para B04. El original nunca se edita.';
create index if not exists idx_comprobante_ncf_modificado on public.comprobante (ncf_modificado) where ncf_modificado is not null;
