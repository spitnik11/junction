#!/usr/bin/env bash
# Smoke test the data + auth path against a running `wrangler pages dev`.
# Usage: B=http://localhost:8788 bash test/smoke.sh   (Stripe path not covered — needs test keys)
set -e
B="${B:-http://localhost:8788}"
pass(){ echo "  ok: $1"; }
code(){ curl -s -o /dev/null -w "%{http_code}" "$@"; }

[ "$(curl -s "$B/api/listings" | grep -c '"id"')" -ge 1 ] && pass "GET /api/listings returns seeded listings"
[ "$(code "$B/api/listings/l_maya")" = 200 ] && pass "GET /api/listings/:id"
TOK="${ADMIN_TOKEN:-dev-admin-token}"
[ "$(code "$B/api/results")" = 401 ] && pass "GET /api/results unauth → 401"
[ "$(code -H "x-admin-token: $TOK" "$B/api/results")" = 200 ] && pass "GET /api/results with token → 200"
[ "$(code "$B/api/orders/o_none")" = 401 ] && pass "GET /api/orders/:id unauth → 401"

curl -s -c /tmp/j_cli.txt -X POST "$B/api/session" -H 'content-type: application/json' \
  -d '{"email":"c@test.com","name":"C","role":"client"}' >/dev/null
[ "$(code -b /tmp/j_cli.txt "$B/api/me")" = 200 ] && pass "session login + /api/me"
[ "$(code -b /tmp/j_cli.txt "$B/api/orders/o_none")" = 404 ] && pass "auth missing order → 404"
[ "$(code -b /tmp/j_cli.txt -X POST "$B/api/listings" -H 'content-type: application/json' -d '{"title":"x","category":"D","price_cents":100}')" = 403 ] \
  && pass "client cannot create listing → 403"

curl -s -c /tmp/j_pro.txt -X POST "$B/api/session" -H 'content-type: application/json' \
  -d '{"email":"p@test.com","name":"P","role":"pro"}' >/dev/null
[ "$(code -b /tmp/j_pro.txt -X POST "$B/api/listings" -H 'content-type: application/json' -d '{"title":"Logo","category":"Design","price_cents":15000,"includes":"Logo"}')" = 201 ] \
  && pass "pro creates listing → 201"
echo "smoke: all passed"
