#!/usr/bin/env bash
# ============================================================================
# Hysteria2 Panel — start script
# ----------------------------------------------------------------------------
# Boots the Next.js panel with sane pre-flight checks (env, deps, Prisma).
#
# Usage:
#   ./start.sh                  # dev mode on :3000 (next dev --turbo)
#   ./start.sh --prod           # production build + next start
#   ./start.sh --port 4000      # override PORT
#   ./start.sh --host 0.0.0.0   # bind on all interfaces
#   ./start.sh --memory         # bump Node heap to 4GB (large dev sessions)
#   ./start.sh --push           # run `prisma db push` before starting
#   ./start.sh --migrate        # run `prisma migrate dev` before starting
#   ./start.sh --skip-install   # skip `npm install`
#   ./start.sh --skip-prisma    # skip `prisma generate`
#   ./start.sh --build-only     # build, do not start
#   ./start.sh -h | --help      # show this help
# ============================================================================

set -euo pipefail

# ---- repo root -------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# ---- defaults --------------------------------------------------------------
MODE="dev"            # dev | prod | build-only
PORT="${PORT:-3000}"
# NB: do not read $HOSTNAME — bash sets it to the machine hostname.
HOST="${HOST:-127.0.0.1}"
SKIP_INSTALL=0
SKIP_PRISMA=0
RUN_PUSH=0
RUN_MIGRATE=0
USE_MEMORY_FLAG=0

# ---- colors ----------------------------------------------------------------
if [[ -t 1 ]]; then
  RED=$'\033[0;31m'; GREEN=$'\033[0;32m'; YELLOW=$'\033[1;33m'
  BLUE=$'\033[0;34m'; BOLD=$'\033[1m'; NC=$'\033[0m'
else
  RED=""; GREEN=""; YELLOW=""; BLUE=""; BOLD=""; NC=""
fi

log()   { printf "%s[start]%s %s\n" "$BLUE" "$NC" "$*"; }
ok()    { printf "%s[ ok ]%s %s\n" "$GREEN" "$NC" "$*"; }
warn()  { printf "%s[warn]%s %s\n" "$YELLOW" "$NC" "$*"; }
fail()  { printf "%s[fail]%s %s\n" "$RED" "$NC" "$*" >&2; exit 1; }

usage() {
  cat <<'EOF'
Hysteria2 Panel — start script

Usage:
  ./start.sh                  # dev mode on :3000 (next dev --turbo)
  ./start.sh --prod           # production build + next start
  ./start.sh --build-only     # build, do not start
  ./start.sh --port 4000      # override PORT
  ./start.sh --host 0.0.0.0   # bind on all interfaces
  ./start.sh --memory         # bump Node heap to 4GB (long dev sessions)
  ./start.sh --push           # run `prisma db push` before starting
  ./start.sh --migrate        # run `prisma migrate dev` before starting
  ./start.sh --skip-install   # skip `npm install`
  ./start.sh --skip-prisma    # skip `prisma generate`
  ./start.sh -h | --help      # show this help

Env files: .env.local (preferred) → .env. Required vars:
  JWT_SECRET (32+ chars), JWT_REFRESH_SECRET (32+ chars), DATABASE_URL
EOF
  exit 0
}

# ---- argv ------------------------------------------------------------------
while [[ $# -gt 0 ]]; do
  case "$1" in
    --prod|--production) MODE="prod"; shift ;;
    --dev)               MODE="dev"; shift ;;
    --build-only)        MODE="build-only"; shift ;;
    --port)              PORT="${2:?--port requires a value}"; shift 2 ;;
    --host|--hostname)   HOST="${2:?--host requires a value}"; shift 2 ;;
    --memory|--mem)      USE_MEMORY_FLAG=1; shift ;;
    --skip-install)      SKIP_INSTALL=1; shift ;;
    --skip-prisma)       SKIP_PRISMA=1; shift ;;
    --push)              RUN_PUSH=1; shift ;;
    --migrate)           RUN_MIGRATE=1; shift ;;
    -h|--help)           usage ;;
    *) fail "unknown flag: $1 (try --help)" ;;
  esac
done

# ---- toolchain checks ------------------------------------------------------
command -v node >/dev/null 2>&1 || fail "node not found on PATH"
command -v npm  >/dev/null 2>&1 || fail "npm not found on PATH"

NODE_MAJOR="$(node -v | sed -E 's/^v([0-9]+).*/\1/')"
if (( NODE_MAJOR < 20 )); then
  fail "Node.js 20+ required (found $(node -v))"
fi
ok "node $(node -v) / npm $(npm -v)"

# ---- env file selection ----------------------------------------------------
ENV_FILE=""
for candidate in .env.local .env; do
  if [[ -f "$candidate" ]]; then
    ENV_FILE="$candidate"
    break
  fi
done
[[ -z "$ENV_FILE" ]] && fail "no .env.local or .env found — copy .env.example first"
ok "env file: $ENV_FILE"

