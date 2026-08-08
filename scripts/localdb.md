# Banco de pruebas — Postgres local (verificación de la corrida T4–T20)

Réplica local del esquema completo para probar migraciones (idempotencia) y
comportamiento (FEFO, inviolabilidad, RLS) SIN tocar producción. No usa el PAT.

Requisitos ya presentes en el entorno: binarios de PostgreSQL 16 en
`/usr/lib/postgresql/16/bin`, usuario `postgres`.

Arranque:
    PGDATA=/tmp/wfpg  SOCK=/tmp/wfsock  PORT=55432
    initdb como usuario `postgres` (no root), start con `-k $SOCK`.
    Aplicar `scripts/localdb-bootstrap.sql` (shim de compatibilidad Supabase:
    roles anon/authenticated/service_role, esquema auth, auth.uid() por GUC
    `app.uid`, pg_trgm en esquema extensions), luego la cadena
    `supabase/migrations/*.sql` en orden.

El shim es SOLO para pruebas locales; nunca va a producción.
