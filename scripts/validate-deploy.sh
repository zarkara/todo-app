#!/usr/bin/env bash
# Validates that deploying the compose stack is idempotent. Run against a stack that is already up.
set -uo pipefail
cd "$(dirname "$0")/.."

WEB_URL=${WEB_URL:-http://localhost:8080}
DB_USER=${POSTGRES_USER:-todo}
DB_NAME=${POSTGRES_DB:-todo}
failures=0

pass() { printf 'PASS  [deploy] %s\n' "$1"; }
fail() { printf 'FAIL  [deploy] %s\n' "$1"; failures=$((failures + 1)); }
verdict() { if eval "$2"; then pass "$1"; else fail "$1"; fi; }

login() {
  curl -s "$WEB_URL/api/auth/login" -H 'content-type: application/json' \
    -d '{"email":"demo@example.com","password":"'"${DEMO_PASSWORD:-password123}"'"}' |
    node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>process.stdout.write(JSON.parse(s).token??""))'
}
user_ids() { docker compose exec -T db psql -U "$DB_USER" -d "$DB_NAME" -tAc 'SELECT email, id FROM users ORDER BY email'; }

# 1. Converging an up-to-date stack changes nothing.
converge=$(docker compose up -d --no-build --wait 2>&1)
verdict 're-running compose up recreates and restarts nothing' '! grep -qiE "recreat|creat|starting" <<<"$converge"'

# 2. Migrations re-run as a no-op.
migrate=$(docker compose run --rm --no-deps api node migrate.cjs 2>&1 | tail -1)
verdict 're-running migrations applies nothing' '[ "$migrate" = "Database schema is up to date" ]'

# 3. Seeding on start keeps existing user ids (tasks stay attached).
before=$(user_ids)
docker compose restart api >/dev/null 2>&1 && docker compose up -d --no-build --wait api >/dev/null 2>&1
after=$(user_ids)
verdict 'restarting re-seeds demo users without changing their ids' '[ -n "$before" ] && [ "$before" = "$after" ]'

# 4. Data survives a full redeploy of the application containers.
title="deploy-check-$(date +%s)-$$"
token=$(login)
id=$(curl -s "$WEB_URL/api/tasks" -H "authorization: Bearer $token" -H 'content-type: application/json' \
  -d "{\"title\":\"$title\"}" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>process.stdout.write(JSON.parse(s).id??""))')
docker compose up -d --no-build --force-recreate --wait api web >/dev/null 2>&1
token=$(login)
listed=$(curl -s "$WEB_URL/api/tasks?q=$title" -H "authorization: Bearer $token")
verdict 'data written before a forced redeploy is still there after it' 'grep -q "$title" <<<"$listed"'
curl -s -o /dev/null -X DELETE "$WEB_URL/api/tasks/$id" -H "authorization: Bearer $token"

echo
if [ "$failures" -eq 0 ]; then echo "Deployment is idempotent"; else echo "$failures deploy check(s) failed"; fi
exit $((failures > 0))
