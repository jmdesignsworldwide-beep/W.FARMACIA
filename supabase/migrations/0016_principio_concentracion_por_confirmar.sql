-- ════════════════════════════════════════════════════════════════════
-- W.FARMACIA · Migración 0016 — Principio conocido, concentración por confirmar
-- ADN JM NEXUS · TANDA 3 · Pieza 3 (importador — enlace clínico inferido)
-- ════════════════════════════════════════════════════════════════════
-- Decisión de Marien (2026-08-01): al importar 5,000 productos, si entran SIN
-- principio activo la equivalencia, la alerta de alergia y la herencia de
-- controlados quedan dormidas para todos, y arreglarlo después es 5,000 veces a
-- mano. El importador debe INFERIR el principio del nombre y enlazarlo.
--
-- Pero un producto puede tener el **principio conocido y la concentración POR
-- CONFIRMAR**. Eso es mejor que no tener nada: la herencia de controlados y la
-- alerta de alergia usan el principio (la molécula), no la concentración; y la
-- equivalencia por molécula (`firma_molecula`) tampoco depende de la dosis. La
-- equivalencia exacta espera a que se confirme la concentración; hasta entonces
-- la `firma_equivalencia` queda incompleta ('?'), que ya se maneja.
--
-- Por eso se relaja la restricción de concentración en el enlace clínico, y se
-- marca lo INFERIDO por el importador como distinto de lo confirmado a mano.
-- ════════════════════════════════════════════════════════════════════

-- La concentración deja de ser obligatoria en el enlace producto↔principio.
alter table public.producto_principio_activo
  alter column concentracion_valor  drop not null,
  alter column concentracion_unidad drop not null;

-- Marca de origen del enlace: inferido por el importador vs confirmado a mano.
alter table public.producto_principio_activo
  add column if not exists inferido boolean not null default false;
comment on column public.producto_principio_activo.inferido is
  'true = el importador infirió este principio/concentración desde el nombre (propuesta por confirmar); false = confirmado a mano. Distingue lo inferido de lo confirmado (Adenda II §1).';

-- Nota: `concentracion_normalizada` es una columna generada por app.conc_norm.
-- Esa función ya es NULL-safe (STRICT / null propaga), así que con valor null la
-- normalizada queda null y la firma de equivalencia usa '?' (incompleta). La
-- firma de MOLÉCULA no depende de la dosis: el principio cuenta para herencia y
-- alergia igual. (Verificado en local antes del PAT; no se toca conc_norm.)
