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

## ✅ El PAT llegó y las migraciones 0021–0024 están APLICADAS a producción

**Resuelto (2026-08-08).** Marien pasó el PAT; se aplicaron `0021`, `0022`, `0023`
y `0024` a producción por la Management API, en orden, y se verificó en la base de
producción: existen `caja_sesion`, `caja_egreso`, `secuencia_fiscal`,
`comprobante`, `cliente`, `cliente_alergia`, `alerta_alergia_evento`; la función
`public.siguiente_ncf`; **RLS FORCE en las 7 tablas**; y la FK
`venta.caja_sesion_id`. El PAT vive solo en memoria durante la corrida; Marien lo
revoca al terminar. Las notas "NO aplicada a producción" de cada tanda quedan
históricas — a partir de aquí el esquema del preview refleja lo construido.

> **Contexto previo:** al inicio de la corrida el PAT no llegaba al entorno (se
> redactaba antes de que el agente lo viera), así que 0021–0024 se probaron
> idempotentes en un Postgres local y se marcaron como no aplicadas hasta este
> punto.

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

---

# TANDA 5 — CAJA DIARIA · 2026-08-08

## ✅ Construido (PR #23)

- **Migración `0021`**: `caja_sesion` (turno: monto inicial, cierre con diferencia
  registrada, modo arranque + fecha de corte, cierre comparativo
  `total_metodo_viejo`), `caja_arqueo` (conteo por denominación dominicana,
  append-only), `caja_egreso` (motivo + autorización, append-only). RLS+FORCE en
  las tres; FK `venta.caja_sesion_id`.
- **App `/caja-diaria`**: abrir caja, resumen del turno (ventas, efectivo cobrado,
  esperado en caja), egresos (solo Dueño/Admin autoriza), cierre con arqueo por
  denominación + diferencia en vivo + cierre comparativo + notas, resumen
  «¡Caja cuadrada!».
- El **cobro del POS** ahora etiqueta la venta con el turno abierto.

## 🔬 Probado (base local)

- **Idempotencia `0021`**: cadena completa + re-aplicar **3×** sin error. ✅
- **RLS+FORCE** en `caja_sesion`, `caja_arqueo`, `caja_egreso`. ✅
- **Inviolabilidad**: `UPDATE` en `caja_egreso` **negado por la base**. ✅
- **FK** `venta.caja_sesion_id → caja_sesion`. ✅
- **Matemática del cierre**: turno inicial 1000 + venta efectivo 357 (enlazada) −
  egreso 200 → **esperado 1157**; arqueo por denominación **1157** → **diferencia
  0 (cuadra)**. La columna generada `subtotal = denominacion*cantidad` cuadra. ✅
- **Estático**: `typecheck` / `lint` / `build` en verde.

## 🛡️ Roles

- **Egreso de caja**: `registrarEgreso` rechaza en servidor si el rol no es
  Dueño/Administrador (el cajero opera la caja pero no autoriza salidas de
  efectivo). Verificado por lógica (mismo patrón `can`/rol que la Tanda 4).

## ⚠️ NO probado / pendiente

- **Migración `0021` NO aplicada a producción — pendiente del PAT.** Hasta
  aplicarla, `/caja-diaria` no funciona en el preview (faltan las tablas).
- **End-to-end en preview** (abrir/cerrar con manos): no ejecutado (schema no
  aplicado + sin sesión de login).
- **Reconocimiento del empleado** («cuadró 14 días seguidos») e **historial de
  turnos visible para el propio cajero**: no construidos aún (mejora de la vista).
- **Prueba visual** 390px / temas: no ejecutada por el agente.

## 🔗 PR

#23 — mergeado a `main` por squash.

---

# TANDA 6 — MOTOR FISCAL NCF · Pieza 1 (esquema) · 2026-08-08

## ✅ Construido

- **Migración `0022`**: `secuencia_fiscal` (rango autorizado, próximo número,
  vigencia, alerta de agotamiento), `comprobante` (entidad propia, **inviolable**,
  con campos e-CF **dormidos**: xml, código de seguridad, fecha de firma, estado
  DGII, respuesta del certificador), y **`app.siguiente_ncf(tipo)`** — asignación
  **atómica** del número (bloqueo de fila `FOR UPDATE`, `SECURITY DEFINER` con
  `search_path` fijo, `execute` revocado a `anon`). Semilla idempotente
  `configuracion.modo_fiscal='ncf'`. **NO se siembran rangos** (los carga el Dueño
  con los reales autorizados por la DGII — evita emitir NCF inválidos).

