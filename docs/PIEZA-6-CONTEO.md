# Tanda 3 · Pieza 6 — Conteo cíclico y calibración de confianza (Adenda II §3)

Cierra la Tanda 3. **Sin migración**: el esquema quedó listo desde la Pieza 1
(`0014`) — tablas `conteo_ciclico` / `conteo_ciclico_linea` / `discrepancia_inventario`
y el enum `producto.estado_verificacion ('verificado','estimado','discrepancia')`.
Esta pieza es 100% capa de app.

## Los 6 requisitos y cómo se cumplen

1. **"aprox. 12"** — ya vivía en la lista de productos (`ProductosLista.tsx`): se
   muestra `aprox.` cuando `estado_verificacion !== 'verificado'`. Un conteo que
   verifica el producto lo pasa a `verificado` y el "aprox." desaparece solo.
2. **Lista diaria 10–15 priorizada** — `abrirConteoDelDia()` elige los productos de
   mayor **valor (precio × existencia)** que están **sin verificar / más antiguos**.
   Tamaño en `TAMANO_LISTA_DIARIA` (15). La **velocidad de venta** entra cuando el
   POS (Tanda 4) empiece a vender; hoy no hay ventas → se prioriza por valor +
   antigüedad (documentado, se afina solo).
3. **Conteo a ciegas** — la página **no** envía `cantidad_sistema` al cliente. Se
   cuenta, se guarda (`guardarConteoLinea`), y solo `revelarConteo()` muestra lo que
   decía el sistema.
4. **Discrepancia permanente con valor en RD$** — `discrepancia_inventario`
   (append-only, trigger `block_mutations`), con `valor`, `diferencia`, causa.
5. **Reconciliación (§Innovación 5)** — `revelarConteo` revisa los movimientos
   recientes del producto y **propone** una causa (`proponerCausa`, heurística: merma
   reciente / salida no cuadrada / entrada o devolución no reflejada / sin señal →
   "revisar"). Es propuesta; la confirma el humano (`causa_confirmada`).
6. **Progreso visible** — barra verde/amarillo/rojo: verificados / estimados /
   con discrepancia, y cuántos faltan.

## La corrección (Camino A, aprobado por Marien) y sus 3 condiciones

Un conteo que no corrige el número no sirve. `confirmarCorreccion()`:

1. **Confirmación humana explícita y obligatoria** — el sistema muestra la diferencia
   y su valor en RD$; la persona confirma. Nunca automático.
2. **Gate por umbral** — si `|valor| ≥ UMBRAL_DISCREPANCIA_RD` (RD$5,000, un solo
   número ajustable), exige **motivo** y rol **Dueño/Administrador** (validado en el
   servidor; la UI lo pide y deshabilita el botón a otros roles).
3. **El movimiento `conteo` guarda AMBAS cantidades** — `cantidad_resultante = contada`
   y `cantidad = diferencia` (sistema recuperable), más `motivo = "sistema=X contada=Y"`.
   Eso permite investigar después.

La corrección: registra la discrepancia permanente → emite el movimiento `conteo`
(libro inviolable, nada se borra) → ajusta `lote.cantidad_actual` a lo contado →
marca el producto `verificado`. **Idempotente**: si ya existe el movimiento de esa
línea (`referencia = conteo-linea:<id>`), no repite.

## Simplificaciones honestas (v1)

- **Conteo por lote** (una línea por lote activo del producto): preserva FEFO y evita
  repartir una diferencia entre lotes. El producto se agrupa en la UI.
- `cantidad_sistema` se **congela** al generar la lista (lo que el sistema creía). Sin
  POS no hay ventas concurrentes que la muevan; cuando exista el POS, conviene revisar
  el conteo a ciegas contra ventas en vuelo.
