#!/usr/bin/env bash
# Validates every security layer of a running compose stack. Re-runnable; exits non-zero on any failure.
set -uo pipefail
cd "$(dirname "$0")/.."

WEB_URL=${WEB_URL:-http://localhost:8080}
DB_USER=${POSTGRES_USER:-todo}
DB_NAME=${POSTGRES_DB:-todo}
failures=0

# Leave the stack as we found it: restarting the API clears the in-memory login limiter that the
# rate-limit checks exhaust, so people (and the next run) can sign in straight away.
restore() { docker compose restart api >/dev/null 2>&1 && docker compose up -d --no-build --wait api >/dev/null 2>&1; }
trap restore EXIT

check() { # check <layer> <description> <command...>
  local layer=$1 description=$2
  shift 2
  if "$@" >/dev/null 2>&1; then
    printf 'PASS  [%s] %s\n' "$layer" "$description"
  else
    printf 'FAIL  [%s] %s\n' "$layer" "$description"
    failures=$((failures + 1))
  fi
}

status_of() { curl -s -o /dev/null -w '%{http_code}' "$@"; }
token_for() {
  curl -s "$WEB_URL/api/auth/login" -H 'content-type: application/json' \
    -d "{\"email\":\"$1\",\"password\":\"${DEMO_PASSWORD:-password123}\"}" |
    node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>process.stdout.write(JSON.parse(s).token??""))'
}
runs_as_non_root() { [ "$(docker compose exec -T "$1" id -u)" != "0" ]; }
production_refuses_dev_defaults() {
  local output
  output=$(docker compose run --rm --no-deps -e NODE_ENV=production api node server.cjs 2>&1) && return 1
  grep -q 'JWT_SECRET' <<<"$output" && grep -q 'DEMO_USERS' <<<"$output"
}
expect_status() { [ "$(status_of "${@:2}")" = "$1" ]; }

echo "== Edge, network, authentication, authorization, error hygiene, sign-up"
node scripts/validate-security.mjs || failures=$((failures + 1))

echo
echo "== Containers"
check containers 'API container runs as a non-root user' runs_as_non_root api
check containers 'web (nginx) container runs as a non-root user' runs_as_non_root web
check containers 'production image refuses the development secret and demo users' production_refuses_dev_defaults

echo
echo "== Token outliving its user"
token=$(token_for grace@example.com)
docker compose exec -T db psql -U "$DB_USER" -d "$DB_NAME" -qc "DELETE FROM users WHERE email = 'grace@example.com'" >/dev/null
check authentication "a deleted user's token cannot read (401)" \
  expect_status 401 "$WEB_URL/api/tasks" -H "authorization: Bearer $token"
check authentication "a deleted user's token cannot write (401, not 500)" \
  expect_status 401 "$WEB_URL/api/tasks" -H "authorization: Bearer $token" -H 'content-type: application/json' -d '{"title":"ghost"}'
# Restarting re-seeds the demo account (seeding is idempotent) and resets the in-memory limiter.
docker compose restart api >/dev/null 2>&1 && docker compose up -d --no-build --wait api >/dev/null 2>&1

echo
echo "== Rate limiting (last: it uses up this client's sign-in and sign-up allowance)"
node scripts/validate-security.mjs --rate-limit || failures=$((failures + 1))

echo
if [ "$failures" -eq 0 ]; then echo "All security layers validated"; else echo "$failures security check group(s) failed"; fi
exit $((failures > 0))
