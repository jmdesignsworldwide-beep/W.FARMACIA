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

---

# TANDA 16 — DELIVERY (ENTREGAS A DOMICILIO) · 2026-08-08

## ✅ Construido (PR pendiente) — migración `0037`

- **Migración `0037`** (aplicada a producción vía Management API — `HTTP 201`,
  verificada: tabla `entrega`, 3 políticas RLS, enum `estado_entrega`; probada
  idempotente 3× en Postgres local): tabla **`entrega`** (destinatario, dirección,
  referencia "la casa amarilla al lado del colmado", teléfono, motorista, estado,
  contra_entrega + monto, cobrado + método, motivo de no entrega, sellos de tiempo).
  Máquina de estados operativa (no inviolable), **auditada** en cada cambio.
- **Página `/delivery`** con **dos caras según el rol**:
  - **Mostrador** (Dueño/Admin/Farmacéutico/Cajero): crea la entrega (a nombre de,
    dirección, referencia, teléfono, contra entrega + monto), **asigna/reasigna
    motorista** desde la lista, y ve **en curso** + **cerradas recientes**.
  - **Motorista**: ve **solo las suyas**; botones grandes (móvil) **Voy en camino →
    Entregado / No pude**; **link a Google Maps**, **llamar** y **WhatsApp**; si es
    contra entrega, confirma **cuánto cobró y cómo**.

## 🔬 Probado (Postgres local, con RLS activa como rol `authenticated`)

- **Aislamiento por motorista**: Moto A ve **1** entrega (la suya), **no** ve la de
  Moto B (**0** filas). Puede mover **la suya** a `en_camino` (UPDATE 1); el intento
  sobre **la ajena** afecta **0** filas (RLS la oculta). ✔
- `0037` idempotente (enum con `if not exists`, tabla `if not exists`, políticas
  `drop/create`); reaplicada 3× sin error.
- `typecheck` / `lint` / `build` en verde; `/delivery` compila (5.58 kB).

## ⚠️ Honesto / pendiente

- **La entrega es logística sobre una venta ya cobrada en caja.** La **contra
  entrega** registra en la propia entrega que el motorista cobró (monto + método);
  ese **efectivo se cuadra en el arqueo de caja** cuando el motorista lo entrega —
  no se crea un segundo asiento de `cobro` para no duplicar el dinero. Si mañana se
  quiere "venta a domicilio sin pasar por caja", se conecta ahí (hueco dejado:
  `entrega.venta_id`).
- **Sin geolocalización en vivo** del motorista (fuera de alcance); el seguimiento
  es por estado (pendiente / en camino / entregado / no entregada).
- Artefactos de prueba: solo Postgres local (2 usuarios `@wfarmacia-test.local`,
  perfiles y entregas `PRUEBA`). Entregas y perfiles **purgados**; los 2 `auth.users`
  quedan retenidos por el FK del `audit_log` (inviolable — su corte se marca, no se
  borra), y el DB local es efímero. **Nada tocó producción.**

## 🔗 PR
Pendiente.

---

# TANDA 17 · PIEZA 1 — CONFIGURACIÓN (AJUSTES) · 2026-08-08

## ✅ Construido (PR pendiente) — SIN migración (usa `configuracion` de 0020)

- **Página `/ajustes`** (solo `configurar_sistema` = Dueño/Admin), sobre la tabla
  clave-valor **`configuracion`** que ya existía:
  - **Identidad de la farmacia**: nombre, RNC, dirección, teléfono.
  - **Mensaje del recibo** (pie del recibo).
  - **Avisos y umbrales**: radar de vencimiento (días de anticipación), recordar
    crónico (días antes), umbral de discrepancia de conteo (RD$).
  - **Farmacia de turno**: interruptor 24h con rango de fechas opcional.
- **Ajuste consumido de verdad**: el **radar de `/vencimientos`** ahora lee
  `dias_alerta_vencimiento` (default 180) en vez de la constante fija. Junto con
  `umbral_discrepancia_conteo` (que ya se consumía), son **dos** ajustes vivos —
  la pantalla no es decorativa.

## 🔬 Probado
- **Upsert idempotente** del ajuste (Postgres local): guardar la misma clave dos
  veces (120 → 200) deja **1 sola fila** con el último valor (`on conflict
  (clave, sucursal_id) do update`). ✔
- `typecheck` / `lint` / `build` en verde; `/ajustes` (3.22 kB) y `/vencimientos`
  compilan.

## ⚠️ Honesto / pendiente
- **Identidad, mensaje de recibo y `dias_alerta_cronico` se GUARDAN** pero su
  consumo pleno es incremental: la identidad/mensaje alimentarán el **recibo
  imprimible** (pieza diferida de T6) y `dias_alerta_cronico` el recordatorio de
  `/cronicos`. Se anota como cableado pendiente, no como hecho.
- **Farmacia de turno**: se guarda; el **banner en el dashboard** se coloca en la
  Tanda 18 (dashboard vivo), que reconstruye esa pantalla (hoy es un stub en ceros).
- Artefacto de prueba: solo Postgres local (clave `dias_alerta_vencimiento` de
  prueba), **purgado en la misma sesión**.

## 🔗 PR
Pendiente (Tanda 17 · Pieza 1).

---

# TANDA 17 · PIEZA 2 — EXPORT / RESPALDO (CSV) · 2026-08-08

## ✅ Construido (PR pendiente) — SIN migración

- **Route handler `GET /export/[recurso]`** (primer route handler del proyecto):
  descarga **CSV con BOM** (Excel/Sheets respetan los acentos) para cinco recursos,
  cada uno con su **barrera de capacidad en el servidor**:
  - `inventario` (gestionar_inventario), `ventas` (ver_finanzas),
    `clientes` (ver_operacion), `fiado` (ver_operacion),
    `por-pagar` (ver_finanzas).
  - Autoriza con `getSessionUser()` + `can()`; 401 sin sesión, 403 sin permiso,
    404 recurso inválido. `Content-Disposition: attachment` con nombre y fecha.
