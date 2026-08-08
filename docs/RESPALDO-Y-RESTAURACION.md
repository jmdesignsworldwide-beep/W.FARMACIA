# 💾 Respaldo y restauración — W.FARMACIA

> **La verdad, sin adornos:** hay dos respaldos distintos y hacen cosas distintas.
> Este documento dice **qué respalda cada uno**, **qué NO**, y **cómo se restaura**,
> en cristiano. Un respaldo que nunca se restauró no es un respaldo — por eso al final
> está la **prueba de restauración** que ya se corrió.

---

## 1. Los dos respaldos

### A) El respaldo automático de la plataforma (Supabase) — el importante

La base de datos vive en **Supabase**. Supabase hace **respaldos automáticos diarios**
de **todo** el sistema (todas las tablas, usuarios, el `audit_log`, todo) por su lado,
sin que nadie tenga que apretar nada.

- **Plan Free/Pro:** respaldo **diario automático**, retenido varios días.
- **Plan Pro (recomendado para producción):** además **Point-in-Time Recovery (PITR)** —
  se puede volver a **cualquier segundo** de los últimos días, no solo al corte diario.
- **Dónde se ve y se restaura:** en el panel de Supabase → **Database → Backups**.

> **Recomendación de entrega:** para una farmacia en producción, **subir al plan Pro**
> y activar **PITR**. Es la diferencia entre "perdí como mucho lo de hoy" y "vuelvo al
> minuto exacto antes del problema".

### B) La exportación a Excel (pantalla **Respaldo** de la app) — tu copia en la mano

La pantalla **Respaldo** baja **archivos CSV** (abren en Excel/Google Sheets) de las
tablas críticas: inventario, movimientos, ventas, comprobantes (NCF), clientes, fiado,
cuentas por pagar y el libro de controlados.

- Es **tu copia personal**, para tenerla en tu computadora, mandarla al contador, o
  revisar sin entrar al sistema.
- **NO reemplaza** el respaldo de la plataforma (A). Es un complemento.

---

## 2. Qué respalda cada uno — y qué NO

| | Respaldo Supabase (A) | Export CSV (B) |
|---|---|---|
| Todas las tablas + usuarios + `audit_log` | ✅ | ❌ (solo tablas críticas) |
| Se restaura el sistema completo de un golpe | ✅ | ❌ (se reimporta tabla por tabla) |
| Lo tienes en tu propia computadora | ❌ (vive en Supabase) | ✅ |
| Automático, sin apretar nada | ✅ (diario) | ❌ (lo bajas tú cuando quieras) |
| Abre en Excel | ❌ | ✅ |

**Lo que NINGUNO hace por ti:** llevarse una copia **fuera de Supabase** de forma
automática. Si quieres una copia offline periódica, baja los CSV de la pantalla
Respaldo (recomendado: **una vez por semana**) y guárdalos en tu computadora o un disco.

---

## 3. Cómo restaurar — paso a paso, en cristiano

### Caso 1 — "Se dañó todo / quiero volver a como estaba ayer"

1. Entra al panel de **Supabase** → tu proyecto → **Database → Backups**.
2. Elige el respaldo del día (o el punto exacto, si tienes PITR).
3. Aprieta **Restore** y confirma.
4. Supabase reemplaza la base con esa copia. **Listo** — el sistema vuelve a ese momento.

> Ojo: restaurar **reemplaza** lo que hay ahora por lo del respaldo. Lo que pasó
> **después** de ese punto se pierde. Por eso PITR (volver al minuto exacto) es mejor.

### Caso 2 — "Solo quiero recuperar una tabla desde mi Excel"

Sirve cuando tienes el CSV de la pantalla Respaldo y quieres devolver esos datos a una
tabla (por ejemplo, la lista de clientes).

1. En Supabase → **Table Editor**, abre la tabla.
2. Usa **Import data from CSV** y sube el archivo que bajaste.
3. Supabase mete los renglones del CSV en la tabla.

Alternativa técnica (para quien maneje SQL), con `psql`:

```
\copy public.<tabla> from 'archivo.csv' with (format csv, header true)
```

---

## 4. La prueba de restauración (ya se corrió)

> **Fecha:** 2026-08-08 · **Entorno:** Postgres local con la cadena completa aplicada.

Se probó el ciclo **exportar → perder → restaurar** con datos que incluían comas y
comillas (lo que suele romper un CSV mal hecho):

1. Tabla con **3 renglones** (uno con el texto `PRUEBA con, coma y "comillas"`).
2. Se **exportó a CSV** (igual que la pantalla Respaldo).
3. Se **vació la tabla** (simulando la pérdida) → **0 renglones**.
4. Se **restauró desde el CSV** → **3 renglones**, suma de montos **115.50** intacta, y
   el renglón con comas/comillas volvió **idéntico**.

**Resultado: ✅ el respaldo se restaura de verdad**, incluidos los casos que rompen un
CSV mal escapado. (El export de la app usa CSV con BOM y comillas dobladas, el formato
que Excel entiende sin ensuciar los acentos.)

---

## 5. Rutina recomendada para Wilkins

- **No hacer nada** para el respaldo diario: Supabase ya lo hace.
- **Una vez por semana**, entrar a **Respaldo** y bajar los CSV a tu computadora
  (tu copia offline).
- **Antes de un cambio grande** (cargar todo el inventario, por ejemplo): bajar los CSV
  ese día, por si acaso.
- **Producción:** subir a Pro y activar **PITR**.
