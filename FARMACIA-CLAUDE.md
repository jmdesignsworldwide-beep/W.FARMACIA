# 💊 FARMACIA-CLAUDE.md

## DOCUMENTO MAESTRO — Sistema Farmacia Wilkins

### JM Nexus Designs · Arquitectura, estándar y hoja de ruta

> **Para Claude Code:** este documento vive en la raíz del proyecto. **Léelo completo al inicio de cada sesión** y vuelve a él antes de cada tanda. Consolida el ADN de JM Nexus, la arquitectura, las cuatro adendas de innovación y el estado real del sistema.
>
> **Si algo de lo que Marien te dice contradice este documento, párate y pregúntale.** No construyas sobre una contradicción.

---

# PARTE 0 — CÓMO TRABAJAMOS

Marien es la fundadora, **no técnica**. Ella dirige, supervisa y aprueba. Tú construyes.

### Reglas de la relación

- **Háblale en cristiano.** Nada de jerga ni código en el chat a menos que ella lo pida.
- **Una pieza a la vez.** Construyes → ella prueba en preview con sus manos → aprueba → **tú mergeas** → siguiente pieza sobre `main` limpio.
- **Investiga antes de construir.** Mira lo que existe, propón el plan, construye tras su OK.
- **Marien nunca mergea. El merge es tuyo** en cuanto ella da el visto. **Ella cierra tandas, tú mergeas PRs.**
- **Nunca dejes un PR en borrador si está listo para revisión.** Un borrador no se puede mergear.
- **Un PR por pieza entregable.** Nunca medio módulo acumulado en una rama.
- **Cuando ella deja una condición pendiente, no construyes encima.** Dile que estás bloqueado y espera.
- **Si lo que ella te dice no cuadra con lo que ves, verifica y párate.** No asumas que ella tiene razón — ya te salvó de borrar 9 commits.
- **Sé su socia honesta.** Haz pushback. Si algo es mala idea, dilo. Si ves un riesgo, señálalo antes de que ella lo encuentre.
- **"Mergeamos y seguimos"** significa que ya revisó y ya revocó el PAT. No pidas verificación — continúa.
- **Verde solo cuando es verde.** Nunca declares algo cerrado que no probaste.
- **El estándar no es "¿funciona?"** Es **"¿el cliente va a decir WOW?"**

### Contexto del proyecto

Sistema de farmacia **real, en producción, para un cliente que paga** — Wilkins José Santos Suero (Olympia Gym Fitness SRL, RNC 1-33-28504-5). Contrato de RD$50,000, 50/50, dos meses de soporte post-entrega.

**Va a ser mostrado a muchas otras farmacias.** Cada pantalla es una carta de presentación.

Farmacia **dominicana**: RD$, ITBIS 18% con exentos, cédula/RNC, fechas DD/MM/AAAA, español dominicano en toda la interfaz. Hoy trabajan con un sistema viejísimo y la mayor parte a mano.

---

# PARTE 1 — STACK Y PROTOCOLOS

### Stack

Next.js (App Router) · TypeScript · Tailwind · Framer Motion · lucide-react · Supabase (Postgres + Auth + Storage + RLS) · Vercel · GitHub `jmdesignsworldwide-beep/w.farmacia`

**Dinero siempre `NUMERIC(14,2)`.** Nunca float.

> **Nota de versión (2026-08-08):** el proyecto corre **Next.js 14.2.35** (se subió desde 14.2.15 para cerrar la crítica del middleware, CVE-2025-29927). El salto a Next 15/16 cierra 5 *high* restantes pero es ruptura — se hace con Marien probando.

### 🔑 Protocolo del PAT — obligatorio

El flujo de Marien es **preview primero, merge después**. El esquema tiene que estar aplicado antes de que ella pruebe.

1. Cuando necesites un cambio de esquema, **pídeselo explícitamente**.
2. Ella genera un PAT temporal y te lo pasa.
3. Tú aplicas por **Management API**, solo en memoria.
4. Le avisas **al instante** y ella lo revoca.

**Reglas duras:**
- **Nunca escribas el PAT en el chat, ni truncado, ni parcial.**
- **Nunca pidas una `DATABASE_URL`** — es permanente, con contraseña adentro. Prohibida.
- **Todo cambio de esquema queda como archivo de migración numerado en el repo.**
- **Prueba la idempotencia en local ANTES de pedir el PAT.** Aplica la cadena completa desde cero y re-aplica la nueva 2-3 veces.
- **Agrupa.** Cada ventana es riesgo. Si vienen dos migraciones, júntalas.
- **Auto-deploy de migraciones APAGADO** durante toda la construcción.
- **Si el PAT está revocado, NO se toca producción.** La migración queda en el repo, probada en local, y el código **degrada con gracia** hasta que se aplique (con PAT nuevo o el SQL Editor de Supabase).