- **Página `/respaldo`**: lista de descargas **filtrada por el rol** (cada quien ve
  solo lo que su capacidad permite bajar).

## 🔬 Probado
- **Escapado CSV** (node): campo con coma → entre comillas; comillas internas
  duplicadas; salto de línea → entre comillas; `null` → vacío; **BOM** presente.
  Abre limpio en Excel con acentos. ✔
- `typecheck` / `lint` / `build` en verde; `/export/[recurso]` y `/respaldo` compilan.

## ⚠️ Honesto / pendiente
- **Es CSV, no `.xlsx` binario.** Abre nativo en Excel/Sheets y es lo que una
  farmacia necesita; un `.xlsx` con formato/colores exigiría una librería y no
  aporta al respaldo. **PDF**: la carpeta DIGEMAPS ya imprime; el resto de reportes
  se imprime desde el navegador (Ctrl+P) — un generador PDF server-side no se
  construyó (fuera de lo que pide el respaldo de datos).
- El export trae **hasta 5.000 filas** por recurso (tope de seguridad); una farmacia
  de barrio no lo alcanza en años, pero se anota el corte.

## 🔗 PR
Pendiente (Tanda 17 · Pieza 2 — cierra Tanda 17).

---

# TANDA 18 — DASHBOARD VIVO (TRES ESTADOS DEL DINERO) · 2026-08-08

## ✅ Construido (PR pendiente) — SIN migración

- **Dashboard reescrito** (era un stub en ceros) → **datos reales** con los
  **tres estados del dinero**, cada tarjeta enlazada a su pantalla:
  1. **Líquido — hoy**: ventas completadas de hoy (total), tickets, y **margen real**
     de hoy (precio − costo congelado). → `/caja-diaria`
  2. **Parado — inventario**: valor del inventario vivo al costo + **capital dormido**
     (sin venta en 90 días). → `/finanzas`
  3. **En la calle — neto**: **por cobrar** (fiado) − **por pagar** (droguerías),
     con color según signo. → `/fiado`
- **Carriles de urgencia con datos reales** (no más estados vacíos vacuos):
  **Vencidos** (n + RD$ en riesgo), **Vence esta semana** (≤7d), **Entregas en curso**
  (pendiente/en_camino), **Cadena de frío** (lotes en revisión). Cada uno linkea.
- **Banner de farmacia de turno**: si Ajustes marca turno, sale arriba del dashboard.
- **Barrera de rol**: todo lo de dinero exige `ver_finanzas`; el **cajero ve solo
  tickets de hoy**, sin cifras de dinero (§2.7).
- **Móvil 390px**: los estados apilan en 1 columna en teléfono (`grid-cols-1`),
  3 en escritorio; los carriles 1→2→4 según ancho. Tarjetas táctiles con enlace.

## 🔬 Probado
- **Consultas nuevas** del dashboard (entregas activas, cadena de frío, turno,
  ventas de hoy) corren **sin error** contra el esquema real (Postgres local). ✔
- El **margen de hoy** reusa el costo congelado de `venta_linea` (misma lógica ya
  probada en `/finanzas`).
- `typecheck` / `lint` / `build` en verde; `/dashboard` compila (4.13 kB).

## ⚠️ Honesto / pendiente
- Con el sistema aún sin ventas cargadas por Marien, **los estados muestran ceros
  reales** y los carriles su mensaje tranquilo — no hay datos ficticios.
- **No hay auto-refresh en vivo** (websocket/polling): el dashboard es *server-side*
  y refresca al navegar o recargar. Un "vivo" con streaming se puede añadir después;
  hoy la cifra es real al momento de abrir.

## 🔗 PR
Pendiente (Tanda 18).

---

# TANDA 19 — PWA OFFLINE (INDEXEDDB) · 2026-08-08

## ✅ Construido (PR pendiente) — SIN migración

- **App instalable** (PWA): `src/app/manifest.ts` (nombre, `display: standalone`,
  `start_url: /dashboard`, íconos, colores de tema) — se puede "Agregar a pantalla
  de inicio" y abre a pantalla completa.
- **Service worker** (`public/sw.js`, JS válido verificado con `node --check`):
  - Estáticos inmutables (`/_next/static/*`, ícono, manifest): **cache-first**.
  - Navegaciones: **network-first** → si no hay red, sirve la última copia cacheada
    de esa página y, si no existe, la página **`/offline.html`**.
  - **Jamás cachea POST**: las escrituras siempre van a la red.
- **`public/offline.html`**: pantalla premium "Sin conexión — vuelve sola cuando
  regrese la señal", con reintento y recarga automática al volver online.
- **IndexedDB** (`src/lib/offline/catalogo-cache.ts`, sin dependencias): el POS
  **guarda una foto del catálogo** cuando hay conexión, para poder **consultar
  precios offline**. Es best-effort y no lanza si el navegador no lo soporta.
- **Conciencia de conexión**: barra global amarilla al perder red (`OfflineBanner`);
  en el POS, **el botón Cobrar se deshabilita offline** (y el atajo F4 avisa) con
  mensaje claro. El registro del SW es silencioso.

## 🔬 Probado
- `node --check public/sw.js` → **JS válido**. ✔
- `build` genera `/manifest.webmanifest` como ruta; `typecheck` / `lint` / `build`
  en verde; `/caja` y `/dashboard` compilan con la lógica offline.

## ⚠️ Honesto / IMPORTANTE — el límite, sin maquillar
- **NO hay ventas offline.** Cobrar es una escritura de servidor que depende de la
  **secuencia NCF, el FEFO y la existencia en vivo**; una cola offline que las
  fingiera podría **duplicar NCF, romper el descuento de lote o doble-cobrar**. Por
  eso, con honestidad: **offline se CONSULTA, no se COBRA.** El cobro espera a que
  vuelva el internet. Esto es una decisión de seguridad, no una carencia.
