# ⛔ PENDIENTES QUE BLOQUEAN — no se pierden por quedar solo dichos

> Este archivo existe porque en este proyecto ya se perdieron cosas por quedar
> solo en el chat. Lo que está aquí **bloquea el cierre de la tanda que lo
> nombra**. No se cierra esa tanda sin resolver su bloqueo, o sin que Marien lo
> levante explícitamente por escrito.

---

## Tanda 3 — Asimetría de seguridad del override de herencia

**Origen:** Adenda IV §1 (herencia molécula → producto). El esquema quedó listo
en la migración `0013` (columnas `producto.es_controlado` / `requiere_receta`
en tres estados `null`/`true`/`false`, más `motivo_control` / `motivo_receta`).
**Falta armar la regla que hace cumplir la asimetría al editar el producto.**

**La regla (obligatoria antes de cerrar la Tanda 3):**

- Subir el candado (molécula no controlada → producto **controlado**, o
  molécula sin receta → producto **con receta**) = más restrictivo = **inofensivo**.
  Se permite sin fricción.
- Bajar el candado (molécula controlada → producto **no controlado**, o
  molécula con receta → producto **sin receta**) = quita una salvaguarda:
  - **`motivo` obligatorio** (no se guarda sin él).
  - **Solo Dueño o Administrador** puede hacerlo (validado en el servidor).
  - Queda en el **`audit_log`** con actor y fecha (la tabla ya lo hace; el
    `motivo` vive como columna en `producto` porque es un hecho de negocio).

**⛔ BLOQUEA el cierre de la Tanda 3.** Hoy no es alcanzable (no hay moléculas
controladas ni inventario), pero el candado debe estar armado **antes** de que
existan productos que puedan bajarlo.

> **Estado (2026-08-01 · Tanda 3 · Pieza 1 · migración `0014`):** el candado
> quedó **ARMADO en la base** (el nivel más fuerte, "ni el administrador"):
> - Trigger `app.enforce_override_candado`: bajar un candado que **la molécula
>   trae puesto** exige **motivo** + `app.has_role('dueno','administrador')`;
>   subirlo o heredarlo (`null`) no pide nada. La herencia toma lo **más
>   restrictivo** de los principios (`app.molecula_candado`). (Se descartó el
>   CHECK ciego "false exige motivo": el formulario escribe `false` por defecto y
>   el CHECK rechazaba los productos ya cargados y las altas nuevas.)
> - El actor y la fecha quedan en `audit_log` (trigger de auditoría de producto).
>
> **Verificado EN PROD (2026-08-01, ventana de PAT de la Tanda 3):** bajar sin
> motivo → rechazado; cajero baja → rol lo niega; Dueño con motivo → guarda y
> queda en `audit_log`; subir sin fricción; herencia multi-principio toma lo más
> restrictivo.

### ⛔⛔ GATE DURO ANTES DE LA PIEZA 4 — el hueco del `false` legado

**El problema (decisión de Marien, 2026-08-01):** hoy el alta escribe
`es_controlado = false` al crear. `false` **no** es "hereda" — es "sobrescrito a
no controlado", y se escribió **sin** motivo ni rol porque no fue un "bajar
candado". Cuando el semilla DIGEMAPS (Pieza 4) marque la Morfina como controlada,
**todos los productos ya cargados tienen `false` encima y NO van a heredar**:
quedan como no controlados, en silencio, sin error. Un controlado despachado por
un cajero, sin receta y fuera del libro.

**No se carga el semilla (Pieza 4) hasta que esté hecho esto:**

1. **El alta escribe `null`, no `false`.** Crear un producto sin decidir nada =
   hereda. (`src/app/(app)/productos/actions.ts`: `camposProducto` deja de hacer
   `Boolean(...)`; marcado explícito = `true`, sin marcar = `null`.)
2. **Migrar los productos existentes:** todo `false` puesto por defecto (no por
   decisión con motivo) → `null`. Hoy son pocos; después del semilla es
   arqueología. (Migración de datos por PAT, **antes** del `insert` del semilla.)
3. **La pantalla de edición pide el motivo al bajar un candado heredado**, con la
   validación de rol en servidor (la base ya lo exige; falta la UI).
4. **En pantalla se ve de dónde viene cada candado:** "controlado (heredado de
   Morfina)" · "controlado (marcado manualmente)" · "no controlado — sobrescrito
   por [quién], motivo: [cuál]".