# ---- required env ----------------------------------------------------------
# Read values directly from the file (no `source`) so spaces/quotes/specials
# in any var don't break the shell. Next.js will load env on its own.
read_env_var() {
  local key="$1"
  awk -v k="$key" '
    BEGIN { FS="=" }
    /^[[:space:]]*#/ { next }
    $0 !~ /^[A-Za-z_][A-Za-z0-9_]*=/ { next }
    {
      # split on first "=" only
      eq = index($0, "=")
      name = substr($0, 1, eq - 1)
      val  = substr($0, eq + 1)
      sub(/^[[:space:]]+/, "", name); sub(/[[:space:]]+$/, "", name)
      if (name == k) {
        # strip a single pair of surrounding double or single quotes
        if (val ~ /^".*"$/ || val ~ /^'\''.*'\''$/) {
          val = substr(val, 2, length(val) - 2)
        }
        print val
        exit
      }
    }
  ' "$ENV_FILE"
}

JWT_SECRET_VAL="$(read_env_var JWT_SECRET)"
JWT_REFRESH_SECRET_VAL="$(read_env_var JWT_REFRESH_SECRET)"
DATABASE_URL_VAL="$(read_env_var DATABASE_URL)"

missing=()
[[ -z "$JWT_SECRET_VAL" ]] && missing+=("JWT_SECRET")
[[ -z "$JWT_REFRESH_SECRET_VAL" ]] && missing+=("JWT_REFRESH_SECRET")
[[ -z "$DATABASE_URL_VAL" ]] && missing+=("DATABASE_URL")

if (( ${#missing[@]} > 0 )); then
  fail "missing required env: ${missing[*]} (set them in $ENV_FILE)"
fi
if (( ${#JWT_SECRET_VAL} < 32 )); then
  fail "JWT_SECRET must be at least 32 characters (found ${#JWT_SECRET_VAL})"
fi
if (( ${#JWT_REFRESH_SECRET_VAL} < 32 )); then
  fail "JWT_REFRESH_SECRET must be at least 32 characters (found ${#JWT_REFRESH_SECRET_VAL})"
fi
ok "required env present"

# ---- npm install -----------------------------------------------------------
if (( SKIP_INSTALL == 0 )); then
  if [[ ! -d node_modules ]] || [[ package.json -nt node_modules ]] || [[ package-lock.json -nt node_modules ]]; then
    log "installing npm dependencies…"
    npm install
    ok "dependencies installed"
  else
    ok "node_modules up to date"
  fi
else
  warn "skipping npm install (--skip-install)"
fi

# ---- Prisma ----------------------------------------------------------------
if (( SKIP_PRISMA == 0 )); then
  if (( RUN_MIGRATE == 1 )); then
    log "running prisma migrate dev…"
    npm run prisma:migrate
    ok "migrations applied"
  elif (( RUN_PUSH == 1 )); then
    log "running prisma db push…"
    npm run prisma:push
    ok "schema pushed"
  fi

  if [[ ! -d node_modules/.prisma/client ]] || [[ prisma/schema.prisma -nt node_modules/.prisma/client ]]; then
    log "generating prisma client…"
    npm run prisma:generate >/dev/null
    ok "prisma client generated"
  else
    ok "prisma client up to date"
  fi
else
  warn "skipping prisma generate (--skip-prisma)"
fi

# ---- node memory flag ------------------------------------------------------
if (( USE_MEMORY_FLAG == 1 )); then
  export NODE_OPTIONS="${NODE_OPTIONS:-} --max-old-space-size=4096"
  ok "NODE_OPTIONS=$NODE_OPTIONS"
fi

export PORT
export HOSTNAME="$HOST"

# ---- shutdown handling -----------------------------------------------------
NEXT_PID=""
shutdown() {
  if [[ -n "$NEXT_PID" ]] && kill -0 "$NEXT_PID" 2>/dev/null; then
    log "stopping next (pid $NEXT_PID)…"
    kill -TERM "$NEXT_PID" 2>/dev/null || true
    wait "$NEXT_PID" 2>/dev/null || true
  fi
}
trap shutdown INT TERM

# ---- launch ----------------------------------------------------------------
case "$MODE" in
  dev)
    log "starting next dev on http://${HOST}:${PORT} (Ctrl+C to stop)"
    npx next dev --turbo --hostname "$HOST" --port "$PORT" &
    NEXT_PID=$!
    wait "$NEXT_PID"
    ;;
  prod)
    log "building production bundle…"
    npx next build
    ok "build complete"
    log "starting next start on http://${HOST}:${PORT}"
    npx next start --hostname "$HOST" --port "$PORT" &
    NEXT_PID=$!
    wait "$NEXT_PID"
    ;;
  build-only)
    log "building production bundle…"
    npx next build
    ok "build complete (skipping start due to --build-only)"
    ;;
  *)
    fail "unknown mode: $MODE"
    ;;
esac