- **Íconos en SVG, no PNG.** No hay herramienta de imágenes en el entorno para
  generar PNG 192/512; Android Chrome (el teléfono de la farmacia) acepta el ícono
  SVG del manifiesto. Un set PNG/maskable es pulido para la Tanda 20.
- **Cache de navegaciones en terminal compartida**: se sirve la última copia solo
  como *fallback* sin red; en línea siempre gana la red (network-first), así no se
  muestra estado viejo con conexión.
- No se pudo **probar el ciclo offline real en un navegador** desde este entorno
  (sin navegador headless con SW aquí); se verificó la validez del SW y la
  compilación. La prueba en dispositivo la hace Marien en el preview.

## 🔗 PR
Pendiente (Tanda 19).

---

# TANDA 20 · PIEZA 1 — ELEVACIÓN: SEGURIDAD Y ENDURECIMIENTO · 2026-08-08

## ✅ Auditoría de seguridad por rol (ataque por URL directa)

- **Toda página** (`page.tsx`) tiene barrera de servidor: 28 rutas con
  `requireCapability(...)` de la capacidad correcta; `/dashboard` y `/respaldo`
  con `requireUser()` (ramifican por capacidad adentro). **0 rutas sin guardia.**
- **Toda acción de escritura** (`actions.ts`) verifica **sesión + capacidad**, no
  solo sesión — se auditó cada `export async function`. Casos que parecían flojos y
  resultaron correctos: `/conteo` centraliza el permiso en `actor()`
  (`can(role,'gestionar_inventario')`); `/catalogos` en `guardaRol(tipo)`; `/fiscal`
  exige Dueño/Admin explícito. `signOut()` es abierto a propósito (cerrar sesión).
- **RLS es el tercer muro**: el cliente del servidor usa la **llave ANON** (respeta
  RLS). El único uso de `service_role` (`productos/actions.ts`) es un **rollback
  interno** de un alta abortada — borra por el `id` que ese mismo servidor acaba de
  crear, tras verificar `gestionar_inventario`. Documentado y acotado; no lee/escribe
  a pedido del usuario. **Defensa en profundidad: página + acción + RLS.**

## ✅ npm audit
- **Antes**: 7 vulnerabilidades (6 high, **1 critical**). La crítica era el
  **Authorization Bypass en el middleware de Next.js** (CVE-2025-29927) — directo al
  corazón de una app con auth por middleware.
- **Acción**: `next` 14.2.15 → **14.2.35** (dentro de la 14.x, sin ruptura) +
  `npm audit fix` (js-yaml, nanoid). `typecheck`/`lint`/`build` en verde tras subir.
- **Después**: **0 críticas.** Quedan 5 *high* que **solo cierra Next 16** (salto de
  dos majors, exige React 19): 3 son de **eslint (solo dev**, no llegan a producción)
  y 2 (`next`/`postcss`) son DoS/cache-confusion. **Honesto**: subir a Next 15/16 es
  ruptura y se hace **con Marien probando**, no a ciegas en producción. Recomendado
  como mantenimiento programado.

## ✅ Supabase Advisors (Management API)
- **Seguridad**:
  - 3× "SECURITY DEFINER ejecutable por authenticated": son **RPC intencionales** que
    el POS llama (`siguiente_ncf`, `alergias_en_conflicto`, `candidatos_cronicos`).
    Se verificó que **las tres fijan `search_path=public, pg_temp`** — el vector real
    de inyección de `SECURITY DEFINER` está cerrado. **Aceptadas por diseño.**
  - 1× "leaked password protection (HIBP)": intenté activarla por API → **HTTP 402
    (requiere plan Pro)**. Se **recomienda activarla** cuando el proyecto suba a Pro
    (bloquea contraseñas filtradas en registro/cambio, gratis en seguridad).
- **Rendimiento** (todo INFO): 89× "unused_index" es **ruido en una base sin tráfico**
  (ningún índice se ha usado porque aún no hay ventas — borrarlos sería un error);
  55× "unindexed_foreign_keys" es mejora de baja prioridad a escala de barrio. Se
  anota, no se toca por tocar.

## ✅ Crédito del creador
- Pie discreto en la barra lateral: **"Hecho por JM Nexus Designs"**, **único enlace
  externo** de la app, y **solo al Instagram** (`BRAND.makerInstagram`).

## 🔗 PR
Pendiente (Tanda 20 · Pieza 1).

---

# TANDA 20 · PIEZA 2 — CIERRE: ARTEFACTOS, UMBRAL CONFIGURABLE, DOCS · 2026-08-08

## ✅ Verificación de artefactos de prueba en producción
Auditoría en vivo (Management API). Resultado, sin maquillar:
- `producto` `PRUEBA` = **1** (solo `PRUEBA T3 Inviolabilidad`, borrado suave,
  referenciado por libros inviolables — residuo documentado de la Tanda 3).
- `principio_activo` `PRUEBA` = **0**.
- `auth.users` `@wfarmacia-test.local` = **2** (los inertes de la Tanda 3).
- `profiles` = **1** (solo el Dueño → los 2 test users **sin perfil**).
- `entrega`/`abono`/`pagador`/`venta`/`cuenta_por_pagar` = **0/0/0/0/0**.
- **Los 2 test users reconfirmados INERTES**: `encrypted_password` vacío, sin
  confirmar, **sin `auth.identities`**, **sin `profile`** → no autentican.
- **Conclusión:** todo el testeo de las Tandas 4–20 fue en **Postgres local**;
  producción recibió **solo esquema** (0021–0037) + seed de config. **Cero
  artefactos nuevos en producción.** Registro actualizado en `ARTEFACTOS-DE-PRUEBA.md`.