**⛔ BLOQUEA LA PIEZA 4.** (Independiente de la Pieza 2, que puede seguir.)

> **Estado (2026-08-01):**
> - **(1) HECHO** — el alta escribe `null` (heredar), no `false`
>   (`camposProducto`: marcar = `true`, sin marcar = `null`).
> - **(2) LISTO, falta PAT** — migración `0017` convierte los `false` legados
>   (sin motivo) a `null`; los `false` **con motivo** (override deliberado) se
>   respetan. Probado en local (legacy→null, override se queda; idempotente).
> - **(2) APLICADO EN PROD (2026-08-01)** — ventana de PAT: los 3 productos del
>   panel (`false` sin motivo) pasaron a `null`; 0 `false` con motivo tocados;
>   herencia en vivo probada (producto null + molécula controlada → hereda).
> - **(3) y (4) HECHO** — el candado en el formulario es de **tres estados**
>   (Heredar / Sí / No) con **procedencia** visible (heredado de X / manual /
>   sobrescrito por quién, con motivo). Bajar un candado heredado exige **motivo**
>   y **solo Dueño/Admin** (la UI lo pide y lo deshabilita; el trigger de la base
>   lo enforce). La molécula del principio elegido calcula la herencia en vivo.
>
> **✅ GATE CERRADO.** El semilla DIGEMAPS (Pieza 4) queda desbloqueado en cuanto
> se mergee esta pieza (PR con la 0017 + el formulario de tres estados).

---

## Tanda 3 — Idempotencia del semilla grande (DIGEMAPS) contra identidad estable

**Origen:** Adenda IV §6. La `0013` sembró el vocabulario clínico mínimo (7
familias alergénicas + clases básicas) con una **`clave_semilla`** estable por
entrada. En la Tanda 3 llega el semilla grande de la DIGEMAPS (~300 principios).

**La regla (obligatoria antes de cerrar la Tanda 3):**

- La carga del semilla grande **debe ser idempotente contra `clave_semilla`**:
  `insert ... on conflict (clave_semilla) do nothing/update`, nunca ciega.
- Si vuelve a insertar "Penicilinas" sin respetar la clave, quedan **dos
  familias alergénicas duplicadas** y la **alerta cruzada de alergia empieza a
  fallar en silencio** (un producto queda en una familia, otro en la otra, y la
  comparación por familia deja de coincidir). Ese es el modo de fallo a impedir.
- Si el Dueño borró una entrada de semilla, la recarga **no la resucita** sin
  avisar (decisión de la Tanda 3).

**⛔ BLOQUEA el cierre de la Tanda 3.**

> **Estado (2026-08-01 · Pieza 1 · `0014`):** la tabla `medicamento_oficial`
> quedó con la identidad estable lista — `unique(registro_sanitario)` y
> `unique(clave_semilla)`. La carga del semilla grande (Pieza 4) debe entrar
> `on conflict (registro_sanitario) do nothing/update`, nunca ciega. Probado en
> local: reinsertar el mismo `registro_sanitario` deja **una** fila. **El semilla
> grande de la Pieza 4 sigue pendiente.**

---

## Tanda 3 — Idempotencia de `medicamento_oficial` por `registro_sanitario`

**Origen:** decisión de Marien (Opción A del buscador de autocompletado). El
catálogo oficial DIGEMAPS es una tabla de **referencia** (no inventario): un
medicamento oficial no es un producto de Wilkins hasta que él lo agregue.

**La regla (obligatoria antes de cerrar la Tanda 3):**

- Identidad estable por `registro_sanitario` (`unique`), para que **el semilla
  grande de la Pieza 4 no duplique**. Si duplica, el buscador ofrece dos veces
  el mismo registro y el autocompletado se ensucia.
- La carga es idempotente: `on conflict (registro_sanitario) do nothing/update`.
- Un producto **puede** crearse fuera del registro (`producto.fuera_de_registro`):
  es información que el Dueño quiere, no un error.

**Estado (`0014`, verificado EN PROD 2026-08-01):** el esquema (unicidad por
`registro_sanitario` + `clave_semilla` + marca `fuera_de_registro`) quedó listo;
en prod se reinsertó el mismo `registro_sanitario` y quedó **una** fila.
**BLOQUEA el cierre de la Tanda 3** hasta la carga del semilla grande (Pieza 4,
`on conflict (registro_sanitario)`) y el buscador que la consume.

---

_Última actualización: 2026-08-01 (Tanda 3 · Pieza 1 · migración 0014)._
