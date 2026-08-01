# 🧪 Registro de artefactos de prueba

> **Por qué existe este documento.** Durante el desarrollo se prueba contra la
> base de datos **de producción** del cliente. Cada prueba deja rastro. Este
> registro anota **todo** lo que se crea para probar —usuarios, productos,
> catálogos, principios activos ficticios— con **fecha y propósito**, para que
> antes de la entrega se pueda **purgar todo** contra esta lista.
>
> Se actualiza **en cada tanda**, no al final. Un usuario "cajero" de prueba con
> clave conocida, vivo en una farmacia real, es un hueco de seguridad.

**Regla:** todo artefacto de prueba usa el dominio `@wfarmacia-test.local` (para
usuarios) o un prefijo `PRUEBA` reconocible (para datos), y se registra aquí
en el mismo commit en que se crea.

---

## 1. Usuarios de prueba

| Email | Rol | Clave | Creado | Propósito | Estado |
|---|---|---|---|---|---|
| prueba.rol.administrador@wfarmacia-test.local | administrador | `PruebaRoles-2026-x9K2` | 2026-07-31 | Hermeticidad de roles §5.3 #5 (RLS de `profiles`, no ve al Dueño, no auto-elevación) | **BORRADO** 2026-07-31 |
| prueba.rol.farmaceutico@wfarmacia-test.local | farmaceutico | `PruebaRoles-2026-x9K2` | 2026-07-31 | Hermeticidad de roles §5.3 #5 (solo su fila, no lee audit_log) | **BORRADO** 2026-07-31 |
| prueba.rol.cajero@wfarmacia-test.local | cajero | `PruebaRoles-2026-x9K2` | 2026-07-31 | Hermeticidad de roles §5.3 #5 | **BORRADO** 2026-07-31 |
| prueba.rol.motorista@wfarmacia-test.local | motorista | `PruebaRoles-2026-x9K2` | 2026-07-31 | Hermeticidad de roles §5.3 #5 (vista hermética) | **BORRADO** 2026-07-31 |
| prueba.app.cajero@wfarmacia-test.local | cajero | `PruebaApp-2026-x9K2` | 2026-07-31 | Gating de finanzas en dashboard (cajero no ve Ventas/Margen/Capital) | **BORRADO** 2026-07-31 |

**Verificación:** al 2026-07-31 no queda ningún usuario `@wfarmacia-test.local`
en producción; el único perfil vivo es el **Dueño** (cuenta real, ver §4).

## 2. Productos, catálogos y principios activos ficticios