## 🔬 Probado (base local)

- **Idempotencia `0022`**: re-aplicada **3×** sin error. ✅
- **NCF atómico**: rango B02 1..3 → `B0200000001`, `B0200000002`, `B0200000003`;
  la 4ª llamada **falla** con "No hay secuencia fiscal disponible" (rango agotado).
  Dos ventas nunca toman el mismo número. ✅
- **Comprobante inviolable**: `UPDATE` **negado por la base**. ✅
- **Estático**: `typecheck` / `lint` / `build` en verde.

## ✅ Pieza 2 (PR #26) — emisión + configuración

- **Migración `0023`**: envoltorio `public.siguiente_ncf` (PostgREST no expone
  `app`), mismo blindaje (SECURITY DEFINER, search_path fijo, execute a
  `authenticated`).
- **Emisión en el cobro**: al cobrar se emite el comprobante — **B01** si hay RNC,
  **B02** consumidor final si no. Campo **RNC** en el modal de cobro; el **NCF**
  sale en el recibo. Si no hay secuencia configurada, la venta **NO se bloquea**:
  se completa sin NCF (skip con gracia).
- **Pantalla `/fiscal`** (Dueño/Admin): cargar rangos autorizados por la DGII,
  con **alerta "por agotarse"** y activar/desactivar.

## 🔬 Probado (base local)

- `0023` idempotente (3×). `public.siguiente_ncf('B02')` → `B0200000101`;
  `B01` sin rango → **error controlado** → la venta se completa **sin NCF**. ✅
- `typecheck` / `lint` / `build` en verde (`/fiscal` en el build).

## ⚠️ NO construido aún (Tanda 6)

- **Recibo** imprimible / térmico (QZ Tray) y compartible por WhatsApp.
- **Nota de crédito** (B04) para anular un comprobante.
- **Migraciones `0022`/`0023` NO aplicadas a producción — pendiente del PAT.**
- **End-to-end en preview**: no ejecutable hasta aplicar el esquema.

## 🔗 PRs

#25 (Pieza 1 — esquema) · #26 (Pieza 2 — emisión + config).

---

# TANDA 7 — CLIENTES Y ALERGIAS · Pieza 1 (esquema) · 2026-08-08

## ✅ Construido (PR #27)

- **Migración `0024`**: `cliente` (expediente ligero, identificado por **teléfono**;
  `fecha_nacimiento` habilita el descuento de ley), `cliente_alergia` (a un
  principio o a una **familia** entera), `alerta_alergia_evento` (registro
  **inviolable** de quién vio la alerta, qué decidió y por qué). RLS+FORCE en las
  tres; alergia la escribe farmacéutico+; el evento es append-only.

## 🔬 Probado (base local) — 🟢 CRÍTICO #2

- **Alerta cruzada de alergia**: paciente alérgica a **Penicilinas** (registrada
  por Amoxicilina), con **Ampicilina** en el carrito → la consulta de detección
  dispara: *«ALERTA CRUZADA: Ampicilina 500mg → familia Penicilinas»*. La
  comparación es por **familia**, no por molécula. ✅
- **Inviolabilidad**: `UPDATE` sobre `alerta_alergia_evento` **negado por la
  base**. ✅
- **Idempotencia `0024`**: re-aplicada **3×** sin error. ✅
- `typecheck` / `lint` / `build` en verde.

## ⚠️ NO construido aún (Tanda 7)

- **Integración en el POS**: identificar al cliente por teléfono, **interrumpir**
  el despacho con la alerta y **registrar la decisión** (Pieza 2). El núcleo de
  detección ya está probado; falta el flujo en pantalla.
- **Crónicos** (detección automática, ciclo, atrasados, WhatsApp) y **servicios de
  farmacia** (inyección/presión/glucosa) — piezas siguientes.
- **Migración `0024` NO aplicada a producción — pendiente del PAT.**

## 🔗 PR

#27 (Pieza 1 — esquema + detección verificada).
