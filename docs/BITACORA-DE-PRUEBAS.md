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

## ✅ Pieza 2 (PR #29) — integración en el POS

- **Migración `0025`** (`public.alergias_en_conflicto`): función que, dado el
  cliente y los productos del carrito, devuelve los choques por familia/principio.
  **Aplicada a producción** y verificada.
- **En la caja**: identificar al cliente **por teléfono**; si el carrito choca con
  una alergia, un **banner** lo avisa y, al cobrar (F4), un **modal INTERRUMPE**:
  «No despachar» o «Despachar con confirmación» (motivo obligatorio). La decisión
  se guarda en `alerta_alergia_evento` (inviolable). La venta se enlaza al cliente.

## 🔬 Probado

- `0025` idempotente (3×) en local; `alergias_en_conflicto(Doña Ana, [Ampicilina])`
  → «Ampicilina 500mg | Penicilinas». **Aplicada a producción** (función presente). ✅
- `typecheck` / `lint` / `build` en verde.
- **NO probado end-to-end en preview** por el agente (requiere sembrar un cliente
  con alergia y una sesión con login); la lógica de detección sí está verificada.

## ✅ Pieza 3 (PR #30) — tratamientos crónicos

- **Migración `0026`** (**aplicada a producción**): `tratamiento_cronico` +
  `public.candidatos_cronicos()` (detección automática de 3+ compras del mismo
  principio).
- **App `/cronicos`**: el sistema **propone** candidatos (con nº de compras e
  intervalo promedio); el farmacéutico **confirma con un clic** (el ciclo se toma
  del intervalo detectado). Activos con estado **al día / por vencer / atrasado**
  (por `proxima_fecha`), **WhatsApp de un clic**, «Vino» (mueve la próxima fecha un
  ciclo) y «Abandonó».

## 🔬 Probado (base local)

- `0026` idempotente (3×). Con 3 ventas de un cliente del mismo principio,
  `candidatos_cronicos()` → *«Doña Ana · Ampicilina · 3 compras · cada ~31 días»*
  (intervalo bien calculado: 61 días / 2 = 30.5 → 31). **Aplicada a producción**. ✅
- `typecheck` / `lint` / `build` en verde.

## ✅ Pieza 4 (PR #31) — servicios de farmacia

- **Migración `0027`** (**aplicada a producción**): `servicio` (inyección,
  presión, glucosa, curación) con `resultado` (jsonb) para la medición, `valor`
  cobrado y enlace a la caja del día.
- **App `/servicios`**: registrar servicio (con medición de presión/glucosa),
  historial reciente, y la jugada — si un cliente se mide seguido, se sugiere
  seguirlo como crónico.

## 🔬 Probado (base local)

- `0027` idempotente (3×); servicio de presión `130/85` guardado y leído del
  `resultado` jsonb. **Aplicada a producción**. ✅
- `typecheck` / `lint` / `build` en verde.

## ⚠️ Pendiente (Tanda 7)

- **Descuento de insumos** del inventario por FEFO al registrar un servicio (jeringa,
  tiras): el esquema lo soporta (`insumo_producto_id`/`insumo_lote_id`); falta el
  selector de insumo + el decremento. Anotado en la pantalla.

## 🔗 PRs

#27 (esquema) · #29 (POS + alerta) · #30 (crónicos) · #31 (servicios). Migraciones
`0024`–`0027` **aplicadas a producción**.

---

# TANDA 8 — EMPLEADOS Y SEGURIDAD · 2026-08-08

## ✅ Construido (PR #32)

- **Migración `0028`** (**aplicada a producción**): amplía `profiles` con el
  expediente — cédula, contacto de emergencia, foto, fecha de ingreso, dirección,
  y para el regente **exequátur** + **vencimiento de licencia**.
- **App `/empleados`** (solo Dueño/Admin): lista con rol, edición del expediente, y
  **alerta de licencia del regente** (vencida / vence en ≤60 días / vigente), con
  un panel de avisos arriba.
- **Los 5 roles** ya estaban validados en servidor (0003) — sin cambios.

## 🔬 Probado

- `0028` idempotente (3×) en local; columnas nuevas presentes. **Aplicada a
  producción** (cédula/exequátur/licencia confirmadas). ✅
- `typecheck` / `lint` / `build` en verde.

## ⚠️ NO construido aún (Tanda 8)