### 🔒 Fort Knox — los diez pilares, desde la línea cero

1. Ninguna llave expuesta. `service_role` solo servidor, nunca `NEXT_PUBLIC_`.
2. **RLS + FORCE en toda tabla, en la misma migración que la crea.**
3. Toda validación de permiso, rol y vigencia **en el servidor**.
4. Protección contra inyección SQL y saneamiento de entrada.
5. Cabeceras de seguridad (CSP, HSTS).
6. Rate limiting por usuario, del lado del servidor.
7. Cero secretos en el código.
8. **Cero vulnerabilidades conocidas en dependencias.** Nunca metas una librería con CVEs.
9. Ningún endpoint ni RPC sin autenticar. `SECURITY DEFINER` con `search_path` fijo y `execute` revocado a `anon`.
10. **Security Advisor limpio** como paso de cierre de toda tanda.

**Además, en este sistema:** medicamentos controlados y datos de salud. El historial es **permanente e inalterable** — solo INSERT y SELECT, con triggers que bloquean UPDATE y DELETE **ni para el administrador**.

---

# PARTE 2 — ADN VISUAL

### El borde luminoso (firma de JM Nexus)

```
box-shadow: 0 0 0 1px rgba(acento, 0.4), 0 0 8px rgba(acento, 0.15);
```

Borde de 1px del acento, glow **muy ceñido**. ❌ **Nunca** sombra difusa. ❌ Nunca halo grande.

Las tarjetas protagonistas llevan el borde más brillante. **Jerarquía visual siempre** — no todas las tarjetas pesan igual.

### Consistencia obsesiva

- **Count-up** en todos los KPIs y montos
- **`tabular-nums`** en absolutamente todos los números
- **Un solo timing:** stagger 60–80ms, curvas spring
- **AnimatePresence** en todos los modales
- Cero layout shift. `prefers-reduced-motion` respetado
- **Dos temas premium** — el claro es crema cálido diseñado, no una inversión
- **390px real**, ambos temas, todas las pantallas

### El sello de identidad

La cápsula farmacéutica, repetida **con elegancia** — nunca copiada idéntica. Cada estado vacío lleva su ícono de contexto con el sello integrado abajo a la derecha, y el anillo teñido con su tono semántico. El crédito **"Hecho por JM Nexus Designs"** vive en el pie de la barra lateral, con el **único enlace externo** del sistema, y **solo al Instagram**.

### Reglas de composición

- **Cero scroll dentro de tarjetas.** Máximo 5 filas + "Ver todos →"
- **Clic = más info, en todo.** Cero botones muertos
- **Dashboard ordenado por urgencia, no por categoría**
- **Estados vacíos premium** — medallón, tipografía con carácter, copy cálido dominicano, CTA que resuelve
- **Nunca cajas gigantes vacías.** La tarjeta se ajusta a su contenido
- **Aprovecha el ancho.** Formularios en dos columnas en escritorio, una en móvil
- **Toda la identidad en UN archivo de tokens.** Ni un color escrito a mano

### Semáforo de vencimiento — consistente en todo el sistema

verde >180 días · ámbar 90–180 · naranja 30–90 · rojo <30 · gris vencido

---

# PARTE 3 — ADN ARQUITECTÓNICO

### El principio del organismo

**Un dato viaja a todos lados.** Cobrar una venta actualiza a la vez: caja, dashboard, inventario, historial del cliente, historial del empleado y panel financiero. **Nunca dupliques** — cada función, etiqueta, cálculo y componente vive en un solo lugar.

### Reglas duras de datos

- **La existencia es la suma de los lotes activos.** Nunca un `stock` guardado en `producto`
- **Movimientos append-only.** Nunca se edita uno; se emite el contrario
- **Redondeo al peso consistente en todos los módulos**
- **`sucursal_id` desde el esquema.** Producto compartido, existencia por sucursal
- Soft-delete + `audit_log` en toda tabla de producción

### Los cinco roles — validados en servidor