## ✅ Corrección honesta de un dicho de la Tanda 17
En la bitácora de la **Tanda 17 · Pieza 1** dije que `umbral_discrepancia_conteo`
"ya se consumía". **Era falso**: `conteo/actions.ts` usaba la **constante** `5000`
fija; el seed existía pero nadie lo leía. Se corrigió de verdad en esta pieza:
- `conteo/actions.ts` ahora lee el umbral por `umbralDiscrepancia(supabase)` en
  `revelarConteo` **y** `confirmarCorreccion`, con `UMBRAL_DISCREPANCIA_RD`
  (RD$5,000) como default. **Verificado en local**: seed 5000 → Ajustes 8000 →
  leído **8000**; restaurado.
- Con esto quedan **dos** ajustes vivos de verdad: `dias_alerta_vencimiento`
  (radar) y `umbral_discrepancia_conteo` (conteo). **Cierra PENDIENTES · Tanda 3 · #5.**

## ⚠️ Honesto — lo que NO se hizo en la elevación
- **`docs/FARMACIA-CLAUDE.md` "Parte 8"**: ese documento gobernante **no vive en el
  repo** (fue material que subió Marien); no se inventó ni se editó a ciegas. El
  cierre se dejó en las fuentes de verdad que SÍ están en el repo: esta bitácora,
  `ARTEFACTOS-DE-PRUEBA.md` y `PENDIENTES.md`.
- **PENDIENTES de Tanda 3 que siguen abiertos** (por factores externos, no por
  descuido): semilla grande DIGEMAPS (servidor MISPAS caído), enlace de las 207 de
  venta libre al catálogo de principios (espera ese semilla), versión posterior de la
  Res. 000009-17 (la busca Marien), y la prueba de fuego del importador con un
  archivo "feo a propósito" (manos de Marien). Ninguno lo puede cerrar Claude solo.