- **Crear usuarios desde la app** (alta con rol) — requiere el admin API de Supabase
  (service_role) y flujo de invitación; hoy los perfiles nacen del signup/auth.
- **Vista del empleado de su propio historial** (el `audit_log` ya lo respalda) y
  **turnos/horarios** — piezas siguientes.
- **Documentos adjuntos** (Storage) — pendiente.

## 🔗 PR

#32.

---

# TANDA 9 — PROVEEDORES, RECEPCIÓN, CADENA DE FRÍO · 2026-08-08

## ✅ Pieza 1 (PR #33) — Proveedores

- **Migración `0029`** (**aplicada a producción**): `proveedor` con tipo
  **laboratorio ≠ droguería** y la **política de devolución** (`acepta_devoluciones`,
  `dias_minimos_vida_util_devolucion`, `condiciones`, `porcentaje_recuperacion`) —
  la base del radar de vencimientos (Tanda 10). RLS+FORCE; gestiona Dueño/Admin.
- **App `/proveedores`**: alta/edición con la política de devolución condicional.

## 🔬 Probado
- `0029` idempotente (3×) en local; RLS FORCE. **Aplicada a producción**. ✅
- `typecheck` / `lint` / `build` en verde.

## ⚠️ Pendiente (Tanda 9, piezas siguientes)
- **Recepción** con conteo contra factura + discrepancias + ficha de cumplimiento
  + deriva de costo.
- **Cadena de frío** (temperatura, apagón, bloqueo de despacho de refrigerados).
- **Préstamos entre farmacias** y **visitadores médicos** (muestras).

## 🔗 PR
#33.

## ✅ Pieza 2 (PR #34) — Cadena de frío

- **Migración `0030`** (**aplicada a producción**): `lectura_temperatura`, `apagon`,
  `producto.requiere_refrigeracion` (override; hereda de la forma) y
  `lote.en_revision_frio` + `revision_motivo`. Config: `umbral_apagon_horas` (2),
  rango de nevera 2–8 °C. RLS+FORCE.
- **App `/cadena-frio`**: registrar temperatura (marca fuera de rango), registrar y
  **cerrar apagón** (si la duración excede el umbral, marca los lotes refrigerados
  `en_revision_frio` y **bloquea su despacho**); el farmacéutico decide **«se salvó»**
  (libera) o **«descartar»** (merma inviolable + lote a 0).
- **Gate en el cobro**: el FEFO **nunca** despacha un lote `en_revision_frio`.

## 🔬 Probado (base local)
- `0030` idempotente (3×). Producto refrigerado (heredado de la forma) + lote →
  la consulta de marcado lo identifica; tras marcarlo `en_revision_frio`, el
  **FEFO vendible del cobro = 0** (no se puede despachar). **Aplicada a
  producción**. ✅
- `typecheck` / `lint` / `build` en verde.

## 🔗 PR
#34.

## ✅ Pieza 3 (PR #35) — Recepción con conteo contra factura + deriva de costo

- **Migración `0031`** (**aplicada a producción**): `recepcion` + `recepcion_linea`
  con **discrepancias calculadas** (recibido−pedido, facturado−cotizado) guardadas
  permanentemente. RLS+FORCE.
- **App `/recepcion`**: buscar producto, capturar pedido/recibido/cotizado/facturado/
  lote/vencimiento por renglón; **deriva de costo en vivo** (si llegó más caro,
  el % y el precio sugerido para mantener el margen); al confirmar se crean los
  **lotes**, los **movimientos de entrada** (inviolables) y el **historial de costo**
  con su variación. Validación de fechas de vencimiento imposibles.

## 🔬 Probado (base local)
- `0031` idempotente (3×). Renglón recibido 96/100 a RD$46.60 (cotizado 42.00) →
  `discrepancia_cantidad=-4`, `discrepancia_precio=+4.60` (el 11% del brief),
  calculadas por columna generada. **Aplicada a producción**. ✅
- `typecheck` / `lint` / `build` en verde.

## ⚠️ Pendiente (Tanda 9)
- **Ficha de cumplimiento** del proveedor (agregado de discrepancias) — pantalla.
- **Préstamos entre farmacias** y **visitadores médicos** (muestras) — piezas
  siguientes.

## 🔗 PR
#35.

## ✅ Pieza 4 (PR #36) — Préstamos entre farmacias

