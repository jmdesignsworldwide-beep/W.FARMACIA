# W.Farmacia

Sistema de farmacia premium para República Dominicana. Construido bajo el estándar **ADN JM NEXUS** — un solo estándar, no negociable hacia abajo.

> **Estado:** Tanda 1 — **Cimientos**. Identidad visual, seguridad por rol y trazabilidad inviolable ya funcionando. Los módulos operativos (caja, inventario con lotes FEFO, radar de vencimientos en pesos) se encienden en las próximas tandas.

---

## Stack

- **Next.js 14** (App Router) + **TypeScript** estricto
- **Tailwind CSS** cableado a un único archivo de tokens (§1.7 del ADN)
- **Framer Motion** para las animaciones firma (una sola curva/timing en todo el sistema)
- **Supabase** — Postgres + Auth + (Storage privado en tandas siguientes)
- Preparado para despliegue en **Vercel**

## Lo que ya trae esta tanda

| Área | Qué hay |
|---|---|
| **ADN visual** | Borde luminoso exacto (§1.1), `tabular-nums` global, count-up en KPIs, dos temas premium (crema cálido + oscuro), **el sello** — cápsula con pulso vital que aparece en sidebar, dashboard y estados vacíos (§1.3), estados vacíos premium (§1.4), bienvenida cinematográfica a prueba de fallos (§1.5). |
| **Seguridad** | Roles (`dueno`, `gerente`, `farmaceutico`, `cajero`) validados **en servidor** en cada ruta (§2.7). El cajero no ve finanzas — barrera en servidor, no ocultando el enlace. RLS + FORCE en toda tabla. |
| **Trazabilidad** | `audit_log` **inviolable** por trigger a nivel de base — INSERT/SELECT únicamente, UPDATE y DELETE bloqueados incluso para el administrador (§2.2). |
| **Datos DO** | RD$ con `NUMERIC(14,2)`, ITBIS 18% con exentos, fechas DD/MM/AAAA, cédula/RNC validados, redondeo consistente al peso (§2.6). |
| **Arranque seguro** | El código valida presencia **y formato** de cada variable de entorno al arrancar y **falla ruidosamente** (Museo de Errores #4 y #6). |

---

## Puesta en marcha

### 1. Variables de entorno

Copia `.env.example` a `.env.local` y llénalo con las credenciales del **mismo** proyecto de Supabase, en una sola sentada (Museo de Errores #5):

```bash
cp .env.example .env.local
```

| Variable | Dónde |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Settings → API → Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Settings → API → anon public |
| `SUPABASE_SERVICE_ROLE_KEY` | Settings → API → service_role (opcional; solo servidor) |

En Vercel / el entorno remoto, cárgalas en **Project Settings → Environment Variables**.

### 2. Aplicar las migraciones

Las migraciones viven numeradas en `supabase/migrations/`:

```
0001_fundacion_extensiones_y_helpers.sql   Extensiones, roles, triggers de inviolabilidad y auditoría
0002_perfiles_y_roles.sql                  Tabla profiles + RLS/FORCE + alta automática de perfil
0003_auditoria_inviolable.sql              Bitácora audit_log (INSERT/SELECT, inviolable)
```

Aplícalas con la CLI de Supabase, **usando un PAT temporal que revocas al terminar** (regla de cierre §5.3 #8):

```bash
# Con la CLI de Supabase enlazada al proyecto:
supabase db push
```

O pega los archivos en orden en el **SQL Editor** del dashboard.

### 3. Crear el primer usuario (dueño)

En Supabase → Authentication → Users → Add user (con correo y contraseña).
El trigger `handle_new_user` crea su `profile` automáticamente. Para hacerlo **dueño**:

```sql
update public.profiles set role = 'dueno' where id = '<uuid-del-usuario>';
```

### 4. Correr en local

```bash
npm install
npm run dev        # http://localhost:3000
```

### 5. Prueba de vida (Museo de Errores #1)

Ninguna tanda está completa hasta que **se cree un registro, se guarde y persista tras recargar**. Con la base conectada: inicia sesión, y verifica en `audit_log` que quedó registrada tu entrada de perfil. Ese es el latido del sistema.

---

## Estructura

```
src/
  app/
    login/                 Login premium + server action de autenticación
    (app)/                 Rutas autenticadas (sidebar + bienvenida)
      dashboard/           Dashboard ordenado por urgencia (§1.6)
  components/
    brand/                 Capsula (el sello), CountUp, LuminousCard, EmptyState, WelcomeCinematic
    layout/                Sidebar (colapsa a hamburguesa), ThemeToggle
  lib/
    tokens.ts              ÚNICA fuente de identidad visual (§1.7)
    env.ts                 Validación de entorno que falla ruidosamente
    roles.ts               Roles y capacidades (fuente de verdad compartida)
    auth.ts                requireUser / requireCapability / requireRole (servidor)
    format.ts              RD$, ITBIS, fechas DO, cédula/RNC
    supabase/              client / server / middleware / types
supabase/migrations/       Migraciones numeradas, RLS+FORCE en la misma migración
```

---

## Checklist de cierre pendiente (necesita Supabase conectado)

Estos puntos de §5.3 se completan al enlazar el proyecto real:

- [ ] Migraciones aplicadas por PAT temporal, **y el PAT revocado**.
- [ ] Un registro creado, guardado y **persistente tras recargar**.
- [ ] Permisos por rol probados en servidor (incl. acceso por URL directa a `/finanzas` como cajero).
- [ ] Security Advisor de Supabase limpio.
- [ ] Deployment Protection activo en Vercel desde el día uno (Museo #7).
```