- **Recorrido de un día completo** (walkthrough con ventas reales): no se puede
  simular sin datos de Marien; el sistema arranca vacío por diseño (§5.3 #3). Se
  verificó cada pieza por separado y la seguridad por rol; el día completo lo maneja
  Marien en el preview.

## 🔗 PR
Pendiente (Tanda 20 · Pieza 2 — cierra Tanda 20 y la corrida T4–T20).

---

# CIERRE MAESTRO · PARTE 2 · PIEZA A — CORRECCIÓN LEGAL (mensajes, disclaimers, receta física) · 2026-08-08

## ✅ Construido — sin migración

- **§2.1 Receta física en mano** (controlados): casilla **obligatoria** "Tengo la
  receta física en mano" + regla visible ("una foto nunca habilita el despacho").
  **Doble barrera**: el botón se deshabilita sin la casilla **y** `despacharControlado`
  la exige en el servidor (`recetaFisica` → error si falta).
- **§2.2 Ningún mensaje nombra el medicamento**: los textos de WhatsApp de
  **crónicos** (`le recordamos su ${principio}` → *"Le recordamos su visita pendiente"*)
  y **encargos** (`llegó lo que encargó (${producto})` → *"Su pedido ya está listo"*)
  ahora son **neutros**. La pantalla interna sigue mostrando el producto al personal;
  lo que **sale por WhatsApp** ya no revela condición de salud (Ley 172-13).
- **§2.4 Presión/glucosa sin interpretación**: servicios **ya** registraba valores sin
  semáforos ni juicios; se añadió el aviso *"Este registro es informativo… Consulte a
  su médico."*
- **§2.5 Patrón como dato, no juicio**: el aviso de controlados pasó de *"⚠️ Patrón…
  revísalo"* a *"Nota: este paciente ya adquirió este mismo controlado recientemente.
  Revísalo — la decisión es tuya."* (solo lo ve el farmacéutico; nunca bloquea).
- **§2.7 Aviso legal en toda pantalla clínica**: componente `AvisoClinico` en
  **controlados**, **equivalencias**, **servicios** y el **modal de alergia** del POS.

## 🔬 Probado
- `typecheck` / `lint` / `build` en verde; `/controlados` y `/servicios` compilan.
- Barrera servidor de receta física: `despacharControlado` devuelve error si
  `recetaFisica` no viene (revisado en el código, además del gate de rol ya existente).

## ⚠️ Honesto
- **§2.3 (sugerencia clínica solo al farmacéutico)**: **no hay** función de
  "recomiéndale un probiótico" en el sistema — no había nada que restringir. La alerta
  cruzada de alergia (que sí ve el cajero) es una **salvaguarda de seguridad**, no una
  sugerencia de venta, y debe seguir visible. Anotado, no fingido.
- **§2.6 (consentimiento / Ley 172-13)** va en la **Pieza B** (requiere migración:
  consentimiento por cliente + opción de no recibir mensajes + política de privacidad).

## 🔗 PR
Pendiente (Parte 2 · Pieza A).
# CIERRE MAESTRO · PARTE 2 · PIEZA B — CONSENTIMIENTO Y DATOS (Ley 172-13) · 2026-08-08

## ✅ Construido — migración `0038`

- **Migración `0038`** (aplicada a producción, `HTTP 201`; idempotente 3× en local):
  `cliente.consentimiento_datos` (bool), `cliente.consentimiento_en` (fecha),
  `cliente.acepta_mensajes` (bool, default true = opt-out).
- **Consentimiento en el POS**: al identificar un cliente, dos chips —
  **"Registrar consentimiento"** (queda con fecha, revocable) y **"No desea mensajes"**
  (opt-out). Guardan al instante vía `registrarConsentimiento` (optimista, revierte si falla).
- **Opt-out respetado**: en `/cronicos`, si el cliente **no acepta mensajes**, su teléfono
  **no se expone** para WhatsApp → el botón de WhatsApp no aparece.
- **`/privacidad`**: política de privacidad **visible** — qué se guarda y para qué,
  consentimiento revocable, mensajes neutros, y los **derechos** del cliente (acceso,
  rectificación, supresión salvo lo que la ley obliga a conservar), más que el
  `audit_log` registra quién accede. Enlazada en el pie de la barra lateral.

## 🔬 Probado
- **Prueba de vida** (Postgres local, RLS): un cliente guarda `consentimiento_datos=true`,
  `acepta_mensajes=false`, con **fecha** → persiste. Artefacto `PRUEBA Consent` purgado.
- `cliente_update` permite a los roles del mostrador (incl. cajero) → el consentimiento
  se puede registrar en caja.
- `0038` idempotente 3×; `typecheck` / `lint` / `build` en verde; `/privacidad` compila.

## ⚠️ Honesto
- **Encargos** guarda el teléfono como texto libre (no está enlazado a `cliente`), así
  que su opt-out no se puede cruzar con el consentimiento; el mensaje de encargos ya es
  **neutro** (Pieza A), que es la protección que importa. Enlazar encargo↔cliente para
  opt-out fino queda anotado como mejora.
- **Derecho de acceso/supresión**: la **política** los declara y el `audit_log` los
  respalda; un botón de "exportar/borrar mis datos" self-service no se construyó — hoy
  se atiende a mano (el export CSV de clientes ya existe en `/respaldo`).

## 🔗 PR
Pendiente (Parte 2 · Pieza B — cierra Parte 2).

---

# CIERRE MAESTRO · PARTE 3 · PIEZA A — REABASTECIMIENTO (mínimo + orden de compra) · 2026-08-08

## ✅ Construido — migración `0039`

- **Migración `0039`** (a producción, `HTTP 201`; idempotente 3× local):
  `orden_compra` + `orden_compra_linea` + enum `estado_orden_compra`
  (borrador/enviada/recibida_parcial/recibida/cancelada). `fecha_envio` es la base de
  "cuánto tardó en llegar" (alimenta la ficha de cumplimiento, Pieza B). RLS: gestiona
  inventario (Dueño/Admin/Farmacéutico); auditada.
- **§3.1 Mínimo por producto (día uno)**: usa `producto.punto_reorden_manual` (ya
  existía). En `/compras` se **configura el mínimo** por producto, con **sugerencia
  inicial sin datos** (más barato → más unidades: <RD$50→24, <200→12, <800→6, resto 3).
- **§3.1 Alerta de bajo de stock**: los productos con existencia **por debajo de su
  mínimo** salen **agrupados por proveedor** (el proveedor del lote más reciente),
  ordenados por urgencia (qué tan por debajo están).
- **§3.2 Orden de compra en dos clics**: por proveedor, cantidad sugerida editable
  (para llevar al doble del mínimo), **precio esperado** (último costo del lote), y
  **"Pedir por WhatsApp"** con la orden pre-armada y legible. Estados: borrador →
  enviada (registra `fecha_envio`) → recibida / cancelada.
- **`/compras`** dejó de ser stub — nav encendido.

## 🔬 Probado
- **Prueba de vida** (Postgres local): crear orden + renglón, **marcar enviada** →
  `estado=enviada`, `fecha_envio` no nula, 1 renglón. Artefactos `PRUEBA … OC` purgados.
- `0039` idempotente 3×; `typecheck` / `lint` / `build` en verde; `/compras` compila.

## ⚠️ Honesto / día noventa
- El mínimo es **fijo** (día uno). El **punto de reorden dinámico** (velocidad de venta)
  es el día noventa: se calcula cuando haya historia de ventas — misma pantalla, más
  inteligencia. Hoy avisa con el mínimo que Wilkins pone; no inventa velocidad que no existe.
- El **proveedor** de un producto se infiere del **lote más reciente**; si un producto
  nunca se recibió por el sistema, cae en "Sin proveedor asignado" (se pide igual, se
  elige el proveedor a mano al recibir).
- La **recepción de la orden** (conteo contra factura) ya vive en `/recepcion`; enlazar
  la orden con su recepción para cerrar el ciclo automáticamente queda para la Pieza B.

## 🔗 PR
Pendiente (Parte 3 · Pieza A).

---

# CIERRE MAESTRO · PARTE 3 · PIEZA B — FICHA DE CUMPLIMIENTO + 3 ALERTAS DE RECEPCIÓN · 2026-08-08

## ✅ Construido — sin migración (usa recepcion/recepcion_linea existentes)

- **§3.4 Ficha de cumplimiento del proveedor — se calcula sola** de las recepciones:
  en `/proveedores`, cada proveedor con compras muestra **# de compras** (desde cuándo),
  **completitud** (llega lo pedido = Σrecibida/Σpedida), **honró la cotización**
  (% de renglones con facturado ≤ cotizado), **entrega prometida** (días del expediente)
  y **pendiente de pago** (de cuentas por pagar). Con **una compra ya dice algo**.
- **§3.3 Las 3 alertas de recepción** en el momento exacto (en `/recepcion`, por renglón):
  1. **Deriva de costo** — ya existía ("llegó X% más caro… sugerido RD$…").
  2. **Vida útil corta** — **nuevo**: si el lote llega con ≤180 días hasta vencer,
     avisa cuántos días trae y pregunta "¿aceptar?".
  3. **Refrigerado** — **nuevo**: si el producto requiere refrigeración (override del
     producto, o heredado de la forma farmacéutica), avisa verificar la cadena de frío.

## 🔬 Probado
- **Ficha (Postgres local)**: 2 renglones (pedí 10 recibí 8; pedí 10 recibí 10) →
  **completitud 90%**; precios (50=50 honró; 44>40 no) → **honró 50%**. Coincide con
  la lógica del código.
- `typecheck` / `lint` / `build` en verde; `/proveedores` y `/recepcion` compilan.
- La refrigeración usa `producto.requiere_refrigeracion ?? forma_farmaceutica.requiere_refrigeracion` (columnas verificadas en la base).

## ⚠️ Honesto / día noventa
- **Días reales de entrega**: se declara en la ficha que se calcularán **al enlazar la
  orden de compra con su recepción** (hoy no hay ese enlace directo); no invento un
  número que no puedo medir bien. Es el siguiente paso natural del ciclo orden→recepción.
- **Rotación** ("su producto rota en 34 días") es **día noventa** — necesita velocidad
  de venta acumulada; no se finge sin historia.
- **Comparación entre proveedores del mismo producto**: la ficha por proveedor está;
  el comparador lado a lado del mismo producto se apoya en `historial_costo`/lotes y
  queda como mejora (dato disponible, vista pendiente).

## 🔗 PR
Pendiente (Parte 3 · Pieza B — cierra Parte 3).

---

# CIERRE MAESTRO · PARTE 4.1 — RECIBO IMPRIMIBLE · 2026-08-08

## ✅ Construido — sin migración

- **Ruta `/recibo/[ventaId]`** (fuera del layout con barra lateral → no imprime el menú):
  recibo **térmico 80mm** con `@page { size: 80mm auto }` y CSS de impresión que oculta
  todo menos el ticket.
- Contenido: **identidad de la farmacia** (nombre/RNC/dirección/teléfono desde
  `configuracion`, con respaldo a la marca), **fecha**, **cajero**, **NCF** y tipo,
  RNC del cliente si lo hay; **líneas** con producto, cantidad × precio, marca
  **(frac.)** si fue fraccionado; **subtotal**, **ITBIS 18%** y **exento** separados,
  **descuento**, **TOTAL**; **método(s) de pago** y **vuelto**; **mensaje del recibo**
  configurable y **"Hecho por JM Nexus Designs"**. Marca **VENTA ANULADA** si aplica.
- **Impresión automática al cobrar, configurable**: interruptor en `/ajustes`
  (`recibo_auto_imprimir`); si está activo, al cobrar se abre el recibo con `?auto=1`
  y dispara `window.print()` solo.
- **Botón "Recibo"** en el banner de éxito del POS (abre en pestaña nueva).
- **Vista previa en pantalla** (para farmacias sin impresora): la misma ruta es la
  vista previa, con botones Imprimir / Volver.
- **Reimprimir**: la ruta es por `ventaId` → cualquier venta se reimprime por su URL.

## 🔬 Probado
- `typecheck` / `lint` / `build` en verde; `/recibo/[ventaId]` compila (1.32 kB).
- Las consultas (venta, venta_linea, comprobante, cobro, configuracion) coinciden con
  el esquema; el ITBIS gravado sale de `venta.itbis` y el exento se suma de las líneas
  sin ITBIS.

## ⚠️ Honesto
- **La prueba visual de impresión** (que el ticket salga bien en una térmica de 80mm)
  la hace Marien en el preview — este entorno no tiene navegador ni impresora. El
  cableado de datos y el CSS de impresión están; el "se ve bien en papel" lo confirma ella.
- **Reimprimir desde un historial de ventas**: hoy el recibo se reimprime por su URL
  (`/recibo/<ventaId>`) y desde el banner del POS. Una **lista de ventas** con botón de
  reimpresión para ventas viejas queda anotada (la ruta ya soporta cualquier venta).

## 🔗 PR
Pendiente (Parte 4.1).

---

# CIERRE MAESTRO · PARTE 4.2 — NOTA DE CRÉDITO B04 · 2026-08-08

## ✅ Construido — migración `0040`

- **Migración `0040`** (a producción, `HTTP 201`; idempotente 3× local):
  `comprobante.ncf_modificado` — el NCF que la nota de crédito B04 modifica
  (obligación DGII). El comprobante original **es inviolable y NO se toca**.
- **`anularVenta` emite la B04 automáticamente**: al anular una venta con NCF
  (B01/B02), toma el **siguiente número de la secuencia B04** (misma alerta de
  agotamiento), inserta un comprobante **nuevo** tipo B04 con el subtotal/ITBIS/total
  del original, **`ncf_modificado` = NCF original** (referencia obligatoria), y el
  **motivo** de anulación queda en la venta. La **venta original y su comprobante
  quedan intactos**; se anula con un documento nuevo, nunca se altera.
- Si no hay secuencia B04 configurada, la anulación **igual se completa** y se avisa
  ("configúrala en Fiscal") — no se bloquea la operación por un tema de secuencia.
- **En el POS**: al anular se muestra el NCF de la nota de crédito (o el aviso).
- **En el recibo**: si la venta tiene B04, el ticket imprime "Nota de crédito: … (B04)"
  → reimprimible por su URL.

## 🔬 Probado — CRÍTICO (Parte 6 · #5), en Postgres local
- **La nota de crédito se emite al anular** y el **comprobante original queda intacto**:
  - Original B02 → **`emitido`** (sin tocar). B04 emitido con
    **`ncf_modificado = B0200000001`** (referencia correcta al original). ✔
  - El comprobante es **INVIOLABLE**: intentar `UPDATE`/`DELETE` sobre el original →
    **"Registro inviolable (ADN §2.2)"**. El original **no se puede editar** — que es
    exactamente lo que la DGII exige. ✔
- `0040` idempotente 3×; `typecheck` / `lint` / `build` en verde.

## ⚠️ Honesto
- Los 2 comprobantes de prueba del test **no se pudieron borrar del DB local** (son
  inviolables por diseño, como el `audit_log`); el DB local es efímero y **nunca tocó
  producción** (a producción solo fue el esquema `0040`).
- La **impresión** de la nota de crédito comparte la plantilla del recibo (muestra el
  B04 y "VENTA ANULADA"); un formato de nota de crédito dedicado es cosmético y se
  puede afinar después.

## 🔗 PR
Pendiente (Parte 4.2).

---

# CIERRE MAESTRO · PARTE 4.3 — FORZAR CAMBIO DE CLAVE AL 1ER INGRESO · 2026-08-08

## ✅ Construido — migración `0041`

- **Migración `0041`** (a producción, `HTTP 201`; idempotente 3× local):
  `profiles.debe_cambiar_password` (default **false** → el Dueño y los usuarios ya
  existentes **no se ven afectados**). El trigger `app.handle_new_user()` ahora marca
  a **todo usuario nuevo** con `debe_cambiar_password = true`. Función
  `marcar_clave_cambiada()` (SECURITY DEFINER, wrapper público) que baja la bandera
  **solo en la fila del propio usuario** (`auth.uid()`), sin darle UPDATE directo a la tabla.
- **El gate**: el layout de la app (`(app)/layout.tsx`) **redirige a `/cambiar-clave`**
  si la bandera está puesta → **no puede navegar** hasta cambiarla.
- **`/cambiar-clave`** (ruta propia, fuera del layout, sin loop): pide clave nueva
  (mín. 8) y repetición; `supabase.auth.updateUser({password})` → `marcar_clave_cambiada()`
  → entra al dashboard. **Esto elimina las claves iniciales circulando por WhatsApp.**

## 🔬 Probado (Postgres local)
- **Prueba de vida del flujo**: nuevo `auth.users` → su profile nace con
  `debe_cambiar_password = **true**`; como ese usuario `authenticated`,
  `public.marcar_clave_cambiada()` → la bandera baja a **false**. ✔
- Idempotente 3× (funciones con `create or replace`, columna `if not exists`).
- `typecheck` / `lint` / `build` en verde; `/cambiar-clave` compila.

## ⚠️ Honesto
- El **cambio de contraseña real** (Supabase Auth `updateUser`) no se puede ejercitar
  desde este entorno sin sesión de navegador; la **lógica de la bandera** sí está
  probada en la base, y el build valida el formulario. La prueba de punta a punta
  (crear empleado → login con temporal → forzado a cambiar) la cierra Marien en el preview.
- La **rotación de la clave provisional del Dueño** sigue siendo manual (él ya existe
  con la bandera en false, por diseño, para no trabarlo) — queda en el checklist de entrega.
- Artefacto de prueba: 1 `auth.users` `@wfarmacia-test.local` en el DB **local**
  (retenido por el FK del `audit_log`, inviolable); efímero, nunca tocó producción.

## 🔗 PR
Pendiente (Parte 4.3).

---

# CIERRE MAESTRO · PARTE 4.4 — RESPALDO HONESTO · 2026-08-08

## ✅ Construido — sin migración

- **`docs/RESPALDO-Y-RESTAURACION.md`**: documento honesto que distingue **los dos
  respaldos** — (A) el **automático diario de Supabase** (plataforma; PITR en Pro) y
  (B) la **exportación CSV** de la app (tu copia en Excel) — con una tabla de **qué
  respalda cada uno y qué NO**, e **instrucciones de restauración paso a paso, en
  cristiano** (restaurar todo desde Supabase; reimportar una tabla desde el CSV).
- **Export ampliado a las tablas críticas**: además de las que ya estaban, `/respaldo`
  ahora baja **movimientos de inventario** (kardex), **comprobantes fiscales** (NCF +
  notas de crédito B04), y el **libro de controlados** — cada uno con su barrera de
  capacidad en el servidor.
- **La pantalla `/respaldo`** dice la verdad: explica que Supabase respalda automático
  por su lado y que el CSV es la copia en la mano, y apunta al documento de restauración.

## 🔬 Probado — "un respaldo que nunca se restauró no es un respaldo"
- **Prueba de restauración real** (Postgres local): ciclo **exportar → vaciar → restaurar**
  con datos que incluían **comas y comillas**:
  - Antes: **3** renglones → tras vaciar: **0** → **tras restaurar: 3**, suma **115.50**
    intacta, y el renglón `PRUEBA con, coma y "comillas"` volvió **idéntico**. ✔
- `typecheck` / `lint` / `build` en verde; `/respaldo` y `/export/[recurso]` compilan.

## ⚠️ Honesto
- **La exportación NO es un cron automático dentro de la app.** El respaldo automático
  de verdad es el de **Supabase** (documentado); el CSV se baja **a demanda** (se
  recomienda semanal, escrito en el documento). Montar un cron de export a un archivo
  externo es tarea de plataforma/ops — se documentó el porqué y la rutina, en vez de
  fingir un "respaldo automático de la app" que no existe.
- El **aviso al Dueño** de "toca bajar el respaldo" es la rutina escrita, no una
  notificación push (el sistema de notificaciones no está en alcance de esta pieza).

## 🔗 PR
Pendiente (Parte 4.4 — cierra Parte 4).

---

# CIERRE MAESTRO · PARTE 5 + PARTE 6 — VERIFICACIÓN CON EVIDENCIA · 2026-08-08

## 🚨 Las 5 críticas (Parte 6) — todas PROBADAS

1. **El cajero NO puede despachar un controlado (por llamada directa).** ✅
   `can('cajero','despachar_controlados') = false` (unit); `can('motorista', …) = false`;
   solo dueño/administrador/farmacéutico = true. Además `despacharControlado` valida
   `can(user.role,'despachar_controlados')` **en el servidor** (no solo el botón).
2. **La alerta cruzada de alergia dispara.** ✅ Cliente **alérgico a Penicilinas** pidiendo
   **Ampicilina 500** → `alergias_en_conflicto` devuelve el producto con familia
   **"Penicilinas"** (Postgres local). Compara por **familia**, no solo por molécula.
3. **Los libros inviolables resisten UPDATE y DELETE.** ✅ `movimiento_inventario` →
   ambos rechazados con *"Registro inviolable (ADN §2.2)"*; `comprobante` idem (Parte 4.2);
   triggers `*_inviolable` presentes en `libro_controlado`, `caja_egreso`, `comprobante`.
4. **El stock baja del lote correcto por FEFO.** ✅ Dos lotes (vence 2027-01-01 y 2026-09-01)
   → FEFO toma primero el que **vence antes** (2026-09-01). El código `lotesFefo` ordena por
   `fecha_vencimiento` ascendente y excluye lotes en revisión de frío y muestras.
5. **La nota de crédito se emite al anular y el original queda intacto.** ✅ (Parte 4.2):
   B04 con `ncf_modificado` = NCF original; el original queda `emitido` y su UPDATE/DELETE
   se rechaza por inviolabilidad.

## 📋 Los 10 supuestos (Parte 5) — estado REAL, sin maquillar

- [✅] **Ficha de cumplimiento del proveedor** — **existe el cálculo** (Parte 3·B):
  completitud, honró cotización, compras+desde, pendiente de pago.
- [❌] **Comparador de precios entre droguerías** — **NO construido**. El dato está
  (`historial_costo` / `lote.proveedor_id`); es una **vista pendiente**, alcanzable. No se fingió.
- [❌] **Estacionalidad y demanda proyectada** (`/insights`) — **NO construido** (sigue stub).
  Necesita meses de historia → **condicionado (día noventa)**.
- [⚠️] **Encargos — aviso al llegar** — **semi-automático**: el mostrador marca "Llegó" y
  aparece el botón de **WhatsApp neutro** ("su pedido está listo", sin nombrar el producto).
  No es una notificación push automática; el aviso se manda con un clic.
- [❌] **Servicios descuentan insumos del inventario** — **NO**. Hoy el servicio se registra
  como **ingreso**; no descuenta insumos (jeringa, tira reactiva…) porque **no existe el
  mapeo insumo-por-servicio**. Es una mejora real pendiente, no está hecho.
- [✅] **Cadena de frío — bloqueo de despacho tras apagón** — **funciona**: el FEFO del POS
  y de controlados **excluye los lotes `en_revision_frio`** → no se despachan.
- [✅] **Alerta cruzada de alergia** (amoxicilina/ampicilina) — **probada** (ver crítica #2).
- [✅] **Cajero y controlados — por llamada directa** — **bloqueado** (ver crítica #1).
- [✅] **FEFO — en la base** — **probado** (ver crítica #4).
- [✅] **Libros inviolables — UPDATE/DELETE** — **probados** (ver crítica #3).

## ⚠️ Honesto — lo que queda pendiente de esta verificación
- **3 de los 10 no están** (comparador de droguerías, estacionalidad/insights, insumos de
  servicios) y **1 es semi** (aviso de encargos con un clic, no push). Se reportan tal cual.
- Alcanzable ya (dato listo, falta vista): **comparador de precios**. Condicionado a datos:
  **estacionalidad/demanda**. Requiere esquema nuevo: **insumos por servicio**.
- Artefactos de prueba de esta verificación: solo Postgres local; lo borrable se purgó.
  Quedan inertes por FK inviolable **1 `PRUEBA Inviol` + su movimiento** (local, efímero,
  nunca tocó producción).

## 🔗 PR
Pendiente (Parte 5 + 6 — cierra el CIERRE MAESTRO).

---

# CIERRE MAESTRO · POST-CIERRE — INSUMOS POR SERVICIO (§5, pedido de Marien) · 2026-08-08

## ✅ Construido — migración `0042` (⚠️ PENDIENTE DE APLICAR A PRODUCCIÓN: PAT revocado)

- **Migración `0042`** (probada idempotente 3× en local, **NO aplicada a producción**
  porque el PAT fue revocado): tabla **`servicio_insumo`** (qué insumos y cuántos
  consume cada tipo de servicio) + RLS (config: gestionar_inventario; lectura: operativo)
  + auditoría.
- **Descuento automático al registrar**: `registrarServicio` descuenta los insumos del
  tipo **por FEFO**, dejando un movimiento **`ajuste`** por lote (`referencia servicio:<id>`,
  motivo "Insumo de servicio: <tipo>"). Así el **conteo cíclico cuadra** y no marca
  discrepancia todos los meses. **No usa `merma`** → no ensucia el reporte de merma.
- **Configurador en `/servicios`** (solo gestionar_inventario): por tipo de servicio,
  agregar/quitar insumos (buscar producto + cantidad). El formulario de registro
  **avisa qué se descontará** ("jeringa ×2, algodón ×1…").
- **Degrada con gracia**: si la tabla `servicio_insumo` **no existe** todavía (migración
  0042 sin aplicar), el servicio se registra igual **sin descontar**, y el configurador
  muestra un aviso claro de "aplicar la migración 0042". **Producción no se rompe.**
- Si falta existencia de un insumo, el servicio **se registra igual** y avisa
  ("sin existencia de: algodón (faltaron 1)").

## 🔬 Probado (Postgres local)
- **Prueba de vida del descuento**: mapeo *inyección → jeringa ×2*; al consumir, el lote
  de jeringa pasa **10 → 8**, con un movimiento **`ajuste`** (referencia `servicio:…`).
  **NO cuenta como merma** (0 filas tipo `merma`) → los reportes de merma quedan limpios.
- `0042` idempotente 3×; `typecheck` / `lint` / `build` en verde; `/servicios` compila.

## ⚠️ Honesto — lo IMPORTANTE
- **La migración `0042` NO está en producción.** El PAT fue revocado (bien hecho). El
  esquema queda en el repo, probado en local; **para activarlo en producción hay que
  aplicar `0042`** (con un PAT nuevo por la Management API, o pegando el SQL en el
  **SQL Editor** del panel de Supabase). Mientras no se aplique, la función **duerme sin
  romper nada** (los servicios se registran sin descontar y el configurador lo dice).

## 🔗 PR
Pendiente.