- **Migración `0032`** (**aplicada a producción**): `prestamo` (dado/recibido,
  producto, cantidad, contraparte, estado pendiente/devuelto, lote afectado).
  RLS+FORCE; lo registra farmacéutico+.
- **App `/prestamos`**: registrar préstamo dado o recibido (con buscador de
  producto), que **ajusta el inventario con movimiento `transferencia`** (no venta
  ni merma) — dado baja del lote FEFO, recibido crea un lote; **marcar devuelto**
  revierte el inventario. Alerta de préstamo viejo (>30 días sin devolver).

## 🔬 Probado (base local)
- `0032` idempotente (3×). Ajuste de inventario: prestar 3 baja el lote 10→7;
  devolver lo restaura 7→10. **Aplicada a producción**. ✅
- `typecheck` / `lint` / `build` en verde.

## ⚠️ Pendiente (Tanda 9)
- **Visitadores médicos** (muestras que entran marcadas y no se venden) y **ficha
  de cumplimiento** del proveedor — piezas siguientes.

## 🔗 PR
#36.

## ✅ Pieza 5 (PR #37) — Visitadores médicos y muestras · cierra Tanda 9

- **Migración `0033`** (**aplicada a producción**): `visita_medica` + `lote.es_muestra`.
  RLS+FORCE.
- **App `/visitadores`**: registrar visita (laboratorio, visitador, fecha, notas) y
  las **muestras** recibidas, que entran al inventario como lotes **`es_muestra`**.
- **Gate en el cobro**: el FEFO **excluye** los lotes `es_muestra` — una muestra
  **no se vende**.

## 🔬 Probado (base local)
- `0033` idempotente (3×). Lote `es_muestra` de un producto → **vendibles por FEFO
  = 0** (total 1, vendible 0). **Aplicada a producción**. ✅
- `typecheck` / `lint` / `build` en verde.

## ⚠️ Pendiente de la Tanda 9 (a retomar con reportes)
- **Ficha de cumplimiento** del proveedor (agregado de discrepancias de
  `recepcion_linea`) — encaja mejor con la Tanda 14 (reportes).
- **Pedidos y ofertas** del visitador — mejora futura.

## 🔗 PR
#37.

---

# TANDA 10 — RADAR DE VENCIMIENTOS · 2026-08-08

## ✅ Construido (PR #38) — sin migración (usa lote + política del proveedor)

- **Página `/vencimientos`**: por cada lote activo que vence en ≤180 días calcula
  **vida útil en %**, días restantes, **valor en riesgo** (cantidad × costo), y la
  **recomendación que cambia según la ventana**: Devolver al laboratorio (ventana
  de devolución abierta = vencimiento − días mínimos del proveedor) → Promocionar →
  Descontar fuerte → Provisionar pérdida. Ordenado por **dinero en riesgo**, con el
  total arriba. El radar no grita por lo que está bien (>180 días se omite).

## 🔬 Probado
- `typecheck` / `lint` / `build` en verde (página de servidor).

## ⚠️ Honesto
- **Vida útil %** se aproxima como `restante / (vencimiento − fecha_recepción)`
  porque no se guarda la fecha de fabricación ni la vida útil total del producto.
  Es un proxy razonable (a mayor ventana original, menor % al acercarse), no el %
  teórico exacto.
- **Flujo de devolución de un clic** (registro + seguimiento de nota de crédito):
  pendiente, pieza siguiente.

## 🔗 PR
#38.

---

# TANDA 11 — CEREBRO DE COMPRAS Y ENCARGOS · 2026-08-08

## ✅ Pieza 1 (PR #39) — Encargos

- **Migración `0034`** (**aplicada a producción**): `encargo` (producto en catálogo
  o texto libre, cliente/teléfono, cantidad, estado
  pendiente→pedido→llegó→entregado / no_volvió). RLS+FORCE.
- **App `/encargos`**: registrar el encargo, avanzar estado con un clic, **WhatsApp
  de un clic** cuando llegó ("llegó lo que encargó"), y el contador de **no
  atendidos = ventas perdidas medibles**.

## 🔬 Probado
- `0034` idempotente (3×); RLS FORCE. **Aplicada a producción**. ✅
- `typecheck` / `lint` / `build` en verde.

