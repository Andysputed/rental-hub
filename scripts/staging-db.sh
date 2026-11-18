#!/usr/bin/env bash
# Manage the isolated RentalHub staging PostgreSQL cluster.
# Local-only: loopback, port 55432, database rentalhub_staging.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PG_BIN="${PG_BIN:-/c/Program Files/PostgreSQL/16/bin}"
STAGING_ROOT="${STAGING_ROOT:-$HOME/RentalHubStaging}"
DATA_DIR="$STAGING_ROOT/pgdata"
LOG_FILE="$STAGING_ROOT/postgres.log"
PORT="${STAGING_DB_PORT:-55432}"
DB_NAME="${STAGING_DB_NAME:-rentalhub_staging}"
DB_USER="${STAGING_DB_USER:-staging_admin}"
PYTHON="${STAGING_PYTHON:-$ROOT_DIR/backend/.venv/Scripts/python.exe}"

require_binaries() {
  for tool in initdb pg_ctl psql createdb; do
    if [ ! -x "$PG_BIN/$tool.exe" ]; then
      echo "Missing $PG_BIN/$tool.exe. Set PG_BIN to your PostgreSQL bin directory." >&2
      exit 1
    fi
  done
}

init_cluster() {
  require_binaries
  mkdir -p "$STAGING_ROOT"
  if [ -f "$DATA_DIR/PG_VERSION" ]; then
    echo "Cluster already initialized at $DATA_DIR"
  else
    "$PG_BIN/initdb.exe" -D "$DATA_DIR" -U "$DB_USER" --auth=trust --encoding=UTF8 --locale=C
  fi
  if [ ! -f "$ROOT_DIR/backend/.env.staging" ]; then
    cp "$ROOT_DIR/backend/.env.staging.example" "$ROOT_DIR/backend/.env.staging"
    echo "Created backend/.env.staging from the example (local staging credentials only)."
  fi
}

is_running() {
  "$PG_BIN/pg_ctl.exe" status -D "$DATA_DIR" >/dev/null 2>&1
}

start_cluster() {
  if is_running; then
    echo "Staging cluster already running on port $PORT."
    return
  fi
  "$PG_BIN/pg_ctl.exe" start -D "$DATA_DIR" -l "$LOG_FILE" -w -t 60 \
    -o "-p $PORT -c listen_addresses=127.0.0.1" >/dev/null
  echo "Staging cluster started on 127.0.0.1:$PORT (log: $LOG_FILE)."
}

stop_cluster() {
  if is_running; then
    "$PG_BIN/pg_ctl.exe" stop -D "$DATA_DIR" -m fast -w >/dev/null
    echo "Staging cluster stopped."
  else
    echo "Staging cluster is not running."
  fi
}

ensure_database() {
  if ! "$PG_BIN/psql.exe" -h 127.0.0.1 -p "$PORT" -U "$DB_USER" -d postgres -tAc \
    "SELECT 1 FROM pg_database WHERE datname = '$DB_NAME'" | grep -q 1; then
    "$PG_BIN/createdb.exe" -h 127.0.0.1 -p "$PORT" -U "$DB_USER" "$DB_NAME"
    echo "Created database $DB_NAME."
  fi
}

show_status() {
  if is_running; then
    "$PG_BIN/psql.exe" -h 127.0.0.1 -p "$PORT" -U "$DB_USER" -d "$DB_NAME" -tAc \
      "SELECT current_database() || ' | port ' || inet_server_port() || ' | user ' || current_user || ' | ' || current_setting('data_directory')"
  else
    echo "Staging cluster is not running."
    exit 1
  fi
}

manage() {
  ( cd "$ROOT_DIR/backend" && DJANGO_SETTINGS_MODULE=config.staging_settings "$PYTHON" manage.py "$@" )
}

case "${1:-help}" in
  init)
    init_cluster
    ;;
  start)
    init_cluster
    start_cluster
    ensure_database
    ;;
  stop)
    stop_cluster
    ;;
  status)
    show_status
    ;;
  migrate)
    start_cluster
    ensure_database
    manage migrate --noinput
    ;;
  seed)
    start_cluster
    manage seed_staging_data --reset --noinput
    ;;
  reset)
    start_cluster
    manage reset_staging_data --noinput
    ;;
  verify)
    start_cluster
    manage verify_staging_data
    ;;
  test)
    start_cluster
    manage test --noinput
    ;;
  bootstrap)
    init_cluster
    start_cluster
    ensure_database
    manage migrate --noinput
    manage seed_staging_data --reset --noinput
    manage verify_staging_data
    ;;
  shell)
    manage shell
    ;;
  *)
    cat <<'EOF'
Usage: scripts/staging-db.sh <command>

  init       Initialize the dedicated local PostgreSQL cluster (if needed)
  start      Start the cluster and ensure rentalhub_staging exists
  stop       Stop the staging cluster
  status     Show database, port, user and data directory
  migrate    Apply migrations to staging
  seed       Reset and regenerate the fictional staging dataset
  reset      Delete staging data (refuses outside staging settings)
  verify     Run staging financial integrity checks
  test       Run the Django test suite against the staging cluster
  bootstrap  init + start + migrate + seed + verify
  shell      Django shell using config.staging_settings

Environment overrides: PG_BIN, STAGING_ROOT, STAGING_DB_PORT, STAGING_PYTHON
EOF
    ;;
esac