| Rol | Ve y hace | NO puede |
|---|---|---|
| **Dueño** | Todo | — |
| **Administrador** | Todo lo operativo + reportes + usuarios | Alterar el historial inviolable |
| **Farmacéutico** | Despacho, recetas, controlados, inventario, clientes | Ver ingresos ni márgenes |
| **Cajero** | POS, caja del turno, consulta | Costos, márgenes, finanzas, anular sin autorización |
| **Motorista** | Solo sus entregas | Todo lo demás |

**Esconder un botón NO es seguridad.** Cada rol se prueba intentando entrar **por URL directa** y **por llamada directa a la acción de servidor**.

### 🔑 La abstracción de pagador — la decisión más importante

Una `venta` **no asume que el cliente pagó todo**. Genera un monto que se **asigna entre uno o más pagadores**:

- `pagador` → por defecto el cliente · puede ser empresa/clínica a crédito · **y el día que quieran, una ARS**
- `venta_linea` lleva `monto_cubierto` y `monto_paciente` **nullable desde hoy**

**Wilkins no usa ARS hoy pero quiere eventualmente.** Con esto, el fiado funciona ya y la ARS entra después **sin abrir el POS de una farmacia viva.**

---

# PARTE 4 — EL MODELO CLÍNICO

*(Sin cambios respecto a la versión maestra: producto vs. lote, principios activos muchos-a-muchos, concentración normalizada, la regla de equivalencia de cuatro condiciones, catálogos críticos vs. libres, la herencia de la molécula con asimetría de seguridad, venta libre por la Resolución 000009-17, y la alerta cruzada de alergia por familia. Todo eso está construido y probado — ver Parte 8.)*

### ⚠️ Alerta cruzada de alergia (recordatorio)

Cada molécula pertenece a una `familia_alergenica`. Al despachar, el sistema compara **la familia**, no la molécula:

> 🚨 El paciente es alérgico a **Amoxicilina**. **Ampicilina** es de la misma familia (**Penicilinas**). **No despachar sin confirmación.**

**Probado (2026-08-08):** alérgico a Penicilinas pidiendo Ampicilina → dispara. **Ninguna farmacia en RD tiene esto.**

### 🔒 Corrección legal (CIERRE, 2026-08-08) — parte del modelo clínico ahora

- **Receta física en mano.** El despacho con receta solo se completa con la receta **física, impresa y legible**. Una foto puede acompañar el expediente, **nunca habilita el despacho**. No hay "receta por WhatsApp": se sustituyó por **apartado/reserva** (el cliente avisa qué va a buscar; trae la receta al recoger).
- **Ningún mensaje automático nombra el medicamento.** Recordatorios, encargos, fiado y delivery mandan mensajes **neutros** ("su pedido está listo") — nunca revelan una condición de salud (Ley 172-13).
- **Consentimiento de datos (Ley 172-13)** por cliente, con fecha, revocable, y **opción de no recibir mensajes** respetada en todo el sistema. Política de privacidad visible en `/privacidad`.
- **Aviso legal** en toda pantalla clínica: *"Este sistema es una herramienta de gestión e información. No sustituye el criterio del profesional farmacéutico."*
- **Patrón sospechoso** de controlados: **dato, no juicio**, solo al farmacéutico, nunca bloquea solo.
- **Servicios** (presión/glucosa): se registran como servicio, **sin interpretación** ("su presión sube"), con aviso informativo.

---

# PARTE 5 — LAS SEIS IDEAS DE NEGOCIO

*(Las seis ideas están construidas y vivas — ver Parte 8: suscripción/crónicos, vencimiento como ventana de opciones, los tres estados del dinero, deriva de costo en la recepción, pronóstico de flujo de caja, y el mostrador como conversación con panel único.)*

---

# PARTE 6 — SUPERVIVENCIA

*(Sin cambios: el sistema nunca bloquea una venta por datos incompletos; calibración de confianza con conteo cíclico a ciegas; presupuesto de velocidad medido; el sistema también es para el empleado; recuperación del error con anulación al mismo lote y carrito que nunca se pierde.)*

> **Nota de integridad del conteo (2026-08-08):** los **servicios ahora descuentan sus insumos** (jeringa, algodón, alcohol…) del inventario por FEFO, para que el conteo cíclico **no marque discrepancia** todos los meses por los servicios prestados. Requiere aplicar la migración `0042` en producción.

---

# PARTE 7 — 🚨 MUSEO DE ERRORES

