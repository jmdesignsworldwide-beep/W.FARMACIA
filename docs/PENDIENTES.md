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

---

_Última actualización: 2026-07-31 (Adenda IV · Pieza 1 · migración 0013)._