| Lote | Qué | Creado | Propósito | Estado |
|---|---|---|---|---|
| Equivalencia 0007/0008/0009 | 4 principios `PRUEBA …` (Losartán, Hidroclorotiazida, Amoxicilina, Ác. clavulánico), 16 productos `PRUEBA …`, 18 renglones de `producto_principio_activo` | 2026-07-31 | Verificar la equivalencia (5 negativas + 3 positivas) contra la base **real** en cada ventana | **BORRADO** 2026-07-31 (cada vez, misma ventana) |
| Pantalla de catálogos | 1 principio `PRUEBA ZZ Molecula` | 2026-07-31 | Verificar el camino feliz (alta + refresco de la lista) de la pantalla de catálogos | **BORRADO** 2026-07-31 |
| Formulario de producto | 1 principio `PRUEBA Losartán ZZ`, 1 producto `PRUEBA Producto ZZ` + su renglón | 2026-07-31 | Verificar el alta end-to-end del formulario de producto (identidad + principio + concentración) | **BORRADO** 2026-07-31 |
| Laboratorio/presentación (0010) | 2 principios `PRUEBA … ZZ` (Losartán, Amoxicilina), 9 productos `PRUEBA …`, 5 laboratorios (Genfar/Genven/MK/Rowe/LabPRUEBA) y 1 presentación (`Caja x 30`) auto-creados por el selector inteligente, + sus renglones | 2026-07-31 | Separar equivalencia clínica de duplicado de inventario: (A) 4 marcas del mismo Losartán 50 → 0 alertas; (B) mismo lab+presentación → alerta de duplicado **y rollback** (bug de duplicado silencioso corregido); (C) re-chequeo al completar un incompleto (con revert); (D) latencia de alta de producto real (≈1.5 s) | **BORRADO** 2026-07-31 (misma ventana) |
| Panel de equivalencia (0011) | 1 principio `PRUEBA Losartán ZZ`, 3 laboratorios (Genfar/Rowe/MK), 3 productos `PRUEBA Losartán 50 Genfar` / `50 Rowe` / `100 MK` + sus renglones | 2026-07-31 | Demostrar el panel: Rowe = equivalente real (otro lab), 100 MK = "casi coincide" (otra dosis). Latencia de la consulta única medida: **mediana 152 ms** (<500 ms) | **VIVOS para la revisión de Marien** — purgar al cerrar la Tanda 2 |
| Borrado de catálogos (0012) | 2 usuarios `@wfarmacia-test.local` (cajero, farmacéutico), formas `PRUEBA 0012 …` / `PRUEBA Borrado Target` + 1 producto, y entradas `xy`/`test`/`123` intentadas (no creadas) | 2026-07-31 | Probar el borrado seguro: rechazo en vivo de cajero/farmacéutico por llamada directa (42501/RLS), bloqueo atómico de una forma en uso, borrado de los tres `new` con rastro de actor, y validación de entradas obvias | **BORRADO** 2026-07-31 (misma ventana) |
| Equivalencia (0013) | 6 principios `PRUEBA EQV …` + 12 productos `PRUEBA EQV …` con sus renglones | 2026-07-31 | Re-correr las 8 pruebas de equivalencia contra prod tras tocar `producto` en la 0013 (nullable del override) | **BORRADO** 2026-07-31 (misma ventana) |
| Tanda 3 / 0014 (inventario por lote) | 2 usuarios `@wfarmacia-test.local` (dueño/cajero), 5 principios `PRUEBA T3 …`, 9 productos `PRUEBA EQV …` + 3 `PRUEBA T3 …` con renglones, 2 formas / 2 vías `PRUEBA T3`, 1 `medicamento_oficial PRUEBA`, y para la inviolabilidad 1 producto `PRUEBA T3 Inviolabilidad` + 1 fila en cada libro (`movimiento_inventario`/`historial_costo`/`discrepancia_inventario`) | 2026-08-01 | Verificar la 0014 en vivo: objetos+RLS/FORCE (7 tablas), override 5 casos (bajar sin motivo→CHECK, cajero→rol, dueño+motivo→guarda+audit, subir sin fricción, herencia más restrictiva), inviolabilidad 6/6, idempotencia de `medicamento_oficial`, y las 8 de equivalencia (5 neg + 3 pos) tras tocar `producto` | **BORRADO** 2026-08-01 lo borrable. **QUEDAN a propósito** (referenciados por el `audit_log` inviolable / son libros inviolables): los **2 `auth.users`** de prueba (sin perfil → invisibles a la app), y de la inviolabilidad el producto (borrado en suave) + las **3 filas de libro** `PRUEBA T3` |

**Verificación:** al cierre de la ventana, `producto` y `principio_activo` con
prefijo `PRUEBA` = **0** — **salvo** los 3 productos `PRUEBA Losartán …` del
panel (0011), que quedan **vivos a propósito** para que Marien pruebe el panel
en el preview. Se purgan al cerrar la Tanda 2 (una línea de service_role).

> **Datos reales (NO prueba):** el seed de `forma_farmaceutica` (15) y
> `via_administracion` (9) que trae 0007, **más el semilla clínico de la 0013**
> (7 familias alergénicas, 10 clases terapéuticas, 5 categorías comerciales, con
> `clave_semilla` estable), es **vocabulario real** del sistema, no artefacto de
> prueba — **no se purga**. Es editable/borrable por el Dueño.
>
> De aquí en adelante, todo dato ficticio se prefija `PRUEBA`, se registra aquí
> y se borra en la misma sesión que lo crea.

## 3. Corte del `audit_log` — dónde empieza la historia real

El `audit_log` es **inviolable** (§2.2): las entradas de prueba **no se pueden
borrar**, y eso es precisamente la evidencia de que la tabla funciona. Por eso
se marca el corte en vez de limpiarlo.

