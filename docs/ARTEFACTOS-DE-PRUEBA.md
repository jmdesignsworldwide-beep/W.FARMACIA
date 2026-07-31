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

**Ninguno en producción.** Las pruebas del modelo de producto y de la
equivalencia (principios activos, formas, vías, productos combinados) se
corrieron **en un Postgres LOCAL desechable**, aplicando las migraciones
`0001→0007` con un shim de Supabase — **nunca contra la base real**. Por eso la
base de producción **no** contiene productos, catálogos ni principios de mentira.

> A partir de la Tanda 2 (cuando el formulario de producto y los catálogos
> escriban en la base real), cada dato ficticio que se cree para probar se
> registra aquí, con su ID, fecha y propósito, y se prefija `PRUEBA`.

## 3. Corte del `audit_log` — dónde empieza la historia real

El `audit_log` es **inviolable** (§2.2): las entradas de prueba **no se pueden
borrar**, y eso es precisamente la evidencia de que la tabla funciona. Por eso
se marca el corte en vez de limpiarlo.

| Dato | Valor |
|---|---|
| Total de entradas al 2026-07-31 | **46** (todas sobre `profiles`) |
| Primera entrada | id **1** · 2026-07-31 03:01:50 UTC |
| **Última entrada de prueba/setup (CORTE)** | id **46** · `profiles` DELETE · **2026-07-31 06:54:04 UTC** |

**Interpretación:** las entradas **id 1–46** son ciclo de vida de setup de
Tanda 1 (alta del Dueño, prueba de vida) y de las pruebas de hermeticidad de
roles (alta/elevación/baja de los usuarios de prueba). **La historia operativa
real de Wilkins empieza después de la id 46.** Cada tanda que genere entradas de
prueba registrará aquí su rango.

## 4. Cuentas reales (NO purgar)

| Cuenta | Rol | Nota |
|---|---|---|
| jm.designs.worldwide@gmail.com | dueno | Cuenta real del Dueño. **No es artefacto de prueba.** Su clave provisional de setup debe **rotarse antes del go-live** (no dejarla como quedó en el arranque). |

## 5. Checklist de purga pre-entrega

- [ ] Confirmar 0 usuarios `@wfarmacia-test.local` en `auth.users`.
- [ ] Confirmar 0 registros con prefijo `PRUEBA` en `producto`, `principio_activo`, `forma_farmaceutica`, `via_administracion`.
- [ ] Rotar la clave provisional del Dueño.
- [ ] Dejar constancia del corte del `audit_log` (§3) en la entrega — las entradas de prueba permanecen por diseño.

---

_Última actualización: 2026-07-31 (Tanda 2 · migración 0007)._
