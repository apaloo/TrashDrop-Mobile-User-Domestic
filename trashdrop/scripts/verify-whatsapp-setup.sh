#!/usr/bin/env bash
# Go-live check for the WhatsApp booking layer.
# Read-only: reports what is configured and what the deployed endpoints do.
# Usage:  ./scripts/verify-whatsapp-setup.sh [site-url]
set -uo pipefail

URL="${1:-https://trashdrop-mobile.windsurf.build}"
pass=0; fail=0
ok()   { printf '  \033[32mPASS\033[0m  %s\n' "$1"; pass=$((pass+1)); }
bad()  { printf '  \033[31mFAIL\033[0m  %s\n' "$1"; fail=$((fail+1)); }
note() { printf '        %s\n' "$1"; }

echo "WhatsApp booking layer — go-live check"
echo "site: $URL"
echo
echo "1. Environment (values are never printed)"

ENVJSON=$(netlify env:list --json 2>/dev/null)
have() { echo "$ENVJSON" | python3 -c "import json,sys;print('y' if '$1' in json.load(sys.stdin) else 'n')" 2>/dev/null; }
getv() { echo "$ENVJSON" | python3 -c "import json,sys;print(json.load(sys.stdin).get('$1',''))" 2>/dev/null; }

for v in META_PHONE_NUMBER_ID META_ACCESS_TOKEN META_APP_SECRET \
         WHATSAPP_VERIFY_TOKEN WHATSAPP_NOTIFY_SECRET WHATSAPP_FLOW_ID SUPABASE_URL; do
  [ "$(have $v)" = y ] && ok "$v set" || bad "$v missing"
done

# These four are easy to paste into the wrong box; check their shapes
TOKEN=$(getv META_ACCESS_TOKEN); SECRET=$(getv META_APP_SECRET)
case "$TOKEN" in
  EAA*) ok "META_ACCESS_TOKEN has access-token shape";;
  "")   : ;;
  *)    bad "META_ACCESS_TOKEN is ${#TOKEN} chars and does not start with EAA — not an access token"
        note "a 32-char hex value is an App Secret; check the two are not swapped";;
esac
if [ -n "$SECRET" ]; then
  if printf '%s' "$SECRET" | grep -qE '^[0-9a-f]{32}$'; then
    ok "META_APP_SECRET has app-secret shape (32 hex)"
  else
    bad "META_APP_SECRET is ${#SECRET} chars — an App Secret is 32 hexadecimal characters"
  fi
fi

# Does the token actually work against the phone number?
PHONE=$(getv META_PHONE_NUMBER_ID)
if [ -n "$TOKEN" ] && [ -n "$PHONE" ]; then
  RESP=$(curl -s -H "Authorization: Bearer $TOKEN" \
         "https://graph.facebook.com/v18.0/${PHONE}?fields=display_phone_number,verified_name" --max-time 25)
  if echo "$RESP" | grep -q display_phone_number; then
    ok "token authenticates against the phone number id"
  else
    bad "Graph rejected the token: $(echo "$RESP" | python3 -c 'import json,sys;print(json.load(sys.stdin).get("error",{}).get("message","?")[:80])' 2>/dev/null)"
  fi
fi

# service_role key must exist under some name, and must not be the anon key
ROLE=$(python3 - <<PY
import json,base64,os
env=json.loads('''$ENVJSON''' or '{}')
def role(k):
    try:
        p=k.split('.')[1]; p+='='*(-len(p)%4)
        return json.loads(base64.urlsafe_b64decode(p)).get('role')
    except Exception: return None
for n in ('SUPABASE_SERVICE_ROLE','SUPABASE_SERVICE_ROLE_KEY'):
    if role(env.get(n,'') or '')=='service_role':
        print(n); break
else: print('')
PY
)
[ -n "$ROLE" ] && ok "service_role key present (in $ROLE)" || bad "no variable holds a service_role key"

# The superseded variable still holds the leaked token until it is revoked
OLD=$(getv WHATSAPP_ACCESS_TOKEN)
case "$OLD" in
  EAActvKX*) bad "WHATSAPP_ACCESS_TOKEN still holds the leaked token — revoke it in Meta and delete the variable";;
  "")        ok "no stale WHATSAPP_ACCESS_TOKEN left behind";;
  *)         : ;;
esac

echo
echo "2. Deployed endpoint behaviour"

code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$URL/.netlify/functions/whatsapp-webhook" \
       -H 'content-type: application/json' -d '{"entry":[]}' --max-time 25)
[ "$code" = 401 ] && ok "webhook rejects an unsigned payload (401)" \
                  || bad "webhook returned $code for an unsigned payload — signature check not live"

SECRET=$(getv META_APP_SECRET)
if [ -n "$SECRET" ]; then
  BODY='{"entry":[]}'
  SIG="sha256=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$SECRET" -r | cut -d' ' -f1)"
  code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$URL/.netlify/functions/whatsapp-webhook" \
         -H 'content-type: application/json' -H "x-hub-signature-256: $SIG" -d "$BODY" --max-time 25)
  [ "$code" = 200 ] && ok "webhook accepts a correctly signed payload (200)" \
                    || bad "webhook returned $code for a correctly signed payload"
else
  note "skipped signed-payload test (META_APP_SECRET not set)"
fi

VT=$(getv WHATSAPP_VERIFY_TOKEN)
if [ -n "$VT" ]; then
  ch=$(curl -s "$URL/.netlify/functions/whatsapp-webhook?hub.mode=subscribe&hub.verify_token=$VT&hub.challenge=ping" --max-time 25)
  [ "$ch" = ping ] && ok "webhook completes Meta's verification handshake" \
                   || bad "verification handshake returned '$ch' instead of the challenge"
fi

code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$URL/.netlify/functions/whatsapp-notify" \
       -H 'content-type: application/json' \
       -d '{"digital_bin_id":"00000000-0000-4000-8000-000000000000"}' --max-time 25)
case "$code" in
  401|500) ok "notify rejects an unauthenticated request ($code)";;
  *)       bad "notify returned $code without a secret — endpoint is open";;
esac

echo
echo "3. Flow"
FID=$(getv WHATSAPP_FLOW_ID); MODE=$(getv WHATSAPP_FLOW_MODE)
[ -n "$FID" ] && ok "flow id $FID (mode: ${MODE:-published})" || bad "WHATSAPP_FLOW_ID missing"
note "if the flow is Draft in WhatsApp Manager, WHATSAPP_FLOW_MODE must be 'draft'"
note "publish it and set the variable to 'published' before real customers use it"

echo
printf 'result: %d passed, %d failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ] || exit 1