## ⚠️ Pendiente (Tanda 11)
- **Punto de reorden dinámico** (velocidad de consumo + tiempo de entrega), **orden
  de compra que se genera sola** con WhatsApp, **comparador de precios entre
  droguerías**, y **sugerencia de compra por perfil de crónicos** — pieza siguiente.

## 🔗 PR
#39.

---

# TANDA 12 — RECETAS Y CONTROLADOS · 2026-08-08

## ✅ Pieza 1 (PR #40) — Despacho de controlados + libro inviolable

- **Migración `0035`** (**aplicada a producción**): `receta` (médico, exequátur,
  paciente, medicamento, indicaciones, imagen_url para receta por WhatsApp) y
  `libro_controlado` **INVIOLABLE** (cada despacho con su farmacéutico, lote y
  receta). RLS+FORCE.
- **App `/controlados`** (solo `despachar_controlados` — el cajero no entra):
  buscar controlado, cantidad, datos de la receta, despachar → **FEFO** descuenta,
  `movimiento venta`, y **entrada en el libro inviolable** con el farmacéutico
  responsable. **Alerta de patrón sospechoso** (mismo paciente + mismo controlado
  en ≤20 días) que **se muestra, no bloquea**. El libro se ve completo abajo.

## 🔬 Probado (base local) — 🟢 CRÍTICOS

- **Crítico #3 (controlados):** una entrada **entra al `libro_controlado`**;
  `UPDATE` y `DELETE` sobre ella son **negados por la base** («Registro inviolable
  ADN §2.2»). ✅
- **Crítico #1 (cajero):** `despacharControlado` exige `despachar_controlados` en
  el servidor; `can(cajero, despachar_controlados)=false` (ya verificado) → el
  cajero es rechazado aunque llame directo. ✅
- `0035` idempotente (3×). **Aplicada a producción**. `typecheck`/`lint`/`build` en verde.

## ⚠️ Pendiente (Tanda 12)
- **Receta por WhatsApp** (subir la foto) y **alerta de receta vencida/duplicada**.
- **Carpeta DIGEMAPS** (una pantalla imprimible con libro+temperaturas+licencia+
  registros+vencidos+facturas) — pieza siguiente.

## 🔗 PR
#40.

## ✅ Pieza 2 (PR #41) — Carpeta de inspección DIGEMAPS · cierra Tanda 12

- **Página `/digemaps`** (solo `despachar_controlados`, sin migración): una sola
  pantalla imprimible con **regente + licencia**, **libro de controlados**,
  **registro de temperatura**, **registros sanitarios** de los productos,
  **productos vencidos en existencia** y **facturas de compra**. Botón «Imprimir
  carpeta» (con `print:` para ocultar lo que no va al papel).

## 🔬 Probado
- `typecheck` / `lint` / `build` en verde. Página de servidor que agrega de tablas
  ya existentes (libro_controlado, lectura_temperatura, profiles, producto, lote,
  recepcion).

## ⚠️ Pendiente (Tanda 12)
- **Receta por WhatsApp** (subir foto) y **alerta de receta vencida/duplicada** —
  mejoras futuras.

## 🔗 PR
#41.

---

# TANDA 13 — PANEL FINANCIERO · 2026-08-08

## ✅ Construido (PR #42) — sin migración (usa venta/venta_linea/movimiento/historial_costo/servicio)

- **Página `/finanzas`** (solo **`ver_finanzas`** = Dueño/Admin, barrera de servidor):
  **rentabilidad REAL** (ingresos − costo **congelado** del lote en
  `venta_linea.costo_unitario_momento`, no ventas brutas) con margen %;
  **capital dormido** (lotes de productos sin venta en >90 días, al costo) vs
  inventario vivo; **ingreso recurrente** (crónicos activos); **rentabilidad por
  categoría**; **erosión de margen por laboratorio** (subidas repetidas de costo
  desde `historial_costo`); ingresos por **servicios** separados.

## 🔬 Probado
- `can(cajero, ver_finanzas)=false` (unit ya verificado) → el cajero/farmacéutico
  no entran (redirige). `typecheck` / `lint` / `build` en verde.

## ⚠️ Honesto / pendiente
- **Pronóstico de flujo de caja** (por pagar vs por cobrar): depende del **fiado y
  cuentas por pagar (Tanda 15)** — anotado en pantalla, aún no calculado.