| # | Lo que pasó | La regla |
|---|---|---|
| 1 | **18 tandas revisadas sobre previews sin base de datos detrás** | **Ninguna tanda cierra hasta crear un registro, guardarlo, y que persista tras recargar** |
| 2 | Rama por defecto en una rama de trabajo | `main` por defecto, verificado |
| 3 | Producción apuntando a `main` viejo | Verificar Production Branch al cerrar |
| 4 | Typo en variable de entorno → admin muerto | Lista exacta + **el código verifica al arrancar y falla ruidosamente** |
| 5 | URL de un proyecto con llave de otro | Todas las credenciales del **mismo** proyecto, **una sola sentada** |
| 6 | Carácter invisible en una llave → checkout muerto | Validar formato de toda llave |
| 7 | Previews públicos con datos de pacientes | Deployment Protection desde el día uno |
| 8 | Modales anclados abajo en móvil | Probar a 390px reales |
| 9 | Error de hidratación intermitente | Todo `null`/`undefined` manejado explícitamente |
| 10 | Sombra difusa en vez de borde luminoso | El valor exacto está en la Parte 2 |
| 11 | Texto ilegible en tema claro | Contraste verificado en **ambos** temas |
| 12 | Imágenes externas con 403 | **Nunca Cloudinary.** Repo o Supabase Storage |
| 13 | Animaciones exageradas que abaratan | Sutil siempre gana |
| 14 | Brief de otro proyecto en la sesión equivocada | Si algo no corresponde, **párate y pregunta** |
| 15 | El estándar bajaba entre proyectos | **Este documento** |
| 16 | Migración aplicada 2× con contenidos distintos | **Idempotencia probada ANTES del PAT** |
| 17 | `false` escrito por defecto rompiendo la herencia futura | **El alta escribe `null`, no `false`** |
| 18 | **Reiniciar la rama desde un `origin/main` viejo (sin `git fetch`) → conflicto de merge en el siguiente PR** | **`git fetch origin main` SIEMPRE antes de reiniciar la rama.** Y `--force-with-lease` sobre un ref stale falla: refresca el ref o usa `--force` solo en tu rama de trabajo |
| 19 | **Declarar en la bitácora que un ajuste "ya se consumía" sin verlo en el código** (el umbral de conteo seguía siendo constante fija) | **No declares consumido lo que no rastreaste.** Si dices que una config alimenta una pantalla, abre el archivo y compruébalo — y si te equivocaste, corrígelo de frente en la bitácora |
| 20 | **Fingir "respaldo automático de la app" cuando solo hay export a demanda** | **Di la verdad de lo que es.** El respaldo automático es el de la plataforma (Supabase); el CSV es la copia en la mano. Y **un respaldo que nunca se restauró no es un respaldo** — pruébalo restaurando una vez |

---

# PARTE 8 — ESTADO ACTUAL (2026-08-08)

### ✅ Completado y en producción — Tandas 0 a 20

**Cimientos (T0–T3):** repo, Supabase, Fort Knox, diseño tokenizado, auth, 5 roles, auditoría inviolable; maestro de productos con equivalencia segura (8/8) y catálogos; inventario por lote con movimientos append-only, historial de costo, importador masivo, conteo cíclico con calibración de confianza, y listado de venta libre (207).

**Operación y clínica (T4–T14):** **POS completo** (FEFO, fraccionamiento, pago mixto, venta en espera, "¿cuánto le alcanza?", vuelto dominicano, descuento de ley); **caja diaria**; **motor fiscal NCF** (B01/B02); **clientes** con alergias y **alerta cruzada por familia**, crónicos con detección automática, servicios; **empleados y seguridad**; **proveedores y recepción** (con deriva de costo, vida útil corta y refrigerado); **radar de vencimientos** por ventana de devolución; **controlados** con libro inviolable y carpeta DIGEMAPS; **panel financiero** (tres estados del dinero, rentabilidad real, flujo de caja); **reportes** (merma tipificada, robo hormiga).

**Cierre del sistema (T15–T20):** **fiado y cuentas por cobrar/pagar**; **delivery** con vista del motorista hermética; **configuración** (`/ajustes`) y **respaldo/export**; **dashboard vivo** (tres estados) y **panel móvil 390px**; **PWA offline** (instalable, service worker, IndexedDB — consulta offline, el cobro exige conexión); **elevación de seguridad** (auditoría por rol, `npm audit` con la crítica cerrada, advisors revisados, crédito JM Nexus).