| Rango de `id` | Origen | ¿Prueba? |
|---|---|---|
| **1 – 46** | Tanda 1: alta del Dueño, prueba de vida, hermeticidad de roles (todas sobre `profiles`) | Prueba/setup |
| **47 – 70** | Seed de 0007: `forma_farmaceutica` (15) + `via_administracion` (9) | **Real** (vocabulario del sistema) |
| **71 – 582** | Pruebas de equivalencia de 0007/0008/0009 (principios/productos/renglones `PRUEBA`, creados y borrados en cada ventana de verificación) | Prueba |
| **583 – 819** | Verificación de 0010 (laboratorio/presentación): altas y borrados de los 9 productos, 5 laboratorios, 1 presentación y 2 principios `PRUEBA`, más los rollbacks del bug de duplicado silencioso y del re-chequeo de edición | Prueba |
| **820 – 832** | Verificación de 0011 (panel de equivalencia): altas del principio, 3 laboratorios y 3 productos `PRUEBA` del panel (aún vivos para la revisión) | Prueba |
| **833 – 866** | Verificación de 0012 (borrado de catálogos): borrado de los tres `new` (actor = Dueño), rechazos de cajero/farmacéutico, bloqueo por uso, y altas/borrados de artefactos `PRUEBA` del borrado | Prueba (incluye los DELETE reales de los tres `new`) |
| **867 – 968** | Aplicación de 0013 (Adenda IV) y su verificación: el **semilla clínico real** (7 familias + 10 clases + 5 categorías, INSERT que permanece) y los `PRUEBA EQV` de la equivalencia (creados y borrados) | Mixto: el semilla es **real**; los `PRUEBA EQV` son prueba |
| **969 – 1095** | Aplicación de 0014 (Tanda 3) y su verificación: recálculo de `completitud` de los productos existentes (updates que permanecen) + todos los artefactos `PRUEBA T3/EQV` (creados y borrados) + el actor del caso 4 del override + la inviolabilidad | Prueba (los updates de `completitud` sobre productos reales permanecen) |

| Dato | Valor |
|---|---|
| **Última entrada al verificar 0007–0009** | id **582** · **2026-07-31** |
| **Última entrada al verificar 0010** | id **819** · **2026-07-31** |
| **Última entrada al verificar 0011** | id **832** · **2026-07-31** |
| **Última entrada al verificar 0012** | id **866** · **2026-07-31** |
| **Última entrada al aplicar/verificar 0013** | id **968** · **2026-07-31** (incluye el semilla clínico real, que permanece) |
| **Última entrada al aplicar/verificar 0014 (CORTE ACTUAL)** | id **1095** · **2026-08-01** (Tanda 3: recálculo de `completitud` real + artefactos `PRUEBA` de la verificación) |

**Interpretación:** el `audit_log` es inviolable, así que las entradas de prueba
permanecen. **La historia operativa real de Wilkins empieza después de la
id 968** (salvo las entradas 47–70 y el semilla clínico de la 0013, que son
vocabulario real del sistema).
Cada tanda que genere entradas de prueba actualiza este corte.

> **Nota sobre los tres `new`:** eran errores de dedo reales de Marien
> (principio, forma, vía). Su borrado (ids de audit dentro del rango 833–866)
> es historia legítima —el Dueño corrigió su catálogo— y quedó registrado con
> su actor. No son "datos de prueba" que se re-crean; se listan aquí solo por
> transparencia del rango.

## 4. Cuentas reales (NO purgar)

| Cuenta | Rol | Nota |
|---|---|---|
| jm.designs.worldwide@gmail.com | dueno | Cuenta real del Dueño. **No es artefacto de prueba.** Su clave provisional de setup debe **rotarse antes del go-live** (no dejarla como quedó en el arranque). |

## 5. Checklist de purga pre-entrega

- [ ] Confirmar 0 registros con prefijo `PRUEBA` **activos** en `producto`, `principio_activo`, `forma_farmaceutica`, `via_administracion`, `medicamento_oficial`.
- [ ] Rotar la clave provisional del Dueño.
- [ ] Dejar constancia del corte del `audit_log` (§3) en la entrega — las entradas de prueba permanecen por diseño.
- [ ] **Residuo inviolable de la Tanda 3 — NO se puede borrar, se documenta:**
  - **2 usuarios `@wfarmacia-test.local`** en `auth.users` (`dueno@`/`cajero@`).
    **No se pueden eliminar:** el `audit_log` inviolable los referencia como
    actor (caso 4 del override y "subir candado" del cajero); borrarlos exigiría
    violar la bitácora. **Son inertes:** `encrypted_password` vacío (no es hash
    bcrypt válido), sin `auth.identities`, `email_confirmed_at` null, dominio
    inexistente (sin magic-link/OTP) y **sin `profile`** → no autentican y, aun
    con sesión imposible, RLS los deja en deny-all. Verificar antes de entregar
    que siguen **sin `profile` y sin poder autenticarse**.
  - De la prueba de inviolabilidad: **1 producto `PRUEBA T3 Inviolabilidad`**
    (borrado en suave → invisible) + **1 fila en cada libro** inviolable
    (`movimiento_inventario` / `historial_costo` / `discrepancia_inventario`).
    Son libros append-only: quedan como parte del corte, marcados `PRUEBA`.

---

_Última actualización: 2026-08-01 (Tanda 3 · Pieza 1 · 0014 — inventario por lote: corte 969–1095 y residuo inviolable)._