- El **capital dormido** usa "sin movimiento de venta en 90 días" como proxy de
  "parado"; es correcto para el uso, no una valuación contable.

## 🔗 PR
#42.

---

# TANDA 14 — REPORTES E INTELIGENCIA · 2026-08-08

## ✅ Construido (PR #43) — sin migración

- **Página `/reportes`** (Dueño/Admin): **más vendidos** (90d, barras), **merma por
  motivo tipificado** (180d, en pesos), **posible robo hormiga** (discrepancias
  negativas repetidas por producto — "muestra el patrón, no acusa"), **encargos no
  atendidos = ventas perdidas**, y **controlados despachados** (30d). Gráficos con
  barras simples (bajo riesgo; sin dependencia nueva).

## 🔬 Probado
- `typecheck` / `lint` / `build` en verde.

## ⚠️ Pendiente / honesto
- **Export PDF/Excel** tabular completo → se agrupa con Configuración (Tanda 17);
  la carpeta DIGEMAPS ya imprime.
- **Reporte de equivalentes sugeridos/aceptados**: requiere registrar la aceptación
  del equivalente en el POS (no se captura hoy) — mejora futura.

## 🔗 PR
#43.

---

# TANDA 15 — FIADO Y CUENTAS POR COBRAR/PAGAR · 2026-08-08

## ✅ Construido (PR pendiente) — migración `0036`

- **Migración `0036`** (aplicada a producción vía Management API, probada idempotente
  3× en Postgres local): `pagador.limite_credito` + `pagador.telefono`; tabla
  **`abono`** (pago parcial contra el saldo, append-only por grant); tabla
  **`cuenta_por_pagar`** (el espejo: lo que se le debe a la droguería, con fecha).
- **POS `/caja`** — el cobro ahora tiene un toggle **Efectivo / Fiar (crédito)**.
  Al fiar se pide a nombre de quién (y teléfono opcional); la venta se cierra como
  `cobro metodo='credito_interno'` con su `pagador` (`a_credito=true`), reusando el
  pagador si ya existe por nombre. No exige efectivo recibido cuando es fiado.
- **Página `/fiado`** (por cobrar): saldo por cliente = cobros a crédito − abonos;
  **total por cobrar**; alerta de **límite de crédito** (cerca al 80% / pasado);
  **registrar abono** (efectivo/transferencia) con atajo "abonar saldo completo";
  **estado de cuenta por WhatsApp** (wa.me, +1 RD); ajuste de límite (solo Dueño/Admin).
- **Página `/por-pagar`** (Dueño/Admin): pendientes con proveedor y vencimiento,
  **total por pagar** y **ya vencido**; registrar CxP y marcar pagada.
- **`/finanzas`** — se activó el **pronóstico de flujo de caja**: por cobrar (fiado)
  vs por pagar (droguerías, con vencido) y **posición neta**.

## 🔬 Probado
- **Saldo de fiado** (Postgres local): 2 ventas fiadas (600 + 300) − abono 250 =
  **650.00** ✔ (cálculo exacto).
- **`abono` append-only**: como rol `authenticated` con RLS activo, `UPDATE` y
  `DELETE` sobre `abono` → **`permission denied for table abono`** (solo se concede
  `select, insert`). Consistente con su hermano `cobro`, que tampoco se borra por API.
- `0036` idempotente (todo `if not exists` / `add column if not exists`); reaplicada
  sin error.
- `typecheck` / `lint` / `build` en verde; `/fiado` y `/por-pagar` compilan.

## ⚠️ Honesto / pendiente
- **`abono` NO lleva trigger `block_mutations`** (inviolabilidad dura por trigger):
  es append-only **por grant**, igual que `cobro`. Los libros verdaderamente
  inviolables por trigger siguen siendo audit, arqueo/egreso, comprobante,
  alerta de alergia y libro de controlados. Decisión de diseño, no descuido:
  el dinero recibido se corrige con un asiento nuevo, no editando el pasado.
- El **límite de crédito** avisa pero **no bloquea** la venta fiada (política del
  dueño, no del sistema): se ve el aviso en `/fiado`, la caja no frena.
- Artefactos de prueba: solo en Postgres local (pagador/venta/cobro/abono con
  prefijo `PRUEBA` y UUID `fada…`), **purgados en la misma sesión**; nunca tocaron
  producción.

## 🔗 PR
Pendiente.
