# Tanda 3 · Pieza 3 — Importador masivo (spec de construcción)

> Requisitos fijados por Marien (2026-08-01). Esta es la vara: el importador se
> construye contra esto, punto por punto. El esquema de la reversibilidad ya
> quedó en la migración `0015` (`importacion` + `importacion_id`).

## Lo que decide el diseño

1. **Dos cosas en el mismo archivo.** Wilkins tiene su inventario en un Excel
   viejo hecho a mano, con **productos y lotes mezclados en la misma hoja**. El
   importador **detecta qué trae** y carga ambos en una pasada:
   - Producto: nombre, principio activo, precio, laboratorio.
   - Lote: cantidad, vencimiento, costo, número de lote.
   - Regla: **crea el producto si no existe, y le mete su lote.** (El producto se
     empareja por firma/nombre normalizado; si ya existe, se le agrega el lote.)

2. **Excel y CSV, sin pasarle el problema a Wilkins.**
   - **SheetJS fijado a versión** para `.xlsx` (celdas combinadas, formato).
   - **CSV con separador autodetectado** — coma, punto y coma o tabulador — sin
     preguntar. (En configuración regional español, exportar con `;` es común y
     rompe en silencio: eso lo resolvemos nosotros, no él.)

3. **Números dominicanos.** `1,250.50` y `1.250,50` significan lo mismo. El
   parser entiende **ambos**; si detecta ambigüedad real, **avisa** (no adivina
   en silencio).

4. **Fechas.** `DD/MM/AAAA` es lo nuestro, pero Excel a veces las manda como
   **número de serie**. Y `03/04/2027` es marzo o abril según quién exportó: si
   hay ambigüedad, **se pregunta UNA vez para todo el archivo**, no fila por fila.

## Flujo (cuatro pasos, con progreso visible)

1. **Subir** — arrastrar `.xlsx` o `.csv`.
2. **Mapeo adaptativo** — lee los encabezados y **propone el mapeo solo**
   ("Descripción"→nombre, "Cant"→cantidad, "P. Venta"→precio). El usuario corrige
   con selectores. **Recuerda el mapeo** de la última corrida (`importacion.mapeo`).
3. **Vista previa validada** — primeras 20 filas ya mapeadas; verde = entra
   limpio, ámbar = entra con aviso, rojo = no se puede importar. Resumen arriba:
   "1,240 listas · 380 con avisos · 12 no se pueden, y por qué".
4. **Importar** — barra de progreso real + **reporte descargable** al final.

## Reglas duras

- **Salta filas basura** (encabezados repetidos, totales, filas vacías).
- **Detecta duplicados** contra lo ya cargado por la **firma de equivalencia**.
- **Acepta datos incompletos** — sin vencimiento/costo/lote entra igual, marcado
  incompleto. Bloquear por datos faltantes mata la carga inicial.
- **Una fila que falla NO tumba la importación.** Entra lo bueno, se reporta lo
  malo, y **lo malo se puede corregir y reintentar solo**.
- **Validación en el SERVIDOR, siempre.** Nunca se confía en el archivo.
- **Grande = en el servidor con progreso real.** 5,000 filas no se procesan en
  el navegador: si cierra la pestaña **no se pierde nada** (el estado vive en
  `importacion`; se reanuda). El navegador arma el preview; el servidor procesa
  e inserta por lotes actualizando `filas_procesadas`.
- **Reversible 24h.** Deshacer una corrida revierte lo que creó: soft-delete de
  los `producto`/`lote` con ese `importacion_id`, y para el stock un movimiento
  **contrario** (no se borra el libro inviolable). Marca `importacion.deshecha_en`.

## Cómo se divide en piezas revisables

- **3 · Esquema (migración `0015`)** — `importacion` + `importacion_id`. **Hecho,
  probado en local; pendiente el PAT.**
- **3 · Importador** — el flujo completo (parseo Excel/CSV, mapeo, parsers
  dominicanos, dos entidades, servidor por lotes con progreso, deshacer, reporte).
  Lleva preview para revisión con las manos.

_El `false → null` del override NO va aquí: va en la ventana del override
(`docs/PENDIENTES.md`), que bloquea la Pieza 4._
