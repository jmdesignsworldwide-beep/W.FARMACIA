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
> - CHECK `chk_motivo_control` / `chk_motivo_receta`: un candado en `false` sin
>   `motivo` **no se guarda nunca** (cualquier rol).
> - Trigger `app.enforce_override_candado`: bajar un candado que **la molécula
>   trae puesto** exige `app.has_role('dueno','administrador')`; subirlo o
>   heredarlo (`null`) no pide nada. La herencia toma lo **más restrictivo** de
>   los principios (`app.molecula_candado`).
> - El actor y la fecha quedan en `audit_log` (trigger de auditoría de producto).
>
> **Verificado EN PROD (2026-08-01, ventana de PAT de la Tanda 3):** bajar sin
> motivo → rechazado (`check_violation`); cajero baja → rol lo niega; Dueño con
> motivo → guarda y queda en `audit_log`; subir sin fricción; herencia
> multi-principio toma lo más restrictivo. El motivo+rol se exige **solo al bajar
> un candado que la molécula trae puesto** (no un CHECK ciego: el formulario
> escribe `es_controlado=false` por defecto y un CHECK lo rechazaría).
>
> **Sigue bloqueando el cierre** por la capa de app:
> 1. La pantalla de edición debe pedir el motivo al bajar el candado (hoy la base
>    lo exige, pero la UI aún no lo ofrece).
> 2. **El formulario escribe `false` por defecto (modelo de dos estados).** Antes
>    de que existan moléculas controladas (semilla DIGEMAPS, Pieza 4), el alta
>    debe pasar a escribir **`null` (heredar)** y migrarse los `false` legados a
>    `null` — si no, un producto con molécula controlada se queda en `false` (no
>    controlado) **sin** motivo ni aprobación, saltándose el candado en silencio.

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
