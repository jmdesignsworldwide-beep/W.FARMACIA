# Listado de Medicamentos de Venta Libre (MVL) — base regulatoria de `requiere_receta`

## Fuente (guardar en el sistema — no se pierde)

- **Documento:** Resolución No. **000009**, Ministerio de Salud Pública (MISPAS) /
  DIGEMAPS — *"Que oficializa el listado de medicamentos de venta libre sin receta"*.
- **Fecha:** **26 de junio de 2017** (sello "26 JUN 2017").
- **Naturaleza:** PDF **escaneado, solo imágenes, sin capa de texto** (generado con
  "Adobe Acrobat 8.1 Image Conversion"). No es una tabla digital ni texto corrido:
  son fotos de una tabla mecanografiada. El listado se obtuvo por **transcripción
  manual leyendo las imágenes** (no OCR automático), página por página.
- **Archivo transcrito:** [`mvl_res_000009-17.csv`](./mvl_res_000009-17.csv) —
  **207 entradas**, orden alfabético por principio activo (ACETAMINOFEN → XILOMETAZOLINA).

> **Pendiente de verificar (lo busca Marien):** puede existir una versión posterior.
> La DIGEMAPS estuvo recibiendo solicitudes de inclusión hasta 2025. Hasta que
> aparezca una versión más reciente, **la 000009-17 es la base vigente**. El día que
> salga una nueva, hay que saber sobre qué base se estaba operando (por eso la fuente
> y la fecha se guardan en el sistema).

## Estructura del listado (5 columnas)

| # | Columna | Nota |
|---|---------|------|
| 1 | `No.` | Orden en la resolución (1–207). |
| 2 | `Nombre Genérico` | Principio activo **o composición** (los combos usan `+`). Viene **separado**, no pegado a un nombre comercial. |
| 3 | `Concentración máxima` | Puede ser un valor, un tope (`Hasta 500 mg`) o `NO DEBE EXCEDER…`. **14 celdas vienen tachadas en el original** (ver abajo). |
| 4 | `Forma Farmacéutica` | Puede listar varias formas separadas por `/`. |
| 5 | `Observaciones / Recomendaciones` | Advertencia regulatoria (texto libre). |

**No trae** registro sanitario, nombre comercial ni laboratorio: es una lista **por
molécula/composición**, no por producto. Alimenta `requiere_receta` a nivel de
principio activo (el cerebro clínico), **no** la tabla `medicamento_oficial`
(que va por `registro_sanitario`).

> Nota de transcripción: el texto se transcribió **sin diacríticos** (ASCII) para
> evitar problemas de codificación. El contenido clínico (principio, concentración,
> forma) es fiel; solo se normalizaron acentos en observaciones.

## Las 14 celdas ILEGIBLES en el origen (nunca se adivinan)

La concentración de estas 14 entradas viene **tachada con un recuadro negro en el PDF
oficial**. Quedan marcadas `[ILEGIBLE - celda tachada en el origen]` y **no se
inventa** su valor:

`#32` Ácido bórico + calamina + glicerina + mentol + óxido de zinc + talco ·
`#42` Agua estéril · `#46` Alcanfor · `#47` Alcanfor + trementina + mentol +
eucalipto + timol · `#70` Calamina · `#71` Calamina + difenhidramina ·
`#72` Calamina + óxido de zinc · `#73` Calamina + óxido de zinc + difenhidramina ·
`#155` Mentol · `#156` Mentol + salicilato de metilo + eucalipto ·
`#168` Óxido de zinc · `#169` Óxido de zinc · `#199` Vitamina A palmitato +
vitamina D3 + óxido de zinc · `#205` Vitamina E + extracto de áloe.

(Todas son de uso tópico; su concentración no se pudo leer en el documento oficial.)

## Reglas de negocio fijadas por Marien (2026-08-01)

1. **Carga literal de las 207.** La **regla de derivados NO se automatiza.**
2. **Asimetría de seguridad (igual que el override):**
   - **En la lista → venta libre.** Es dato oficial, sin fricción.
   - **No estar en la lista ≠ "requiere receta" por inferencia.** Significa
     **"sin determinar"**, y el sistema lo trata **como que exige receta por
     precaución**, mostrando **"no consta en el listado MVL — verificar"**.
   - Un sistema que dice *"no sé, verifica"* es más seguro que uno que adivina y se
     equivoca en la dirección peligrosa (dejar pasar sin receta lo que la necesitaba).
3. **Regla de derivados — documentada, no automatizada.** La resolución cierra con:
   > *"Quedan incluidos como medicamentos de venta libre los principios activos y/o
   > las combinaciones de principios activos que se deriven de lo expresado en este
   > listado, siempre y cuando no excedan las concentraciones máximas permitidas."*

   Esa derivación **la decide el farmacéutico**, no una inferencia del sistema.
4. **Topes de concentración: se guardan** (aunque no se automatice la derivación).
   Si la lista dice `Hasta 500 mg`, un producto de 650 mg **no** es venta libre —
   eso es una **comparación directa**, no una inferencia. (17 entradas traen tope:
   `#1,2,3,10,12,15,16,17,24,27,40,93,137,138,187,188,206`.)