**CIERRE MAESTRO (2026-08-08):**
- **Corrección legal** completa (receta física, mensajes neutros, consentimiento 172-13, disclaimers, patrón como dato) — ver Parte 4.
- **Inteligencia de proveedores**: mínimo por producto → **orden de compra por WhatsApp**; **ficha de cumplimiento** calculada (completitud, honró cotización, pendiente de pago); las 3 alertas de recepción.
- **Recibo imprimible** térmico 80mm (auto al cobrar configurable, reimprimible, vista previa).
- **Nota de crédito B04 automática al anular** (referencia al NCF original; el original inviolable queda intacto).
- **Cambio de clave forzado** al primer ingreso (mata la clave temporal por WhatsApp).
- **Respaldo honesto** (documento de restauración probado + export ampliado).
- **Insumos por servicio** (`0042`) para que el conteo cíclico cuadre.

### ⏳ Pendientes documentados (dependen de datos o de afuera)

- **Aplicar la migración `0042`** (insumos por servicio) en producción — **el PAT fue revocado**; se aplica con un PAT nuevo o el SQL Editor de Supabase. Hasta entonces, los servicios se registran sin descontar (degrada con gracia).
- **Semilla DIGEMAPS** — servidor del MISPAS caído (504). Tabla y carga idempotente listas.
- **Enlazar las 207 de venta libre** al catálogo de principios (22 ambiguas a mano).
- **Verificar versión posterior** de la Resolución 000009-17.
- **Comparador de precios entre droguerías** — dato listo, vista pendiente (necesita varios proveedores por producto).
- **Estacionalidad / demanda proyectada** (`/insights`) — necesita meses de historia. Día noventa.
- **Días reales de entrega** en la ficha del proveedor — se enciende al enlazar orden↔recepción.
- **Activación e-CF** — certificado digital + certificador + rangos DGII.

### 📋 Checklist de entrega — estado honesto

- ✅ Cero disclaimers de demostración · ✅ Crédito JM Nexus (solo Instagram) · ✅ Receta física · ✅ Mensajes neutros · ✅ Nota de crédito B04 · ✅ Cambio de clave forzado.
- ⚠️ **Purga de artefactos** — producción sin artefactos nuevos; quedan 2 usuarios + 1 producto **inertes** referenciados por libros inviolables (documentado).
- ❌ **Leaked Password Protection** — requiere plan **Pro** (Supabase devolvió 402).
- ❌ **`npm audit`** — cerrada la crítica; quedan 5 *high* que solo cierra Next 15/16 (ruptura, con Marien probando).
- ⚠️ **Advisors** — 3 WARN de `SECURITY DEFINER` aceptados por diseño (RPC del POS con `search_path` fijado).
- ⬜ **Rotar la clave provisional del Dueño** · **Deployment Protection / Production Branch en Vercel** · **capacitación + carga de inventario real** — presencial con Marien.

### 🗺️ Ruta

Tandas 1–20 **entregadas**. Solo queda la **21 (condicional): activación e-CF**, cuando lleguen el certificado digital de Wilkins, el proveedor certificador y los rangos de la DGII. **El sistema se entrega completo y operativo en NCF.**

---

# PARTE 9 — PROTOCOLO DE CALIDAD

### Las tres pasadas

1. **Funcional** — ¿todo hace lo que dice? ¿Botones muertos? ¿Flujos completos contra Supabase?
2. **Premium** — ¿se ve caro? ¿Dónde se ve genérico?
3. **Del cliente** — recórrelo como el dueño en su día real. ¿Dónde se traba? ¿Qué le falta?

> **Si no encontraste NADA que mejorar en alguna pasada, se hizo mal.**

### ✅ Cierre de tanda — no negociable

1. Registro creado, guardado, **persistente tras recargar**
2. Cero botones muertos · plomería real contra Supabase
3. RLS + FORCE en toda tabla nueva, en su misma migración
4. **Los 5 roles probados por URL directa y por llamada directa**
5. Tema claro y oscuro · **390px real**
6. PAT temporal usado **y revocado** (o, si está revocado, migración probada en local y código que degrada con gracia)
7. Migración numerada en el repo, **idempotente**
8. **Las 8 pruebas de equivalencia** (5 negativas + 3 positivas) si se tocó `producto`
9. **Ambos Advisors limpios**
10. **Presupuesto de velocidad medido y reportado**

---

# 🎯 LA VARA

Un sistema de farmacia común le dice al dueño **lo que ya pasó**.

Este le dice **lo que va a pasar, y qué hacer mientras todavía hay tiempo.**

> **"¿La próxima farmacia que vea esto va a decir que nunca ha visto algo así en República Dominicana?"**

Si la respuesta es "está ok", no está listo. **La vara no baja.**
