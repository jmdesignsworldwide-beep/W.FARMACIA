# 🔬 BITÁCORA DE PRUEBAS — Sistema Farmacia Wilkins

> Documento vivo de la corrida continua (Tandas 4→20). Crece con cada tanda.
> **Honestidad primero:** lo verde es verde; lo que no se probó se escribe como
> NO probado, con el porqué. Marien lee esto al final para saber qué mirar.

## Cómo se verifica en esta corrida

- **Banco de pruebas local** (`scripts/localdb-run.sh`): un Postgres 16 con la
  **cadena completa de migraciones aplicada** (0001→last), con un shim de
  compatibilidad Supabase (roles `anon`/`authenticated`/`service_role`, esquema
  `auth`, `auth.uid()` por GUC, `pg_trgm`). Sirve para probar **idempotencia de
  migraciones, FEFO, inviolabilidad de libros y RLS** sin tocar producción.
- **Verificación estática**: `typecheck`, `lint`, `build` en verde por pieza.
- **Unit**: lógica pura (matriz de roles, cálculos) ejecutada con `tsx`.

## ⚠️ Bloqueo material de la corrida — EL PAT NO LLEGÓ

El PAT que se pasó **no está accesible en este entorno** (no aparece en variables
de entorno ni en el mensaje recibido; los secretos se redactan antes de que el
agente los vea). **Consecuencia:** no se pueden aplicar migraciones nuevas a
producción por la Management API. **Plan seguido:** cada migración se escribe como
archivo numerado en el repo y **se prueba idempotente en el Postgres local**; se
mergea el código; y se marca aquí **"NO aplicada a producción — pendiente del
PAT"**. Cuando el PAT llegue por un canal que alcance al agente (o Marien aplique
las migraciones), el esquema queda listo para aplicar de un golpe.

> **Nota T4:** las migraciones de la Tanda 4 (`0019`, `0020`) **ya estaban en
> producción** antes de esta corrida, así que el POS sí puede probarse en el
> preview. La Tanda 4 no introdujo migración nueva (su plomería es app).

---

# TANDA 4 — PUNTO DE VENTA · 2026-08-08

## ✅ Construido (7 piezas, 7 PR mergeados)

| Pieza | PR | Qué |
|---|---|---|
| 2 — La caja | #16 | Catálogo precargado en memoria, búsqueda tolerante a acentos, distribución 60/40, teclado (escribir/↑↓/Enter/Esc/F2/Supr), total con ITBIS incluido, panel de contexto |
| 3 — Equivalencias | #17 | Firma de molécula; equivalente real (verde, misma concentración) vs "casi coincide" (ámbar); un clic agrega; "No hay, pero sí tienes" cuando está en cero |
| 4 — Cobro de verdad | #18 | Efectivo con vuelto y denominaciones dominicanas; **FEFO** (parte entre lotes); **movimiento inviolable** por descuento; **gate clínico en servidor**; ITBIS gravado/exento; idempotencia |
| 5 — Anulación | #19 | Devolución al **mismo lote**, movimiento `devolucion`, venta `anulada` con motivo+responsable; motivo obligatorio; solo Dueño/Admin (`anular_ventas`) |
| 6 — ¿Cuánto le alcanza? | #20 | F3: unidades que alcanzan a un monto con ITBIS, tope por existencia, vuelto; conciencia de fraccionamiento (`permite_fraccionamiento`) |
| 7 — Venta en espera | #21 | F8 aparca con etiqueta; varios carritos vivos; retomar con un clic (consume vía UPDATE, sin DELETE por RLS) |

## 🔬 Probado (con evidencia)

- **Prueba de vida del cobro (base local).** Producto con 2 lotes (vence oct-2026
  y may-2027). Venta de 7 uds → **la venta persiste** (`estado=completada`,
  total 357.00), el **lote FEFO correcto** baja (oct 10→3), el otro queda intacto
  (may 10). Un `movimiento_inventario` tipo `venta` (−7, resultante 3) queda
  registrado. ✅
- **Anulación (base local).** Anular esa venta → lote restaurado (3→10), venta
  `estado=anulada` con motivo, `movimiento devolucion` (+7) junto al `venta` (−7)
  en el libro. ✅
- **Venta en espera (base local).** Roundtrip `jsonb`: aparcar carrito (len 1) →
  retomar consume a vacío (len 0). `RLS+FORCE` activos en `venta_en_espera`. ✅
- **Cálculo "¿cuánto le alcanza?"** coincide con el brief: RD$200 ÷ 17.80 = 11
  unidades, RD$195.80, vuelto RD$4.20. ✅
- **Estático:** `typecheck` / `lint` / `build` en verde en las 7 piezas.

## 🛡️ Los 4 críticos de la corrida — estado honesto

1. **El cajero NO puede despachar un controlado** — 🟡 **verificado por lógica y
   unidad, no por llamada HTTP en vivo.** El server action `cobrarEnEfectivo`
   rechaza si el carrito tiene un controlado/receta y el rol no tiene
   `despachar_controlados`. Test unit ejecutado (`tsx`): `can(cajero,
   despachar_controlados)=false`, `farmaceutico/dueño=true`. Como es un server
   action, la llamada directa (sin UI) pega contra ese mismo código. **Falta:**
   ejecutarlo por HTTP directo contra el preview con un usuario cajero real.
2. **Alerta cruzada de alergia** — 🔴 **NO construido** (es de la Tanda 7).
3. **Libros inviolables resisten** — 🟢 **verificado en base local.** `UPDATE` y
   `DELETE` sobre `movimiento_inventario` son **negados por la base** (trigger
   `app.block_mutations`, "Registro inviolable ADN §2.2"), aun como superusuario.
4. **Stock baja del lote correcto por FEFO** — 🟢 **verificado en base local**
   (ver prueba de vida arriba).

## 📊 Velocidad

- Búsqueda: **en memoria**, mismo enfoque que la lista de productos de la Tanda 3
  (medida allí en **16 ms sobre 5.000 productos**). **NO medida con reloj en el
  POS en esta corrida** — pendiente medir buscar→resultados, cobrar<2s y venta de
  3 productos<15s en el preview.

## ⚠️ NO probado / NO construido en la Tanda 4 (honesto)

- **End-to-end en el preview con manos** (venta real contra la Supabase de prod):
  no ejecutado por el agente. El esquema del POS sí está en prod; Marien puede
  hacer una venta real en el preview.
- **Prueba visual** (tema claro/oscuro, 390px reales): **no ejecutada** por el
  agente en esta corrida (requiere sesión con login en el preview).
- **Pago mixto** (efectivo+tarjeta+crédito): no construido — hoy solo efectivo.
  El esquema (`cobro` con varias filas) ya lo soporta.
- **Descuento de ley 352-98** e **identificación por teléfono**: no construidos —
  dependen del expediente de cliente (Tanda 7).
- **Sugerencia clínica** (antibiótico→probiótico) y **alerta de precio
  desactualizado**: no construidas — mejoras del panel, pendientes.
- **Registro de receta** (médico/exequátur/paciente) en el despacho de
  controlados: el gate existe; el formulario de receta es de la Tanda 12.
- **Advisors de Supabase**: no corridos en esta corrida (sin acceso al dashboard).

## 🐛 Fallos encontrados y corregidos

- Ninguno de comportamiento en las pruebas locales. Ajuste de proceso: se rebasó
  la rama sobre `main` para que cada PR tenga un único commit limpio por pieza.

## 🔗 PRs

#16, #17, #18, #19, #20, #21 — todos mergeados a `main` por squash. Preview de
Vercel en verde (Ready) en cada uno.
