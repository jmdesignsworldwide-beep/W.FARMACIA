#!/usr/bin/env bash
# Levanta un Postgres 16 local y aplica bootstrap + cadena de migraciones.
# Uso: scripts/localdb-run.sh   (idempotente: recrea la base wf desde cero)
set -euo pipefail
PGBIN=/usr/lib/postgresql/16/bin
PGDATA=/tmp/wfpg; SOCK=/tmp/wfsock; PORT=55432
if [ ! -s "$PGDATA/PG_VERSION" ]; then
  rm -rf "$PGDATA"; mkdir -p "$PGDATA"; chown postgres:postgres "$PGDATA"; chmod 700 "$PGDATA"
  runuser -u postgres -- "$PGBIN/initdb" -D "$PGDATA" -U postgres --auth=trust -E UTF8 >/dev/null
fi
mkdir -p "$SOCK"; chown postgres:postgres "$SOCK"
runuser -u postgres -- "$PGBIN/pg_ctl" -D "$PGDATA" -o "-p $PORT -k $SOCK -h 127.0.0.1" -l /tmp/pg.log start >/dev/null 2>&1 || true
sleep 2
P() { runuser -u postgres -- "$PGBIN/psql" -h "$SOCK" -p "$PORT" -U postgres "$@"; }
P -d postgres -q -c "drop database if exists wf;" -c "create database wf;"
P -d wf -v ON_ERROR_STOP=1 -q -f scripts/localdb-bootstrap.sql
for f in $(ls supabase/migrations/*.sql | sort); do
  P -d wf -v ON_ERROR_STOP=1 -q -f "$f" >/dev/null
done
echo "Base wf lista con la cadena completa aplicada."
